#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertIsolatedStaging,
  combinedEnvironment,
  queueNames,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";
import {
  observationDirectory,
  readObservationWindow,
  resetObservationWindow
} from "./observation-window.mjs";
import {
  buildCanarySourceRunHealthQuery,
  MAXIMUM_RECOVERED_MODEL_FALLBACK_RATE,
  MAXIMUM_RECOVERED_SOURCE_FAILURES,
  MAXIMUM_RECOVERED_SOURCE_FAILURE_RATE,
  modelOperationHealthPass,
  recoveredModelFallbackRate,
  SOURCE_RECOVERY_SLA_MINUTES,
  sourceRunHealthPass
} from "./reliability.mjs";
import {
  CANARY_COLLECTION_PLAN,
  CANARY_GOOGLE_NEWS_PLAN,
  CANARY_LLM_PLAN,
  CANARY_X_PLAN
} from "./cost-plan.mjs";

const jsonOnly = process.argv.includes("--json");
const MAX_OBSERVATION_GAP_MINUTES = 45;
const MINIMUM_24H_OBSERVATIONS = 49;
const criticalGateNames = new Set([
  "release-stability",
  "cohort-size",
  "verified-accounts",
  "routes",
  "source-attempts",
  "source-success",
  "source-run-health",
  "source-freshness",
  "fixture-cadence",
  "processing-failures",
  "publication-failures",
  "meaningful-publication",
  "model-operation-health",
  "model-synthesis",
  "terminal-window-per-feed",
  "hourly-cadence",
  "daily-cadence",
  "spend-cap",
  "spend-settlement",
  "duplicates",
  "queue-lag",
  "dlq-zero-backlog",
  "continuous-observation-history",
  "prior-critical-failures"
]);
const config = readWorkerConfig();
const auditCodeSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: resolve(import.meta.dirname, "..", ".."),
  encoding: "utf8"
}).trim();
const { staging, baseUrl } = assertIsolatedStaging(config, { baseUrl: process.env.CANARY_BASE_URL });
const release = readRelease();
let window = readObservationWindow();
if (!window) window = resetObservationWindow("first-audit", release);
if (!window.versionId && release.versionId) {
  window = resetObservationWindow("release-baseline-established", release);
}
if (release.versionId && window.versionId && release.versionId !== window.versionId) {
  window = resetObservationWindow("staging-release-changed", release);
}
const observedAt = new Date().toISOString();
const hourMs = 60 * 60 * 1000;
const firstCompleteModelHour = new Date(Math.ceil(Date.parse(window.startedAt) / hourMs) * hourMs).toISOString();
const completeModelHoursEnd = new Date(Math.floor(Date.parse(observedAt) / hourMs) * hourMs).toISOString();
const expectedCompleteModelHours = Math.max(
  0,
  Math.round((Date.parse(completeModelHoursEnd) - Date.parse(firstCompleteModelHour)) / hourMs)
);

const inventory = queryOne(`
  SELECT
    COUNT(DISTINCT a.id) AS accounts,
    COUNT(DISTINCT CASE WHEN a.email_verified_at IS NOT NULL THEN a.id END) AS verified_accounts,
    COUNT(DISTINCT b.id) AS feeds,
    COUNT(DISTINCT s.id) AS sources,
    COUNT(DISTINCT CASE WHEN s.id LIKE 'launch_canary_fixture_%' THEN s.id END) AS fixture_sources,
    COUNT(DISTINCT CASE WHEN s.id LIKE 'launch_canary_source_%' THEN s.id END) AS live_sources,
    COUNT(DISTINCT CASE WHEN b.briefing_cadence = 'hourly' THEN b.id END) AS hourly_feeds,
    COUNT(DISTINCT CASE WHEN b.briefing_cadence = 'daily' THEN b.id END) AS daily_feeds,
    SUM(CASE WHEN s.id LIKE 'launch_canary_source_%' AND s.provider = 'rss' THEN 1 ELSE 0 END) AS rss_sources,
    SUM(CASE WHEN s.id LIKE 'launch_canary_source_%' AND s.provider = 'telegram' THEN 1 ELSE 0 END) AS telegram_sources,
    SUM(CASE WHEN s.id LIKE 'launch_canary_source_%' AND s.provider = 'apify' AND s.kind = 'google_news' THEN 1 ELSE 0 END) AS google_news_sources,
    SUM(CASE WHEN s.id LIKE 'launch_canary_source_%' AND s.provider = 'apify' AND s.kind = 'x_profile' THEN 1 ELSE 0 END) AS x_sources,
    (SELECT COUNT(*) FROM paid_provider_seats
      WHERE account_id LIKE 'launch_canary_account_%') AS canary_paid_provider_seats,
    (SELECT COUNT(*) FROM paid_provider_seats) AS total_paid_provider_seats
  FROM accounts a
  LEFT JOIN briefings b ON b.owner_account_id = a.id AND b.id LIKE 'launch_canary_briefing_%'
  LEFT JOIN sources s ON s.briefing_id = b.id
    AND (s.id LIKE 'launch_canary_source_%' OR s.id LIKE 'launch_canary_fixture_%')
  WHERE a.id LIKE 'launch_canary_account_%';
`);

