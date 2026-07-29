import type { BriefingConfig, NormalizedMessage } from "@distilled/core";
import {
  buildGoogleNewsRssUrl,
  defaultActorIdForKind,
  detectSourceInput,
  normalizeApifyDatasetItems,
  parseGoogleNewsRssFeed,
  parseJsonNewsFeed,
  parseRssFeed,
  type DetectedSourceInput
} from "@distilled/connectors";
import { ingestPublicTelegramChannel, type PublicTelegramIngestResult } from "./publicTelegram";
import { isMessageWithinIngestHorizon } from "./sourceFreshness";
import type {
  Env,
  ProcessingJobMessage,
  Repository,
  SourceQuota,
  SourceRefreshCandidate,
  SourceRecord,
  SourceRefreshJobMessage,
  SourceRunRecord
} from "./types";

const RSS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const TELEGRAM_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const GOOGLE_NEWS_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const APIFY_MINIMUM_RUN_CHARGE_USD = 0.02;
const PROCESSING_BACKLOG_REFRESH_PAUSE_LIMIT = 40;
const DEFAULT_GLOBAL_COLLECTION_DAILY_BUDGET_USD = 15;
const DEFAULT_GLOBAL_COLLECTION_MONTHLY_BUDGET_USD = 450;
const DEFAULT_TOTAL_MONTHLY_BUDGET_USD = 600;
const HOSTED_COLLECTION_DAILY_BUDGET_USD = 0.25;
const HOSTED_COLLECTION_MONTHLY_BUDGET_USD = 5;
const BRAVE_NEWS_SEARCH_COST_USD = 0.005;
const BRAVE_NEWS_ACTOR_ID = "brave-news-search";
const X_MAX_ITEMS = 20;
const GOOGLE_NEWS_MAX_ITEMS = 10;
const DEFAULT_X_PRICE_PER_1000_TWEETS_USD = 0.15;
const DEFAULT_GOOGLE_NEWS_ACTOR_ID = "groupoject/google-news-scraper";
const DEFAULT_GOOGLE_NEWS_FALLBACK_ACTOR_ID = "solidcode/google-news-scraper";
const DEFAULT_X_ACTOR_BUILD = "1.1.3";
const DEFAULT_GOOGLE_NEWS_ACTOR_BUILD = "1.1.1";
const DEFAULT_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD = "1.0.10";
const DEFAULT_GOOGLE_NEWS_PRICE_PER_1000_RESULTS_USD = 0.5;
const DEFAULT_GOOGLE_NEWS_FALLBACK_PRICE_PER_1000_RESULTS_USD = 1.2;
const APIFY_ACTOR_START_CHARGE_USD = 0.00005;
const RSS_FETCH_TIMEOUT_MS = 10_000;
const RSS_MAX_RESPONSE_BYTES = 2_000_000;
const RSS_MAX_REDIRECTS = 3;
const APIFY_CONTROL_MAX_RESPONSE_BYTES = 256_000;
const APIFY_DATASET_MAX_RESPONSE_BYTES = 2_000_000;
const APIFY_FETCH_TIMEOUT_MS = 12_000;
const CANONICAL_SOURCE_DISPATCH_LEASE_MS = 10 * 60 * 1000;
const CANONICAL_SOURCE_EXECUTION_LEASE_MS = 2 * 60 * 1000;

export type SourceIngestResult = PublicTelegramIngestResult & {
  provider?: SourceRecord["provider"];
  kind?: SourceRecord["kind"];
  runStarted?: boolean;
};

export interface SourceRefreshInput {
  briefing: BriefingConfig;
  repo: Repository;
  bucket: { put(key: string, value: string, options?: unknown): Promise<unknown> };
  queue: { send(message: ProcessingJobMessage): Promise<unknown> };
  env?: Partial<Env>;
  fetcher?: typeof fetch;
  now?: Date;
  force?: boolean;
  canonicalLeaseToken?: string;
  sourceQuota?: SourceQuota;
}

export interface SourceRefreshDispatchInput {
  briefing: BriefingConfig;
  repo: Repository;
  queue: { send(message: SourceRefreshJobMessage): Promise<unknown> };
  now?: Date;
  force?: boolean;
}

export interface DueSourceRefreshDispatchInput {
  candidates: SourceRefreshCandidate[];
  repo: Repository;
  queue: { send(message: SourceRefreshJobMessage): Promise<unknown> };
  now?: Date;
}

export async function addSourceFromInput(input: SourceRefreshInput & { sourceInput: string }): Promise<SourceIngestResult> {
  const detected = detectSourceInput(input.sourceInput);
  await assertDetectedSourceEnabled(input.repo, input.env ?? {}, detected);
  const source = await upsertDetectedSource(
    input.repo,
    input.briefing,
    detected,
    input.env ?? {},
    input.now,
    input.sourceQuota
  );
  if (detected.provider === "telegram") {
    return ingestPublicTelegramChannel({
      ...input,
      source,
      url: detected.sourceUrl,
      activateSource: true
    });
  }

  if (detected.provider === "rss") {
    return ingestRssSource({ ...input, source });
  }

  const now = input.now ?? new Date();
  return (await startCappedApifySourceRun({ ...input, source, now })) ?? skippedApifySourceRun(source);
}

export async function refreshEnabledSources(input: SourceRefreshInput): Promise<SourceIngestResult[]> {
  if (input.briefing.paused) return [];

  const now = input.now ?? new Date();
  const sources = (await input.repo.listSources(input.briefing.id)).filter((source) => source.enabled);
  const results: SourceIngestResult[] = [];

  for (const source of sources) {
    if (isSyntheticCanaryFixture(source)) continue;
    if (!input.force && source.nextRetryAt && source.nextRetryAt > now.toISOString()) continue;
    if (!input.force && !isSourceRefreshDue(input.briefing, source, now)) continue;
    const result = await refreshSource({ ...input, source, now });
    if (result) results.push(result);
  }

  return results;
}

export async function enqueueDueSourceRefreshJobs(input: SourceRefreshDispatchInput): Promise<number> {
  if (input.briefing.paused) return 0;
  if (!input.force && await hasLargeProcessingBacklog(input.repo, input.briefing.id)) return 0;

  const now = input.now ?? new Date();
  const sources = (await input.repo.listSources(input.briefing.id)).filter((source) => source.enabled);
  let enqueued = 0;

  for (const source of sources) {
    if (isSyntheticCanaryFixture(source)) continue;
    if (!input.force && source.nextRetryAt && source.nextRetryAt > now.toISOString()) continue;
    if (!input.force && !isSourceRefreshDue(input.briefing, source, now)) continue;
    if ((source.provider === "apify" || source.kind === "google_news") &&
      await input.repo.hasActiveCanonicalSourceRun(source.id)) continue;

    const dispatchLeaseToken = await input.repo.claimCanonicalSourceRefresh(
      source.id,
      input.force ? 15 * 60 * 1000 : sourceRefreshIntervalMs(input.briefing, source),
      CANONICAL_SOURCE_DISPATCH_LEASE_MS,
      now
    );
    if (!dispatchLeaseToken) continue;

    try {
      await input.queue.send({
        type: "refresh_source",
        briefingId: input.briefing.id,
        sourceId: source.id,
        force: input.force || undefined,
        canonicalLeaseToken: dispatchLeaseToken
      });
    } catch (error) {
      if (dispatchLeaseToken) {
        await input.repo.releaseCanonicalSourceRefresh(source.id, dispatchLeaseToken, now);
      }
      throw error;
    }
    enqueued += 1;
  }

  return enqueued;
}

export async function enqueueDueSourceRefreshCandidates(input: DueSourceRefreshDispatchInput): Promise<number> {
  const now = input.now ?? new Date();
  let enqueued = 0;
  for (const candidate of input.candidates) {
    const dispatchLeaseToken = await input.repo.claimCanonicalSourceRefresh(
      candidate.sourceId,
      sourceRefreshIntervalFor(
        candidate.briefingCadence,
        candidate.provider,
        candidate.kind
      ),
      CANONICAL_SOURCE_DISPATCH_LEASE_MS,
      now
    );
    if (!dispatchLeaseToken) continue;
    try {
      await input.queue.send({
        type: "refresh_source",
        briefingId: candidate.briefingId,
        sourceId: candidate.sourceId,
        canonicalLeaseToken: dispatchLeaseToken
      });
    } catch (error) {
      await input.repo.releaseCanonicalSourceRefresh(candidate.sourceId, dispatchLeaseToken, now);
      throw error;
    }
    enqueued += 1;
  }
  return enqueued;
}

