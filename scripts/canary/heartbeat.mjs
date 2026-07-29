#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { repositoryRoot } from "../lib/release-config.mjs";

const audit = spawnSync(
  process.execPath,
  ["scripts/canary/audit.mjs", "--json"],
  { cwd: repositoryRoot, encoding: "utf8", env: process.env }
);
if (audit.stderr) process.stderr.write(audit.stderr);
if (!audit.stdout.trim()) {
  throw new Error("Canary audit produced no observation.");
}

let observation;
try {
  observation = JSON.parse(audit.stdout);
} catch {
  process.stdout.write(audit.stdout);
  throw new Error("Canary audit output was not valid JSON.");
}
process.stdout.write(`${JSON.stringify(observation, null, 2)}\n`);

const failed = (observation.gates ?? []).filter((gate) => !gate.passed).map((gate) => gate.name);
const expectedWarmupFailures = new Set(["observation-duration-24h"]);
const critical = failed.filter((name) => !expectedWarmupFailures.has(name));
if (critical.length > 0) {
  throw new Error(`Canary heartbeat failed critical gates: ${critical.join(", ")}`);
}
if (!observation.passed) {
  console.log("Canary heartbeat recorded; the 24-hour duration gate is still warming up.");
  process.exit(0);
}

const attestation = spawnSync(
  process.execPath,
  ["scripts/canary/attest.mjs", "--output", ".canary-observations/production-attestation.txt"],
  { cwd: repositoryRoot, stdio: "inherit", env: process.env }
);
if (attestation.error) throw attestation.error;
if (attestation.status !== 0) process.exit(attestation.status ?? 1);
console.log("Canary heartbeat passed and signed the protected same-SHA evidence.");
