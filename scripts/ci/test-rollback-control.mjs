#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  closedVersionIdentity,
  rollbackConfirmation,
  singleFullTrafficVersion,
  validateRollbackBaseline
} from "../lib/rollback-control.mjs";

const versionId = "01234567-89ab-cdef-0123-456789abcdef";
const releaseSha = "a".repeat(40);
const deployment = {
  id: "deployment-id",
  versions: [{ version_id: versionId, percentage: 100 }]
};
const details = {
  id: versionId,
  metadata: { created_on: "2026-07-29T10:00:00.000Z" },
  resources: {
    bindings: [
      { type: "plain_text", name: "REGISTRATION_MODE", text: "closed" },
      { type: "plain_text", name: "RELEASE_SHA", text: releaseSha }
    ]
  }
};
const baseline = {
  schemaVersion: 1,
  environment: "production",
  workerName: "distilled-news",
  baseUrl: "https://distilled.news",
  versionId,
  releaseSha,
  registrationMode: "closed",
  d1RegistrationEnabled: false
};

assert.deepEqual(singleFullTrafficVersion(deployment), { versionId, percentage: 100 });
assert.deepEqual(closedVersionIdentity(details, versionId), {
  versionId,
  releaseSha,
  createdOn: "2026-07-29T10:00:00.000Z"
});
assert.equal(
  validateRollbackBaseline(baseline, {
    environment: "production",
    workerName: "distilled-news",
    baseUrl: "https://distilled.news"
  }).versionId,
  versionId
);
assert.equal(
  rollbackConfirmation("production", versionId),
  `distilled-news:production:rollback:${versionId}`
);

assert.throws(
  () => singleFullTrafficVersion({
    versions: [
      { version_id: versionId, percentage: 90 },
      { version_id: "fedcba98-7654-3210-fedc-ba9876543210", percentage: 10 }
    ]
  }),
  /exactly one/
);
assert.throws(
  () => closedVersionIdentity({
    ...details,
    resources: {
      bindings: [
        { type: "plain_text", name: "REGISTRATION_MODE", text: "open" },
        { type: "plain_text", name: "RELEASE_SHA", text: releaseSha }
      ]
    }
  }, versionId),
  /not a closed-registration/
);
assert.throws(
  () => validateRollbackBaseline(
    { ...baseline, d1RegistrationEnabled: true },
    {
      environment: "production",
      workerName: "distilled-news",
      baseUrl: "https://distilled.news"
    }
  ),
  /both registration gates were closed/
);
assert.throws(
  () => validateRollbackBaseline(
    baseline,
    {
      environment: "staging",
      workerName: "distilled-news-staging",
      baseUrl: "https://staging.distilled.news"
    }
  ),
  /environment/
);

console.log("Validated release rollback target parsing and fail-closed evidence checks.");