export async function refreshSourceById(input: SourceRefreshInput & { sourceId: string }): Promise<SourceIngestResult | undefined> {
  const source = await input.repo.getSource(input.sourceId);
  if (!source) throw new Error("Source not found.");
  return refreshSource({ ...input, source });
}

async function refreshSource(input: SourceRefreshInput & { source: SourceRecord }): Promise<SourceIngestResult | undefined> {
  if (input.briefing.paused || !input.briefing.publicFeedEnabled || !input.source.enabled) return undefined;
  const owner = await input.repo.getAccountById(input.briefing.ownerAccountId);
  if (!owner || owner.disabledAt) return undefined;
  if (isSyntheticCanaryFixture(input.source)) return undefined;
  const now = input.now ?? new Date();
  const intervalMs = sourceRefreshIntervalMs(input.briefing, input.source);
  try {
    await assertSourceEnabled(input.repo, input.env ?? {}, input.source);
  } catch (error) {
    if (isProviderDisabledError(error)) {
      await input.repo.rescheduleCanonicalSourceRefresh(
        input.source.id,
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        "Provider disabled by deployment policy.",
        now
      );
      return undefined;
    }
    throw error;
  }
  const leaseToken = input.canonicalLeaseToken
    ? await input.repo.activateCanonicalSourceRefresh(
        input.source.id,
        input.canonicalLeaseToken,
        CANONICAL_SOURCE_EXECUTION_LEASE_MS,
        now
      )
    : await input.repo.claimCanonicalSourceRefresh(
        input.source.id,
        input.force ? 15 * 60 * 1000 : intervalMs,
        CANONICAL_SOURCE_EXECUTION_LEASE_MS,
        now
      );
  if (!leaseToken) return undefined;
  const directRun = input.source.provider === "apify"
    ? null
    : await input.repo.createSourceRun({
      sourceId: input.source.id,
      briefingId: input.briefing.id,
      provider: input.source.provider,
      actorId: input.source.provider === "telegram" ? "telegram-public-html" : "rss-direct",
      state: "running",
      estimatedCostUsd: 0,
      startedAt: now.toISOString()
    }, now);

  try {
    let result: SourceIngestResult | undefined;
    if (input.source.provider === "telegram") {
      if (!input.source.url) throw new Error("Telegram source URL is missing.");
      result = await ingestPublicTelegramChannel({ ...input, source: input.source, url: input.source.url, now });
    } else if (input.source.kind === "google_news" && input.source.provider === "apify") {
      if (await input.repo.hasActiveCanonicalSourceRun(input.source.id)) return undefined;
      result = await startCappedApifySourceRun({ ...input, source: input.source, now });
    } else if (input.source.kind === "google_news") {
      // Compatibility for self-hosters that have not applied the Apify
      // migration yet. Production Google News sources use Apify.
      result = await ingestRssSource({ ...input, source: input.source, now });
    } else if (input.source.provider === "rss") {
      if (!input.source.sourceUrl && !input.source.url) throw new Error("RSS source URL is missing.");
      result = await ingestRssSource({ ...input, source: input.source, now });
    } else if (input.source.provider === "apify") {
      if (await input.repo.hasActiveCanonicalSourceRun(input.source.id)) return undefined;
      result = await startCappedApifySourceRun({ ...input, source: input.source, now });
    } else {
      throw new Error(`Unsupported source provider: ${input.source.provider}`);
    }

    await input.repo.completeCanonicalSourceRefresh(
      input.source.id,
      leaseToken,
      nextSourceRefreshAt(input.briefing, input.source, now),
      result && result.imported > 0 ? now.toISOString() : undefined,
      now,
      input.source.provider !== "apify"
    );
    if (directRun) {
      const completedAt = new Date();
      await input.repo.updateSourceRun({
        id: directRun.id,
        state: "succeeded",
        itemCount: result?.fetched ?? 0,
        actualCostUsd: 0,
        completedAt: completedAt.toISOString()
      }, completedAt);
    }
    return result;
  } catch (error) {
    if (directRun) {
      const completedAt = new Date();
      await input.repo.updateSourceRun({
        id: directRun.id,
        state: "failed",
        itemCount: 0,
        actualCostUsd: 0,
        error: error instanceof Error ? error.message : String(error),
        completedAt: completedAt.toISOString()
      }, completedAt);
    }
    const budgetPause = isCollectionBudgetError(error);
    const backoffMs = budgetPause ? millisecondsUntilNextUtcDay(now) : sourceFailureBackoffMs(input.source);
    await input.repo.failCanonicalSourceRefresh(
      input.source.id,
      leaseToken,
      budgetPause ? "Collection budget reached; paused until the next UTC budget window." :
        error instanceof Error ? error.message : String(error),
      budgetPause ? "budget_pause" : sourceFailureClass(error, input.source),
      backoffMs,
      now
    );
    if (budgetPause) {
      return undefined;
    }
    throw error;
  }
}

function isSyntheticCanaryFixture(source: SourceRecord): boolean {
  return source.id.startsWith("source_canary_fixture_") || source.input === "synthetic:canary-fixture";
}

export async function pollApifySourceRuns(input: Omit<SourceRefreshInput, "briefing">): Promise<void> {
  const runs = await input.repo.listSourceRuns({ provider: "apify", states: ["queued", "running"], limit: 25 });
  for (const run of runs) {
    const source = await input.repo.getSource(run.sourceId);
    const briefing = await input.repo.getBriefingById(run.briefingId);
    if (!source || !briefing) {
      await input.repo.updateSourceRun({ id: run.id, state: "failed", error: "Source or briefing not found", completedAt: new Date().toISOString() });
      continue;
    }
    const owner = await input.repo.getAccountById(briefing.ownerAccountId);
    if (!owner || owner.disabledAt || briefing.paused || !briefing.publicFeedEnabled || !source.enabled) {
      const completedAt = new Date();
      await settleSourceRunSpend(input.repo, run, run.estimatedCostUsd, completedAt);
      await input.repo.updateSourceRun({
        id: run.id,
        state: "failed",
        actualCostUsd: run.estimatedCostUsd,
        error: "Source refresh stopped because the account or feed is disabled.",
        completedAt: completedAt.toISOString()
      }, completedAt);
      continue;
    }

    try {
      await pollApifySourceRun({ ...input, briefing, source, run });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Apify polling error";
      await settleSourceRunSpend(input.repo, run, run.estimatedCostUsd, new Date());
      await input.repo.updateSourceRun({
        id: run.id,
        state: "failed",
        error: message,
        completedAt: new Date().toISOString()
      });
      const now = new Date();
      await recordSourceGroupFailure(
        input.repo,
        source,
        message,
        "apify_poll",
        new Date(now.getTime() + sourceFailureBackoffMs(source)).toISOString(),
        now
      );
    }
  }
}

async function upsertDetectedSource(
  repo: Repository,
  briefing: BriefingConfig,
  detected: DetectedSourceInput,
  env: Partial<Env>,
  now = new Date(),
  quota?: SourceQuota
): Promise<SourceRecord> {
  let actorId = detected.provider === "apify"
    ? ("actorId" in detected ? detected.actorId : undefined) ?? defaultActorIdForKind(detected.kind, env)
    : undefined;
  if (detected.kind === "google_news") {
    const query = googleNewsQueryFromDetectedSource(detected);
    if (!query) throw new Error("Google News source query is missing.");
    const locale = googleNewsLocale(briefing.language);
    actorId ??= env.APIFY_GOOGLE_NEWS_ACTOR_ID ?? DEFAULT_GOOGLE_NEWS_ACTOR_ID;
    detected = {
      ...detected,
      sourceUrl: buildGoogleNewsRssUrl(query, locale),
      actorInput: googleNewsActorInput(query, locale.language, locale.geo, GOOGLE_NEWS_MAX_ITEMS, actorId)
    };
  }
  if (detected.provider === "apify" && !actorId) {
    throw new Error(`No Apify actor is configured for ${detected.kind}.`);
  }

  return repo.upsertConfiguredSource({
    briefingId: briefing.id,
    title: detected.title,
    provider: detected.provider,
    kind: detected.kind,
    username: "username" in detected ? detected.username : undefined,
    input: detected.input,
    url: "sourceUrl" in detected ? detected.sourceUrl : undefined,
    sourceUrl: "sourceUrl" in detected ? detected.sourceUrl : undefined,
    actorId,
    actorInput: "actorInput" in detected ? detected.actorInput : undefined,
    enabled: true
  }, now, quota);
}

