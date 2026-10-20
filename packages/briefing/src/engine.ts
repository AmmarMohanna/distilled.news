import { callJson, UsageMeter, type ModelPort } from "./model";
import { chunkArticles, prepareArticles, selectPrior, type PrepareOptions, type PreparedArticle } from "./prepare";
import {
  CONSOLIDATE_SYSTEM,
  EDITOR_SYSTEM,
  REPAIR_SYSTEM,
  VERIFY_SYSTEM,
  consolidateUser,
  editorUser,
  repairUser,
  verifyUser
} from "./prompts";
import { significantNumbers } from "./text";
import type { BriefingInput, BriefingItem, BriefingModels, BriefingResult, DroppedItem, FeedSpec, ItemRelation, PriorItem } from "./types";

export interface EngineOptions {
  /** Input size above which articles are edited in parallel chunks and then consolidated. */
  maxEditorChars: number;
  /** Source text budget for one verification call; larger briefings verify in parallel batches. */
  maxVerifyChars: number;
  /** Safety valve, not an editorial quota. */
  maxItems: number;
  prepare: Partial<PrepareOptions>;
  now: () => Date;
}

export const DEFAULT_ENGINE: EngineOptions = {
  maxEditorChars: 90_000,
  maxVerifyChars: 80_000,
  maxItems: 30,
  prepare: {},
  now: () => new Date()
};

interface Draft {
  headline: string;
  body: string;
  relation: ItemRelation;
  importance: 1 | 2 | 3;
  /** Refs of prepared articles. */
  refs: string[];
  updatesId?: string;
}