const sources = queryOne(`
  WITH canary_sources AS (
    SELECT
      s.*,
      b.briefing_cadence,
      CASE
        WHEN s.id LIKE 'launch_canary_fixture_%' THEN ${SOURCE_RECOVERY_SLA_MINUTES.fixture}
        WHEN s.kind IN ('x_profile', 'x_search') THEN ${SOURCE_RECOVERY_SLA_MINUTES.x}
        WHEN s.kind = 'google_news' THEN ${SOURCE_RECOVERY_SLA_MINUTES.googleNews}
        WHEN s.provider = 'telegram' THEN ${SOURCE_RECOVERY_SLA_MINUTES.telegram}
        ELSE ${SOURCE_RECOVERY_SLA_MINUTES.rss}
      END AS recovery_sla_minutes
    FROM sources s
    JOIN briefings b ON b.id = s.briefing_id
    WHERE s.id LIKE 'launch_canary_source_%'
       OR s.id LIKE 'launch_canary_fixture_%'
  )
  SELECT
    COUNT(*) AS configured,
    SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled,
    SUM(CASE WHEN s.last_checked_at IS NOT NULL THEN 1 ELSE 0 END) AS attempted,
    SUM(CASE WHEN s.last_success_at IS NOT NULL THEN 1 ELSE 0 END) AS ever_succeeded,
    SUM(CASE WHEN s.last_success_at >= ${sql(window.startedAt)} THEN 1 ELSE 0 END) AS succeeded_in_window,
    SUM(CASE
      WHEN s.last_checked_at IS NULL THEN 1
      WHEN s.id LIKE 'launch_canary_fixture_%'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 minutes') THEN 1
      WHEN s.provider = 'telegram'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 minutes') THEN 1
      WHEN s.provider = 'rss'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes') THEN 1
      WHEN s.kind = 'x_profile' AND s.briefing_cadence = 'daily'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${CANARY_X_PLAN.freshnessHours} hours') THEN 1
      WHEN s.kind = 'x_profile'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 minutes') THEN 1
      WHEN s.kind = 'google_news' AND s.briefing_cadence = 'daily'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${CANARY_GOOGLE_NEWS_PLAN.freshnessHours} hours') THEN 1
      WHEN s.kind = 'google_news' AND s.briefing_cadence != 'daily'
        AND s.last_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours') THEN 1
      ELSE 0
    END) AS stale,
    SUM(CASE WHEN s.last_error IS NOT NULL THEN 1 ELSE 0 END) AS with_error,
    SUM(CASE
      WHEN s.enabled = 0 THEN 1
      WHEN s.last_error IS NOT NULL AND (
        s.failure_class IN ('budget', 'budget_pause', 'queue_dlq')
        OR lower(s.last_error) LIKE 'paused after repeated source failures:%'
      ) THEN 1
      ELSE 0
    END) AS fatal_current_errors,
    SUM(CASE
      WHEN s.last_error IS NOT NULL
        AND (
          s.last_checked_at IS NULL
          OR julianday(${sql(observedAt)}) >
            julianday(s.last_checked_at, '+' || s.recovery_sla_minutes || ' minutes')
        )
      THEN 1
      ELSE 0
    END) AS expired_current_errors,
    MAX(s.last_checked_at) AS latest_attempt_at,
    MAX(s.last_success_at) AS latest_success_at
  FROM canary_sources s;
`);

const sourceRuns = queryOne(buildCanarySourceRunHealthQuery({
  windowStartedAt: window.startedAt,
  observedAt
}));

const fixtureCadence = queryOne(`
  SELECT
    COUNT(*) AS fixtures_observed,
    COALESCE(SUM(CASE WHEN successful_runs >= 80 THEN 1 ELSE 0 END), 0) AS fixtures_with_expected_coverage,
    COALESCE(MIN(successful_runs), 0) AS minimum_successful_runs
  FROM (
    SELECT source.id, COUNT(run.id) AS successful_runs
    FROM sources source
    LEFT JOIN source_runs run ON run.source_id = source.id
      AND run.state = 'succeeded'
      AND run.created_at >= ${sql(window.startedAt)}
    WHERE source.id LIKE 'launch_canary_fixture_%'
    GROUP BY source.id
  );
`);

const processing = queryOne(`
  SELECT
    COUNT(*) AS jobs,
    COALESCE(SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
    COALESCE(SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
    COALESCE(SUM(CASE WHEN state = 'queued' THEN 1 ELSE 0 END), 0) AS queued,
    COALESCE(SUM(CASE WHEN state = 'queued' AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes') THEN 1 ELSE 0 END), 0) AS stale_queued
  FROM processing_jobs
  WHERE briefing_id LIKE 'launch_canary_briefing_%'
    AND created_at >= ${sql(window.startedAt)};
`);

