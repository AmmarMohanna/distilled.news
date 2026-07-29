#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectPriorEvidenceRun } from "../canary/select-evidence-run.mjs";
import { repositoryRoot } from "../lib/release-config.mjs";

const releaseSha = "1234567890abcdef1234567890abcdef12345678";
const path = ".github/workflows/canary-heartbeat.yml";
const run = (id, overrides = {}) => ({
  id,
  status: "completed",
  conclusion: "success",
  head_sha: releaseSha,
  path,
  run_started_at: `2026-07-29T10:${String(id).padStart(2, "0")}:00.000Z`,
  ...overrides
});

assert.equal(
  selectPriorEvidenceRun({
    workflowRuns: [
      run(1),
      run(2, { conclusion: "failure" })
    ],
    releaseSha,
    currentRunId: 3
  }),
  2,
  "a critical failed heartbeat must supersede older successful evidence"
);

assert.equal(
  selectPriorEvidenceRun({
    workflowRuns: [
      run(1),
      run(2, { conclusion: "failure" }),
      run(3)
    ],
    releaseSha,
    currentRunId: 4
  }),
  3,
  "the run following a critical failure must restore the failed run's reset state"
);

assert.equal(
  selectPriorEvidenceRun({
    workflowRuns: [
      run(1, { head_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" }),
      run(2, { path: ".github/workflows/ci.yml" }),
      run(3, { status: "in_progress" })
    ],
    releaseSha,
    currentRunId: 4
  }),
  null,
  "other SHAs, workflows, and incomplete runs cannot supply evidence"
);

const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/canary-heartbeat.yml"),
  "utf8"
);
const heartbeatIndex = workflow.indexOf("Record and, when complete, sign the heartbeat");
const packageIndex = workflow.indexOf("Package evidence and post-failure reset state");
const uploadIndex = workflow.indexOf("Persist protected evidence state");
assert.ok(
  heartbeatIndex >= 0 && packageIndex > heartbeatIndex && uploadIndex > packageIndex,
  "the failed heartbeat must be followed by packaging and upload steps"
);
const packageStep = workflow.slice(packageIndex, uploadIndex);
assert.match(
  packageStep,
  /id: package-evidence\s+if: always\(\)/,
  "critical heartbeat failures must not skip signed evidence packaging"
);
assert.match(
  workflow.slice(uploadIndex),
  /if: always\(\) && steps\.package-evidence\.outcome == 'success'/,
  "a successfully packaged failed observation must still upload"
);

console.log("Canary evidence handoff checks passed.");