const RELATIONS = new Set(["new", "update", "correction"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function importanceOf(value: unknown): 1 | 2 | 3 {
  const n = Math.round(Number(value));
  return n <= 1 ? 1 : n >= 3 ? 3 : 2;
}

function parseDrafts(raw: unknown, known: Set<string>, priorIds: Set<string>): Draft[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error('missing "items" array');
  const drafts: Draft[] = [];
  for (const entry of list) {
    const item = entry as Record<string, unknown>;
    const headline = text(item?.headline);
    const body = text(item?.body);
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    const refs = [...new Set(sources.map((s) => text(s).toUpperCase()).filter((ref) => known.has(ref)))];
    if (!headline || !body || !refs.length) continue; // uncited or empty drafts cannot be published
    const relation = RELATIONS.has(text(item.relation)) ? (text(item.relation) as ItemRelation) : "new";
    const updates = text(item.updates);
    drafts.push({
      headline,
      body,
      relation,
      importance: importanceOf(item.importance),
      refs,
      updatesId: priorIds.has(updates) ? updates : undefined
    });
  }
  return drafts;
}

function scriptProblem(draft: { headline: string; body: string }, language: FeedSpec["language"]): string | undefined {
  const sample = `${draft.headline} ${draft.body}`;
  if (language === "ar" && !/[؀-ۿ]/.test(sample)) return "item is not written in Arabic";
  if (language !== "ar" && /[؀-ۿ]/.test(sample) && !/[A-Za-z]{3}/.test(sample)) return `item is not written in ${language === "en" ? "English" : "French"}`;
  return undefined;
}

/** Mechanical flags handed to the verifier as hints; never a verdict on their own. */
function hintsFor(draft: Draft, byRef: Map<string, PreparedArticle>, feed: FeedSpec): string[] {
  const evidence = draft.refs.map((ref) => byRef.get(ref)?.text ?? "").join("\n");
  const evidenceNumbers = new Set(significantNumbers(evidence));
  const missing = significantNumbers(`${draft.headline} ${draft.body}`).filter((n) => !evidenceNumbers.has(n));
  const hints: string[] = [];
  if (missing.length) hints.push(`numbers not found in cited sources: ${missing.join(", ")}`);
  const script = scriptProblem(draft, feed.language);
  if (script) hints.push(script);
  return hints;
}

async function edit(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  articles: PreparedArticle[],
  prior: PriorItem[]
): Promise<Draft[]> {
  const known = new Set(articles.map((a) => a.ref));
  const priorIds = new Set(prior.map((p) => p.id));
  return callJson(
    port,
    meter,
    {
      model: models.editor,
      system: EDITOR_SYSTEM,
      user: editorUser({ feed: input.feed, windowStart: input.windowStart, windowEnd: input.windowEnd, prior, articles }),
      maxTokens: 4000
    },
    (raw) => parseDrafts(raw, known, priorIds)
  );
}

async function consolidate(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  prior: PriorItem[]
): Promise<Draft[]> {
  const priorIds = new Set(prior.map((p) => p.id));
  return callJson(
    port,
    meter,
    {
      model: models.editor,
      system: CONSOLIDATE_SYSTEM,
      user: consolidateUser({
        feed: input.feed,
        prior,
        drafts: drafts.map((d) => ({ headline: d.headline, body: d.body, relation: d.relation, updates: d.updatesId, importance: d.importance }))
      }),
      maxTokens: 4000
    },
    (raw) => {
      const list = (raw as { items?: unknown })?.items;
      if (!Array.isArray(list)) throw new Error('missing "items" array');
      const out: Draft[] = [];
      for (const entry of list) {
        const item = entry as Record<string, unknown>;
        const from = (Array.isArray(item?.from) ? item.from : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < drafts.length);
        const headline = text(item?.headline);
        const body = text(item?.body);
        if (!from.length || !headline || !body) continue;
        // Sources are the union of the merged drafts: the model cannot invent a citation here.
        const refs = [...new Set(from.flatMap((n: number) => drafts[n].refs))];
        const updates = text(item.updates);
        out.push({
          headline,
          body,
          relation: RELATIONS.has(text(item.relation)) ? (text(item.relation) as ItemRelation) : drafts[from[0]].relation,
          importance: importanceOf(item.importance),
          refs,
          updatesId: priorIds.has(updates) ? updates : drafts[from[0]].updatesId
        });
      }
      return out;
    }
  );
}

interface Verdict {
  verdict: "ok" | "fix" | "drop";
  issues: string[];
}

function batchesBySourceSize(indices: number[], drafts: Draft[], byRef: Map<string, PreparedArticle>, maxChars: number): number[][] {
  const batches: Array<{ indices: number[]; refs: Set<string>; chars: number }> = [];
  for (const index of indices) {
    const refs = drafts[index].refs;
    let placed = false;
    for (const batch of batches) {
      const added = refs.filter((ref) => !batch.refs.has(ref)).reduce((sum, ref) => sum + (byRef.get(ref)?.text.length ?? 0), 0);
      if (batch.chars + added <= maxChars) {
        batch.indices.push(index);
        for (const ref of refs) batch.refs.add(ref);
        batch.chars += added;
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push({ indices: [index], refs: new Set(refs), chars: refs.reduce((s, ref) => s + (byRef.get(ref)?.text.length ?? 0), 0) });
    }
  }
  return batches.map((batch) => batch.indices);
}

async function verify(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  indices: number[],
  byRef: Map<string, PreparedArticle>,
  prior: PriorItem[],
  maxChars: number
): Promise<Map<number, Verdict>> {
  const priorById = new Map(prior.map((p) => [p.id, p]));
  const results = new Map<number, Verdict>();
  const batches = batchesBySourceSize(indices, drafts, byRef, maxChars);
  await Promise.all(
    batches.map(async (batch) => {
      const refs = [...new Set(batch.flatMap((i) => drafts[i].refs))];
      const sources = refs.map((ref) => byRef.get(ref)!).filter(Boolean);
      const parsed = await callJson(
        port,
        meter,
        {
          model: models.verifier,
          system: VERIFY_SYSTEM,
          user: verifyUser({
            prior,
            sources,
            items: batch.map((index) => {
              const d = drafts[index];
              const earlier = d.updatesId ? priorById.get(d.updatesId) : undefined;
              return {
                index,
                headline: d.headline,
                body: d.body,
                relation: d.relation,
                sources: d.refs,
                updatesText: earlier ? `${earlier.headline}: ${earlier.body}` : undefined,
                hints: hintsFor(d, byRef, input.feed)
              };
            })
          }),
          maxTokens: 3000
        },
        (raw) => {
          const list = (raw as { results?: unknown })?.results;
          if (!Array.isArray(list)) throw new Error('missing "results" array');
          const out = new Map<number, Verdict>();
          for (const entry of list) {
            const row = entry as Record<string, unknown>;
            const i = Number(row?.i);
            const verdict = text(row?.verdict).toLowerCase();
            if (!batch.includes(i) || !["ok", "fix", "drop"].includes(verdict)) continue;
            const issues = (Array.isArray(row.issues) ? row.issues : []).map(text).filter(Boolean);
            out.set(i, { verdict: verdict as Verdict["verdict"], issues });
          }
          return out;
        }
      );
      for (const [i, verdict] of parsed) results.set(i, verdict);
    })
  );
  return results;
}

async function repair(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  drafts: Draft[],
  flagged: Map<number, string[]>,
  byRef: Map<string, PreparedArticle>
): Promise<Map<number, { headline: string; body: string } | null>> {
  const indices = [...flagged.keys()];
  const refs = [...new Set(indices.flatMap((i) => drafts[i].refs))];
  const sources = refs.map((ref) => byRef.get(ref)!).filter(Boolean);
  return callJson(
    port,
    meter,
    {
      model: models.editor,
      system: REPAIR_SYSTEM,
      user: repairUser({
        sources,
        items: indices.map((index) => ({
          index,
          headline: drafts[index].headline,
          body: drafts[index].body,
          relation: drafts[index].relation,
          sources: drafts[index].refs,
          issues: flagged.get(index)!
        }))
      }),
      maxTokens: 3000
    },
    (raw) => {
      const list = (raw as { items?: unknown })?.items;
      if (!Array.isArray(list)) throw new Error('missing "items" array');
      const out = new Map<number, { headline: string; body: string } | null>();
      for (const entry of list) {
        const row = entry as Record<string, unknown>;
        const i = Number(row?.i);
        if (!indices.includes(i)) continue;
        const headline = text(row.headline);
        const body = text(row.body);
        out.set(i, row.drop === true || !headline || !body ? null : { headline, body });
      }
      return out;
    }
  );
}

/**
 * Turns the window's articles into a verified briefing.
 *
 * Calls in a normal run: one editor call and one verification call. Flagged items get one
 * targeted rewrite and one re-check; an item that still fails is dropped on its own, so a
 * single bad sentence never blocks the rest of the briefing. Throws only when the model
 * cannot be reached or keeps returning unusable output, in which case nothing has been
 * persisted and the window can simply be retried.
 */
export async function generateBriefing(
  input: BriefingInput,
  port: ModelPort,
  models: BriefingModels,
  overrides: Partial<EngineOptions> = {}
): Promise<BriefingResult> {
  const options: EngineOptions = { ...DEFAULT_ENGINE, ...overrides };
  const meter = new UsageMeter();
  const started = Date.now();
  const stages: Record<string, number> = {};
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      stages[name] = (stages[name] ?? 0) + Date.now() - t;
    }
  };
  const finish = (partial: Pick<BriefingResult, "status" | "items" | "skipped" | "dropped">): BriefingResult => ({
    ...partial,
    usage: meter.usage,
    timings: { totalMs: Date.now() - started, stages }
  });

  const { prepared, skipped } = prepareArticles(input.articles, options.prepare);
  if (!prepared.length) return finish({ status: "empty", items: [], skipped, dropped: [] });

  const byRef = new Map(prepared.map((a) => [a.ref, a]));
  const prior = selectPrior(input.prior ?? [], prepared, options.now());
  const priorIds = new Set(prior.map((p) => p.id));

  // 1. Edit: choose and write.
  const chunks = chunkArticles(prepared, options.maxEditorChars);
  let drafts: Draft[];
  if (chunks.length === 1) {
    drafts = await timed("edit", () => edit(port, meter, models, input, prepared, prior));
  } else {
    const parts = await timed("edit", () => Promise.all(chunks.map((chunk) => edit(port, meter, models, input, chunk, prior))));
    const merged = parts.flat();
    drafts = merged.length > 1 ? await timed("consolidate", () => consolidate(port, meter, models, input, merged, prior)) : merged;
  }
  drafts = drafts
    .map((d, order) => ({ d, order }))
    .sort((a, b) => a.d.importance - b.d.importance || a.order - b.order)
    .slice(0, options.maxItems)
    .map(({ d }) => d);
  if (!drafts.length) return finish({ status: "empty", items: [], skipped, dropped: [] });

  // 2. Verify, repair what is repairable once, drop what is not.
  const dropped: DroppedItem[] = [];
  const accepted = new Set<number>();
  let todo = drafts.map((_, i) => i);
  for (let round = 0; round < 2 && todo.length; round += 1) {
    const verdicts = await timed("verify", () => verify(port, meter, models, input, drafts, todo, byRef, prior, options.maxVerifyChars));
    const flagged = new Map<number, string[]>();
    const unchecked: number[] = [];
    for (const index of todo) {
      const verdict = verdicts.get(index);
      if (!verdict) unchecked.push(index);
      else if (verdict.verdict === "ok") accepted.add(index);
      else if (verdict.verdict === "drop") dropped.push({ headline: drafts[index].headline, reason: verdict.issues.join(" | ") || "judged unsupported or repeated" });
      else if (round === 0) flagged.set(index, verdict.issues.length ? verdict.issues : ["verifier flagged this item"]);
      else dropped.push({ headline: drafts[index].headline, reason: `still flagged after repair: ${verdict.issues.join(" | ")}` });
    }
    todo = unchecked; // a verifier that skipped an item has not approved it; ask again
    if (flagged.size && round === 0) {
      const fixes = await timed("repair", () => repair(port, meter, models, drafts, flagged, byRef));
      for (const index of flagged.keys()) {
        const fixed = fixes.get(index);
        if (!fixed) {
          dropped.push({ headline: drafts[index].headline, reason: `could not be repaired: ${flagged.get(index)!.join(" | ")}` });
          continue;
        }
        drafts[index] = { ...drafts[index], ...fixed };
        todo.push(index);
      }
    }
  }
  for (const index of todo) dropped.push({ headline: drafts[index].headline, reason: "never confirmed by the verifier" });

  const items: BriefingItem[] = [...accepted]
    .sort((a, b) => a - b)
    .map((index) => {
      const d = drafts[index];
      const ids = d.refs.flatMap((ref) => [byRef.get(ref)!.id, ...byRef.get(ref)!.alsoIds]);
      return {
        headline: d.headline,
        body: d.body,
        relation: d.relation,
        importance: d.importance,
        sourceIds: [...new Set(ids)],
        ...(d.updatesId && priorIds.has(d.updatesId) ? { updatesId: d.updatesId } : {})
      };
    });
  return finish({ status: items.length ? "published" : "rejected", items, skipped, dropped });
}