const publication = queryOne(`
  SELECT
    (SELECT COUNT(*) FROM briefing_windows
      WHERE briefing_id LIKE 'launch_canary_briefing_%' AND created_at >= ${sql(window.startedAt)}) AS windows,
    (SELECT COUNT(*) FROM briefing_windows
      WHERE briefing_id LIKE 'launch_canary_briefing_%' AND state = 'failed' AND created_at >= ${sql(window.startedAt)}) AS failed_windows,
    (SELECT COUNT(*) FROM briefing_windows
      WHERE briefing_id LIKE 'launch_canary_briefing_%' AND state = 'running'
        AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')) AS stale_running_windows,
    (SELECT COUNT(*) FROM briefing_windows
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND state IN ('published', 'empty')
        AND created_at >= ${sql(window.startedAt)}) AS terminal_windows,
    (SELECT COUNT(DISTINCT briefing_id) FROM briefing_windows
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND state IN ('published', 'empty')
        AND created_at >= ${sql(window.startedAt)}) AS feeds_with_terminal_windows,
    (SELECT COUNT(*) FROM (
      SELECT b.id
      FROM briefings b
      JOIN briefing_windows w ON w.briefing_id = b.id
      WHERE b.id LIKE 'launch_canary_briefing_%'
        AND b.briefing_cadence = 'hourly'
        AND w.state IN ('published', 'empty')
        AND w.created_at >= ${sql(window.startedAt)}
      GROUP BY b.id
      HAVING COUNT(*) >= 20
    )) AS hourly_feeds_with_20_terminal_windows,
    (SELECT COUNT(DISTINCT b.id)
      FROM briefings b
      JOIN briefing_windows w ON w.briefing_id = b.id
      WHERE b.id LIKE 'launch_canary_briefing_%'
        AND b.briefing_cadence = 'daily'
        AND w.state IN ('published', 'empty')
        AND w.created_at >= ${sql(window.startedAt)}) AS daily_feeds_with_terminal_windows,
    (SELECT COUNT(*) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%' AND created_at >= ${sql(window.startedAt)}) AS editions,
    (SELECT COUNT(DISTINCT briefing_id) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%' AND created_at >= ${sql(window.startedAt)}) AS feeds_with_editions,
    (SELECT COUNT(*) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND created_at >= ${sql(window.startedAt)}) AS meaningful_editions,
    (SELECT COUNT(DISTINCT briefing_id) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND created_at >= ${sql(window.startedAt)}) AS feeds_with_meaningful_editions,
    (SELECT COUNT(*) FROM briefing_editions e
      WHERE e.briefing_id LIKE 'launch_canary_briefing_%'
        AND e.status = 'published'
        AND e.created_at >= ${sql(window.startedAt)}
        AND EXISTS (
          SELECT 1 FROM json_tree(e.sections_json) evidence
          WHERE evidence.key = 'sourceId'
            AND evidence.value LIKE 'launch_canary_fixture_%'
        )) AS fixture_editions,
    (SELECT COUNT(DISTINCT e.briefing_id) FROM briefing_editions e
      WHERE e.briefing_id LIKE 'launch_canary_briefing_%'
        AND e.status = 'published'
        AND e.created_at >= ${sql(window.startedAt)}
        AND EXISTS (
          SELECT 1 FROM json_tree(e.sections_json) evidence
          WHERE evidence.key = 'sourceId'
            AND evidence.value LIKE 'launch_canary_fixture_%'
        )) AS feeds_with_fixture_editions,
    (SELECT COUNT(*) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND generation_mode = 'ai'
        AND created_at >= ${sql(window.startedAt)}) AS ai_editions,
    (SELECT COUNT(DISTINCT briefing_id) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND generation_mode = 'ai'
        AND created_at >= ${sql(window.startedAt)}) AS feeds_with_ai_editions,
    (SELECT COUNT(*) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND generation_mode = 'deterministic'
        AND created_at >= ${sql(window.startedAt)}) AS deterministic_editions;
`);

const modelUsage = queryOne(`
  SELECT
    COUNT(*) AS successful_calls,
    COUNT(DISTINCT briefing_id) AS feeds_with_successful_calls,
    COUNT(DISTINCT strftime('%Y-%m-%dT%H:00:00Z', created_at)) AS hourly_buckets_with_success,
    COALESCE(SUM(input_tokens), 0) AS input_tokens,
    COALESCE(SUM(output_tokens), 0) AS output_tokens,
    ROUND(COALESCE(SUM(estimated_cost_usd), 0), 6) AS estimated_cost_usd,
    MAX(created_at) AS latest_success_at,
    (SELECT COUNT(*) FROM briefing_editions
      WHERE briefing_id LIKE 'launch_canary_briefing_%'
        AND status = 'published'
        AND sections_json <> '[]'
        AND generation_mode = 'ai'
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')) AS recent_ai_editions
  FROM llm_usage_events
  WHERE briefing_id LIKE 'launch_canary_briefing_%'
    AND purpose = 'edition_summary'
    AND created_at >= ${sql(window.startedAt)};
`);

const modelCoverage = queryOne(`
  SELECT
    COUNT(*) AS observed_complete_hours,
    COALESCE(SUM(CASE WHEN feeds_with_success >= 45 THEN 1 ELSE 0 END), 0) AS passing_complete_hours,
    COALESCE(MIN(feeds_with_success), 0) AS minimum_feeds_with_success
  FROM (
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z', usage.created_at) AS hour_bucket,
      COUNT(DISTINCT usage.briefing_id) AS feeds_with_success
    FROM llm_usage_events usage
    JOIN briefings briefing ON briefing.id = usage.briefing_id
    WHERE usage.briefing_id LIKE 'launch_canary_briefing_%'
      AND briefing.briefing_cadence = 'hourly'
      AND usage.purpose = 'edition_summary'
      AND usage.created_at >= ${sql(firstCompleteModelHour)}
      AND usage.created_at < ${sql(completeModelHoursEnd)}
    GROUP BY hour_bucket
  );
`);

