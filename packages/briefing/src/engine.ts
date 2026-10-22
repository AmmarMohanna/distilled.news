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
import type { BriefingInput, BriefingItem, BriefingModels, BriefingResult, DroppedItem, FeedSpec, ItemRelation, OmittedStory, PriorItem } from "./types";

export interface EngineOptions {
  /** Input size above which articles are edited in parallel chunks and then consolidated. */
  maxEditorChars: number;
  /** Source text budget for one verification call; larger briefings verify in parallel batches. */
  maxVerifyChars: number;
  /** Safety valve, not an editorial quota. */
  maxItems: number;
  /** Repair attempts per item before it is dropped; each costs one repair and one re-check call, only when needed. */
  maxRepairs: number;
  prepare: Partial<PrepareOptions>;
  now: () => Date;
}

export const DEFAULT_ENGINE: EngineOptions = {
  maxEditorChars: 90_000,
  maxVerifyChars: 80_000,
  maxItems: 30,
  maxRepairs: 2,
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

function parseLeftOut(raw: unknown, known: Set<string>, idsOf: Map<string, string[]>): OmittedStory[] {
  const list = (raw as { left_out?: unknown })?.left_out;
  if (!Array.isArray(list)) return [];
  const out: OmittedStory[] = [];
  for (const entry of list) {
    const row = entry as Record<string, unknown>;
    const refs = (Array.isArray(row?.sources) ? row.sources : []).map((r) => text(r).toUpperCase()).filter((r) => known.has(r));
    if (refs.length) out.push({ stage: "editor", reason: text(row.why) || "no reason given", sourceIds: [...new Set(refs.flatMap((r) => idsOf.get(r) ?? []))] });
  }
  return out;
}

function scriptProblem(draft: { headline: string; body: string }, language: FeedSpec["language"]): string | undefined {
  const sample = `${draft.headline} ${draft.body}`;
  if (language === "ar" && !/[؀-ۿ]/.test(sample)) return "item is not written in Arabic";
  if (language !== "ar" && /[؀-ۿ]/.test(sample) && !/[A-Za-z]{3}/.test(sample)) return `item is not written in ${language === "en" ? "English" : "French"}`;
  return undefined;
}

/** Mechanical flags handed to the verifier as hints; never a verdict on their own. */
function hintsFor(draft: Draft, byRef: Map<string, PreparedArticle>, feed: FeedSpec): string[] {
  const evidence = draft.refs.map((ref) => {
    const source = byRef.get(ref);
    return source ? `${source.title ?? ""} ${source.publishedAt} ${source.text}` : "";
  }).join("\n");
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
  prior: PriorItem[],
  partial = false
): Promise<{ drafts: Draft[]; omitted: OmittedStory[] }> {
  const known = new Set(articles.map((a) => a.ref));
  const priorIds = new Set(prior.map((p) => p.id));
  const idsOf = new Map(articles.map((a) => [a.ref, [a.id, ...a.alsoIds]]));
  return callJson(
    port,
    meter,
    {
      model: models.editor,
      system: EDITOR_SYSTEM,
      user: editorUser({ feed: input.feed, windowStart: input.windowStart, windowEnd: input.windowEnd, prior, articles, partial }),
      maxTokens: 4000
    },
    (raw) => ({
      drafts: parseDrafts(raw, known, priorIds),
      omitted: parseLeftOut(raw, known, idsOf)
    })
  );
}

async function consolidate(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  prior: PriorItem[],
  idsOfRefs: (refs: string[]) => string[]
): Promise<{ drafts: Draft[]; omitted: OmittedStory[] }> {
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
      const used = new Set<number>();
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
        for (const n of from) used.add(n);
      }
      const omitted: OmittedStory[] = [];
      const cutIndexes = new Set<number>();
      const cuts = Array.isArray((raw as { cut?: unknown })?.cut) ? ((raw as { cut: unknown[] }).cut) : [];
      for (const entry of cuts) {
        const row = entry as Record<string, unknown>;
        const from = (Array.isArray(row?.from) ? row.from : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < drafts.length && !used.has(n));
        for (const n of from) {
          if (drafts[n].importance === 1) continue; // lead stories cannot be cut; restored below
          cutIndexes.add(n);
          omitted.push({ stage: "consolidation", reason: text(row.why) || "cut for reading budget", headline: drafts[n].headline, sourceIds: idsOfRefs(drafts[n].refs) });
        }
      }
      const restored: Draft[] = [];
      drafts.forEach((draft, n) => {
        if (used.has(n) || cutIndexes.has(n)) return;
        // A lead story is never lost to the cut; anything else the model silently dropped is recorded as such.
        if (draft.importance === 1) restored.push(draft);
        else omitted.push({ stage: "consolidation", reason: "dropped by consolidation without a reason", headline: draft.headline, sourceIds: idsOfRefs(draft.refs) });
      });
      return { drafts: [...restored, ...out], omitted };
    }
  );
}

