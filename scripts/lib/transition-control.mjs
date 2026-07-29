import {
  plainTextBinding,
  singleFullTrafficVersion
} from "./rollback-control.mjs";

export const legacyProductionVersionId = "74a97cf8-1361-41c8-bc7d-6d0b87b55151";
export const legacyRegistrationFreezeTrigger = "legacy_registration_freeze_20260729";
export const legacyPaidFeedFreezeTrigger = "legacy_paid_feed_freeze_20260729";
export const legacyTransitionMarker = "legacy_transition_completed";
export const stagingBootstrapStartedMarker = "staging_bootstrap_started";
export const stagingBootstrapCompletedMarker = "staging_bootstrap_completed";

export function assertPinnedLegacyDeployment(deployment, details) {
  const current = singleFullTrafficVersion(deployment);
  if (current.versionId !== legacyProductionVersionId || details?.id !== legacyProductionVersionId) {
    throw new Error(
      `Legacy transition requires ${legacyProductionVersionId} at 100% traffic.`
    );
  }
  if (
    plainTextBinding(details, "REGISTRATION_MODE") !== undefined ||
    plainTextBinding(details, "RELEASE_SHA") !== undefined
  ) {
    throw new Error("Pinned legacy version fingerprint unexpectedly contains hardened release bindings.");
  }
  return current;
}

export function assertLegacyRegistrationFreeze(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Required D1 trigger ${legacyRegistrationFreezeTrigger} is missing.`);
  }
  const sql = normalizeTriggerSql(rows[0]?.sql);
  const expected = normalizeTriggerSql(
    `CREATE TRIGGER ${legacyRegistrationFreezeTrigger} ` +
    "BEFORE INSERT ON accounts WHEN NEW.role = 'user' " +
    "BEGIN SELECT RAISE(ABORT, 'registration temporarily closed'); END"
  );
  if (rows[0]?.name !== legacyRegistrationFreezeTrigger || sql !== expected) {
    throw new Error(`D1 trigger ${legacyRegistrationFreezeTrigger} does not match the reviewed freeze.`);
  }
  return true;
}

export function assertLegacyPaidFeedFreeze(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Required D1 trigger ${legacyPaidFeedFreezeTrigger} is missing.`);
  }
  const sql = normalizeTriggerSql(rows[0]?.sql);
  const expected = normalizeTriggerSql(
    `CREATE TRIGGER ${legacyPaidFeedFreezeTrigger} ` +
    "BEFORE UPDATE OF paused ON briefings " +
    "WHEN OLD.paused = 1 AND NEW.paused != 1 AND EXISTS (" +
    "SELECT 1 FROM sources WHERE sources.briefing_id = OLD.id AND (" +
    "sources.kind IN ('google_news', 'x_profile', 'x_search') OR " +
    "(sources.kind = 'apify_actor' AND sources.last_error = " +
    "'retired during reviewed 2026-07-29 hosted paid-provider reconciliation')" +
    ")) BEGIN SELECT RAISE(ABORT, " +
    "'legacy paid-provider feed frozen for hardened transition'); END"
  );
  if (rows[0]?.name !== legacyPaidFeedFreezeTrigger || sql !== expected) {
    throw new Error(`D1 trigger ${legacyPaidFeedFreezeTrigger} does not match the reviewed freeze.`);
  }
  return true;
}

export function assertFinalizedLegacyTransition({
  markerValue,
  releaseSha,
  versionId,
  registrationFreezeRows,
  paidFeedFreezeRows
}) {
  const expectedPrefix = `${releaseSha}:${versionId}:`;
  if (!String(markerValue ?? "").startsWith(expectedPrefix)) {
    throw new Error("Legacy transition completion marker does not match the live release and version.");
  }
  const completedAt = Date.parse(String(markerValue).slice(expectedPrefix.length));
  if (!Number.isFinite(completedAt)) {
    throw new Error("Legacy transition completion marker has an invalid completion timestamp.");
  }
  if ((registrationFreezeRows ?? []).length !== 0 || (paidFeedFreezeRows ?? []).length !== 0) {
    throw new Error("Legacy transition freeze triggers remain installed.");
  }
  return {
    markerValue,
    completedAt: new Date(completedAt).toISOString()
  };
}

function normalizeTriggerSql(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "")
    .toLowerCase();
}

export function workerDoesNotExist(result) {
  if (result?.status === 0) return false;
  const detail = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
  return detail.includes("code: 10007") && /worker does not exist/i.test(detail);
}

export function hardenedFinalizePlan({
  markerValue,
  freezePresent,
  releaseSha,
  versionId,
  proposedMarker
}) {
  const prefix = `${releaseSha}:${versionId}:`;
  if (markerValue) {
    if (!markerValue.startsWith(prefix)) {
      throw new Error("Legacy transition marker does not match the hardened release and version.");
    }
    return {
      markerValue,
      writeMarker: false,
      dropFreeze: freezePresent,
      alreadyFinalized: !freezePresent
    };
  }
  if (!freezePresent) {
    throw new Error("Legacy freeze disappeared before the transition completion marker was written.");
  }
  if (!String(proposedMarker ?? "").startsWith(prefix)) {
    throw new Error("Proposed legacy transition marker does not match the hardened release and version.");
  }
  return {
    markerValue: proposedMarker,
    writeMarker: true,
    dropFreeze: true,
    alreadyFinalized: false
  };
}