const modelOperations = queryOne(`
  SELECT
    COUNT(*) AS total_outcomes,
    COALESCE(SUM(CASE
      WHEN status = 'succeeded' AND detail = 'primary_succeeded' THEN 1 ELSE 0 END), 0)
      AS primary_succeeded,
    COALESCE(SUM(CASE
      WHEN status = 'succeeded' AND detail LIKE 'fallback_succeeded:%' THEN 1 ELSE 0 END), 0)
      AS fallback_succeeded,
    COALESCE(SUM(CASE
      WHEN status = 'failed' AND detail LIKE 'exhausted:%' THEN 1 ELSE 0 END), 0)
      AS exhausted,
    COALESCE(SUM(CASE
      WHEN (
        (status = 'succeeded' AND detail = 'primary_succeeded')
        OR (status = 'succeeded' AND detail LIKE 'fallback_succeeded:%')
        OR (status = 'failed' AND detail LIKE 'exhausted:%')
      ) THEN 0 ELSE 1 END), 0) AS unexpected_outcomes,
    COUNT(DISTINCT CASE WHEN status = 'succeeded' THEN body_id END) AS feeds_with_success,
    MAX(CASE WHEN status = 'succeeded' THEN occurred_at END) AS latest_success_at,
    MAX(CASE WHEN status = 'failed' THEN occurred_at END) AS latest_exhausted_at
  FROM operational_events
  WHERE category = 'model'
    AND subsystem LIKE 'edition_synthesis:%'
    AND body_type = 'edition_summary'
    AND body_id LIKE 'launch_canary_briefing_%'
    AND release_sha = ${sql(release.releaseSha ?? "")}
    AND occurred_at >= ${sql(window.startedAt)}
    AND occurred_at <= ${sql(observedAt)};
`);

const modelValidation = queryOne(`
  SELECT
    COUNT(*) AS total_events,
    COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded,
    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
    MAX(CASE WHEN status = 'failed' THEN occurred_at END) AS latest_failure_at
  FROM operational_events
  WHERE category = 'model'
    AND subsystem = 'edition_synthesis_validation'
    AND body_type = 'edition_summary'
    AND body_id LIKE 'launch_canary_briefing_%'
    AND release_sha = ${sql(release.releaseSha ?? "")}
    AND occurred_at >= ${sql(window.startedAt)}
    AND occurred_at <= ${sql(observedAt)};
`);

const spend = queryOne(`
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN event_type = 'reservation' THEN amount_usd ELSE 0 END), 0), 6) AS reservations_usd,
    ROUND(COALESCE(SUM(CASE WHEN event_type = 'settlement' THEN amount_usd ELSE 0 END), 0), 6) AS settlements_usd,
    ROUND(COALESCE(SUM(CASE WHEN event_type = 'release' THEN amount_usd ELSE 0 END), 0), 6) AS releases_usd,
    ROUND(COALESCE(SUM(amount_usd), 0), 6) AS net_committed_usd,
    ROUND(COALESCE(SUM(CASE WHEN category = 'collection' THEN amount_usd ELSE 0 END), 0), 6) AS collection_net_usd,
    ROUND(COALESCE(SUM(CASE WHEN category = 'llm' THEN amount_usd ELSE 0 END), 0), 6) AS llm_net_usd,
    ROUND(COALESCE((
      SELECT MAX(daily_net_usd)
      FROM (
        SELECT strftime('%Y-%m-%d', created_at) AS utc_day, SUM(amount_usd) AS daily_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND category = 'collection'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY utc_day
      )
    ), 0), 6) AS maximum_daily_collection_net_usd,
    ROUND(COALESCE((
      SELECT MAX(account_daily_net_usd)
      FROM (
        SELECT
          strftime('%Y-%m-%d', created_at) AS utc_day,
          account_id,
          SUM(amount_usd) AS account_daily_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND category = 'collection'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY utc_day, account_id
      )
    ), 0), 6) AS maximum_account_daily_collection_net_usd,
    ROUND(COALESCE((
      SELECT MAX(daily_net_usd)
      FROM (
        SELECT strftime('%Y-%m-%d', created_at) AS utc_day, SUM(amount_usd) AS daily_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND category = 'llm'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY utc_day
      )
    ), 0), 6) AS maximum_daily_llm_net_usd,
    ROUND(COALESCE((
      SELECT MAX(account_daily_net_usd)
      FROM (
        SELECT
          strftime('%Y-%m-%d', created_at) AS utc_day,
          account_id,
          SUM(amount_usd) AS account_daily_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND category = 'llm'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY utc_day, account_id
      )
    ), 0), 6) AS maximum_account_daily_llm_net_usd,
    ROUND(COALESCE((
      SELECT MAX(account_window_net_usd)
      FROM (
        SELECT account_id, SUM(amount_usd) AS account_window_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND category = 'llm'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY account_id
      )
    ), 0), 6) AS maximum_account_window_llm_net_usd,
    ROUND(COALESCE((
      SELECT MAX(daily_net_usd)
      FROM (
        SELECT strftime('%Y-%m-%d', created_at) AS utc_day, SUM(amount_usd) AS daily_net_usd
        FROM spend_ledger
        WHERE account_id LIKE 'launch_canary_account_%'
          AND created_at >= ${sql(window.startedAt)}
          AND created_at <= ${sql(observedAt)}
        GROUP BY utc_day
      )
    ), 0), 6) AS maximum_daily_total_net_usd
  FROM spend_ledger
  WHERE account_id LIKE 'launch_canary_account_%'
    AND created_at >= ${sql(window.startedAt)}
    AND created_at <= ${sql(observedAt)};
`);

const staleReservations = queryOne(`
  SELECT COUNT(*) AS unsettled_stale_reservations
  FROM spend_ledger reservation
  WHERE reservation.account_id LIKE 'launch_canary_account_%'
    AND reservation.event_type = 'reservation'
    AND reservation.created_at >= ${sql(window.startedAt)}
    AND reservation.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')
    AND NOT EXISTS (
      SELECT 1
      FROM spend_ledger terminal
      WHERE terminal.idempotency_key = reservation.idempotency_key
        AND terminal.event_type IN ('settlement', 'release')
    );
`);

