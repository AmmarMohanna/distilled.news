import {
  BriefingBudgetError,
  DEFAULT_PRICES,
  anthropicModel,
  generateBriefing,
  openAiCompatibleModel,
  type Article,
  type BriefingResult,
  type ModelPort,
  type PriceTable,
  type PriorItem
} from "@distilled/briefing";
import { editionId, editionTitle, type BriefingConfig, type BriefingEdition, type BriefingEvidence, type NormalizedMessage } from "@distilled/core";
import { V3SpendGuard, guardedModelPort } from "./v3-spend";
import type { Env, Repository } from "./types";

export interface V3Runtime {
  /** Raw provider client with transport retries disabled; retries and spending are the guard's job. */
  port: ModelPort;
  models: { editor: string; verifier: string };
  spend: { guard: V3SpendGuard; prices: PriceTable };
}

/**
 * Returns null (so the legacy path runs) unless V3 is switched on, a model credential exists AND a
 * spending budget is configured. V3 never runs without an explicit dollar cap.
 */
export function v3RuntimeFromEnv(env: Env): V3Runtime | null {
  if (env.BRIEFING_ENGINE !== "v3") return null;
  const daily = Number(env.BRIEFING_V3_DAILY_BUDGET_USD);
  if (!Number.isFinite(daily) || daily <= 0 || !env.DB) {
    console.warn("BRIEFING_ENGINE=v3 ignored: set BRIEFING_V3_DAILY_BUDGET_USD to a positive dollar amount");
    return null;
  }
  const perRun = Number(env.BRIEFING_V3_RUN_BUDGET_USD);
  let prices: PriceTable = DEFAULT_PRICES;
  if (env.BRIEFING_PRICES_JSON) {
    try {
      prices = { ...DEFAULT_PRICES, ...(JSON.parse(env.BRIEFING_PRICES_JSON) as PriceTable) };
    } catch {
      console.warn("BRIEFING_ENGINE=v3 ignored: BRIEFING_PRICES_JSON is not valid JSON");
      return null;
    }
  }
  let port: ModelPort;
  let models: V3Runtime["models"];
  if (env.OPENROUTER_API_KEY) {
    port = openAiCompatibleModel({ url: "https://openrouter.ai/api/v1/chat/completions", apiKey: env.OPENROUTER_API_KEY, reportCost: true, retries: 0 });
    models = { editor: env.BRIEFING_EDITOR_MODEL ?? "openai/gpt-4.1", verifier: env.BRIEFING_VERIFIER_MODEL ?? "openai/gpt-4.1-mini" };
  } else if (env.ANTHROPIC_API_KEY) {
    port = anthropicModel({ apiKey: env.ANTHROPIC_API_KEY, retries: 0 });
    models = { editor: env.BRIEFING_EDITOR_MODEL ?? "claude-sonnet-5-5", verifier: env.BRIEFING_VERIFIER_MODEL ?? "claude-haiku-5-5" };
  } else {
    return null;
  }
  const guard = new V3SpendGuard(env.DB, { dailyUsd: daily, runUsd: Number.isFinite(perRun) && perRun > 0 ? Math.min(perRun, daily) : Math.min(0.5, daily) });
  return { port, models, spend: { guard, prices } };
}

/** Feeds each call's tokens and cost into the existing per-feed usage ledger. */
export function withUsageRecording(port: ModelPort, repo: Repository, briefingId: string): ModelPort {
  return {
    async complete(request) {
      const started = Date.now();
      const response = await port.complete(request);
      try {
        await repo.recordLlmUsage({
          briefingId,
          model: request.model,
          purpose: "summary",
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          estimatedCostUsd: response.costUsd ?? 0,
          reportedCostUsd: response.costUsd,
          latencyMs: Date.now() - started,
          phase: "v3_briefing",
          outcome: "SUCCESS"
        });
      } catch (error) {
        console.warn("Could not record V3 model usage", error);
      }
      return response;
    }
  };
}

export function messageToArticle(message: NormalizedMessage): Article {
  return {
    id: message.id,
    source: message.source.title,
    title: message.news?.headline,
    url: message.sourceUrl,
    publishedAt: message.postedAt,
    text: message.text
  };
}