async function ingestRssSource(input: SourceRefreshInput & { source: SourceRecord }): Promise<SourceIngestResult> {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();
  const isGoogleNews = input.source.kind === "google_news";
  const url = isGoogleNews ? googleNewsSourceUrl(input.source) : input.source.sourceUrl ?? input.source.url;
  if (!url) throw new Error(isGoogleNews ? "Google News RSS source URL is missing." : "RSS source URL is missing.");

  const cursor = sourceFetchCursor(input.source.cursor);
  const headers = new Headers(rssRequestHeaders(isGoogleNews));
  if (cursor.etag) headers.set("if-none-match", cursor.etag);
  if (cursor.lastModified) headers.set("if-modified-since", cursor.lastModified);
  let response = await fetchRssResponse(fetcher, url, headers);
  if (response.status === 403 || response.status === 406 ||
    (isGoogleNews && [429, 500, 502, 503, 504].includes(response.status))) {
    response = await fetchRssResponse(fetcher, url, browserCompatibleRssHeaders(headers));
  }
  if (response.status === 304) {
    await input.repo.updateSourceState({ sourceId: input.source.id, lastCheckedAt: now.toISOString() }, now);
    await markSourceFetch(input.repo, input.briefing.id, now);
    await input.repo.recordSourceSuccess(input.source.id, undefined, now);
    return { sourceId: input.source.id, title: input.source.title, url, fetched: 0, imported: 0, queued: 0, skipped: 0, provider: "rss", kind: isGoogleNews ? "google_news" : "rss_feed" };
  }
  if (!response.ok) {
    if (isGoogleNews && input.env?.BRAVE_SEARCH_API_KEY &&
      input.env.BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED?.trim().toLowerCase() === "true") {
      return ingestBraveNewsSource({ ...input, sourceUrl: url, now });
    }
    const message = `Could not fetch ${isGoogleNews ? "Google News RSS" : "RSS"} source: ${response.status}`;
    throw new Error(message);
  }

  let payload = await readBoundedText(response, RSS_MAX_RESPONSE_BYTES);
  if (looksLikeHtml(payload)) {
    response = await fetchRssResponse(fetcher, url, browserCompatibleRssHeaders(headers));
    if (!response.ok) throw new Error(`Could not fetch ${isGoogleNews ? "Google News RSS" : "RSS"} source: ${response.status}`);
    payload = await readBoundedText(response, RSS_MAX_RESPONSE_BYTES);
  }
  if (looksLikeHtml(payload)) throw new Error(`Could not parse ${isGoogleNews ? "Google News RSS" : "RSS"} source: upstream returned HTML instead of a feed`);
  const isJsonFeed = !isGoogleNews && (response.headers.get("content-type")?.toLowerCase().includes("json") || /^[\s\r\n]*[\[{]/.test(payload));
  const payloadHash = await sha256(payload);
  if (cursor.payloadHash === payloadHash) {
    await input.repo.updateSourceState({
      sourceId: input.source.id,
      lastCheckedAt: now.toISOString(),
      cursor: { ...cursor, etag: response.headers.get("etag") ?? cursor.etag, lastModified: response.headers.get("last-modified") ?? cursor.lastModified, payloadHash }
    }, now);
    await markSourceFetch(input.repo, input.briefing.id, now);
    await input.repo.recordSourceSuccess(input.source.id, undefined, now);
    return { sourceId: input.source.id, title: input.source.title, url, fetched: 0, imported: 0, queued: 0, skipped: 0, provider: "rss", kind: isGoogleNews ? "google_news" : "rss_feed" };
  }
  const rawPayloadKey = `${isGoogleNews ? "google-news" : isJsonFeed ? "json-feed" : "rss"}/${input.briefing.id}/${input.source.id}/${now.getTime()}.${isJsonFeed ? "json" : "xml"}`;
  await input.bucket.put(rawPayloadKey, payload, {
    httpMetadata: { contentType: isJsonFeed ? "application/json; charset=utf-8" : "application/rss+xml; charset=utf-8" }
  });

  const parser = isGoogleNews ? parseGoogleNewsRssFeed : isJsonFeed ? parseJsonNewsFeed : parseRssFeed;
  const messages = parser(payload, {
    sourceId: input.source.id,
    sourceTitle: input.source.title,
    sourceUrl: url,
    receivedAt: now,
    retentionDays: input.briefing.retentionDays,
    rawPayloadKey,
    publisherTimeZone: isJsonFeed ? directPublisherTimeZone(url) : undefined
  });
  const result = await persistMessages({ ...input, messages, now });
  await markSourceFetch(input.repo, input.briefing.id, now);
  if (result.imported > 0) await markImportedMessage(input.repo, input.briefing.id, now);
  await input.repo.updateSourceState({
    sourceId: input.source.id,
    lastCheckedAt: now.toISOString(),
    lastSeenAt: messages[0]?.receivedAt ?? now.toISOString(),
    sourceUrl: response.url || url,
    cursor: {
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      payloadHash
    }
  }, now);
  await input.repo.recordSourceSuccess(input.source.id, result.imported > 0 ? now.toISOString() : undefined, now);

  return {
    ...result,
    sourceId: input.source.id,
    title: messages[0]?.source.title ?? input.source.title,
    url,
    provider: "rss",
    kind: isGoogleNews ? "google_news" : "rss_feed"
  };
}

/**
 * A publisher API without an ISO offset needs an explicit source contract.
 * Keep this small, reviewed registry rather than guessing from a country's
 * hostname or changing timestamps based on the server clock.
 */
function directPublisherTimeZone(sourceUrl: string): string | undefined {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (hostname === "mtv.com.lb" || hostname.endsWith(".mtv.com.lb")) return "Asia/Beirut";
  } catch {
    // The URL was already validated by source ingestion; leave unknown APIs
    // on the existing UTC-safe fallback if it is malformed.
  }
  return undefined;
}

async function ingestBraveNewsSource(input: SourceRefreshInput & {
  source: SourceRecord;
  sourceUrl: string;
  now: Date;
}): Promise<SourceIngestResult> {
  const token = input.env?.BRAVE_SEARCH_API_KEY;
  if (!token) throw new Error("BRAVE_SEARCH_API_KEY is not configured.");
  if (isHostedEnvironment(input.env) || !(await runtimeProviderEnabled(input.repo, input.env ?? {}, "brave"))) {
    throw new Error("Brave News is disabled on this deployment.");
  }
  const query = googleNewsQueryFromSource(input.source);
  if (!query) throw new Error("Google News source query is missing.");

  const idempotencyKey = paidOperationKey(
    "brave",
    input.source.canonicalKey ?? input.source.id,
    query,
    input.now,
    HOUR_MS
  );
  const reservation = await input.repo.reserveSpend({
    idempotencyKey,
    accountId: input.briefing.ownerAccountId,
    briefingId: input.briefing.id,
    category: "collection",
    provider: "brave",
    amountUsd: BRAVE_NEWS_SEARCH_COST_USD,
    limits: collectionSpendLimits(input.env),
    metadata: { sourceId: input.source.id, actorId: BRAVE_NEWS_ACTOR_ID }
  }, input.now);
  if (reservation.status === "denied") {
    throw new Error(`Brave News budget reached (${reservation.reason ?? "limit"})`);
  }
  if (reservation.status === "duplicate") {
    throw new Error("Brave News request already reserved for this source window.");
  }
  const run = await input.repo.createSourceRun({
    sourceId: input.source.id,
    briefingId: input.briefing.id,
    provider: "rss",
    actorId: BRAVE_NEWS_ACTOR_ID,
    state: "queued",
    estimatedCostUsd: BRAVE_NEWS_SEARCH_COST_USD,
    idempotencyKey,
    startedAt: input.now.toISOString()
  }, input.now);

  const url = new URL("https://api.search.brave.com/res/v1/news/search");
  url.searchParams.set("q", query.slice(0, 400));
  url.searchParams.set("count", "20");
  url.searchParams.set("country", "ALL");
  url.searchParams.set("search_lang", input.briefing.language);
  url.searchParams.set("freshness", "pd");
  url.searchParams.set("safesearch", "moderate");
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        accept: "application/json",
        "x-subscription-token": token,
        "user-agent": "Distilled.news news source reader"
      },
      signal: controller.signal
    });
  } catch (error) {
    await input.repo.settleSpend({ idempotencyKey, actualUsd: BRAVE_NEWS_SEARCH_COST_USD }, input.now);
    await input.repo.updateSourceRun({
      id: run.id,
      state: "failed",
      itemCount: 0,
      actualCostUsd: BRAVE_NEWS_SEARCH_COST_USD,
      error: error instanceof Error ? error.message : String(error),
      completedAt: input.now.toISOString()
    }, input.now);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out fetching Brave News source after ${RSS_FETCH_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    await input.repo.settleSpend({ idempotencyKey, actualUsd: BRAVE_NEWS_SEARCH_COST_USD }, input.now);
    await input.repo.updateSourceRun({
      id: run.id,
      state: "failed",
      itemCount: 0,
      actualCostUsd: BRAVE_NEWS_SEARCH_COST_USD,
      error: `Brave News returned ${response.status}`,
      completedAt: input.now.toISOString()
    }, input.now);
    throw new Error(`Could not fetch Brave News source: ${response.status}`);
  }

  const payload = await readBoundedJson<BraveNewsResponse>(response, APIFY_CONTROL_MAX_RESPONSE_BYTES, "Brave News");
  const rawPayloadKey = `brave-news/${input.briefing.id}/${input.source.id}/${input.now.getTime()}.json`;
  await input.bucket.put(rawPayloadKey, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  const messages = (payload.results ?? []).slice(0, 20).flatMap((item): NormalizedMessage[] => {
    const resultUrl = safePublicResultUrl(item.url);
    const title = plainSearchText(item.title);
    if (!resultUrl || !title) return [];
    const description = plainSearchText(item.description);
    const postedAt = validSearchDate(item.page_age) ?? validSearchDate(item.page_fetched) ?? input.now.toISOString();
    const expiresAt = new Date(postedAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + input.briefing.retentionDays);
    const hostname = item.meta_url?.hostname ?? new URL(resultUrl).hostname.replace(/^www\./, "");
    const messageKey = stableSourceHash(`${input.source.canonicalKey ?? input.source.id}|${resultUrl}`).toString(36);
    return [{
      id: `brave_news_${messageKey}`,
      source: {
        id: input.source.id,
        title: hostname,
        type: "channel",
        provider: "rss",
        kind: "google_news"
      },
      messageId: messageKey,
      text: [title, description].filter(Boolean).join(". "),
      links: [resultUrl],
      media: [],
      postedAt,
      receivedAt: input.now.toISOString(),
      sourceUrl: resultUrl,
      rawPayloadKey,
      expiresAt: expiresAt.toISOString()
    }];
  });
  const result = await persistMessages({ ...input, messages });
  await input.repo.settleSpend({ idempotencyKey, actualUsd: BRAVE_NEWS_SEARCH_COST_USD }, input.now);
  await input.repo.updateSourceRun({
    id: run.id,
    state: "succeeded",
    itemCount: messages.length,
    actualCostUsd: BRAVE_NEWS_SEARCH_COST_USD,
    archiveKey: rawPayloadKey,
    completedAt: input.now.toISOString()
  }, input.now);
  await input.repo.updateSourceState({
    sourceId: input.source.id,
    lastCheckedAt: input.now.toISOString(),
    lastSeenAt: messages[0]?.receivedAt ?? input.now.toISOString()
  }, input.now);
  await markSourceFetch(input.repo, input.briefing.id, input.now);
  if (result.imported > 0) await markImportedMessage(input.repo, input.briefing.id, input.now);
  return {
    ...result,
    sourceId: input.source.id,
    title: input.source.title,
    url: input.sourceUrl,
    provider: "rss",
    kind: "google_news"
  };
}

interface BraveNewsResponse {
  results?: Array<{
    title?: string;
    url?: string;
    description?: string;
    page_age?: string;
    page_fetched?: string;
    meta_url?: { hostname?: string };
  }>;
}

function safePublicResultUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return assertSafePublicUrl(value);
  } catch {
    return undefined;
  }
}

