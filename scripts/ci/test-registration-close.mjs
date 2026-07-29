#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  acceptEmergencyHttpClosure,
  planEmergencyRegistrationClose
} from "../lib/registration-close.mjs";

const liveSha = "a".repeat(40);
const mainAheadSha = "b".repeat(40);
const openVersion = "01234567-89ab-cdef-0123-456789abcdef";
const closedVersion = "fedcba98-7654-3210-fedc-ba9876543210";
const plan = planEmergencyRegistrationClose({
  currentVersionId: openVersion,
  currentMode: "open",
  currentReleaseSha: liveSha,
  candidates: [
    {
      versionId: closedVersion,
      releaseSha: liveSha,
      registrationMode: "closed"
    },
    {
      versionId: "11111111-2222-3333-4444-555555555555",
      releaseSha: mainAheadSha,
      registrationMode: "closed"
    }
  ],
  pinnedLegacyVersionId: "74a97cf8-1361-41c8-bc7d-6d0b87b55151"
});
assert.equal(plan.liveReleaseSha, liveSha);
assert.equal(plan.rollbackVersionId, closedVersion);
assert.notEqual(plan.liveReleaseSha, mainAheadSha);

assert.deepEqual(planEmergencyRegistrationClose({
  currentVersionId: closedVersion,
  currentMode: "closed",
  currentReleaseSha: liveSha,
  candidates: [],
  pinnedLegacyVersionId: "74a97cf8-1361-41c8-bc7d-6d0b87b55151"
}), {
  kind: "hardened",
  liveReleaseSha: liveSha,
  rollbackVersionId: null,
  closedVersionId: closedVersion
});
assert.equal(acceptEmergencyHttpClosure("unavailable"), true);
assert.equal(acceptEmergencyHttpClosure("closed"), true);
assert.throws(() => acceptEmergencyHttpClosure("open"), /contradict/);
assert.deepEqual(planEmergencyRegistrationClose({
  currentVersionId: "74a97cf8-1361-41c8-bc7d-6d0b87b55151",
  currentMode: undefined,
  currentReleaseSha: undefined,
  candidates: [],
  pinnedLegacyVersionId: "74a97cf8-1361-41c8-bc7d-6d0b87b55151"
}), {
  kind: "pinned-legacy",
  liveReleaseSha: null,
  rollbackVersionId: null,
  closedVersionId: "74a97cf8-1361-41c8-bc7d-6d0b87b55151"
});

// Emergency close does not accept a maintenance secret or requested main SHA:
// its only authority is the live version metadata plus D1/control-plane closure.
assert.equal("INTERNAL_MAINTENANCE_SECRET" in plan, false);
assert.equal("requestedReleaseSha" in plan, false);

console.log("Validated main-ahead, endpoint-down, and missing-secret emergency close behavior.");
