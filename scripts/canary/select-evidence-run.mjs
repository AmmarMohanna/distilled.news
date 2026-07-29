#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const HEARTBEAT_WORKFLOW_PATH = ".github/workflows/canary-heartbeat.yml";

export function selectPriorEvidenceRun({
  workflowRuns,
  releaseSha,
  currentRunId
}) {
  if (!/^[a-f0-9]{40,64}$/i.test(releaseSha ?? "")) {
    throw new Error("CANARY_RELEASE_SHA must be a full frozen release SHA.");
  }
  if (!Array.isArray(workflowRuns)) throw new Error("GitHub workflow run data is invalid.");

  const candidates = workflowRuns.filter((run) =>
    run &&
    run.status === "completed" &&
    run.head_sha === releaseSha &&
    run.path === HEARTBEAT_WORKFLOW_PATH &&
    String(run.id) !== String(currentRunId)
  );
  candidates.sort((left, right) => {
    const timeOrder = String(left.run_started_at ?? left.created_at ?? "")
      .localeCompare(String(right.run_started_at ?? right.created_at ?? ""));
    return timeOrder || Number(left.id) - Number(right.id);
  });
  return candidates.at(-1)?.id ?? null;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("GitHub workflow run response is invalid JSON.");
  }
  const runId = selectPriorEvidenceRun({
    workflowRuns: payload.workflow_runs,
    releaseSha: process.env.CANARY_RELEASE_SHA,
    currentRunId: process.env.CURRENT_RUN_ID
  });
  if (runId !== null) process.stdout.write(`${runId}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