function plainSearchText(value: string | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function validSearchDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

async function fetchRssResponse(fetcher: typeof fetch, initialUrl: string, headers: Headers): Promise<Response> {
  let current = assertSafePublicUrl(initialUrl);
  for (let redirect = 0; redirect <= RSS_MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetcher(current, { headers, redirect: "manual", signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`Timed out fetching RSS source after ${RSS_FETCH_TIMEOUT_MS / 1000} seconds`);
      throw error;
    } finally { clearTimeout(timeout); }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("RSS source redirected without a location");
    if (redirect >= RSS_MAX_REDIRECTS) throw new Error("RSS source redirected too many times");
    current = assertSafePublicUrl(new URL(location, current).toString());
  }
  throw new Error("RSS source redirected too many times");
}

function assertSafePublicUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("RSS source must use HTTP or HTTPS");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || host.startsWith("127.") || host.startsWith("169.254.") || host.startsWith("10.") || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^fc|^fd|^fe80:/i.test(host)) {
    throw new Error("RSS source resolves to a private or local address");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  return readBoundedResponseText(response, maxBytes, "RSS source");
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  label: string
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`${label} response exceeds ${maxBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`${label} response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function readBoundedJson<T>(response: Response, maxBytes: number, label: string): Promise<T> {
  const text = await readBoundedResponseText(response, maxBytes, label);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out fetching upstream after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sourceFetchCursor(value: unknown): { etag?: string; lastModified?: string; payloadHash?: string } {
  return value && typeof value === "object" && !Array.isArray(value) ? value as { etag?: string; lastModified?: string; payloadHash?: string } : {};
}
function looksLikeHtml(value: string): boolean { return /^\s*(?:<!doctype\s+html|<html\b)/i.test(value); }
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

async function startCappedApifySourceRun(input: SourceRefreshInput & {
  source: SourceRecord;
}): Promise<SourceIngestResult | undefined> {
  const maxItems = apifyRunMaxItems(input.source);
  if (maxItems === undefined) return undefined;
  const now = input.now ?? new Date();
  const actorId = apifyActorIdForRefresh(input.source, input.env);
  const actorBuild = apifyActorBuildForRefresh(input.source, input.env, actorId);
  const estimatedCostUsd = apifyEstimatedCostUsd(input.source, input.env, actorId, maxItems);
  try {
    return await startApifySourceRun({
      ...input,
      actorId,
      actorBuild,
      actorInput: apifyActorInputForRefresh(input.source, input.briefing, now, maxItems, actorId),
      maxItems,
      estimatedCostUsd
    });
  } catch (error) {
    const fallbackActorId = googleNewsFallbackActorId(input.source, input.env);
    if (!fallbackActorId || fallbackActorId === actorId || !shouldTryGoogleNewsFallback(error)) throw error;
    return startApifySourceRun({
      ...input,
      actorId: fallbackActorId,
      actorBuild: apifyActorBuildForRefresh(input.source, input.env, fallbackActorId),
      actorInput: apifyActorInputForRefresh(input.source, input.briefing, now, maxItems, fallbackActorId),
      maxItems,
      estimatedCostUsd: apifyEstimatedCostUsd(input.source, input.env, fallbackActorId, maxItems)
    });
  }
}

async function startApifySourceRun(input: SourceRefreshInput & {
  source: SourceRecord;
  actorId?: string;
  actorBuild?: string;
  actorInput?: unknown;
  estimatedCostUsd?: number;
  maxItems?: number;
}): Promise<SourceIngestResult> {
  const now = input.now ?? new Date();
  if (!input.env?.APIFY_API_TOKEN) throw new Error("APIFY_API_TOKEN is not configured.");
  const estimatedCost = Math.max(APIFY_MINIMUM_RUN_CHARGE_USD, input.estimatedCostUsd ?? 0);
  const actorId = input.actorId ?? input.source.actorId;
  const actorInput = input.actorInput ?? input.source.actorInput ?? {};
  if (!actorId) throw new Error("Apify actor is not configured for this source.");
  const actorBuild = input.actorBuild ?? apifyActorBuildForRefresh(input.source, input.env, actorId);
  const idempotencyKey = paidOperationKey(
    "apify",
    input.source.canonicalKey ?? input.source.id,
    `${actorId}@${actorBuild}`,
    now,
    sourceRefreshIntervalMs(input.briefing, input.source)
  );
  const reservation = await input.repo.reserveSpend({
    idempotencyKey,
    accountId: input.briefing.ownerAccountId,
    briefingId: input.briefing.id,
    category: "collection",
    provider: "apify",
    amountUsd: estimatedCost,
    limits: collectionSpendLimits(input.env),
    metadata: { sourceId: input.source.id, actorId, actorBuild, maxItems: input.maxItems }
  }, now);
  if (reservation.status === "denied") {
    throw new Error(`Collection budget reached (${reservation.reason ?? "limit"})`);
  }
  if (reservation.status === "duplicate") {
    return skippedApifySourceRun(input.source);
  }
  const sourceRun = await input.repo.createSourceRun({
    sourceId: input.source.id,
    briefingId: input.briefing.id,
    provider: "apify",
    actorId,
    state: "queued",
    estimatedCostUsd: estimatedCost,
    idempotencyKey,
    startedAt: now.toISOString()
  }, now);

  let actorRun: ApifyRunPayload;
  try {
    actorRun = await runApifyActor(actorId, actorInput, input.env.APIFY_API_TOKEN, input.fetcher, {
      maxItems: input.maxItems,
      build: actorBuild,
      maxTotalChargeUsd: estimatedCost
    });
  } catch (error) {
    await input.repo.settleSpend({ idempotencyKey, actualUsd: estimatedCost }, now);
    await input.repo.updateSourceRun({
      id: sourceRun.id,
      state: "failed",
      actualCostUsd: estimatedCost,
      error: error instanceof Error ? error.message : String(error),
      completedAt: now.toISOString()
    }, now);
    throw error;
  }
  await input.repo.updateSourceRun({
    id: sourceRun.id,
    actorRunId: actorRun.id,
    datasetId: actorRun.defaultDatasetId,
    state: "running"
  }, now);
  await input.repo.updateSourceState({
    sourceId: input.source.id,
    lastCheckedAt: now.toISOString()
  }, now);
  await markSourceFetch(input.repo, input.briefing.id, now);

  return {
    sourceId: input.source.id,
    title: input.source.title,
    url: input.source.sourceUrl ?? input.source.url ?? input.source.input ?? input.source.id,
    fetched: 0,
    imported: 0,
    queued: 0,
    skipped: 0,
    provider: "apify",
    kind: input.source.kind,
    runStarted: true
  };
}

async function pollApifySourceRun(input: SourceRefreshInput & {
  source: SourceRecord;
  run: SourceRunRecord;
}): Promise<void> {
  if (!input.env?.APIFY_API_TOKEN) throw new Error("APIFY_API_TOKEN is not configured.");
  if (!input.run.actorRunId) throw new Error("Apify run id is missing.");

  const now = input.now ?? new Date();
  const actorRun = await getApifyRun(input.run.actorRunId, input.env.APIFY_API_TOKEN, input.fetcher);
  if (actorRun.status === "READY" || actorRun.status === "RUNNING") {
    await input.repo.updateSourceRun({
      id: input.run.id,
      datasetId: actorRun.defaultDatasetId,
      state: "running"
    }, now);
    return;
  }

  if (actorRun.status !== "SUCCEEDED") {
    const error = `Apify run ${actorRun.status.toLowerCase()}`;
    await settleSourceRunSpend(input.repo, input.run, actorRun.usageTotalUsd, now);
    await input.repo.updateSourceRun({
      id: input.run.id,
      state: "failed",
      datasetId: actorRun.defaultDatasetId,
      actualCostUsd: actorRun.usageTotalUsd,
      error,
      completedAt: now.toISOString()
    }, now);
    await recordSourceGroupFailure(
      input.repo,
      input.source,
      error,
      "apify_run",
      new Date(now.getTime() + sourceFailureBackoffMs(input.source)).toISOString(),
      now
    );
    return;
  }

  const datasetId = actorRun.defaultDatasetId ?? input.run.datasetId;
  if (!datasetId) throw new Error("Apify run succeeded without a dataset id.");
  const items = await getApifyDatasetItems(datasetId, input.env.APIFY_API_TOKEN, input.fetcher);
  const rawPayloadKey = `apify/${input.briefing.id}/${input.source.id}/${actorRun.id}/items.json`;
  await input.bucket.put(rawPayloadKey, JSON.stringify(items), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });

  const messages = normalizeApifyDatasetItems(items, {
    sourceId: input.source.id,
    sourceTitle: input.source.title,
    kind: input.source.kind,
    receivedAt: now,
    retentionDays: input.briefing.retentionDays,
    rawPayloadKey
  });
  const unusableDataset = describeUnusableApifyDataset(items, messages.length);
  if (unusableDataset) {
    await settleSourceRunSpend(input.repo, input.run, actorRun.usageTotalUsd, now);
    await input.repo.updateSourceRun({
      id: input.run.id,
      state: unusableDataset.failed ? "failed" : "succeeded",
      datasetId,
      itemCount: 0,
      archiveKey: rawPayloadKey,
      actualCostUsd: actorRun.usageTotalUsd,
      error: unusableDataset.message,
      completedAt: now.toISOString()
    }, now);
    if (unusableDataset.failed) {
      await recordSourceGroupFailure(
        input.repo,
        input.source,
        unusableDataset.message,
        "apify_dataset",
        new Date(now.getTime() + sourceFailureBackoffMs(input.source)).toISOString(),
        now
      );
    } else {
      await recordSourceGroupSuccess(input.repo, input.source, undefined, now);
    }
    return;
  }

  const result = await persistMessages({ ...input, messages, now });
  await settleSourceRunSpend(input.repo, input.run, actorRun.usageTotalUsd, now);
  await input.repo.updateSourceRun({
    id: input.run.id,
    state: "succeeded",
    datasetId,
    itemCount: items.length,
    archiveKey: rawPayloadKey,
    actualCostUsd: actorRun.usageTotalUsd,
    error: nullError(),
    completedAt: now.toISOString()
  }, now);
  await input.repo.updateSourceState({
    sourceId: input.source.id,
    lastSeenAt: messages[0]?.receivedAt ?? now.toISOString(),
    cursor: nextApifyCursor(input.source, messages)
  }, now);
  for (const equivalent of await input.repo.listEquivalentSources(input.source.id)) {
    if (equivalent.id === input.source.id) continue;
    await input.repo.updateSourceState({
      sourceId: equivalent.id,
      cursor: nextApifyCursor(equivalent, messages)
    }, now);
  }
  await recordSourceGroupSuccess(input.repo, input.source, result.imported > 0 ? now.toISOString() : undefined, now);
  await markSourceFetch(input.repo, input.briefing.id, now);
  if (result.imported > 0) await markImportedMessage(input.repo, input.briefing.id, now);
}

export function describeUnusableApifyDataset(
  items: unknown[],
  normalizedCount: number
): { message: string; failed: boolean } | null {
  if (normalizedCount > 0 || items.length === 0) return null;
  const records = items
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (records.length === 0) return null;

  if (records.every((item) => item.demo === true)) {
    return {
      message: "Apify returned demo placeholders instead of live source records. The configured X actor requires a paid Apify plan for live data.",
      failed: true
    };
  }
  if (records.every((item) => item.noResults === true)) {
    return {
      message: "Apify returned no results for this source input.",
      failed: false
    };
  }
  if (records.every((item) => item.resultType === "diagnostic" && item.status === "zero-output")) {
    return {
      message: "Apify returned no results for this X source input.",
      failed: false
    };
  }

  return {
    message: "Apify returned items, but none matched the expected source schema.",
    failed: true
  };
}

async function persistMessages(input: SourceRefreshInput & {
  source: SourceRecord;
  messages: NormalizedMessage[];
  now: Date;
}): Promise<Omit<SourceIngestResult, "sourceId" | "url">> {
  let imported = 0;
  let queued = 0;
  let skipped = 0;
  const equivalentSources = await input.repo.listEquivalentSources(input.source.id);
  const targets = equivalentSources.length > 0 ? equivalentSources : [input.source];

  for (const message of input.messages) {
    if (new Date(message.expiresAt).getTime() <= input.now.getTime()) {
      skipped += 1;
      continue;
    }
    const canonicalMessageId = `canonical_${(await sha256(`${input.source.canonicalKey ?? input.source.id}|${message.messageId}`)).slice(0, 32)}`;
    for (const target of targets) {
      const briefing = await input.repo.getBriefingById(target.briefingId);
      if (!briefing || briefing.paused || !briefing.publicFeedEnabled || !target.enabled) continue;
      const owner = await input.repo.getAccountById(briefing.ownerAccountId);
      if (!owner || owner.disabledAt) continue;
      if (!isMessageWithinIngestHorizon(briefing, message.postedAt, input.now)) {
        skipped += 1;
        continue;
      }
      const targetMessage = {
        ...message,
        source: { ...message.source, id: target.id }
      };
      const resolvedTarget = await input.repo.upsertSourceFromMessage(target.briefingId, targetMessage, input.now);
      const persistedMessage = {
        ...targetMessage,
        id: scopedRawMessageId(target.briefingId, canonicalMessageId),
        source: {
          ...targetMessage.source,
          id: resolvedTarget.id
        }
      };
      const existing = await input.repo.getRawMessage(persistedMessage.id);
      if (existing) {
        skipped += 1;
        continue;
      }

      const jobId = await input.repo.saveRawMessageAndCreateProcessingJob(target.briefingId, persistedMessage, input.now);
      await input.queue.send({ jobId, briefingId: target.briefingId, rawMessageId: persistedMessage.id });
      await input.repo.markProcessingJobEnqueued(jobId, input.now);
      imported += 1;
      queued += 1;
    }
  }

  return {
    fetched: input.messages.length,
    imported,
    queued,
    skipped,
    title: input.messages[0]?.source.title
  };
}

async function markSourceFetch(repo: Repository, briefingId: string, now: Date): Promise<void> {
  await repo.setSetting("last_source_fetch_at", now.toISOString(), now);
  await repo.setSetting(`last_source_fetch_at:${briefingId}`, now.toISOString(), now);
}

async function markImportedMessage(repo: Repository, briefingId: string, now: Date): Promise<void> {
  await repo.setSetting("last_imported_message_at", now.toISOString(), now);
  await repo.setSetting(`last_imported_message_at:${briefingId}`, now.toISOString(), now);
  await repo.setSetting("last_source_event_at", now.toISOString(), now);
  await repo.setSetting(`last_source_event_at:${briefingId}`, now.toISOString(), now);
}

async function runApifyActor(
  actorId: string,
  actorInput: unknown,
  token: string,
  fetcher = fetch,
  options: { maxItems?: number; build: string; maxTotalChargeUsd: number }
): Promise<ApifyRunPayload> {
  const url = new URL(`https://api.apify.com/v2/actors/${encodeApifyActorId(actorId)}/runs`);
  if (options.maxItems !== undefined) url.searchParams.set("maxItems", String(options.maxItems));
  url.searchParams.set("build", options.build);
  url.searchParams.set("maxTotalChargeUsd", options.maxTotalChargeUsd.toFixed(6));
  const response = await fetchWithTimeout(fetcher, url.toString(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(actorInput ?? {})
  }, APIFY_FETCH_TIMEOUT_MS);
  const payload: { data?: ApifyRunPayload; error?: { message?: string } } =
    await readBoundedJson<{ data?: ApifyRunPayload; error?: { message?: string } }>(
    response,
    APIFY_CONTROL_MAX_RESPONSE_BYTES,
    "Apify actor start"
  ).catch(() => ({}));
  if (!response.ok || !payload.data) {
    throw new Error(`Apify actor run failed to start: ${payload.error?.message ?? response.status}`);
  }
  return payload.data;
}

async function getApifyRun(runId: string, token: string, fetcher = fetch): Promise<ApifyRunPayload> {
  const response = await fetchWithTimeout(fetcher, `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, {
    headers: { authorization: `Bearer ${token}` }
  }, APIFY_FETCH_TIMEOUT_MS);
  const payload: { data?: ApifyRunPayload; error?: { message?: string } } =
    await readBoundedJson<{ data?: ApifyRunPayload; error?: { message?: string } }>(
    response,
    APIFY_CONTROL_MAX_RESPONSE_BYTES,
    "Apify run status"
  ).catch(() => ({}));
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? `Could not fetch Apify run: ${response.status}`);
  }
  return payload.data;
}

async function getApifyDatasetItems(datasetId: string, token: string, fetcher = fetch): Promise<unknown[]> {
  const response = await fetchWithTimeout(
    fetcher,
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=50`,
    {
    headers: { authorization: `Bearer ${token}` }
    },
    APIFY_FETCH_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`Could not fetch Apify dataset items: ${response.status}`);
  const payload = await readBoundedJson<unknown>(
    response,
    APIFY_DATASET_MAX_RESPONSE_BYTES,
    "Apify dataset"
  );
  return Array.isArray(payload) ? payload : [];
}

function encodeApifyActorId(actorId: string): string {
  return encodeURIComponent(actorId.replace("/", "~"));
}

function isSourceRefreshDue(briefing: BriefingConfig, source: SourceRecord, now: Date): boolean {
  if (source.nextRetryAt) return source.nextRetryAt <= now.toISOString();
  if (source.provider === "telegram") return Boolean(source.url);
  if (source.provider === "rss") return Boolean(source.sourceUrl ?? source.url);
  if (source.provider === "apify") return true;
  return !briefing.paused;
}

function sourceRefreshIntervalMs(briefing: BriefingConfig, source: SourceRecord): number {
  return sourceRefreshIntervalFor(
    briefing.briefingCadence,
    source.provider,
    source.kind
  );
}

function sourceRefreshIntervalFor(
  cadence: BriefingConfig["briefingCadence"],
  provider: SourceRecord["provider"],
  kind: SourceRecord["kind"]
): number {
  if (kind === "google_news") return apifyRefreshIntervalForCadence(cadence);
  if (provider === "telegram") return TELEGRAM_REFRESH_INTERVAL_MS;
  if (provider === "rss") return RSS_REFRESH_INTERVAL_MS;
  if (provider === "apify") return apifyRefreshIntervalForCadence(cadence);
  return HOUR_MS;
}

function sourceFailureBackoffMs(source: SourceRecord): number {
  const retryMinutes = [2, 5, 15, 30, 60];
  const baseMs = retryMinutes[Math.min(source.consecutiveFailures ?? 0, retryMinutes.length - 1)] * 60 * 1000;
  const jitterWindowMs = source.kind === "google_news"
    ? GOOGLE_NEWS_REFRESH_INTERVAL_MS
    : 4 * 60 * 1000;
  const jitterMs = stableSourceHash(sourceRefreshIdentity(source)) % jitterWindowMs;
  return baseMs + jitterMs;
}

async function hasLargeProcessingBacklog(repo: Repository, briefingId: string): Promise<boolean> {
  const jobs = await repo.listProcessingJobs({
    briefingId,
    states: ["queued"],
    limit: PROCESSING_BACKLOG_REFRESH_PAUSE_LIMIT
  });
  return jobs.length >= PROCESSING_BACKLOG_REFRESH_PAUSE_LIMIT;
}

function apifyRefreshIntervalMs(briefing: BriefingConfig): number {
  return apifyRefreshIntervalForCadence(briefing.briefingCadence);
}

function apifyRefreshIntervalForCadence(cadence: BriefingConfig["briefingCadence"]): number {
  if (cadence === "daily") return 6 * HOUR_MS;
  if (cadence === "weekly" || cadence === "monthly") return 24 * HOUR_MS;
  return HOUR_MS;
}

function nextSourceRefreshAt(briefing: BriefingConfig, source: SourceRecord, now: Date): string {
  if (source.provider === "apify" && briefing.briefingCadence === "hourly") {
    const next = new Date(now);
    next.setUTCMinutes(45, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
    return next.toISOString();
  }
  const intervalMs = sourceRefreshIntervalMs(briefing, source);
  return nextStaggeredSourceRefreshAt(source, now, intervalMs).toISOString();
}

function nextStaggeredSourceRefreshAt(source: SourceRecord, now: Date, intervalMs: number): Date {
  const intervalMinutes = Math.max(1, Math.round(intervalMs / 60_000));
  const offset = stableSourceHash(sourceRefreshIdentity(source)) % intervalMinutes;
  const nowMinute = Math.floor(now.getTime() / 60_000);
  const base = Math.floor(nowMinute / intervalMinutes) * intervalMinutes;
  let candidateMinute = base + offset;
  if (candidateMinute <= nowMinute) candidateMinute += intervalMinutes;
  const candidate = new Date(candidateMinute * 60_000);
  return candidate;
}

function sourceRefreshIdentity(source: SourceRecord): string {
  return source.canonicalKey ?? source.sourceUrl ?? source.url ?? source.input ?? source.id;
}

function stableSourceHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function sourceFailureClass(error: unknown, source: SourceRecord): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/(?:source|channel|fetch)[^:]*:\s*(\d{3})/i)?.[1];
  if (status) return `upstream_${status}`;
  if (/timed out|abort/i.test(message)) return "timeout";
  if (/budget/i.test(message)) return "budget";
  if (source.provider === "telegram") return "telegram_transport";
  if (source.kind === "google_news") return "google_news_transport";
  if (source.provider === "apify") return "apify_start";
  return "source_transport";
}

function isProviderDisabledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /provider is disabled|disabled on hosted Distilled\.news|disabled on this deployment/i.test(message);
}

function isCollectionBudgetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:Collection|Brave News) budget reached/i.test(message);
}

function millisecondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60_000, next - now.getTime());
}

async function recordSourceGroupSuccess(
  repo: Repository,
  source: SourceRecord,
  newItemAt: string | undefined,
  now: Date
): Promise<void> {
  const sources = await repo.listEquivalentSources(source.id);
  for (const equivalent of sources.length > 0 ? sources : [source]) {
    await repo.recordSourceSuccess(equivalent.id, newItemAt, now);
  }
}

async function recordSourceGroupFailure(
  repo: Repository,
  source: SourceRecord,
  error: string,
  failureClass: string,
  nextRetryAt: string,
  now: Date
): Promise<void> {
  const sources = await repo.listEquivalentSources(source.id);
  for (const equivalent of sources.length > 0 ? sources : [source]) {
    await repo.recordSourceFailure({ sourceId: equivalent.id, error, failureClass, nextRetryAt }, now);
  }
  await repo.rescheduleCanonicalSourceRefresh(source.id, nextRetryAt, error, now);
}

function apifyRunMaxItems(source: SourceRecord): number | undefined {
  const input = recordValue(source.actorInput);
  if (source.kind === "google_news") {
    return Math.max(1, Math.floor(Math.min(
      numberValue(input.maxResults ?? input.maxItemsPerQuery ?? input.maxItems, GOOGLE_NEWS_MAX_ITEMS),
      GOOGLE_NEWS_MAX_ITEMS
    )));
  }
  if (isXSource(source)) {
    return Math.max(1, Math.floor(Math.min(numberValue(input.maxItems, X_MAX_ITEMS), X_MAX_ITEMS)));
  }
  return undefined;
}