const duplicates = queryOne(`
  SELECT COUNT(*) AS duplicate_groups
  FROM (
    SELECT briefing_id, source_id, message_id, COUNT(*) AS copies
    FROM raw_messages
    WHERE briefing_id LIKE 'launch_canary_briefing_%'
      AND created_at >= ${sql(window.startedAt)}
    GROUP BY briefing_id, source_id, message_id
    HAVING COUNT(*) > 1
  );
`);

const dlqHistory = queryOne(`
  SELECT
    COUNT(*) AS events_in_window,
    COALESCE(SUM(CASE WHEN body_type = 'refresh_source' THEN 1 ELSE 0 END), 0) AS source_events,
    COALESCE(SUM(CASE WHEN body_type = 'process_raw_message' THEN 1 ELSE 0 END), 0) AS processing_events,
    COALESCE(SUM(CASE WHEN body_type = 'publish_due_edition' THEN 1 ELSE 0 END), 0) AS edition_events,
    COALESCE(SUM(CASE
      WHEN body_type NOT IN ('refresh_source', 'process_raw_message', 'publish_due_edition')
        OR body_type IS NULL
      THEN 1 ELSE 0 END), 0) AS unknown_events,
    COUNT(DISTINCT subsystem) AS affected_queues,
    MAX(occurred_at) AS latest_event_at
  FROM operational_events
  WHERE category = 'dlq'
    AND occurred_at >= ${sql(window.startedAt)}
    AND occurred_at <= ${sql(observedAt)};
`);

const routes = await Promise.all([
  checkRoute(new URL("/", baseUrl).toString(), "home", { strictCsp: true }),
  checkRoute(new URL("/api/status", baseUrl).toString(), "status", {
    json: (body) => body.status === "operational" && body.releaseSha === release.releaseSha
  }),
  checkRoute(new URL("/api/capabilities", baseUrl).toString(), "capabilities", {
    json: (body) =>
      body.hosted === true &&
      body.registrationMode === "closed" &&
      body.limits?.feedsPerAccount === 2 &&
      body.limits?.sourcesPerFeed === 5 &&
      body.limits?.sourcesPerAccount === 10 &&
      body.paidProviderBeta?.accountCap === 4 &&
      body.paidProviderBeta?.claimedAccounts <= 4
  }),
  checkRoute(new URL("/api/explore/feeds", baseUrl).toString(), "explore"),
  checkRoute(new URL("/api/feed/launch-canary-001/hourly-signal", baseUrl).toString(), "sampleHourlyFeed"),
  checkRoute(new URL("/api/feed/launch-canary-001/daily-signal", baseUrl).toString(), "sampleDailyFeed"),
  checkRoute(new URL("/api/feed/launch-canary-001/hourly-signal/search?q=synthetic", baseUrl).toString(), "search"),
  checkRoute(new URL("/bootstrap.js", baseUrl).toString(), "bootstrapJs", { contentType: "javascript" }),
  checkRoute(new URL("/bootstrap.css", baseUrl).toString(), "bootstrapCss", { contentType: "text/css" }),
  checkRoute(new URL("/canary-fixture.xml?source=route-check&rotating=1", baseUrl).toString(), "fixture", {
    contentType: "application/rss+xml"
  }),
  checkRoute(new URL("/api/feed/does-not-exist/does-not-exist", baseUrl).toString(), "expected404", {
    expectedStatus: 404
  })
]);
const queueMetrics = await readQueueMetrics(staging);
const dlqs = queueMetrics.filter((queue) => /dlq$/i.test(queue.name));
const primaryQueues = queueMetrics.filter((queue) => !/dlq$/i.test(queue.name));
const elapsedHours = (Date.parse(observedAt) - Date.parse(window.startedAt)) / 3_600_000;
const spendWindowUtcDays = utcDayCount(window.startedAt, observedAt);
const spendWindowCaps = {
  utcDays: spendWindowUtcDays,
  collectionUsd: CANARY_COLLECTION_PLAN.globalDailyCeilingUsd * spendWindowUtcDays,
  llmUsd: Math.min(
    CANARY_LLM_PLAN.globalDailyCeilingUsd * spendWindowUtcDays,
    CANARY_LLM_PLAN.globalMonthlyCeilingUsd
  ),
  accountLlmUsd: Math.min(
    CANARY_LLM_PLAN.accountDailyCeilingUsd * spendWindowUtcDays,
    CANARY_LLM_PLAN.accountMonthlyCeilingUsd
  )
};
spendWindowCaps.combinedUsd = spendWindowCaps.collectionUsd + spendWindowCaps.llmUsd;
const successfulModelOutcomes =
  modelOperations.primary_succeeded + modelOperations.fallback_succeeded;
const modelFallbackRate = recoveredModelFallbackRate(modelOperations);
const recoveredSourceFailureRate =
  sourceRuns.recovered_failures / Math.max(1, sourceRuns.attempts);
