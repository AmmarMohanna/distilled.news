#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  createStateBundle,
  restoreStateBundle
} from "../canary/state-bundle.mjs";

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "distilled-canary-bundle-test-"));
const source = resolve(temporaryRoot, "source");
const restored = resolve(temporaryRoot, "restored");
const key = "test-only-canary-evidence-key-with-at-least-32-characters";
const releaseSha = "1234567890abcdef1234567890abcdef12345678";
const startedAt = "2026-07-29T10:00:00.000Z";
const versionId = "version-staging-1";
const now = new Date("2026-07-29T10:15:00.000Z");

try {
  mkdirSync(source, { mode: 0o700 });
  writeFileSync(resolve(source, "window.json"), `${JSON.stringify({
    startedAt,
    reason: "test",
    releaseSha,
    versionId
  })}\n`);
  writeFileSync(resolve(source, "observations.ndjson"), `${JSON.stringify({
    observedAt: now.toISOString(),
    window: { startedAt, releaseSha, versionId }
  })}\n`);
  writeFileSync(
    resolve(source, "observation-2026-07-29T10-15-00-000Z.json"),
    `${JSON.stringify({ observedAt: now.toISOString() })}\n`
  );

  const bundle = createStateBundle({ directory: source, key, releaseSha, now });
  const result = restoreStateBundle({
    input: bundle,
    directory: restored,
    key,
    releaseSha,
    now
  });
  assert.equal(result.releaseSha, releaseSha);
  assert.equal(result.files, 3);
  assert.equal(
    readFileSync(resolve(restored, "window.json"), "utf8"),
    readFileSync(resolve(source, "window.json"), "utf8")
  );

  assert.throws(
    () => restoreStateBundle({
      input: `${bundle.slice(0, -2)}xx`,
      directory: resolve(temporaryRoot, "tampered"),
      key,
      releaseSha,
      now
    }),
    /signed JSON|signature/
  );

  const envelope = JSON.parse(bundle);
  const payload = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  payload.files[0].name = "../checkout/scripts/canary/heartbeat.mjs";
  envelope.payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  envelope.signature = createHmac("sha256", key).update(envelope.payload).digest("base64url");
  assert.throws(
    () => restoreStateBundle({
      input: JSON.stringify(envelope),
      directory: resolve(temporaryRoot, "path-traversal"),
      key,
      releaseSha,
      now
    }),
    /disallowed path/
  );

  const symlinkSource = resolve(temporaryRoot, "symlink-source");
  mkdirSync(symlinkSource, { mode: 0o700 });
  symlinkSync(resolve(source, "window.json"), resolve(symlinkSource, "window.json"));
  assert.throws(
    () => createStateBundle({ directory: symlinkSource, key, releaseSha, now }),
    /not a regular file/
  );

  const criticalSource = resolve(temporaryRoot, "critical-source");
  const criticalRestored = resolve(temporaryRoot, "critical-restored");
  const failedAt = "2026-07-29T10:15:00.000Z";
  const resetAt = "2026-07-29T10:15:05.000Z";
  const failedObservationFile = "observation-2026-07-29T10-15-00-000Z.json";
  const failedWindow = {
    startedAt,
    reason: "test",
    releaseSha,
    versionId
  };
  const failedObservation = {
    schemaVersion: 1,
    observedAt: failedAt,
    window: failedWindow,
    gates: [
      { name: "observation-duration-24h", passed: false },
      { name: "routes", passed: false }
    ],
    passed: false
  };
  const resetWindow = {
    startedAt: resetAt,
    reason: "critical-gate-failure:routes",
    releaseSha,
    versionId,
    resetFrom: {
      observedAt: failedAt,
      observationFile: failedObservationFile,
      window: {
        startedAt,
        releaseSha,
        versionId
      },
      criticalGates: ["routes"]
    }
  };
  mkdirSync(criticalSource, { mode: 0o700 });
  writeFileSync(resolve(criticalSource, "window.json"), `${JSON.stringify(resetWindow, null, 2)}\n`);
  writeFileSync(
    resolve(criticalSource, "observations.ndjson"),
    `${JSON.stringify(failedObservation)}\n`
  );
  writeFileSync(
    resolve(criticalSource, failedObservationFile),
    `${JSON.stringify(failedObservation, null, 2)}\n`
  );

  const criticalBundle = createStateBundle({
    directory: criticalSource,
    key,
    releaseSha,
    now: new Date("2026-07-29T10:16:00.000Z")
  });
  restoreStateBundle({
    input: criticalBundle,
    directory: criticalRestored,
    key,
    releaseSha,
    now: new Date("2026-07-29T10:16:00.000Z")
  });
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(criticalRestored, "window.json"), "utf8")),
    resetWindow,
    "the next run must restore the newly started post-failure window"
  );
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(criticalRestored, failedObservationFile), "utf8")),
    failedObservation,
    "the failed observation and its prior window must remain in signed evidence"
  );

  const nextObservedAt = "2026-07-29T10:30:00.000Z";
  const nextObservation = {
    schemaVersion: 1,
    observedAt: nextObservedAt,
    window: resetWindow,
    gates: [{ name: "observation-duration-24h", passed: false }],
    passed: false
  };
  writeFileSync(
    resolve(criticalRestored, "observations.ndjson"),
    `${JSON.stringify(failedObservation)}\n${JSON.stringify(nextObservation)}\n`
  );
  writeFileSync(
    resolve(criticalRestored, "observation-2026-07-29T10-30-00-000Z.json"),
    `${JSON.stringify(nextObservation, null, 2)}\n`
  );
  assert.doesNotThrow(
    () => createStateBundle({
      directory: criticalRestored,
      key,
      releaseSha,
      now: new Date("2026-07-29T10:31:00.000Z")
    }),
    "the first heartbeat after a reset must package against the new window"
  );

  const invalidCriticalSource = resolve(temporaryRoot, "invalid-critical-source");
  mkdirSync(invalidCriticalSource, { mode: 0o700 });
  writeFileSync(
    resolve(invalidCriticalSource, "window.json"),
    `${JSON.stringify({
      ...resetWindow,
      reason: "critical-gate-failure:spend-cap",
      resetFrom: { ...resetWindow.resetFrom, criticalGates: ["spend-cap"] }
    }, null, 2)}\n`
  );
  writeFileSync(
    resolve(invalidCriticalSource, "observations.ndjson"),
    `${JSON.stringify(failedObservation)}\n`
  );
  writeFileSync(
    resolve(invalidCriticalSource, failedObservationFile),
    `${JSON.stringify(failedObservation, null, 2)}\n`
  );
  assert.throws(
    () => createStateBundle({
      directory: invalidCriticalSource,
      key,
      releaseSha,
      now: new Date("2026-07-29T10:16:00.000Z")
    }),
    /critical-reset metadata is invalid|matching failed observation/,
    "a reset cannot claim a critical failure absent from the signed observation"
  );

  console.log("Canary state bundle security checks passed.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