function apifyActorIdForRefresh(source: SourceRecord, env: Partial<Env> | undefined): string | undefined {
  if (source.kind !== "google_news") return source.actorId;
  const primaryActorId = source.actorId ?? env?.APIFY_GOOGLE_NEWS_ACTOR_ID ?? DEFAULT_GOOGLE_NEWS_ACTOR_ID;
  const fallbackActorId = googleNewsFallbackActorId(source, env);
  return (source.consecutiveFailures ?? 0) > 0 && fallbackActorId !== primaryActorId
    ? fallbackActorId
    : primaryActorId;
}

function googleNewsFallbackActorId(source: SourceRecord, env: Partial<Env> | undefined): string | undefined {
  if (source.kind !== "google_news") return undefined;
  return env?.APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_ID ?? DEFAULT_GOOGLE_NEWS_FALLBACK_ACTOR_ID;
}

function apifyEstimatedCostUsd(
  source: SourceRecord,
  env: Partial<Env> | undefined,
  actorId: string | undefined,
  maxItems: number
): number {
  if (source.kind !== "google_news") {
    return APIFY_ACTOR_START_CHARGE_USD + (maxItems / 1000) * positiveNumber(
      env?.APIFY_X_PRICE_USD_PER_1000_RESULTS,
      DEFAULT_X_PRICE_PER_1000_TWEETS_USD
    );
  }
  const fallbackActorId = googleNewsFallbackActorId(source, env);
  const pricePerThousand = actorId === fallbackActorId
    ? positiveNumber(
      env?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS,
      DEFAULT_GOOGLE_NEWS_FALLBACK_PRICE_PER_1000_RESULTS_USD
    )
    : positiveNumber(
      env?.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS,
      DEFAULT_GOOGLE_NEWS_PRICE_PER_1000_RESULTS_USD
    );
  return APIFY_ACTOR_START_CHARGE_USD + (maxItems / 1000) * pricePerThousand;
}