const recentModelCutoff = new Date(Date.parse(observedAt) - 2 * 60 * 60 * 1000).toISOString();
const priorObservations = readObservationHistory(window);
const history = historyEvidence(priorObservations, window, observedAt, elapsedHours);
const priorCriticalFailures = priorObservations.flatMap((observation) =>
  (observation.gates ?? [])
    .filter((item) => criticalGateNames.has(item.name) && !item.passed)
    .map((item) => ({ observedAt: observation.observedAt, gate: item.name }))
);
const gates = [
  gate("observation-duration-24h", elapsedHours >= 24, { elapsedHours }),
  gate("continuous-observation-history", history.continuous, history),
  gate("prior-critical-failures", priorCriticalFailures.length === 0, {
    count: priorCriticalFailures.length,
    failures: priorCriticalFailures.slice(0, 20)
  }),
  gate(
    "release-stability",
    release.readable && Boolean(release.versionId) && Boolean(release.releaseSha) &&
      release.versionId === window.versionId && release.releaseSha === window.releaseSha &&
      auditCodeSha === release.releaseSha,
    { current: release, baseline: window, auditCodeSha }
  ),
  gate(
    "cohort-size",
    inventory.accounts === 50 && inventory.feeds === 100 && inventory.sources === 500 &&
      inventory.hourly_feeds === 50 && inventory.daily_feeds === 50 &&
      inventory.live_sources === 100 && inventory.fixture_sources === 400 &&
      inventory.rss_sources === 97 && inventory.telegram_sources === 1 &&
      inventory.google_news_sources === 1 && inventory.x_sources === 1 &&
      inventory.canary_paid_provider_seats === 2 &&
      inventory.total_paid_provider_seats <= 4,
    inventory
  ),
  gate("verified-accounts", inventory.verified_accounts === 50, { verified: inventory.verified_accounts }),
  gate("routes", routes.every((route) => route.ok), routes),
  gate("source-attempts", elapsedHours < 2 || sources.attempted === 500, { elapsedHours, attempted: sources.attempted }),
  gate(
    "source-success",
    elapsedHours < 24 || (sources.succeeded_in_window === 500 && sourceRuns.attempts > 0),
    { elapsedHours, sources, sourceRuns }
  ),
  gate(
    "source-run-health",
    sourceRunHealthPass({ elapsedHours, sourceRuns, sources }),
    {
      elapsedHours,
      recoverySlaMinutes: SOURCE_RECOVERY_SLA_MINUTES,
      maximumRecoveredFailures: MAXIMUM_RECOVERED_SOURCE_FAILURES,
      maximumRecoveredFailureRate: MAXIMUM_RECOVERED_SOURCE_FAILURE_RATE,
      recoveredFailureRate: recoveredSourceFailureRate,
      sourceRuns,
      sourcesWithError: sources.with_error,
      fatalCurrentErrors: sources.fatal_current_errors,
      expiredCurrentErrors: sources.expired_current_errors,
      enabledSources: sources.enabled
    }
  ),
  gate("source-freshness", elapsedHours < 2 || sources.stale === 0, { elapsedHours, stale: sources.stale }),
  gate(
    "fixture-cadence",
    elapsedHours < 24 || (
      fixtureCadence.fixtures_observed === 400 &&
      fixtureCadence.fixtures_with_expected_coverage === 400 &&
      fixtureCadence.minimum_successful_runs >= 80
    ),
    { elapsedHours, expectedMinimumRunsPerFixture: 80, fixtureCadence }
  ),
  gate("processing-failures", processing.failed === 0 && processing.stale_queued === 0, processing),
  gate("publication-failures", publication.failed_windows === 0 && publication.stale_running_windows === 0, publication),
  gate(
    "terminal-window-per-feed",
    elapsedHours < 24 || publication.feeds_with_terminal_windows === 100,
    publication
  ),
  gate(
    "hourly-cadence",
    elapsedHours < 24 || publication.hourly_feeds_with_20_terminal_windows === 50,
    publication
  ),
  gate(
    "daily-cadence",
    elapsedHours < 24 || publication.daily_feeds_with_terminal_windows === 50,
    publication
  ),
  gate(
    "meaningful-publication",
    elapsedHours < 24 ||
      (
        publication.feeds_with_meaningful_editions === 100 &&
        publication.meaningful_editions >= 100 &&
        publication.feeds_with_fixture_editions === 100 &&
        publication.fixture_editions >= 100
      ),
    publication
  ),
  gate(
    "model-operation-health",
    modelOperationHealthPass({ modelOperations, modelValidation }),
    {
      maximumRecoveredFallbackRate: MAXIMUM_RECOVERED_MODEL_FALLBACK_RATE,
      recoveredFallbackRate: modelFallbackRate,
      modelOperations,
      modelValidation
    }
  ),
  gate(
    "model-synthesis",
    elapsedHours < 24 || (
      publication.feeds_with_ai_editions === 100 &&
      modelUsage.feeds_with_successful_calls === 100 &&
      modelUsage.successful_calls > 0 &&
      modelOperations.feeds_with_success === 100 &&
      successfulModelOutcomes > 0 &&
      modelValidation.succeeded === successfulModelOutcomes &&
      expectedCompleteModelHours >= 20 &&
      modelCoverage.observed_complete_hours === expectedCompleteModelHours &&
      modelCoverage.passing_complete_hours === expectedCompleteModelHours &&
      modelCoverage.minimum_feeds_with_success >= 45 &&
      modelUsage.recent_ai_editions >= 45 &&
      modelUsage.latest_success_at >= recentModelCutoff &&
      modelFallbackRate <= MAXIMUM_RECOVERED_MODEL_FALLBACK_RATE &&
      publication.deterministic_editions === 0
    ),
    {
      elapsedHours,
      aiEditions: publication.ai_editions,
      deterministicEditions: publication.deterministic_editions,
      recoveredModelFallbackRate: modelFallbackRate,
      maximumRecoveredModelFallbackRate: MAXIMUM_RECOVERED_MODEL_FALLBACK_RATE,
      requiredFeedsWithAiEditions: 100,
      expectedCompleteModelHours,
      firstCompleteModelHour,
      completeModelHoursEnd,
      modelCoverage,
      modelOperations,
      modelValidation,
      minimumRecentAiEditions: 45,
      modelUsage
    }
  ),
  gate(
    "spend-cap",
    spend.maximum_daily_collection_net_usd <= CANARY_COLLECTION_PLAN.globalDailyCeilingUsd &&
      spend.maximum_account_daily_collection_net_usd <= CANARY_COLLECTION_PLAN.accountDailyCeilingUsd &&
      spend.maximum_daily_llm_net_usd <= CANARY_LLM_PLAN.globalDailyCeilingUsd &&
      spend.maximum_account_daily_llm_net_usd <= CANARY_LLM_PLAN.accountDailyCeilingUsd &&
      spend.maximum_account_window_llm_net_usd <= spendWindowCaps.accountLlmUsd &&
      spend.maximum_daily_total_net_usd <=
        CANARY_COLLECTION_PLAN.globalDailyCeilingUsd + CANARY_LLM_PLAN.globalDailyCeilingUsd &&
      spend.collection_net_usd <= spendWindowCaps.collectionUsd &&
      spend.llm_net_usd <= spendWindowCaps.llmUsd &&
      spend.net_committed_usd <= spendWindowCaps.combinedUsd,
    {
      ...spend,
      collectionGlobalDailyCeilingUsd: CANARY_COLLECTION_PLAN.globalDailyCeilingUsd,
      collectionAccountDailyCeilingUsd: CANARY_COLLECTION_PLAN.accountDailyCeilingUsd,
      llmGlobalDailyCeilingUsd: CANARY_LLM_PLAN.globalDailyCeilingUsd,
      llmAccountDailyCeilingUsd: CANARY_LLM_PLAN.accountDailyCeilingUsd,
      combinedDailyCeilingUsd:
        CANARY_COLLECTION_PLAN.globalDailyCeilingUsd + CANARY_LLM_PLAN.globalDailyCeilingUsd,
      windowCaps: spendWindowCaps
    }
  ),
  gate("spend-settlement", staleReservations.unsettled_stale_reservations === 0, staleReservations),
  gate("duplicates", duplicates.duplicate_groups === 0, duplicates),
  gate(
    "queue-lag",
    primaryQueues.every(queueWithinLaunchLimit),
    {
      maximumBacklog: { sources: 150, processing: 100, editions: 100 },
      maximumOldestMessageAgeMinutes: 15,
      queues: primaryQueues
    }
  ),
  gate(
    "dlq-zero-backlog",
    dlqs.every((queue) => queue.readable && queue.backlog === 0) &&
      dlqHistory.events_in_window === 0,
    { queues: dlqs, persisted: dlqHistory }
  )
];

