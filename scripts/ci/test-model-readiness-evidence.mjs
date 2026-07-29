#!/usr/bin/env node

import assert from "node:assert/strict";
import { assertModelReadinessEvidence } from "../lib/model-readiness-evidence.mjs";

const now = Date.parse("2026-07-29T12:00:00.000Z");
const fingerprint = "a".repeat(64);
const valid = {
  attempted: true,
  cached: false,
  succeeded: true,
  validatedAt: "2026-07-29T11:59:00.000Z",
  inputFingerprint: fingerprint,
  outputFingerprint: "b".repeat(64),
  model: "gpt-4.1-mini"
};

assert.doesNotThrow(() => assertModelReadinessEvidence(valid, { now }));
assert.doesNotThrow(() => assertModelReadinessEvidence({
  ...valid,
  attempted: false,
  cached: true
}, { now }));

for (const invalid of [
  { ...valid, succeeded: false },
  { ...valid, attempted: true, cached: true },
  { ...valid, attempted: false, cached: false },
  { ...valid, validatedAt: now },
  { ...valid, validatedAt: "2026-07-29T11:54:59.999Z" },
  { ...valid, validatedAt: "2026-07-29T12:00:00.001Z" },
  { ...valid, inputFingerprint: "not-a-sha256" },
  { ...valid, outputFingerprint: "A".repeat(64) },
  { ...valid, model: "  " }
]) {
  assert.throws(
    () => assertModelReadinessEvidence(invalid, { now }),
    /Fixed-input model readiness evidence is missing or invalid/
  );
}

console.log("Validated fixed-input model readiness operator evidence.");
