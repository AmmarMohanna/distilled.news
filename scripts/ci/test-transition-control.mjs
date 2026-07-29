#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertLegacyPaidFeedFreeze,
  assertLegacyRegistrationFreeze,
  assertFinalizedLegacyTransition,
  assertPinnedLegacyDeployment,
  hardenedFinalizePlan,
  legacyProductionVersionId,
  legacyPaidFeedFreezeTrigger,
  legacyRegistrationFreezeTrigger,
  workerDoesNotExist
} from "../lib/transition-control.mjs";

const legacyDetails = {
  id: legacyProductionVersionId,
  resources: {
    bindings: [
      { type: "plain_text", name: "PUBLIC_WEB_BASE_URL", text: "https://distilled.news" }
    ]
  }
};
assert.deepEqual(
  assertPinnedLegacyDeployment({
    versions: [{ version_id: legacyProductionVersionId, percentage: 100 }]
  }, legacyDetails),
  { versionId: legacyProductionVersionId, percentage: 100 }
);
assert.throws(
  () => assertPinnedLegacyDeployment({
    versions: [{ version_id: "01234567-89ab-cdef-0123-456789abcdef", percentage: 100 }]
  }, legacyDetails),
  /requires/
);
assert.throws(
  () => assertPinnedLegacyDeployment({
    versions: [{ version_id: legacyProductionVersionId, percentage: 100 }]
  }, {
    ...legacyDetails,
    resources: {
      bindings: [{ type: "plain_text", name: "REGISTRATION_MODE", text: "closed" }]
    }
  }),
  /fingerprint/
);

assert.equal(assertLegacyRegistrationFreeze([{
  name: legacyRegistrationFreezeTrigger,
  sql:
    `CREATE TRIGGER ${legacyRegistrationFreezeTrigger} ` +
    "BEFORE INSERT ON accounts WHEN NEW.role = 'user' " +
    "BEGIN SELECT RAISE(ABORT, 'registration temporarily closed'); END"
}]), true);
assert.throws(
  () => assertLegacyRegistrationFreeze([{
    name: legacyRegistrationFreezeTrigger,
    sql: `CREATE TRIGGER ${legacyRegistrationFreezeTrigger} AFTER INSERT ON accounts BEGIN SELECT 1; END`
  }]),
  /does not match/
);
assert.throws(
  () => assertLegacyRegistrationFreeze([{
    name: legacyRegistrationFreezeTrigger,
    sql:
      `CREATE TRIGGER ${legacyRegistrationFreezeTrigger} ` +
      "BEFORE INSERT ON accounts WHEN NEW.role = 'user' AND 0 " +
      "BEGIN SELECT RAISE(ABORT, 'registration temporarily closed'); END"
  }]),
  /does not match/
);
assert.equal(assertLegacyPaidFeedFreeze([{
  name: legacyPaidFeedFreezeTrigger,
  sql:
    `CREATE TRIGGER ${legacyPaidFeedFreezeTrigger} BEFORE UPDATE OF paused ON briefings ` +
    "WHEN OLD.paused = 1 AND NEW.paused != 1 AND EXISTS (" +
    "SELECT 1 FROM sources WHERE sources.briefing_id = OLD.id AND (" +
    "sources.kind IN ('google_news', 'x_profile', 'x_search') OR " +
    "(sources.kind = 'apify_actor' AND sources.last_error = " +
    "'retired during reviewed 2026-07-29 hosted paid-provider reconciliation'))) " +
    "BEGIN SELECT RAISE(ABORT, 'legacy paid-provider feed frozen for hardened transition'); END"
}]), true);
assert.throws(
  () => assertLegacyPaidFeedFreeze([{
    name: legacyPaidFeedFreezeTrigger,
    sql: `CREATE TRIGGER ${legacyPaidFeedFreezeTrigger} AFTER UPDATE ON briefings BEGIN SELECT 1; END`
  }]),
  /does not match/
);
assert.throws(
  () => assertLegacyPaidFeedFreeze([{
    name: legacyPaidFeedFreezeTrigger,
    sql:
      `CREATE TRIGGER ${legacyPaidFeedFreezeTrigger} BEFORE UPDATE OF paused ON briefings ` +
      "WHEN OLD.paused = 1 AND NEW.paused != 1 AND 0 AND EXISTS (" +
      "SELECT 1 FROM sources WHERE sources.briefing_id = OLD.id AND (" +
      "sources.kind IN ('google_news', 'x_profile', 'x_search') OR " +
      "(sources.kind = 'apify_actor' AND sources.last_error = " +
      "'retired during reviewed 2026-07-29 hosted paid-provider reconciliation'))) " +
      "BEGIN SELECT RAISE(ABORT, 'legacy paid-provider feed frozen for hardened transition'); END"
  }]),
  /does not match/
);

assert.equal(workerDoesNotExist({
  status: 1,
  stdout: "",
  stderr: "This Worker does not exist on your account. [code: 10007]"
}), true);
assert.equal(workerDoesNotExist({
  status: 1,
  stdout: "",
  stderr: "authentication failed [code: 10000]"
}), false);

const hardenedSha = "b".repeat(40);
const hardenedVersion = "01234567-89ab-cdef-0123-456789abcdef";
const completedMarker = `${hardenedSha}:${hardenedVersion}:2026-07-29T12:00:00.000Z`;
assert.deepEqual(assertFinalizedLegacyTransition({
  markerValue: completedMarker,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  registrationFreezeRows: [],
  paidFeedFreezeRows: []
}), {
  markerValue: completedMarker,
  completedAt: "2026-07-29T12:00:00.000Z"
});
assert.throws(() => assertFinalizedLegacyTransition({
  markerValue: null,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  registrationFreezeRows: [],
  paidFeedFreezeRows: []
}), /completion marker/);
assert.throws(() => assertFinalizedLegacyTransition({
  markerValue: completedMarker,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  registrationFreezeRows: [{ name: legacyRegistrationFreezeTrigger }],
  paidFeedFreezeRows: []
}), /freeze triggers/);
assert.deepEqual(hardenedFinalizePlan({
  markerValue: null,
  freezePresent: true,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  proposedMarker: completedMarker
}), {
  markerValue: completedMarker,
  writeMarker: true,
  dropFreeze: true,
  alreadyFinalized: false
});
assert.deepEqual(hardenedFinalizePlan({
  markerValue: completedMarker,
  freezePresent: true,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  proposedMarker: "ignored"
}), {
  markerValue: completedMarker,
  writeMarker: false,
  dropFreeze: true,
  alreadyFinalized: false
});
assert.deepEqual(hardenedFinalizePlan({
  markerValue: completedMarker,
  freezePresent: false,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  proposedMarker: "ignored"
}), {
  markerValue: completedMarker,
  writeMarker: false,
  dropFreeze: false,
  alreadyFinalized: true
});
assert.throws(() => hardenedFinalizePlan({
  markerValue: null,
  freezePresent: false,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  proposedMarker: completedMarker
}), /disappeared/);
assert.throws(() => hardenedFinalizePlan({
  markerValue: `${"c".repeat(40)}:${hardenedVersion}:2026-07-29T12:00:00.000Z`,
  freezePresent: true,
  releaseSha: hardenedSha,
  versionId: hardenedVersion,
  proposedMarker: completedMarker
}), /does not match/);

console.log("Validated one-time staging and pinned legacy transition guards.");
