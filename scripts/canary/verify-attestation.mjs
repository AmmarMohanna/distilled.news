#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyAttestationPayload } from "./attestation-crypto.mjs";

const compact = process.env.CANARY_ATTESTATION?.trim() ?? "";
const publicKey = process.env.CANARY_ATTESTATION_PUBLIC_KEY ?? "";
const expectedReleaseSha = process.env.RELEASE_SHA ?? "";

if (!compact) throw new Error("A signed CANARY_ATTESTATION is required for production.");
if (!/^[a-f0-9]{40,64}$/i.test(expectedReleaseSha)) {
  throw new Error("RELEASE_SHA must be the full production release SHA.");
}

let envelope;
let payload;
try {
  envelope = JSON.parse(Buffer.from(compact, "base64url").toString("utf8"));
  payload = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
} catch {
  throw new Error("Canary attestation is not valid base64url JSON.");
}
if (envelope.algorithm !== "Ed25519" || typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
  throw new Error("Canary attestation envelope is invalid.");
}
if (!verifyAttestationPayload(envelope.payload, envelope.signature, publicKey)) {
  throw new Error("Canary attestation signature is invalid.");
}

const startedAt = Date.parse(payload.startedAt);
const completedAt = Date.parse(payload.completedAt);
const ageHours = (Date.now() - completedAt) / 3_600_000;
if (
  payload.schemaVersion !== 1 ||
  payload.releaseSha !== expectedReleaseSha ||
  payload.auditCodeSha !== expectedReleaseSha ||
  payload.auditCodeDigest !== auditCodeDigest() ||
  !payload.versionId ||
  !Number.isFinite(startedAt) ||
  !Number.isFinite(completedAt) ||
  completedAt - startedAt < 24 * 3_600_000 ||
  Number(payload.durationHours) < 24 ||
  Number(payload.observationCount) < 49 ||
  Number(payload.maxGapMinutes) > 45 ||
  !/^[a-f0-9]{64}$/i.test(payload.observationDigest ?? "") ||
  !Array.isArray(payload.passedGates) ||
  !payload.passedGates.includes("release-stability") ||
  !payload.passedGates.includes("continuous-observation-history") ||
  !payload.passedGates.includes("prior-critical-failures") ||
  !payload.passedGates.includes("source-run-health") ||
  !payload.passedGates.includes("meaningful-publication") ||
  !payload.passedGates.includes("model-operation-health") ||
  !payload.passedGates.includes("model-synthesis") ||
  !payload.passedGates.includes("spend-cap") ||
  !payload.passedGates.includes("dlq-zero-backlog") ||
  ageHours < 0 ||
  ageHours > 168
) {
  throw new Error("Canary attestation does not satisfy the same-SHA 24-hour production gate.");
}

console.log("Canary attestation verified.");
console.log(`- release: ${payload.releaseSha}`);
console.log(`- duration: ${Number(payload.durationHours).toFixed(2)} hours`);
console.log(`- observations: ${payload.observationCount}`);
console.log(`- maximum gap: ${Number(payload.maxGapMinutes).toFixed(2)} minutes`);

function auditCodeDigest() {
  const paths = [
    "scripts/canary/audit.mjs",
    "scripts/canary/cost-plan.mjs",
    "scripts/canary/heartbeat.mjs",
    "scripts/canary/observation-window.mjs",
    "scripts/canary/reliability.mjs",
    "scripts/canary/state-bundle.mjs",
    "scripts/canary/select-evidence-run.mjs",
    "scripts/canary/attestation-crypto.mjs",
    "scripts/canary/attest.mjs",
    "scripts/canary/verify-attestation.mjs"
  ];
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(resolve(path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