function toEvidence(message: NormalizedMessage): BriefingEvidence {
  return {
    documentId: message.news?.acquiredItemId,
    contentHash: message.news?.contentHash,
    headline: message.news?.headline,
    messageId: message.id,
    sourceId: message.source.id,
    sourceTitle: message.source.title,
    sourceType: message.source.type,
    sourceProvider: message.source.provider,
    sourceKind: message.source.kind,
    sourceUrl: message.sourceUrl,
    postedAt: message.postedAt,
    text: message.text,
    links: message.links,
    media: message.media
  };
}

/** What the reader was already told: every section of recent editions, newest last. */
export function priorFromEditions(editions: BriefingEdition[]): PriorItem[] {
  return editions
    .filter((edition) => edition.status === "published")
    .flatMap((edition) =>
      edition.sections
        .filter((section) => section.evidence.length > 0)
        .map((section, index) => ({ id: `${edition.id}:${index}`, at: edition.publishedAt, headline: section.title, body: section.summary }))
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function buildV3Edition(input: {
  briefing: BriefingConfig;
  messages: NormalizedMessage[];
  result: BriefingResult;
  windowStart: string;
  windowEnd: string;
  now: Date;
}): BriefingEdition {
  const { briefing, result } = input;
  const byId = new Map(input.messages.map((message) => [message.id, message]));
  const sections = result.items.map((item) => ({
    title: item.headline,
    summary: item.body,
    evidence: item.sourceIds.flatMap((id) => (byId.has(id) ? [toEvidence(byId.get(id)!)] : []))
  }));
  const timestamp = input.now.toISOString();
  return {
    id: editionId(briefing.id, briefing.briefingCadence, input.windowStart, input.windowEnd),
    briefingId: briefing.id,
    cadence: briefing.briefingCadence,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    title: editionTitle(briefing.briefingCadence, briefing.language),
    // Deterministic digest of the verified headlines; no extra generated text to verify.
    summary: result.items.map((item) => item.headline).join(" · ").slice(0, 600),
    sections,
    status: "published",
    publishedAt: input.windowEnd,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

/** Raw messages read per run. A fuller window is processed in batches across successive runs. */
const FETCH_LIMIT = 1000;
/** An article behind a dropped item is offered to the editor this many times in total (one retry), then abandoned. */
const MAX_ATTEMPTS = 2;
const MAX_PENDING = 200;
const MAX_ABANDONED_KEPT = 25;

interface V3State {
  /** Everything posted before this instant has been evaluated (or is listed in `pending`). */
  cursor?: string;
  /** Article id -> times it has been offered to the editor and its item was dropped. */
  pending: Record<string, number>;
  /** Most recent articles given up on after MAX_ATTEMPTS, kept for operator visibility. */
  abandoned: Array<{ at: string; headline: string; reason: string; articleIds: string[] }>;
}

const stateKey = (briefingId: string) => `v3_state:${briefingId}`;

async function loadState(repo: Repository, briefingId: string): Promise<V3State> {
  const raw = await repo.getSetting(stateKey(briefingId));
  if (!raw) return { pending: {}, abandoned: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<V3State>;
    return {
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : undefined,
      pending: parsed.pending && typeof parsed.pending === "object" ? parsed.pending : {},
      abandoned: Array.isArray(parsed.abandoned) ? parsed.abandoned : []
    };
  } catch {
    // A corrupt record must not silently restart the feed from "now"; fail this run so it is visible.
    throw new Error(`corrupt V3 state for feed ${briefingId}`);
  }
}

export type V3Outcome = "published" | "empty" | "rejected" | "error" | "budget";

/**
 * One scheduled run of V3 for a feed.
 *
 * Articles are read from the feed's own cursor (not from the scheduled window), so windows skipped
 * while the worker was down or the provider was failing are picked up, not lost. After a run:
 *  - published/empty/rejected: the cursor advances to the end of what was read;
 *  - an item dropped by verification sends its articles (those no published item cites) back for
 *    one more attempt in a later run, then they are recorded as abandoned;
 *  - an item dropped as redundant is not retried (it only repeated what the reader was told);
 *  - error or budget refusal: nothing changes, so the next run re-reads the same articles.
 * Cursor and pending list live in one setting value, so they cannot disagree after a crash. If the
 * worker dies after saving the edition but before saving that state, the next run re-reads the same
 * articles but the editor sees the saved edition as already told and skips them.
 */
export async function publishV3Window(input: {
  repo: Repository;
  v3: V3Runtime;
  briefing: BriefingConfig;
  /** Where to start only when the feed has no cursor yet (its first V3 run). */
  fallbackStart: string;
  windowEnd: string;
  now: Date;
  generate?: typeof generateBriefing;
}): Promise<V3Outcome> {
  const { repo, briefing } = input;
  const state = await loadState(repo, briefing.id);
  const start = state.cursor ?? input.fallbackStart;
  if (Date.parse(start) > Date.parse(input.windowEnd)) return "empty";

  let fetched = await repo.listRawMessagesForWindow(briefing.id, start, input.windowEnd, FETCH_LIMIT);
  let end = input.windowEnd;
  if (fetched.length >= FETCH_LIMIT) {
    // Cut at a timestamp boundary so the next run (start inclusive) continues without a gap or overlap.
    const last = fetched[fetched.length - 1].postedAt;
    const trimmed = fetched.filter((message) => message.postedAt < last);
    if (trimmed.length) {
      fetched = trimmed;
      end = last;
    }
  }

  const seen = new Set(fetched.map((message) => message.id));
  const carried: NormalizedMessage[] = [];
  for (const id of Object.keys(state.pending)) {
    if (seen.has(id)) continue;
    const message = await repo.getRawMessage(id);
    if (message) carried.push(message);
  }
  const messages = [...carried, ...fetched];
  if (!messages.length) {
    // Nothing to offer: no model call, no cost. Advance so the same empty span is not re-read.
    await repo.setSetting(stateKey(briefing.id), JSON.stringify({ cursor: end, pending: {}, abandoned: state.abandoned } satisfies V3State), input.now);
    return "empty";
  }
  const articles = messages.map(messageToArticle);
  const windowMinutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
  const prior = priorFromEditions(await repo.listBriefingEditions(briefing.id, true, input.now, 30));
  const runId = `${briefing.id}:${end}:${input.now.getTime()}`;

  let result: BriefingResult;
  try {
    const port = guardedModelPort(withUsageRecording(input.v3.port, repo, briefing.id), {
      guard: input.v3.spend.guard,
      feedId: briefing.id,
      runId,
      prices: input.v3.spend.prices
    });
    result = await (input.generate ?? generateBriefing)(
      {
        feed: {
          interest: briefing.interestProfile,
          language: briefing.language,
          windowMinutes: briefing.updateIntervalMinutes ?? windowMinutes,
          style: briefing.styleInstruction
        },
        articles,
        prior,
        windowStart: start,
        windowEnd: end
      },
      port,
      input.v3.models,
      { now: () => input.now }
    );
  } catch (error) {
    const budget = error instanceof BriefingBudgetError;
    console.error(budget ? "V3 budget refused; articles stay pending" : "V3 generation failed; articles stay pending", briefing.id, error);
    return budget ? "budget" : "error";
  }

  if (result.status === "published") {
    await repo.saveBriefingEdition(buildV3Edition({ briefing, messages, result, windowStart: start, windowEnd: end, now: input.now }), input.now);
  }

  // Everything offered this run leaves the pending list; only unpublished, retryable items go back.
  const offered = new Set(messages.map((message) => message.id));
  const pending: Record<string, number> = {};
  for (const [id, attempts] of Object.entries(state.pending)) if (!offered.has(id)) pending[id] = attempts;
  const published = new Set(result.items.flatMap((item) => item.sourceIds));
  const abandoned = [...state.abandoned];
  for (const drop of result.dropped) {
    if (!drop.carry) continue;
    const retry = drop.sourceIds.filter((id) => !published.has(id) && offered.has(id));
    const give = retry.filter((id) => (state.pending[id] ?? 0) + 1 >= MAX_ATTEMPTS);
    for (const id of retry) if (!give.includes(id) && Object.keys(pending).length < MAX_PENDING) pending[id] = (state.pending[id] ?? 0) + 1;
    if (give.length) abandoned.push({ at: input.now.toISOString(), headline: drop.headline, reason: drop.reason.slice(0, 300), articleIds: give });
  }
  await repo.setSetting(stateKey(briefing.id), JSON.stringify({ cursor: end, pending, abandoned: abandoned.slice(-MAX_ABANDONED_KEPT) } satisfies V3State), input.now);
  console.info("v3_briefing", JSON.stringify({ briefingId: briefing.id, status: result.status, items: result.items.length, dropped: result.dropped.length, omitted: result.omitted.slice(0, 20).map((o) => ({ stage: o.stage, headline: o.headline, reason: o.reason, articles: o.sourceIds.length })), carried: Object.keys(pending).length, abandoned: abandoned.length, usage: result.usage, timings: result.timings }));
  return result.status;
}
