#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertIsolatedStaging,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";

const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const API_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{20,2048}$/;
const CURSOR_PATTERN = /^[^\u0000-\u001f\u007f]{1,2048}$/;
const SPEND_LEDGER_REVIEW_ROWS = 250_000;
const SPEND_LEDGER_DAILY_REVIEW_ROWS = 10_000;
const SPEND_LEDGER_BLOCK_ROWS = 1_000_000;

const retentionQuery = `
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

export async function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const runtime = options.environment ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const run = options.runWrangler ?? runWrangler;
  const config = options.config ?? readWorkerConfig();
  const environment = optionValue(argv, "--environment") ?? "staging";
  const selected = environmentConfig(config, environment);

  if (environment === "staging") assertIsolatedStaging(config);
  if (
    environment === "production" &&
    runtime.CONFIRM_PRODUCTION_READ !== "distilled-news:production:retention-read"
  ) {
    throw new Error(
      "Set CONFIRM_PRODUCTION_READ=distilled-news:production:retention-read for the production read-only check."
    );
  }

  const configuredBucket = selected.r2_buckets
    ?.find((candidate) => candidate.binding === "RAW_ARCHIVE")
    ?.bucket_name;
  const target = validateRetentionTarget({
    configuredAccountId: selected.vars?.CLOUDFLARE_ACCOUNT_ID,
    configuredBucket,
    runtimeAccountId: runtime.CLOUDFLARE_ACCOUNT_ID,
    runtimeBucket: runtime.RAW_ARCHIVE_BUCKET,
    runtimeToken: runtime.CLOUDFLARE_API_TOKEN
  });

  const result = run([
    "d1", "execute", "DB",
    "--remote",
    "--env", environment,
    "--json",
    "--command", retentionQuery
  ], { capture: true });
  const payload = JSON.parse(result.stdout);
  const row = payload[0]?.results?.[0];
  if (!row) throw new Error("Retention verification returned no result.");

  const lifecycle = await cloudflareR2Request({
    ...target,
    operation: "lifecycle",
    fetcher
  });
  const maximumAgeSeconds = 30 * 24 * 60 * 60;
  const lifecycleRule = (lifecycle.result?.rules ?? []).find((rule) =>
    rule.enabled === true &&
    (rule.conditions?.prefix === undefined || rule.conditions.prefix === "") &&
    rule.deleteObjectsTransition?.condition?.type === "Age" &&
    Number(rule.deleteObjectsTransition.condition.maxAge) <= maximumAgeSeconds
  );
  const objectInventory = await inspectObjects(target, fetcher);
  const spendLedgerGrowth = {
    totalRows: Number(row.spend_ledger_rows ?? 0),
    rowsTodayUtc: Number(row.spend_ledger_rows_today_utc ?? 0),
    oldestAt: row.spend_ledger_oldest_at ?? null,
    reviewRowThreshold: SPEND_LEDGER_REVIEW_ROWS,
    dailyReviewRowThreshold: SPEND_LEDGER_DAILY_REVIEW_ROWS,
    releaseBlockingRowThreshold: SPEND_LEDGER_BLOCK_ROWS
  };

  const report = {
    environment,
    database: d1Binding(selected).database_name,
    bucket: target.bucketName,
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
  };
  console.log(JSON.stringify(report, null, 2));

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
    throw new Error(
      "Retention gate failed: stale D1/R2/spend/model detail, missing lifecycle, old/unreadable R2 objects, or the spend-ledger hard ceiling remains."
    );
  }
  return report;
}

export function validateRetentionTarget({
  configuredAccountId,
  configuredBucket,
  runtimeAccountId,
  runtimeBucket,
  runtimeToken
}) {
  const accountId = String(runtimeAccountId ?? "").trim();
  const bucketName = String(runtimeBucket ?? "").trim();
  const token = String(runtimeToken ?? "").trim();
  const manifestAccountId = String(configuredAccountId ?? "").trim();
  const manifestBucket = String(configuredBucket ?? "").trim();

  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal runtime value.");
  }
  if (!BUCKET_NAME_PATTERN.test(bucketName)) {
    throw new Error("RAW_ARCHIVE_BUCKET must be a valid runtime R2 bucket name.");
  }
  if (!API_TOKEN_PATTERN.test(token)) {
    throw new Error("CLOUDFLARE_API_TOKEN must be provided directly to this process.");
  }
  if (manifestAccountId !== accountId || manifestBucket !== bucketName) {
    throw new Error(
      "Runtime Cloudflare account and RAW_ARCHIVE bucket must exactly match the reviewed Wrangler environment."
    );
  }
  return { accountId, bucketName, token };
}

export function buildCloudflareR2Url({ accountId, bucketName, operation, cursor }) {
  if (!ACCOUNT_ID_PATTERN.test(accountId) || !BUCKET_NAME_PATTERN.test(bucketName)) {
    throw new Error("Cloudflare R2 request target is invalid.");
  }
  if (operation !== "lifecycle" && operation !== "objects") {
    throw new Error("Cloudflare R2 request operation is invalid.");
  }
  const url = new URL(
    `/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/${operation}`,
    CLOUDFLARE_API_ORIGIN
  );
  if (operation === "objects") {
    url.searchParams.set("per_page", "1000");
    if (cursor !== undefined) {
      if (typeof cursor !== "string" || !CURSOR_PATTERN.test(cursor)) {
        throw new Error("Cloudflare R2 pagination cursor is invalid.");
      }
      url.searchParams.set("cursor", cursor);
    }
  }
  if (url.origin !== CLOUDFLARE_API_ORIGIN) {
    throw new Error("Cloudflare R2 request escaped the fixed API origin.");
  }
  return url;
}

async function inspectObjects(target, fetcher) {
  let cursor;
  let total = 0;
  let olderThan31Days = 0;
  let unreadableLastModified = 0;
  let oldestModifiedAt = null;
  const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
  do {
    const page = await cloudflareR2Request({
      ...target,
      operation: "objects",
      cursor,
      fetcher
    });
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

async function cloudflareR2Request({
  accountId,
  bucketName,
  token,
  operation,
  cursor,
  fetcher
}) {
  const url = buildCloudflareR2Url({ accountId, bucketName, operation, cursor });
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare R2 read failed with HTTP ${response.status}.`);
  }
  return payload;
}

function optionValue(argv, name) {
  const direct = argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
