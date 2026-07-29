#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signAttestationPayload } from "./attestation-crypto.mjs";
import {
  observationDirectory,
  readObservationWindow
} from "./observation-window.mjs";

const privateKey = process.env.CANARY_ATTESTATION_PRIVATE_KEY ?? "";
const window = readObservationWindow();
if (!window) throw new Error("No active canary observation window exists.");

const observationsPath = resolve(observationDirectory, "observations.ndjson");
if (!existsSync(observationsPath)) throw new Error("No canary observations exist.");
const matchingLines = [];
const observations = [];
for (const line of readFileSync(observationsPath, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  let observation;
  try {
    observation = JSON.parse(line);
  } catch {
    continue;
  }
  if (
    observation.window?.startedAt === window.startedAt &&
    observation.window?.versionId === window.versionId &&
    observation.window?.releaseSha === window.releaseSha
  ) {
    matchingLines.push(line);
    observations.push(observation);
  }
}
const final = observations.at(-1);
if (!final?.passed || !final.gates?.every((gate) => gate.passed)) {
  throw new Error("The latest observation is not a fully passing 24-hour canary result.");
}
if (
  final.history?.continuous !== true ||
  Number(final.history?.observationCount ?? 0) < 49 ||
  Number(final.history?.maxGapMinutes ?? Number.POSITIVE_INFINITY) > 45 ||
  (final.priorCriticalFailures?.length ?? 0) !== 0
) {
  throw new Error("Canary history is incomplete, has a heartbeat gap, or contains a critical failure.");
}
const durationHours = (Date.parse(final.observedAt) - Date.parse(window.startedAt)) / 3_600_000;
if (durationHours < 24) throw new Error("Canary duration is shorter than 24 hours.");
if (!/^[a-f0-9]{40,64}$/i.test(window.releaseSha ?? "")) {
  throw new Error("Canary release SHA is missing or invalid.");
}
if (final.auditCodeSha !== window.releaseSha) {
  throw new Error("Canary audit code SHA does not match the staged Worker release.");
}

const payload = {
  schemaVersion: 1,
  releaseSha: window.releaseSha,
  auditCodeSha: final.auditCodeSha,
  auditCodeDigest: auditCodeDigest(),
  versionId: window.versionId,
  startedAt: window.startedAt,
  completedAt: final.observedAt,
  durationHours,
  observationCount: final.history.observationCount,
  maxGapMinutes: final.history.maxGapMinutes,
  observationDigest: createHash("sha256").update(matchingLines.join("\n")).digest("hex"),
  passedGates: final.gates.map((gate) => gate.name).sort()
};
const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = signAttestationPayload(encodedPayload, privateKey);
const attestation = Buffer.from(JSON.stringify({
  algorithm: "Ed25519",
  payload: encodedPayload,
  signature
})).toString("base64url");
const outputPath = resolve(optionValue("--output") ?? resolve(observationDirectory, "production-attestation.txt"));
writeFileSync(outputPath, `${attestation}\n`, { mode: 0o600 });
console.log(`Signed canary attestation written to ${outputPath}`);
console.log("Paste its single line into the protected production release workflow.");

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

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