const observation = {
  schemaVersion: 1,
  auditCodeSha,
  observedAt,
  window,
  staging: {
    worker: staging.name,
    baseUrl,
    release
  },
  inventory,
  routes,
  sources,
  sourceRuns,
  fixtureCadence,
  processing,
  publication,
  modelUsage,
  modelCoverage,
  modelOperations,
  modelValidation,
  dlqs,
  queueMetrics,
  dlqHistory,
  spend,
  staleReservations,
  duplicates,
  history,
  priorCriticalFailures,
  gates,
  passed: gates.every((item) => item.passed)
};

mkdirSync(observationDirectory, { recursive: true, mode: 0o700 });
const filename = `observation-${observation.observedAt.replace(/[:.]/g, "-")}.json`;
const outputPath = resolve(observationDirectory, filename);
writeFileSync(outputPath, `${JSON.stringify(observation, null, 2)}\n`, { mode: 0o600 });
appendFileSync(resolve(observationDirectory, "observations.ndjson"), `${JSON.stringify(observation)}\n`, { mode: 0o600 });

const currentCriticalFailures = gates
  .filter((item) => criticalGateNames.has(item.name) && !item.passed)
  .map((item) => item.name);
if (currentCriticalFailures.length > 0) {
  resetObservationWindow(
    `critical-gate-failure:${currentCriticalFailures.join(",")}`,
    release,
    {
      observedAt: observation.observedAt,
      observationFile: filename,
      window: {
        startedAt: observation.window.startedAt,
        releaseSha: observation.window.releaseSha,
        versionId: observation.window.versionId
      },
      criticalGates: currentCriticalFailures
    }
  );
}

if (jsonOnly) {
  console.log(JSON.stringify(observation, null, 2));
} else {
  console.log(`Canary observation: ${outputPath}`);
  console.log(`Window: ${window.startedAt} (${elapsedHours.toFixed(2)} hours)`);
  console.log(`Release: ${release.releaseSha ?? release.versionId ?? "unknown"}`);
  for (const item of gates) console.log(`- [${item.passed ? "PASS" : "FAIL"}] ${item.name}`);
  if (currentCriticalFailures.length > 0) {
    console.log(`Observation window restarted after critical failure: ${currentCriticalFailures.join(", ")}`);
  }
}
if (!observation.passed) process.exitCode = 1;

function queryOne(command) {
  const result = runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", "staging",
    "--json",
    "--command", command
  ], { capture: true });
  const row = JSON.parse(result.stdout)[0]?.results?.[0] ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "number" ? value : value == null ? null : numeric(value)
  ]));
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(value).trim() !== "" ? parsed : value;
}

function readRelease() {
  const result = runWrangler(["versions", "list", "--env", "staging", "--json"], {
    capture: true,
    allowFailure: true
  });
  if (result.status !== 0) return { versionId: null, releaseSha: null, readable: false };
  const versions = JSON.parse(result.stdout);
  const latest = Array.isArray(versions) ? versions.at(-1) ?? null : null;
  const text = JSON.stringify(latest ?? {});
  return {
    versionId: latest?.id ?? latest?.version_id ?? null,
    releaseSha: text.match(/\b[a-f0-9]{40,64}\b/i)?.[0] ?? null,
    readable: true
  };
}

