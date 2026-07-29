#!/usr/bin/env node

import {
  assertIsolatedStaging,
  combinedEnvironment,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";

const environment = optionValue("--environment") ?? "staging";
const SPEND_LEDGER_REVIEW_ROWS = 250_000;
const SPEND_LEDGER_DAILY_REVIEW_ROWS = 10_000;
const SPEND_LEDGER_BLOCK_ROWS = 1_000_000;
const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
const values = combinedEnvironment(environment);
if (environment === "staging") assertIsolatedStaging(config);
if (environment === "production" && process.env.CONFIRM_PRODUCTION_READ !== "distilled-news:production:retention-read") {
  throw new Error("Set CONFIRM_PRODUCTION_READ=distilled-news:production:retention-read for the production read-only check.");
}

const query = `
SELECT
  (SELECT COUNT(*) FROM raw_messages WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_raw_messages,
  (SELECT COUNT(*) FROM briefing_items WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_briefing_items,
  (SELECT COUNT(*) FROM clusters WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_clusters,
  (SELECT COUNT(*) FROM auth_tokens WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_auth_tokens,
  (SELECT COUNT(*) FROM briefing_editions
    WHERE published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 days', '-10 minutes')) AS expired_briefing_editions,
  (SELECT COUNT(*) FROM briefing_windows
    WHERE window_end <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 days', '-10 minutes')) AS expired_briefing_windows,
  (SELECT COUNT(DISTINCT raw_payload_key) FROM raw_messages WHERE raw_payload_key IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_r2_references,
  (SELECT COUNT(DISTINCT archive_key) FROM source_runs
    WHERE archive_key IS NOT NULL
      AND archive_key != ''
      AND COALESCE(completed_at, updated_at, created_at) <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days', '-10 minutes')) AS old_source_archive_references,
  (SELECT COUNT(*) FROM spend_ledger) AS spend_ledger_rows,
  (SELECT COUNT(*) FROM spend_ledger
    WHERE created_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')) AS spend_ledger_rows_today_utc,
  (SELECT MIN(created_at) FROM spend_ledger) AS spend_ledger_oldest_at,
  (SELECT COUNT(*) FROM spend_ledger reservation
    WHERE reservation.event_type = 'reservation'
      AND reservation.created_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days', '-10 minutes')
      AND EXISTS (
        SELECT 1 FROM spend_ledger terminal
        WHERE terminal.idempotency_key = reservation.idempotency_key
          AND terminal.event_type IN ('settlement', 'release')
      )) AS expired_terminal_spend_operations,
  (SELECT COUNT(*) FROM spend_ledger reservation
    WHERE reservation.event_type = 'reservation'
      AND reservation.created_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-10 minutes')
      AND NOT EXISTS (
        SELECT 1 FROM spend_ledger terminal
        WHERE terminal.idempotency_key = reservation.idempotency_key
          AND terminal.event_type IN ('settlement', 'release')
      )) AS stale_open_spend_reservations,
  (SELECT COUNT(*) FROM spend_daily_aggregates
    WHERE day < date('now', '-13 months')) AS expired_spend_aggregates,
  (SELECT COUNT(*) FROM spend_idempotency_tombstones
    WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')) AS expired_spend_tombstones,
  (SELECT COUNT(*) FROM llm_usage_events
    WHERE created_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days', '-10 minutes')) AS expired_llm_usage_events;
`;

const result = runWrangler([
  "d1", "execute", "DB",
  "--remote",
  "--env", environment,
  "--json",
  "--command", query
], { capture: true });
const payload = JSON.parse(result.stdout);
const row = payload[0]?.results?.[0];
if (!row) throw new Error("Retention verification returned no result.");

const bucket = selected.r2_buckets?.find((candidate) => candidate.binding === "RAW_ARCHIVE")?.bucket_name;
const token = values.get("CLOUDFLARE_API_TOKEN");
const accountId = values.get("CLOUDFLARE_ACCOUNT_ID") ?? selected.vars?.CLOUDFLARE_ACCOUNT_ID;
if (!bucket || !token || !accountId) {
  throw new Error("R2 retention verification requires RAW_ARCHIVE, CLOUDFLARE_ACCOUNT_ID, and an R2-read API token.");
}
const lifecycle = await cloudflare(
  `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/lifecycle`,
  token
);
const maximumAgeSeconds = 30 * 24 * 60 * 60;
const lifecycleRule = (lifecycle.result?.rules ?? []).find((rule) =>
  rule.enabled === true &&
  (rule.conditions?.prefix === undefined || rule.conditions.prefix === "") &&
  rule.deleteObjectsTransition?.condition?.type === "Age" &&
  Number(rule.deleteObjectsTransition.condition.maxAge) <= maximumAgeSeconds
);
const objectInventory = await inspectObjects(accountId, bucket, token);
const spendLedgerGrowth = {
  totalRows: Number(row.spend_ledger_rows ?? 0),
  rowsTodayUtc: Number(row.spend_ledger_rows_today_utc ?? 0),
  oldestAt: row.spend_ledger_oldest_at ?? null,
  reviewRowThreshold: SPEND_LEDGER_REVIEW_ROWS,
  dailyReviewRowThreshold: SPEND_LEDGER_DAILY_REVIEW_ROWS,
  releaseBlockingRowThreshold: SPEND_LEDGER_BLOCK_ROWS
};

console.log(JSON.stringify({
  environment,
  database: d1Binding(selected).database_name,
  bucket,
  checkedAt: new Date().toISOString(),
  ...row,
  lifecycle: {
    compliant: Boolean(lifecycleRule),
    ruleId: lifecycleRule?.id ?? null,
    maximumAgeDays: lifecycleRule
      ? Number(lifecycleRule.deleteObjectsTransition.condition.maxAge) / 86_400
      : null
  },
  objects: objectInventory,
  spendLedgerGrowth
}, null, 2));

if (
  spendLedgerGrowth.totalRows >= SPEND_LEDGER_REVIEW_ROWS ||
  spendLedgerGrowth.rowsTodayUtc >= SPEND_LEDGER_DAILY_REVIEW_ROWS
) {
  console.warn(
    "Spend-ledger growth threshold reached despite bounded aggregation; investigate retention backlog and operation volume."
  );
}

const staleRows = [
  row.expired_raw_messages,
  row.expired_briefing_items,
  row.expired_clusters,
  row.expired_auth_tokens,
  row.expired_briefing_editions,
  row.expired_briefing_windows,
  row.expired_r2_references,
  row.old_source_archive_references,
  row.expired_terminal_spend_operations,
  row.stale_open_spend_reservations,
  row.expired_spend_aggregates,
  row.expired_spend_tombstones,
  row.expired_llm_usage_events
].reduce((sum, value) => sum + Number(value ?? 0), 0);
if (
  staleRows > 0 ||
  !lifecycleRule ||
  objectInventory.olderThan31Days > 0 ||
  objectInventory.unreadableLastModified > 0 ||
  spendLedgerGrowth.totalRows >= SPEND_LEDGER_BLOCK_ROWS
) {
  console.error(
    "Retention gate failed: stale D1/R2/spend/model detail, missing lifecycle, old/unreadable R2 objects, or the spend-ledger hard ceiling remains."
  );
  process.exitCode = 1;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function inspectObjects(accountId, bucketName, token) {
  let cursor;
  let total = 0;
  let olderThan31Days = 0;
  let unreadableLastModified = 0;
  let oldestModifiedAt = null;
  const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
  do {
    const query = new URLSearchParams({ per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const page = await cloudflare(
      `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects?${query}`,
      token
    );
    for (const object of page.result ?? []) {
      total += 1;
      const modified = Date.parse(object.last_modified);
      if (Number.isFinite(modified)) {
        if (modified < cutoff) olderThan31Days += 1;
        if (!oldestModifiedAt || modified < Date.parse(oldestModifiedAt)) {
          oldestModifiedAt = new Date(modified).toISOString();
        }
      } else {
        unreadableLastModified += 1;
      }
    }
    cursor = page.result_info?.is_truncated ? page.result_info?.cursor : undefined;
    if (page.result_info?.is_truncated && !cursor) {
      throw new Error("R2 object listing was truncated without a continuation cursor.");
    }
  } while (cursor);
  return { total, olderThan31Days, unreadableLastModified, oldestModifiedAt };
}

async function cloudflare(path, token) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare R2 read failed with HTTP ${response.status}.`);
  }
  return payload;
}
