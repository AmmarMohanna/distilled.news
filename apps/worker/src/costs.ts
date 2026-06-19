import type { SourceKind } from "@distilled/core";
import type { Env, Repository, SourceRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_BUDGET_USD = 1;
const LLM_RESERVE_FRACTION = 0.05;
const DEFAULT_X_PRICE_PER_1000_RESULTS_USD = 0.18;
const DEFAULT_GOOGLE_NEWS_PRICE_PER_1000_RESULTS_USD = 0.5;
const DEFAULT_OPENAI_INPUT_PRICE_PER_MILLION_TOKENS_USD = 0.4;
const DEFAULT_OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS_USD = 1.6;
const X_MAX_ITEMS = 20;
const GOOGLE_NEWS_MAX_ITEMS_PER_QUERY = 15;

export interface PaidSourceBudgetContext {
  dailyBudgetUsd: number;
  llmSpendUsd: number;
  paidSourceBudgetUsd: number;
  paidSourceSpendUsd: number;
  perSourceDailyBudgetUsd: number;
  sourceSpendUsd: Map<string, number>;
  paidSourceCount: number;
  since: string;
  now: Date;
}

export interface PaidSourceRefreshDecision {
  shouldStart: boolean;
  reason: "due" | "not_due" | "budget_exhausted" | "unsupported";
  intervalMs?: number;
  estimatedCostUsd?: number;
  maxItems?: number;
}

export function isBudgetedApifySource(source: SourceRecord): boolean {
  return source.provider === "apify" && (source.kind === "google_news" || source.kind === "x_profile" || source.kind === "x_search");
}

export async function createPaidSourceBudgetContext(input: {
  briefingId: string;
  dailyBudgetUsd: number;
  paidSources: SourceRecord[];
  repo: Repository;
  now: Date;
}): Promise<PaidSourceBudgetContext> {
  const since = new Date(input.now.getTime() - DAY_MS).toISOString();
  const dailyBudgetUsd = normalizedDailyBudgetUsd(input.dailyBudgetUsd);
  const llmSpendUsd = await input.repo.sumLlmUsageCost({ briefingId: input.briefingId, since });
  const paidSourceBudgetUsd = dailyPaidSourceBudgetUsd(dailyBudgetUsd, llmSpendUsd);
  const paidSourceSpendUsd = await input.repo.sumSourceRunCosts({ briefingId: input.briefingId, since });
  const sourceSpendUsd = new Map<string, number>();
  for (const source of input.paidSources) {
    sourceSpendUsd.set(source.id, await input.repo.sumSourceRunCosts({ briefingId: input.briefingId, sourceId: source.id, since }));
  }
  return {
    dailyBudgetUsd,
    llmSpendUsd,
    paidSourceBudgetUsd,
    paidSourceSpendUsd,
    perSourceDailyBudgetUsd: input.paidSources.length > 0 ? paidSourceBudgetUsd / input.paidSources.length : 0,
    sourceSpendUsd,
    paidSourceCount: input.paidSources.length,
    since,
    now: input.now
  };
}

export function decidePaidSourceRefresh(input: {
  source: SourceRecord;
  context: PaidSourceBudgetContext;
  env?: Partial<Env>;
}): PaidSourceRefreshDecision {
  const estimatedCostUsd = estimateApifySourceRunCostUsd(input.source, input.env);
  const maxItems = apifyRunMaxItems(input.source);
  if (estimatedCostUsd === undefined || maxItems === undefined) return { shouldStart: false, reason: "unsupported" };

  if (
    input.context.paidSourceBudgetUsd <= 0 ||
    input.context.perSourceDailyBudgetUsd <= 0 ||
    input.context.paidSourceSpendUsd + estimatedCostUsd > input.context.paidSourceBudgetUsd ||
    (input.context.sourceSpendUsd.get(input.source.id) ?? 0) + estimatedCostUsd > input.context.perSourceDailyBudgetUsd
  ) {
    return { shouldStart: false, reason: "budget_exhausted", estimatedCostUsd, maxItems };
  }

  const intervalMs = paidSourceRefreshIntervalMs(input.source.kind, estimatedCostUsd, input.context.perSourceDailyBudgetUsd);
  if (!isDue(input.source.lastCheckedAt, input.context.now, intervalMs)) {
    return { shouldStart: false, reason: "not_due", intervalMs, estimatedCostUsd, maxItems };
  }

  return { shouldStart: true, reason: "due", intervalMs, estimatedCostUsd, maxItems };
}

export function dailyPaidSourceBudgetUsd(dailyBudgetUsd: number, llmSpendUsd: number): number {
  const normalized = normalizedDailyBudgetUsd(dailyBudgetUsd);
  return Math.max(0, normalized - Math.max(normalized * LLM_RESERVE_FRACTION, llmSpendUsd));
}

export function paidSourceRefreshIntervalMs(kind: SourceKind, runCostUsd: number, sourceDailyBudgetUsd: number): number {
  if (sourceDailyBudgetUsd <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(minRefreshIntervalMs(kind), (runCostUsd / sourceDailyBudgetUsd) * DAY_MS);
}

export function estimateApifySourceRunCostUsd(source: SourceRecord, env?: Partial<Env>): number | undefined {
  const maxItems = apifyRunMaxItems(source);
  if (maxItems === undefined) return undefined;
  if (source.kind === "google_news") {
    return maxItems * pricePerResult(env?.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS, DEFAULT_GOOGLE_NEWS_PRICE_PER_1000_RESULTS_USD);
  }
  if (source.kind === "x_profile" || source.kind === "x_search") {
    return maxItems * pricePerResult(env?.APIFY_X_PRICE_USD_PER_1000_RESULTS, DEFAULT_X_PRICE_PER_1000_RESULTS_USD);
  }
  return undefined;
}

export function apifyRunMaxItems(source: SourceRecord): number | undefined {
  const input = recordValue(source.actorInput);
  if (source.kind === "google_news") {
    const queries = Array.isArray(input.queries) ? input.queries.length : 1;
    const maxQueries = Math.max(1, Math.min(numberValue(input.maxQueries, queries), queries || 1));
    const perQuery = Math.min(numberValue(input.maxItemsPerQuery, GOOGLE_NEWS_MAX_ITEMS_PER_QUERY), GOOGLE_NEWS_MAX_ITEMS_PER_QUERY);
    return Math.max(1, Math.floor(perQuery * maxQueries));
  }
  if (source.kind === "x_profile" || source.kind === "x_search") {
    return Math.max(1, Math.floor(Math.min(numberValue(input.maxItems, X_MAX_ITEMS), X_MAX_ITEMS)));
  }
  return undefined;
}

export function estimateOpenAiCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  env?: Partial<Env>;
}): number {
  const inputPrice = pricePerMillionTokens(
    input.env?.OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS,
    DEFAULT_OPENAI_INPUT_PRICE_PER_MILLION_TOKENS_USD
  );
  const outputPrice = pricePerMillionTokens(
    input.env?.OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS,
    DEFAULT_OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS_USD
  );
  return (input.inputTokens * inputPrice + input.outputTokens * outputPrice) / 1_000_000;
}

export function paidSourceBudgetStatus(context: PaidSourceBudgetContext): string | undefined {
  if (context.paidSourceCount === 0) return undefined;
  if (context.paidSourceBudgetUsd <= 0 || context.paidSourceSpendUsd >= context.paidSourceBudgetUsd) {
    return "paid sources paused by daily budget";
  }
  return "paid sources slowed by budget";
}

function minRefreshIntervalMs(kind: SourceKind): number {
  if (kind === "google_news") return 60 * 60 * 1000;
  if (kind === "x_search") return 45 * 60 * 1000;
  if (kind === "x_profile") return 20 * 60 * 1000;
  return DAY_MS;
}

function isDue(lastCheckedAt: string | undefined, now: Date, intervalMs: number): boolean {
  if (!lastCheckedAt) return true;
  return now.getTime() - new Date(lastCheckedAt).getTime() >= intervalMs;
}

function normalizedDailyBudgetUsd(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DAILY_BUDGET_USD;
}

function pricePerResult(value: string | undefined, fallbackPer1000: number): number {
  return numberValue(value, fallbackPer1000) / 1000;
}

function pricePerMillionTokens(value: string | undefined, fallback: number): number {
  return numberValue(value, fallback);
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