async function readQueueMetrics(environment) {
  const values = combinedEnvironment("staging");
  const token = values.get("CLOUDFLARE_API_TOKEN");
  const accountId = values.get("CLOUDFLARE_ACCOUNT_ID") ?? environment.vars?.CLOUDFLARE_ACCOUNT_ID;
  const names = Array.from(new Set(queueNames(environment)));
  if (!token || !accountId) {
    return names.map((name) => ({ name, readable: false, backlog: null, error: "Cloudflare read credentials missing" }));
  }

  const queuesResponse = await cloudflare(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/queues?per_page=100`,
    token
  );
  const byName = new Map((queuesResponse.result ?? []).map((queue) => [queue.queue_name, queue]));
  return Promise.all(names.map(async (name) => {
    const queue = byName.get(name);
    if (!queue?.queue_id) return { name, readable: false, backlog: null, error: "queue not found" };
    try {
      const response = await cloudflare(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/queues/${encodeURIComponent(queue.queue_id)}/metrics`,
        token
      );
      return {
        name,
        readable: response.success === true,
        backlog: Number(response.result?.backlog_count ?? 0),
        backlogBytes: Number(response.result?.backlog_bytes ?? 0),
        oldestMessageTimestampMs: Number(response.result?.oldest_message_timestamp_ms ?? 0)
      };
    } catch (error) {
      return {
        name,
        readable: false,
        backlog: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
}

function queueWithinLaunchLimit(queue) {
  if (!queue.readable || !Number.isFinite(queue.backlog)) return false;
  const maximum = /sources/i.test(queue.name)
    ? 150
    : /processing/i.test(queue.name)
      ? 100
      : /editions/i.test(queue.name)
        ? 100
        : 0;
  if (queue.backlog > maximum) return false;
  if (
    queue.backlog > 0 &&
    Number(queue.oldestMessageTimestampMs) > 0 &&
    Date.now() - Number(queue.oldestMessageTimestampMs) > 15 * 60 * 1000
  ) {
    return false;
  }
  return true;
}

async function cloudflare(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare API read failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function checkRoute(url, name, options = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const expectedStatus = options.expectedStatus ?? 200;
    let valid = response.status === expectedStatus;
    let validationError;
    const contentType = response.headers.get("content-type") ?? "";
    if (valid && options.contentType && !contentType.includes(options.contentType)) {
      valid = false;
      validationError = `content-type is ${contentType || "missing"}`;
    }
    if (valid && options.strictCsp) {
      const csp = response.headers.get("content-security-policy") ?? "";
      valid =
        csp.includes("script-src 'self' https://challenges.cloudflare.com") &&
        csp.includes("style-src 'self'") &&
        csp.includes("object-src 'none'") &&
        !csp.includes("'unsafe-inline'");
      if (!valid) validationError = "strict CSP is missing";
    }
    if (valid && options.json) {
      const body = await response.json();
      valid = options.json(body) === true;
      if (!valid) validationError = "JSON contract mismatch";
    }
    return {
      name,
      url,
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
      ok: valid,
      validationError
    };
  } catch (error) {
    return {
      name,
      url,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function gate(name, passed, evidence) {
  return { name, passed: Boolean(passed), evidence };
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function utcDayCount(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
    throw new Error("Canary spend window timestamps are invalid.");
  }
  const startDay = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const endDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.floor((endDay - startDay) / 86_400_000) + 1;
}

function readObservationHistory(activeWindow) {
  const path = resolve(observationDirectory, "observations.ndjson");
  if (!existsSync(path)) return [];
  const observations = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const observation = JSON.parse(line);
      if (
        observation.window?.startedAt === activeWindow.startedAt &&
        observation.window?.versionId === activeWindow.versionId &&
        observation.window?.releaseSha === activeWindow.releaseSha
      ) {
        observations.push(observation);
      }
    } catch {
      // A partial final line cannot count as observation evidence.
    }
  }
  return observations.sort((left, right) => String(left.observedAt).localeCompare(String(right.observedAt)));
}

function historyEvidence(previous, activeWindow, currentObservedAt, elapsedHours) {
  const startMs = Date.parse(activeWindow.startedAt);
  const currentMs = Date.parse(currentObservedAt);
  const observationTimes = [
    ...previous.map((observation) => Date.parse(observation.observedAt)),
    currentMs
  ].filter((value) => Number.isFinite(value) && value >= startMs && value <= currentMs)
    .sort((left, right) => left - right);
  const checkpoints = [startMs, ...observationTimes];
  let maxGapMs = 0;
  for (let index = 1; index < checkpoints.length; index += 1) {
    maxGapMs = Math.max(maxGapMs, checkpoints[index] - checkpoints[index - 1]);
  }
  const observationCount = observationTimes.length;
  const maxGapMinutes = maxGapMs / 60_000;
  return {
    heartbeatMinutes: 15,
    maximumAllowedGapMinutes: MAX_OBSERVATION_GAP_MINUTES,
    observationCount,
    minimumObservationsAt24Hours: MINIMUM_24H_OBSERVATIONS,
    firstObservationAt: observationTimes[0] ? new Date(observationTimes[0]).toISOString() : null,
    latestObservationAt: observationTimes.at(-1) ? new Date(observationTimes.at(-1)).toISOString() : null,
    maxGapMinutes,
    continuous:
      Number.isFinite(startMs) &&
      maxGapMinutes <= MAX_OBSERVATION_GAP_MINUTES &&
      (elapsedHours < 24 || observationCount >= MINIMUM_24H_OBSERVATIONS)
  };
}