interface Verdict {
  verdict: "ok" | "fix" | "drop" | "redundant";
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
            windowEnd: input.windowEnd,
            prior,
            sources,
            items: batch.map((index, localIndex) => {
              const d = drafts[index];
              const earlier = d.updatesId ? priorById.get(d.updatesId) : undefined;
              return {
                index: localIndex,
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
            if (!Number.isInteger(i) || i < 0 || i >= batch.length || !["ok", "fix", "drop", "redundant"].includes(verdict)) continue;
            const issues = (Array.isArray(row.issues) ? row.issues : []).map(text).filter(Boolean);
            out.set(batch[i], { verdict: verdict as Verdict["verdict"], issues });
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
  input: BriefingInput,
  drafts: Draft[],
  flagged: Map<number, string[]>,
  byRef: Map<string, PreparedArticle>
): Promise<Map<number, { headline: string; body: string } | null>> {
  // Model-facing numbers are local to this subset; translate back mechanically.
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
        windowEnd: input.windowEnd,
        sources,
        items: indices.map((index, localIndex) => ({
          index: localIndex,
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
        if (!Number.isInteger(i) || i < 0 || i >= indices.length) continue;
        const headline = text(row.headline);
        const body = text(row.body);
        out.set(indices[i], row.drop === true || !headline || !body ? null : { headline, body });
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
  const omittedStories: OmittedStory[] = [];
  const finish = (partial: Pick<BriefingResult, "status" | "items" | "skipped" | "dropped">): BriefingResult => ({
    ...partial,
    omitted: omittedStories,
    usage: meter.usage,
    timings: { totalMs: Date.now() - started, stages }
  });

  const { prepared, skipped } = prepareArticles(input.articles, options.prepare);
  if (!prepared.length) return finish({ status: "empty", items: [], skipped, dropped: [] });

  const byRef = new Map(prepared.map((a) => [a.ref, a]));
  const prior = selectPrior(input.prior ?? [], prepared, options.now());
  const priorIds = new Set(prior.map((p) => p.id));
  const sourceIdsOfRefs = (refs: string[]) => [...new Set(refs.flatMap((ref) => [byRef.get(ref)!.id, ...byRef.get(ref)!.alsoIds]))];

  // 1. Edit: choose and write.
  const chunks = chunkArticles(prepared, options.maxEditorChars);
  let drafts: Draft[];
  const omitted: OmittedStory[] = [];
  if (chunks.length === 1) {
    const edited = await timed("edit", () => edit(port, meter, models, input, prepared, prior));
    drafts = edited.drafts;
    omitted.push(...edited.omitted);
  } else {
    const parts = await timed("edit", () => Promise.all(chunks.map((chunk) => edit(port, meter, models, input, chunk, prior, true))));
    const merged = parts.flatMap((part) => part.drafts);
    omitted.push(...parts.flatMap((part) => part.omitted));
    if (merged.length > 1) {
      const consolidated = await timed("consolidate", () => consolidate(port, meter, models, input, merged, prior, sourceIdsOfRefs));
      drafts = consolidated.drafts;
      omitted.push(...consolidated.omitted);
    } else {
      drafts = merged;
    }
  }
  omittedStories.push(...omitted);
  drafts = drafts
    .map((d, order) => ({ d, order }))
    .sort((a, b) => a.d.importance - b.d.importance || a.order - b.order)
    .map(({ d }) => d);
  for (const d of drafts.slice(options.maxItems)) {
    omittedStories.push({ stage: "safety_cap", reason: `over the safety limit of ${options.maxItems} items`, headline: d.headline, sourceIds: sourceIdsOfRefs(d.refs) });
  }
  drafts = drafts.slice(0, options.maxItems);
  if (!drafts.length) return finish({ status: "empty", items: [], skipped, dropped: [] });

  // 2. Verify, repair what is repairable once, drop what is not.
  const dropped: DroppedItem[] = [];
  const accepted = new Set<number>();
  let todo = drafts.map((_, i) => i);
  for (let round = 0; round <= options.maxRepairs && todo.length; round += 1) {
    const verdicts = await timed("verify", () => verify(port, meter, models, input, drafts, todo, byRef, prior, options.maxVerifyChars));
    const flagged = new Map<number, string[]>();
    const unchecked: number[] = [];
    for (const index of todo) {
      const verdict = verdicts.get(index);
      if (!verdict) unchecked.push(index);
      else if (verdict.verdict === "ok") accepted.add(index);
      else if (verdict.verdict === "redundant") dropped.push({ headline: drafts[index].headline, reason: verdict.issues.join(" | ") || "repeats what the reader was already told", carry: false, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
      else if (verdict.verdict === "drop") dropped.push({ headline: drafts[index].headline, reason: verdict.issues.join(" | ") || "judged unsupported", carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
      else if (round < options.maxRepairs) flagged.set(index, verdict.issues.length ? verdict.issues : ["verifier flagged this item"]);
      else dropped.push({ headline: drafts[index].headline, reason: `still flagged after repair: ${verdict.issues.join(" | ")}`, carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
    }
    todo = unchecked; // a verifier that skipped an item has not approved it; ask again
    if (flagged.size && round < options.maxRepairs) {
      const fixes = await timed("repair", () => repair(port, meter, models, input, drafts, flagged, byRef));
      for (const index of flagged.keys()) {
        const fixed = fixes.get(index);
        if (!fixed) {
          dropped.push({ headline: drafts[index].headline, reason: `could not be repaired: ${flagged.get(index)!.join(" | ")}`, carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
          continue;
        }
        drafts[index] = { ...drafts[index], ...fixed };
        todo.push(index);
      }
    }
  }
  for (const index of todo) dropped.push({ headline: drafts[index].headline, reason: "never confirmed by the verifier", carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });

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
