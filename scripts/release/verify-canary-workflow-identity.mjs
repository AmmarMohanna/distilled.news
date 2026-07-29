#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[a-f0-9]{40}$/i;
const ALLOWED_EVENTS = new Set(["schedule", "workflow_dispatch"]);

export function assertCanaryWorkflowIdentity(input) {
  const releaseSha = normalizeSha(input.releaseSha, "CANARY_RELEASE_SHA");
  const githubSha = normalizeSha(input.githubSha, "GITHUB_SHA");
  const workflowSha = normalizeSha(input.workflowSha, "GITHUB_WORKFLOW_SHA");
  const checkoutSha = normalizeSha(input.checkoutSha, "checked-out SHA");
  const eventName = String(input.eventName ?? "").trim();
  const ref = String(input.ref ?? "").trim();

  if (!ALLOWED_EVENTS.has(eventName)) {
    throw new Error(`Canary heartbeat event is not allowed: ${eventName || "unknown"}.`);
  }
  if (ref !== "refs/heads/main") {
    throw new Error(`Canary heartbeat must run from refs/heads/main, not ${ref || "unknown"}.`);
  }
  if (
    releaseSha !== githubSha ||
    releaseSha !== workflowSha ||
    releaseSha !== checkoutSha
  ) {
    throw new Error(
      "Canary heartbeat identity mismatch: CANARY_RELEASE_SHA, event SHA, workflow SHA, and checkout SHA must be identical."
    );
  }
  return true;
}

function normalizeSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function main() {
  const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  }).trim();
  assertCanaryWorkflowIdentity({
    releaseSha: process.env.CANARY_RELEASE_SHA,
    githubSha: process.env.GITHUB_SHA,
    workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    checkoutSha,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF
  });
  console.log("Verified frozen protected-main canary workflow identity.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main();
}