function shouldTryGoogleNewsFallback(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Apify actor run failed to start:");
}

function apifyActorInputForRefresh(
  source: SourceRecord,
  briefing: BriefingConfig,
  now: Date,
  maxItems: number,
  actorId = source.actorId
): Record<string, unknown> {
  if (source.kind === "google_news") {
    const query = googleNewsQueryFromSource(source);
    if (!query) throw new Error("Google News source query is missing.");
    const locale = googleNewsLocale(briefing.language);
    return googleNewsActorInput(query, locale.language, locale.geo, maxItems, actorId);
  }

  const actorInput: Record<string, unknown> = { ...recordValue(source.actorInput), maxItems };
  if (!isXSource(source)) return actorInput;
  const cursor = recordValue(source.cursor);
  const previousPostedAt = stringValue(cursor.latestPostedAt);
  const previousTime = previousPostedAt ? Date.parse(previousPostedAt) : Number.NaN;
  const lowerBound = Math.max(
    Number.isFinite(previousTime) ? previousTime - 10 * 60 * 1000 : 0,
    now.getTime() - 2 * HOUR_MS
  );
  actorInput.since_time = String(Math.floor(lowerBound / 1000));
  actorInput.until_time = String(Math.floor(now.getTime() / 1000));
  const latestMessageId = stringValue(cursor.latestMessageId);
  if (latestMessageId && /^\d+$/.test(latestMessageId)) actorInput.since_id = latestMessageId;
  return actorInput;
}

function googleNewsActorInput(
  query: string,
  language: string,
  country: string,
  maxResults = GOOGLE_NEWS_MAX_ITEMS,
  actorId = DEFAULT_GOOGLE_NEWS_ACTOR_ID
): Record<string, unknown> {
  if (actorId === DEFAULT_GOOGLE_NEWS_ACTOR_ID || actorId.includes("groupoject/google-news-scraper")) {
    return {
      queries: [query],
      geo: country,
      language,
      postedWithinDays: 1,
      maxItemsPerQuery: maxResults,
      maxQueries: 1,
      dedupe: true,
      monitoringMode: true,
      monitorKey: `distilled-${stableSourceHash(`${language}|${country}|${query.toLowerCase()}`).toString(36)}`,
      monitoringInitialRun: "emit",
      enableAnalysis: false,
      requestDelayMs: 0,
      maxConcurrency: 1
    };
  }
  return {
    keywords: [query],
    timeFilter: "hour",
    language,
    country: country === "LB" ? "any" : country,
    includeAuthor: false,
    resolvePublisherUrls: false,
    sortBy: "date",
    deduplicateAcrossKeywords: true,
    expandedSearch: false,
    maxResults,
    maxRequestsPerKeyword: 2
  };
}

function googleNewsLocale(language: BriefingConfig["language"]): { language: string; geo: string } {
  if (language === "fr") return { language: "fr", geo: "FR" };
  if (language === "ar") return { language: "ar", geo: "LB" };
  return { language: "en", geo: "US" };
}

function googleNewsQueryFromDetectedSource(source: DetectedSourceInput): string | undefined {
  if (source.kind !== "google_news") return undefined;
  const actorInput = recordValue(source.actorInput);
  return firstString(Array.isArray(actorInput.keywords) ? actorInput.keywords : undefined) ??
    firstString(Array.isArray(actorInput.queries) ? actorInput.queries : undefined) ??
    googleNewsQueryFromUrl(source.sourceUrl) ??
    source.input.replace(/^news:\s*/i, "").trim();
}

function nextApifyCursor(source: SourceRecord, messages: NormalizedMessage[]): Record<string, unknown> {
  const existing = recordValue(source.cursor);
  if (messages.length === 0) return existing;
  const latest = [...messages].sort((left, right) => right.postedAt.localeCompare(left.postedAt))[0];
  if (!latest) return existing;
  return {
    ...existing,
    latestPostedAt: latest.postedAt,
    latestMessageId: latest.messageId
  };
}

function isXSource(source: SourceRecord): boolean {
  return source.kind === "x_profile" || source.kind === "x_search";
}

function scopedRawMessageId(briefingId: string, rawMessageId: string): string {
  return `${briefingId}::${rawMessageId}`;
}

