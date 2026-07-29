import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  buildCanarySourceRunHealthQuery,
  modelOperationHealthPass,
  recoveredModelFallbackRate,
  sourceRunHealthPass
} from "../canary/reliability.mjs";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    canonical_key TEXT,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL
  );
  CREATE TABLE source_runs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    briefing_id TEXT NOT NULL,
    state TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    estimated_cost_usd REAL,
    actual_cost_usd REAL
  );
`);

const insertSource = db.prepare(
  "INSERT INTO sources (id, canonical_key, kind, provider) VALUES (?, ?, ?, ?)"
);
for (const source of [
  ["launch_canary_source_rss_a", "account|rss|shared", "rss_feed", "rss"],
  ["launch_canary_source_rss_b", "account|rss|shared", "rss_feed", "rss"],
  ["launch_canary_source_telegram", "account|telegram", "telegram_channel", "telegram"],
  ["launch_canary_source_x", "account|x", "x_profile", "apify"],
  ["launch_canary_source_news", "account|news", "google_news", "apify"],
  ["launch_canary_fixture_001_hourly_1", "account|fixture", "rss_feed", "rss"]
]) {
  insertSource.run(...source);
}

const insertRun = db.prepare(`
  INSERT INTO source_runs (
    id, source_id, briefing_id, state, completed_at, updated_at, created_at,
    estimated_cost_usd, actual_cost_usd
  ) VALUES (?, ?, 'launch_canary_briefing_001_hourly', ?, ?, ?, ?, 0, 0)
`);
for (const run of [
  ["rss-failed", "launch_canary_source_rss_a", "failed", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z"],
  ["rss-recovered-via-equivalent", "launch_canary_source_rss_b", "succeeded", "2026-07-29T00:20:00.000Z", "2026-07-29T00:20:00.000Z", "2026-07-29T00:20:00.000Z"],
  ["telegram-pending", "launch_canary_source_telegram", "failed", "2026-07-29T01:50:00.000Z", "2026-07-29T01:50:00.000Z", "2026-07-29T01:50:00.000Z"],
  ["x-failed", "launch_canary_source_x", "failed", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z"],
  ["x-late-recovery", "launch_canary_source_x", "succeeded", "2026-07-29T00:31:00.000Z", "2026-07-29T00:31:00.000Z", "2026-07-29T00:31:00.000Z"],
  ["news-exhausted", "launch_canary_source_news", "failed", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z", "2026-07-29T00:00:00.000Z"],
  ["fixture-failed", "launch_canary_fixture_001_hourly_1", "failed", "2026-07-29T01:30:00.000Z", "2026-07-29T01:30:00.000Z", "2026-07-29T01:30:00.000Z"],
  ["fixture-recovered", "launch_canary_fixture_001_hourly_1", "succeeded", "2026-07-29T01:44:00.000Z", "2026-07-29T01:44:00.000Z", "2026-07-29T01:44:00.000Z"],
  ["fresh-running", "launch_canary_source_rss_a", "running", null, "2026-07-29T01:55:00.000Z", "2026-07-29T01:55:00.000Z"],
  ["stale-queued", "launch_canary_source_rss_a", "queued", null, "2026-07-29T01:30:00.000Z", "2026-07-29T01:30:00.000Z"]
]) {
  insertRun.run(...run);
}

const sourceRuns = db.prepare(buildCanarySourceRunHealthQuery({
  windowStartedAt: "2026-07-29T00:00:00.000Z",
  observedAt: "2026-07-29T02:00:00.000Z"
})).get();
assert.deepEqual(
  {
    attempts: sourceRuns.attempts,
    succeeded: sourceRuns.succeeded,
    failed: sourceRuns.failed,
    recovered: sourceRuns.recovered_failures,
    pending: sourceRuns.pending_failures,
    exhausted: sourceRuns.exhausted_failures,
    late: sourceRuns.late_recoveries,
    inFlight: sourceRuns.in_flight,
    stale: sourceRuns.stale_in_flight
  },
  {
    attempts: 10,
    succeeded: 3,
    failed: 5,
    recovered: 2,
    pending: 1,
    exhausted: 2,
    late: 1,
    inFlight: 2,
    stale: 1
  }
);

const cleanSources = {
  fatal_current_errors: 0,
  expired_current_errors: 0,
  with_error: 0,
  enabled: 500
};
assert.equal(sourceRunHealthPass({
  elapsedHours: 12,
  sourceRuns: {
    attempts: 100,
    failed: 5,
    recovered_failures: 4,
    exhausted_failures: 0,
    pending_failures: 1,
    stale_in_flight: 0
  },
  sources: { ...cleanSources, with_error: 1 }
}), true, "a still-recoverable transient may remain pending before the final audit");
assert.equal(sourceRunHealthPass({
  elapsedHours: 24,
  sourceRuns: {
    attempts: 40_000,
    recovered_failures: 4,
    exhausted_failures: 0,
    pending_failures: 1,
    stale_in_flight: 0
  },
  sources: cleanSources
}), false, "the final audit requires no pending failures");
assert.equal(sourceRunHealthPass({
  elapsedHours: 24,
  sourceRuns: {
    attempts: 40_000,
    failed: 5,
    recovered_failures: 5,
    exhausted_failures: 0,
    pending_failures: 0,
    stale_in_flight: 0
  },
  sources: cleanSources
}), true, "recovered transient attempts remain evidence without invalidating the window");
assert.equal(sourceRunHealthPass({
  elapsedHours: 1,
  sourceRuns: {
    attempts: 100,
    recovered_failures: 0,
    exhausted_failures: 1,
    pending_failures: 0,
    stale_in_flight: 0
  },
  sources: cleanSources
}), false, "an exhausted failure invalidates the window immediately");
assert.equal(sourceRunHealthPass({
  elapsedHours: 2,
  sourceRuns: {
    attempts: 1_000,
    recovered_failures: 26,
    exhausted_failures: 0,
    pending_failures: 0,
    stale_in_flight: 0
  },
  sources: cleanSources
}), false, "too many recovered failures invalidate the window immediately");
assert.equal(sourceRunHealthPass({
  elapsedHours: 24,
  sourceRuns: {
    attempts: 10_000,
    recovered_failures: 11,
    exhausted_failures: 0,
    pending_failures: 0,
    stale_in_flight: 0
  },
  sources: cleanSources
}), false, "the final recovered-failure rate is bounded");

const recoveredModel = {
  primary_succeeded: 98,
  fallback_succeeded: 2,
  exhausted: 0,
  unexpected_outcomes: 0
};
assert.equal(recoveredModelFallbackRate(recoveredModel), 0.02);
assert.equal(modelOperationHealthPass({
  modelOperations: recoveredModel,
  modelValidation: { failed: 0 }
}), true);
assert.equal(modelOperationHealthPass({
  modelOperations: { ...recoveredModel, exhausted: 1 },
  modelValidation: { failed: 0 }
}), false);
assert.equal(modelOperationHealthPass({
  modelOperations: recoveredModel,
  modelValidation: { failed: 1 }
}), false);

db.close();
console.log("Canary recovery and model-outcome fixtures passed.");
