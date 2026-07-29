#!/usr/bin/env node

import assert from "node:assert/strict";
import { assertCanaryWorkflowIdentity } from "../release/verify-canary-workflow-identity.mjs";

const releaseSha = "a".repeat(40);
const strong = {
  releaseSha,
  githubSha: releaseSha,
  workflowSha: releaseSha,
  checkoutSha: releaseSha,
  eventName: "schedule",
  ref: "refs/heads/main"
};

assert.equal(assertCanaryWorkflowIdentity(strong), true);
assert.equal(
  assertCanaryWorkflowIdentity({ ...strong, eventName: "workflow_dispatch" }),
  true
);
assert.throws(
  () => assertCanaryWorkflowIdentity({ ...strong, releaseSha: "short" }),
  /full 40-character/
);
assert.throws(
  () => assertCanaryWorkflowIdentity({ ...strong, githubSha: "b".repeat(40) }),
  /identity mismatch/
);
assert.throws(
  () => assertCanaryWorkflowIdentity({ ...strong, workflowSha: "b".repeat(40) }),
  /identity mismatch/
);
assert.throws(
  () => assertCanaryWorkflowIdentity({ ...strong, checkoutSha: "b".repeat(40) }),
  /identity mismatch/
);
assert.throws(
  () => assertCanaryWorkflowIdentity({
    ...strong,
    eventName: "workflow_dispatch",
    ref: "refs/heads/unreviewed"
  }),
  /refs\/heads\/main/
);
assert.throws(
  () => assertCanaryWorkflowIdentity({ ...strong, eventName: "pull_request" }),
  /event is not allowed/
);

console.log("Protected-main canary workflow identity fixtures passed.");