function skippedApifySourceRun(source: SourceRecord): SourceIngestResult {
  return {
    sourceId: source.id,
    title: source.title,
    url: source.sourceUrl ?? source.url ?? source.input ?? source.id,
    fetched: 0,
    imported: 0,
    queued: 0,
    skipped: 0,
    provider: "apify",
    kind: source.kind
  };
}

function nullError(): undefined {
  return undefined;
}

function rssRequestHeaders(isGoogleNews: boolean): HeadersInit {
  if (!isGoogleNews) {
    return {
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "user-agent": "Distilled.news RSS source reader"
    };
  }
  return {
    accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (compatible; DistilledNewsBot/1.0; +https://distilled.news)"
  };
}

function browserCompatibleRssHeaders(existing: Headers): Headers {
  const headers = new Headers(existing);
  headers.set("accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.5, */*;q=0.1");
  headers.set("accept-language", "en-US,en;q=0.9");
  headers.set("cache-control", "no-cache");
  headers.set("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Distilled.news/1.0");
  return headers;
}

async function assertDetectedSourceEnabled(
  repo: Repository,
  env: Partial<Env>,
  source: DetectedSourceInput
): Promise<void> {
  const runtimeProvider = runtimeProviderForKind(source.kind);
  if (isHostedEnvironment(env) &&
    (runtimeProvider === "linkedin" || runtimeProvider === "generic_apify")) {
    throw new Error(`${runtimeProvider === "linkedin" ? "LinkedIn" : "Generic Apify"} sources are not available on hosted Distilled.news.`);
  }
  if (!(await runtimeProviderEnabled(repo, env, runtimeProvider))) {
    throw new Error(`${runtimeProvider} provider is disabled.`);
  }
}

async function assertSourceEnabled(
  repo: Repository,
  env: Partial<Env>,
  source: SourceRecord
): Promise<void> {
  const runtimeProvider = runtimeProviderForKind(source.kind);
  if (isHostedEnvironment(env) &&
    (runtimeProvider === "linkedin" || runtimeProvider === "generic_apify")) {
    throw new Error(`${runtimeProvider} provider is disabled on hosted Distilled.news.`);
  }
  if (!(await runtimeProviderEnabled(repo, env, runtimeProvider))) {
    throw new Error(`${runtimeProvider} provider is disabled.`);
  }
}

function runtimeProviderForKind(kind: SourceRecord["kind"]): "rss" | "telegram" | "google_news" | "x" | "linkedin" | "generic_apify" {
  if (kind === "rss_feed") return "rss";
  if (kind === "telegram_channel" || kind === "telegram_group") return "telegram";
  if (kind === "google_news") return "google_news";
  if (kind === "x_profile" || kind === "x_search") return "x";
  if (kind === "linkedin_company" || kind === "linkedin_profile") return "linkedin";
  return "generic_apify";
}

async function runtimeProviderEnabled(
  repo: Repository,
  env: Partial<Env>,
  provider: "rss" | "telegram" | "google_news" | "x" | "linkedin" | "generic_apify" | "brave"
): Promise<boolean> {
  const envValue = {
    rss: env.PROVIDER_RSS_ENABLED,
    telegram: env.PROVIDER_TELEGRAM_ENABLED,
    google_news: env.PROVIDER_GOOGLE_NEWS_ENABLED,
    x: env.PROVIDER_X_ENABLED,
    linkedin: env.PROVIDER_LINKEDIN_ENABLED,
    generic_apify: env.PROVIDER_GENERIC_APIFY_ENABLED,
    brave: env.PROVIDER_BRAVE_ENABLED
  }[provider];
  const envEnabled = booleanSetting(envValue);
  if (envEnabled === false) return false;
  if (envEnabled === undefined && isHostedEnvironment(env)) return false;
  const override = booleanSetting(await repo.getSetting(`provider_enabled:${provider}`) ?? undefined);
  return override ?? true;
}

function booleanSetting(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

function isHostedEnvironment(env: Partial<Env> | undefined): boolean {
  const value = env?.ENVIRONMENT?.trim().toLowerCase();
  return value === "production" || value === "staging";
}

function collectionSpendLimits(env: Partial<Env> | undefined) {
  return {
    accountDailyUsd: isHostedEnvironment(env) ? HOSTED_COLLECTION_DAILY_BUDGET_USD : 1_000_000,
    accountMonthlyUsd: isHostedEnvironment(env) ? HOSTED_COLLECTION_MONTHLY_BUDGET_USD : 1_000_000,
    globalDailyUsd: nonNegativeNumber(
      env?.GLOBAL_COLLECTION_DAILY_BUDGET_USD,
      DEFAULT_GLOBAL_COLLECTION_DAILY_BUDGET_USD
    ),
    globalMonthlyUsd: nonNegativeNumber(
      env?.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD,
      DEFAULT_GLOBAL_COLLECTION_MONTHLY_BUDGET_USD
    ),
    totalMonthlyUsd: nonNegativeNumber(env?.TOTAL_MONTHLY_BUDGET_USD, DEFAULT_TOTAL_MONTHLY_BUDGET_USD)
  };
}

function paidOperationKey(
  provider: "apify" | "brave",
  sourceId: string,
  operation: string,
  now: Date,
  intervalMs: number
): string {
  const windowStart = Math.floor(now.getTime() / Math.max(60_000, intervalMs)) * Math.max(60_000, intervalMs);
  return `${provider}:${sourceId}:${stableSourceHash(operation).toString(36)}:${windowStart}`;
}

function apifyActorBuildForRefresh(
  source: SourceRecord,
  env: Partial<Env> | undefined,
  actorId: string | undefined
): string {
  if (!actorId) throw new Error("Apify actor is not configured for this source.");
  if (isXSource(source)) return env?.APIFY_X_ACTOR_BUILD?.trim() || DEFAULT_X_ACTOR_BUILD;
  const fallbackActorId = googleNewsFallbackActorId(source, env);
  if (source.kind === "google_news" && actorId === fallbackActorId) {
    return env?.APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD?.trim() || DEFAULT_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD;
  }
  if (source.kind === "google_news") {
    return env?.APIFY_GOOGLE_NEWS_ACTOR_BUILD?.trim() || DEFAULT_GOOGLE_NEWS_ACTOR_BUILD;
  }
  const actorInput = recordValue(source.actorInput);
  const pinned = stringValue(actorInput.actorBuild ?? actorInput.build);
  if (!pinned) throw new Error("A pinned Apify actor build is required for this source.");
  return pinned;
}

async function settleSourceRunSpend(
  repo: Repository,
  run: SourceRunRecord,
  actualUsd: number | undefined,
  now: Date
): Promise<void> {
  if (!run.idempotencyKey) return;
  await repo.settleSpend({
    idempotencyKey: run.idempotencyKey,
    actualUsd: actualUsd ?? run.estimatedCostUsd ?? 0
  }, now);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function googleNewsSourceUrl(source: SourceRecord): string | undefined {
  const existingUrl = source.sourceUrl ?? source.url;
  if (existingUrl && isGoogleNewsSearchUrl(existingUrl)) return existingUrl;

  const actorInput = recordValue(source.actorInput);
  const query = googleNewsQueryFromSource(source);
  if (!query) return undefined;

  return buildGoogleNewsRssUrl(query, {
    geo: stringValue(actorInput.geo),
    language: stringValue(actorInput.language)
  });
}

function googleNewsQueryFromSource(source: SourceRecord): string | undefined {
  const actorInput = recordValue(source.actorInput);
  return firstString(Array.isArray(actorInput.keywords) ? actorInput.keywords : undefined) ??
    firstString(Array.isArray(actorInput.queries) ? actorInput.queries : undefined) ??
    stringValue(actorInput.query) ??
    googleNewsQueryFromUrl(source.sourceUrl ?? source.url) ??
    source.input?.replace(/^news:\s*/i, "").trim();
}

function googleNewsQueryFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname !== "news.google.com" || url.pathname !== "/rss/search") return undefined;
    return stringValue(url.searchParams.get("q") ?? undefined);
  } catch {
    return undefined;
  }
}

function isGoogleNewsSearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "news.google.com" && url.pathname === "/rss/search";
  } catch {
    return false;
  }
}

function firstString(values: unknown[] | undefined): string | undefined {
  return values?.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

interface ApifyRunPayload {
  id: string;
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";
  defaultDatasetId?: string;
  startedAt?: string;
  usageTotalUsd?: number;
}
