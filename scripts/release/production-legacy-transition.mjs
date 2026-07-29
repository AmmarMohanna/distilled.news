#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";
import {
  closedVersionIdentity,
  plainTextBinding,
  singleFullTrafficVersion
} from "../lib/rollback-control.mjs";
import {
  assertLegacyPaidFeedFreeze,
  assertLegacyRegistrationFreeze,
  assertPinnedLegacyDeployment,
  hardenedFinalizePlan,
  legacyProductionVersionId,
  legacyPaidFeedFreezeTrigger,
  legacyRegistrationFreezeTrigger,
  legacyTransitionMarker
} from "../lib/transition-control.mjs";
import {
  assertPaidSeatInventory,
  classifyLegacyPaidCohort,
  legacyPaidSourceRetirementMarker,
  readProtectedPaidCohortManifest,
  retainedPaidSourceIds,
  reviewedAccountIds,
  reviewedLegacyPaidCohort
} from "../lib/paid-cohort-control.mjs";

const mode = process.argv[2];
if (![
  "freeze",
  "preflight",
  "cohort-inventory",
  "cohort-reconcile",
  "verify-seats",
  "prepare",
  "finalize",
  "rollback"
].includes(mode)) {
  throw new Error(
    "Usage: production-legacy-transition.mjs " +
    "freeze|preflight|cohort-inventory|cohort-reconcile|verify-seats|prepare|finalize|rollback " +
    "[--evidence <path>]"
  );
}
const environment = "production";
const config = readWorkerConfig();
const production = environmentConfig(config, environment);
const baseUrl = production.vars?.PUBLIC_WEB_BASE_URL;
if (
  production.name !== "lownoise-news" ||
  production.vars?.ENVIRONMENT !== "production" ||
  production.vars?.REGISTRATION_MODE !== "closed" ||
  !baseUrl
) {
  throw new Error("Legacy transition is pinned to the closed lownoise-news production environment.");
}

const releaseSha = process.env.RELEASE_SHA ?? "";
const failedReleaseSha = process.env.FAILED_RELEASE_SHA ?? "";
const confirmationSuffix = mode === "finalize"
  ? releaseSha
  : mode === "rollback"
    ? legacyProductionVersionId
    : legacyProductionVersionId;
const expectedConfirmation =
  `distilled-news:production:legacy-transition:${mode}:${confirmationSuffix}`;
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation}.`);
}
if (["preflight", "finalize"].includes(mode) && !fullSha(releaseSha)) {
  throw new Error("RELEASE_SHA must be the full reviewed hardened release SHA.");
}
if (mode === "rollback" && !fullSha(failedReleaseSha)) {
  throw new Error("FAILED_RELEASE_SHA must be the full hardened release SHA.");
}

if (["cohort-inventory", "cohort-reconcile", "verify-seats"].includes(mode)) {
  assertPinnedLegacyDeployment(currentDeployment(), versionDetails(legacyProductionVersionId));
  assertLegacyFreeze();
  refuseCompletedTransition();
  const reviewDigest = process.env.PAID_COHORT_REVIEW_DIGEST ?? "";
  if (reviewDigest !== reviewedLegacyPaidCohort.digest) {
    throw new Error(
      `Set PAID_COHORT_REVIEW_DIGEST=${reviewedLegacyPaidCohort.digest} after reviewing the inventory.`
    );
  }

  const cohortManifest = protectedPaidCohortManifest();
  const before = readPaidCohortInventory(cohortManifest);
  const beforeState = classifyLegacyPaidCohort(before, cohortManifest);
  if (mode === "cohort-inventory") {
    appendGithubEnv("PAID_COHORT_STATE", beforeState.state);
    writeEvidence(cohortEvidence(mode, before, beforeState));
    console.log(
      `Reviewed production paid cohort is ${beforeState.state} (${beforeState.paidSourceCount} active paid source rows).`
    );
    process.exit(0);
  }

  if (mode === "cohort-reconcile") {
    let mutationApplied = false;
    if (beforeState.state === "unreconciled") {
      retireUnreviewedPaidSources(cohortManifest);
      mutationApplied = true;
    } else if (!["reconciled", "cleanup-partial", "cleaned"].includes(beforeState.state)) {
      throw new Error(`Unsupported paid cohort state ${beforeState.state}.`);
    }
    const after = readPaidCohortInventory(cohortManifest);
    const afterState = classifyLegacyPaidCohort(after, cohortManifest);
    if (!["reconciled", "cleanup-partial", "cleaned"].includes(afterState.state)) {
      throw new Error(`Paid cohort reconciliation ended in unsupported state ${afterState.state}.`);
    }
    writeEvidence({
      ...cohortEvidence(mode, after, afterState),
      previousState: beforeState.state,
      mutationApplied,
      payloadDisposition: "preserved-in-r2-and-d1; retired source rows remain attached until hardened cleanup"
    });
    console.log(
      `Production paid cohort reconciled to two reviewed owners and four paid sources; ` +
      `${afterState.retiredSourceCount} source rows were retired without deleting payload references.`
    );
    process.exit(0);
  }

  if (!["reconciled", "cleanup-partial", "cleaned"].includes(beforeState.state)) {
    throw new Error(`Post-migration seat verification requires a safe cohort state, got ${beforeState.state}.`);
  }
  const seats = assertPaidSeatInventory(readPaidSeatInventory(cohortManifest));
  writeEvidence({
    ...cohortEvidence(mode, before, beforeState),
    seats,
    accountCap: 4,
    verifiedAt: new Date().toISOString()
  });
  console.log(`Post-migration paid-provider seat invariant passed with ${seats.seatCount} of 4 seats.`);
  process.exit(0);
}

if (mode === "freeze") {
  const deployment = currentDeployment();
  const { versionId } = singleFullTrafficVersion(deployment);
  let state;
  if (versionId === legacyProductionVersionId) {
    assertPinnedLegacyDeployment(deployment, versionDetails(legacyProductionVersionId));
    state = "pinned-legacy";
  } else {
    if (!fullSha(releaseSha)) {
      throw new Error("Freezing a hardened transition requires its explicit full RELEASE_SHA.");
    }
    const identity = closedVersionIdentity(versionDetails(versionId), versionId);
    if (identity.releaseSha !== releaseSha) {
      throw new Error(
        `Freeze refused: hardened version carries ${identity.releaseSha}, expected ${releaseSha}.`
      );
    }
    await assertLiveClosed(baseUrl, releaseSha);
    state = "same-sha-hardened";
  }
  installLegacyFreeze();
  setD1RegistrationClosed();
  if (state === "pinned-legacy") await assertLegacyEndpoints();
  else await assertLiveClosed(baseUrl, releaseSha);
  writeEvidence({
    schemaVersion: 1,
    mode,
    environment,
    state,
    currentVersionId: versionId,
    hardenedReleaseSha: state === "same-sha-hardened" ? releaseSha : null,
    legacyFreezeInstalled: true,
    legacyPaidFeedFreezeInstalled: true,
    d1RegistrationEnabled: false,
    verifiedAt: new Date().toISOString()
  });
  console.log(`Production registration freeze verified for ${state} version ${versionId}.`);
  process.exit(0);
}

if (mode === "preflight") {
  const deployment = currentDeployment();
  const { versionId } = singleFullTrafficVersion(deployment);
  const markerValue = readSetting(legacyTransitionMarker);
  const freezeRows = legacyFreezeRows();
  const paidFreezeRows = legacyPaidFeedFreezeRows();
  let transitionState;
  if (versionId === legacyProductionVersionId) {
    if (markerValue) {
      throw new Error("Completed transition marker cannot coexist with the pinned legacy version.");
    }
    assertPinnedLegacyDeployment(deployment, versionDetails(legacyProductionVersionId));
    assertLegacyFreeze();
    await assertLegacyEndpoints();
    transitionState = "legacy";
  } else {
    const identity = closedVersionIdentity(versionDetails(versionId), versionId);
    if (identity.releaseSha !== releaseSha) {
      throw new Error(
        `Transition recovery requires hardened release ${releaseSha}, found ${identity.releaseSha}.`
      );
    }
    if (freezeRows.length > 0 || paidFreezeRows.length > 0) {
      assertLegacyRegistrationFreeze(freezeRows);
      assertLegacyPaidFeedFreeze(paidFreezeRows);
    }
    if (!markerValue && (freezeRows.length === 0 || paidFreezeRows.length === 0)) {
      throw new Error("Unmarked hardened transition has lost its legacy registration freeze.");
    }
    if (markerValue && !markerValue.startsWith(`${releaseSha}:${versionId}:`)) {
      throw new Error("Transition recovery marker does not match the hardened release and version.");
    }
    assertD1RegistrationClosed();
    await assertLiveClosed(baseUrl, releaseSha);
    transitionState = markerValue && freezeRows.length === 0 && paidFreezeRows.length === 0
      ? "hardened-finalized"
      : "hardened-finalize-pending";
  }
  appendGithubEnv("LEGACY_TRANSITION_STATE", transitionState);
  const evidence = {
    schemaVersion: 1,
    mode,
    environment,
    legacyVersionId: legacyProductionVersionId,
    currentVersionId: versionId,
    deploymentId: deployment.id ?? null,
    deploymentCreatedOn: deployment.created_on ?? null,
    transitionState,
    registrationClosure: {
      mechanism: transitionState === "legacy"
        ? "d1-before-insert-trigger"
        : "hardened-worker-and-d1",
      trigger: legacyRegistrationFreezeTrigger,
      paidFeedTrigger: legacyPaidFeedFreezeTrigger,
      freezePresent: freezeRows.length === 1 && paidFreezeRows.length === 1,
      verified: true
    },
    transitionMarker: markerValue,
    verifiedAt: new Date().toISOString()
  };
  writeEvidence(evidence);
  console.log(`Production transition preflight passed in state ${transitionState}.`);
  process.exit(0);
}

if (mode === "prepare") {
  refuseCompletedTransition();
  assertPinnedLegacyDeployment(currentDeployment(), versionDetails(legacyProductionVersionId));
  assertLegacyFreeze();
  setD1RegistrationClosed();
  console.log("Production D1 registration switch is false; pinned legacy freeze remains installed.");
  process.exit(0);
}

if (mode === "finalize") {
  const deployment = currentDeployment();
  const { versionId } = singleFullTrafficVersion(deployment);
  if (versionId === legacyProductionVersionId) {
    throw new Error("Hardened transition cannot finalize while the legacy version is current.");
  }
  const identity = closedVersionIdentity(versionDetails(versionId), versionId);
  if (identity.releaseSha !== releaseSha) {
    throw new Error(`Hardened version carries ${identity.releaseSha}, expected ${releaseSha}.`);
  }
  assertD1RegistrationClosed();
  await assertLiveClosed(baseUrl, releaseSha);
  const cohortManifest = protectedPaidCohortManifest();
  const paidCohort = readPaidCohortInventory(cohortManifest);
  const paidCohortState = classifyLegacyPaidCohort(paidCohort, cohortManifest);
  if (paidCohortState.state !== "cleaned") {
    throw new Error(
      `Hardened transition cannot finalize before payload-safe canary cleanup; state is ${paidCohortState.state}.`
    );
  }
  const paidSeats = assertPaidSeatInventory(readPaidSeatInventory(cohortManifest));

  const freezeRows = legacyFreezeRows();
  const paidFreezeRows = legacyPaidFeedFreezeRows();
  if (freezeRows.length > 0 || paidFreezeRows.length > 0) {
    assertLegacyRegistrationFreeze(freezeRows);
    assertLegacyPaidFeedFreeze(paidFreezeRows);
  }
  const proposedMarker = `${releaseSha}:${versionId}:${new Date().toISOString()}`;
  const plan = hardenedFinalizePlan({
    markerValue: readSetting(legacyTransitionMarker),
    freezePresent: freezeRows.length === 1 && paidFreezeRows.length === 1,
    releaseSha,
    versionId,
    proposedMarker
  });
  if (plan.writeMarker) {
    d1Json(
      `INSERT INTO settings (key, value, updated_at) VALUES ('${legacyTransitionMarker}', '${plan.markerValue}', '${new Date().toISOString()}') ` +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
    );
  }
  if (readSetting(legacyTransitionMarker) !== plan.markerValue) {
    throw new Error("Legacy transition completion marker did not verify.");
  }
  assertD1RegistrationClosed();
  await assertLiveClosed(baseUrl, releaseSha);
  if (plan.dropFreeze) {
    d1Json(
      `DROP TRIGGER ${legacyPaidFeedFreezeTrigger}; ` +
      `DROP TRIGGER ${legacyRegistrationFreezeTrigger};`
    );
  }
  if (legacyFreezeRows().length !== 0 || legacyPaidFeedFreezeRows().length !== 0) {
    throw new Error("Legacy registration freeze was not removed after hardened closure verification.");
  }
  assertD1RegistrationClosed();
  await assertLiveClosed(baseUrl, releaseSha);

  const evidence = {
    schemaVersion: 1,
    mode,
    environment,
    legacyVersionId: legacyProductionVersionId,
    hardenedVersionId: versionId,
    hardenedReleaseSha: releaseSha,
    registrationMode: "closed",
    d1RegistrationEnabled: false,
    legacyFreezeRemoved: true,
    legacyPaidFeedFreezeRemoved: true,
    transitionMarker: plan.markerValue,
    paidCohortState: paidCohortState.state,
    paidProviderSeats: paidSeats.seatCount,
    paidProviderAccountCap: 4,
    resumedAfterMarkerWrite: !plan.writeMarker && plan.dropFreeze,
    alreadyFinalized: plan.alreadyFinalized,
    verifiedAt: new Date().toISOString()
  };
  writeEvidence(evidence);
  console.log(`One-time legacy transition finalized at hardened version ${versionId}.`);
  process.exit(0);
}

const marker = readSetting(legacyTransitionMarker);
const before = currentDeployment();
const beforeVersion = singleFullTrafficVersion(before).versionId;
if (marker) {
  if (!marker.startsWith(`${failedReleaseSha}:${beforeVersion}:`)) {
    throw new Error("Completed transition marker does not match the current hardened version.");
  }
  const identity = closedVersionIdentity(versionDetails(beforeVersion), beforeVersion);
  if (identity.releaseSha !== failedReleaseSha) {
    throw new Error("Completed transition marker release SHA does not match Worker metadata.");
  }
  assertD1RegistrationClosed();
  await assertLiveClosed(baseUrl, failedReleaseSha);
  writeEvidence({
    schemaVersion: 1,
    mode,
    environment,
    action: "hardened-transition-already-completed",
    currentVersionId: beforeVersion,
    currentReleaseSha: failedReleaseSha,
    registrationMode: "closed",
    d1RegistrationEnabled: false,
    verifiedAt: new Date().toISOString()
  });
  console.log("Hardened transition was already finalized; legacy rollback was intentionally skipped.");
  process.exit(0);
}

installLegacyFreeze();
setD1RegistrationClosed();
let rollbackInvoked = false;
if (beforeVersion !== legacyProductionVersionId) {
  const currentRelease = plainTextBinding(versionDetails(beforeVersion), "RELEASE_SHA");
  if (currentRelease !== failedReleaseSha) {
    throw new Error(
      `Legacy rollback refused: current version ${beforeVersion} is not failed release ${failedReleaseSha}.`
    );
  }
  runWrangler([
    "rollback", legacyProductionVersionId,
    "--env", environment,
    "--message", `One-time hardening transition rollback from ${failedReleaseSha}`,
    "--yes"
  ]);
  rollbackInvoked = true;
}

const after = currentDeployment();
assertPinnedLegacyDeployment(after, versionDetails(legacyProductionVersionId));
assertLegacyFreeze();
assertD1RegistrationClosed();
await assertLegacyEndpoints();
writeEvidence({
  schemaVersion: 1,
  mode,
  environment,
  action: "legacy-rollback",
  failedReleaseSha,
  rollbackInvoked,
  legacyVersionId: legacyProductionVersionId,
  legacyFreezeInstalled: true,
  legacyPaidFeedFreezeInstalled: true,
  d1RegistrationEnabled: false,
  verifiedAt: new Date().toISOString()
});
console.log(`Pinned legacy rollback state verified at ${legacyProductionVersionId}.`);
console.log("- D1 migration rollback: not attempted (migrations remain forward-only)");

function readPaidCohortInventory(cohortManifest) {
  const accountIds = reviewedAccountIds(cohortManifest).map(sqlLiteral).join(", ");
  const marker = sqlLiteral(legacyPaidSourceRetirementMarker);
  const accounts = d1Json(`
    SELECT
      accounts.id AS account_id,
      accounts.username,
      (SELECT COUNT(*) FROM briefings WHERE briefings.owner_account_id = accounts.id) AS feed_count,
      (SELECT COUNT(*) FROM briefings
        WHERE briefings.owner_account_id = accounts.id AND briefings.paused = 1) AS paused_feed_count
    FROM accounts
    WHERE accounts.id IN (${accountIds})
      OR EXISTS (
        SELECT 1
        FROM briefings
        JOIN sources ON sources.briefing_id = briefings.id
        WHERE briefings.owner_account_id = accounts.id
          AND sources.kind IN ('google_news', 'x_profile', 'x_search')
      )
    ORDER BY accounts.id;
  `);
  const sources = d1Json(`
    SELECT
      accounts.id AS account_id,
      accounts.username,
      briefings.id AS briefing_id,
      sources.id AS source_id,
      sources.kind,
      sources.enabled,
      sources.last_error
    FROM sources
    JOIN briefings ON briefings.id = sources.briefing_id
    JOIN accounts ON accounts.id = briefings.owner_account_id
    WHERE accounts.id IN (${accountIds})
      AND (
        sources.kind IN ('google_news', 'x_profile', 'x_search')
        OR (sources.kind = 'apify_actor' AND sources.last_error = ${marker})
      )
    ORDER BY sources.id;
  `);
  const payloadReferences = d1Json(`
    WITH object_refs(account_id, object_key) AS (
      SELECT briefings.owner_account_id, raw_messages.raw_payload_key
      FROM raw_messages
      JOIN briefings ON briefings.id = raw_messages.briefing_id
      WHERE briefings.owner_account_id IN (${accountIds})
        AND raw_messages.raw_payload_key IS NOT NULL
        AND raw_messages.raw_payload_key != ''
      UNION
      SELECT briefings.owner_account_id, source_runs.archive_key
      FROM source_runs
      JOIN briefings ON briefings.id = source_runs.briefing_id
      WHERE briefings.owner_account_id IN (${accountIds})
        AND source_runs.archive_key IS NOT NULL
        AND source_runs.archive_key != ''
    ),
    key_owners AS (
      SELECT object_key, COUNT(DISTINCT account_id) AS owner_count
      FROM object_refs
      GROUP BY object_key
    )
    SELECT object_refs.account_id, object_refs.object_key, key_owners.owner_count
    FROM object_refs
    JOIN key_owners ON key_owners.object_key = object_refs.object_key
    ORDER BY object_refs.account_id, object_refs.object_key;
  `);
  return { accounts, sources, payloadReferences };
}

function retireUnreviewedPaidSources(cohortManifest) {
  const canaryAccountIds = reviewedLegacyPaidCohort.canaryAccounts
    .map(({ accountId }) => sqlLiteral(accountId))
    .join(", ");
  const realAccountIds = cohortManifest.realAccounts
    .map(({ accountId }) => sqlLiteral(accountId))
    .join(", ");
  const retainedSourceIds = retainedPaidSourceIds(cohortManifest).map(sqlLiteral).join(", ");
  const timestamp = sqlLiteral(new Date().toISOString());
  const marker = sqlLiteral(legacyPaidSourceRetirementMarker);
  d1Json(`
    UPDATE sources
    SET
      kind = 'apify_actor',
      enabled = 0,
      health_state = 'degraded',
      failure_class = 'retired_paid_provider',
      next_retry_at = NULL,
      last_error = ${marker},
      updated_at = ${timestamp}
    WHERE kind IN ('google_news', 'x_profile', 'x_search')
      AND briefing_id IN (
        SELECT id
        FROM briefings
        WHERE owner_account_id IN (${canaryAccountIds})
          OR (
            owner_account_id IN (${realAccountIds})
            AND sources.id NOT IN (${retainedSourceIds})
          )
      );
  `);
}

function readPaidSeatInventory(cohortManifest) {
  const realAccountIds = cohortManifest.realAccounts
    .map(({ accountId }) => sqlLiteral(accountId))
    .join(", ");
  return d1Json(`
    WITH paid_counts AS (
      SELECT
        briefings.owner_account_id AS account_id,
        SUM(CASE WHEN sources.kind = 'google_news' THEN 1 ELSE 0 END) AS google_news_count,
        SUM(CASE WHEN sources.kind IN ('x_profile', 'x_search') THEN 1 ELSE 0 END) AS x_count
      FROM sources
      JOIN briefings ON briefings.id = sources.briefing_id
      WHERE sources.kind IN ('google_news', 'x_profile', 'x_search')
      GROUP BY briefings.owner_account_id
    )
    SELECT
      (SELECT COUNT(*) FROM paid_provider_seats) AS seat_count,
      (SELECT COUNT(*) FROM paid_counts) AS paid_owner_count,
      COALESCE((SELECT MAX(google_news_count) FROM paid_counts), 0) AS max_google_news_per_account,
      COALESCE((SELECT MAX(x_count) FROM paid_counts), 0) AS max_x_per_account,
      (SELECT COUNT(*) FROM paid_provider_seats
        WHERE account_id NOT IN (${realAccountIds})) AS unexpected_seats,
      (SELECT COUNT(*) FROM paid_counts
        WHERE account_id NOT IN (${realAccountIds})) AS unexpected_paid_owners,
      (SELECT COUNT(*) FROM paid_provider_seats
        WHERE account_id IN (${realAccountIds})) AS reviewed_real_seats
    ;
  `);
}

function cohortEvidence(evidenceMode, inventory, state) {
  const payloadKeys = inventory.payloadReferences.map((row) => String(row.object_key)).sort();
  const identityDigestInput = [
    ...inventory.accounts.map((row) =>
      `${row.account_id}\0${row.username}\0${row.feed_count}\0${row.paused_feed_count}`
    ),
    ...inventory.sources.map((row) =>
      `${row.account_id}\0${row.briefing_id}\0${row.source_id}\0${row.kind}\0${row.enabled}`
    )
  ].sort();
  const canaryAccountCount = inventory.accounts.filter((row) =>
    String(row.username).startsWith("canary-")
  ).length;
  return {
    schemaVersion: 1,
    mode: evidenceMode,
    environment,
    reviewDigest: reviewedLegacyPaidCohort.digest,
    state: state.state,
    identitySetSha256: createHash("sha256").update(identityDigestInput.join("\n")).digest("hex"),
    accounts: {
      total: inventory.accounts.length,
      syntheticCanary: canaryAccountCount,
      reviewedReal: inventory.accounts.length - canaryAccountCount,
      feeds: inventory.accounts.reduce((sum, row) => sum + Number(row.feed_count), 0),
      pausedFeeds: inventory.accounts.reduce(
        (sum, row) => sum + Number(row.paused_feed_count),
        0
      )
    },
    sources: {
      total: inventory.sources.length,
      enabled: inventory.sources.filter((row) => Number(row.enabled) === 1).length,
      googleNews: inventory.sources.filter((row) => row.kind === "google_news").length,
      x: inventory.sources.filter((row) =>
        row.kind === "x_profile" || row.kind === "x_search"
      ).length,
      retired: inventory.sources.filter((row) =>
        row.last_error === legacyPaidSourceRetirementMarker
      ).length
    },
    payloadReferences: {
      distinctKeys: payloadKeys.length,
      sharedReferences: inventory.payloadReferences.filter(
        (row) => Number(row.owner_count) > 1
      ).length,
      keySetSha256: createHash("sha256").update(payloadKeys.join("\n")).digest("hex")
    },
    payloadKeysIncludedInEvidence: false,
    paidSourceCount: state.paidSourceCount,
    retiredSourceCount: state.retiredSourceCount,
    verifiedAt: new Date().toISOString()
  };
}

let cachedPaidCohortManifest;
function protectedPaidCohortManifest() {
  if (cachedPaidCohortManifest) return cachedPaidCohortManifest;
  const path = process.env.PAID_COHORT_MANIFEST_FILE ?? optionValue("--cohort-manifest");
  if (!path) {
    throw new Error("PAID_COHORT_MANIFEST_FILE must point to the protected production manifest.");
  }
  cachedPaidCohortManifest = readProtectedPaidCohortManifest(path);
  return cachedPaidCohortManifest;
}

function currentDeployment() {
  return wranglerJson(["deployments", "status", "--env", environment, "--json"]);
}

function versionDetails(versionId) {
  return wranglerJson(["versions", "view", versionId, "--env", environment, "--json"]);
}

function refuseCompletedTransition() {
  const markerValue = readSetting(legacyTransitionMarker);
  if (markerValue) {
    throw new Error(
      `One-time legacy transition is already completed and cannot be reused: ${markerValue}.`
    );
  }
}

function legacyFreezeRows() {
  return d1Json(
    "SELECT name, sql FROM sqlite_master " +
    `WHERE type = 'trigger' AND name = '${legacyRegistrationFreezeTrigger}';`
  );
}

function legacyPaidFeedFreezeRows() {
  return d1Json(
    "SELECT name, sql FROM sqlite_master " +
    `WHERE type = 'trigger' AND name = '${legacyPaidFeedFreezeTrigger}';`
  );
}

function assertLegacyFreeze() {
  assertLegacyRegistrationFreeze(legacyFreezeRows());
  assertLegacyPaidFeedFreeze(legacyPaidFeedFreezeRows());
}

function installLegacyFreeze() {
  d1Json(
    `CREATE TRIGGER IF NOT EXISTS ${legacyRegistrationFreezeTrigger} ` +
    "BEFORE INSERT ON accounts WHEN NEW.role = 'user' " +
    "BEGIN SELECT RAISE(ABORT, 'registration temporarily closed'); END;"
  );
  d1Json(
    `CREATE TRIGGER IF NOT EXISTS ${legacyPaidFeedFreezeTrigger} ` +
    "BEFORE UPDATE OF paused ON briefings " +
    "WHEN OLD.paused = 1 AND NEW.paused != 1 AND EXISTS (" +
    "SELECT 1 FROM sources WHERE sources.briefing_id = OLD.id AND (" +
    "sources.kind IN ('google_news', 'x_profile', 'x_search') OR " +
    `(sources.kind = 'apify_actor' AND sources.last_error = ${sqlLiteral(legacyPaidSourceRetirementMarker)})` +
    ")) BEGIN SELECT RAISE(ABORT, 'legacy paid-provider feed frozen for hardened transition'); END;"
  );
  assertLegacyFreeze();
}

function setD1RegistrationClosed() {
  d1Json(
    "INSERT INTO settings (key, value, updated_at) " +
    `VALUES ('registration_enabled', 'false', '${new Date().toISOString()}') ` +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
  );
  assertD1RegistrationClosed();
}

function assertD1RegistrationClosed() {
  if (String(readSetting("registration_enabled") ?? "false").toLowerCase() !== "false") {
    throw new Error("D1 registration switch is not false.");
  }
}

function readSetting(key) {
  const rows = d1Json(`SELECT value FROM settings WHERE key = '${key}' LIMIT 1;`);
  return rows[0]?.value ?? null;
}

function d1Json(command) {
  const payload = wranglerJson([
    "d1", "execute", "DB",
    "--remote",
    "--env", environment,
    "--json",
    "--command", command
  ]);
  return payload[0]?.results ?? [];
}

function wranglerJson(arguments_) {
  const result = runWrangler(arguments_, { capture: true });
  return JSON.parse(result.stdout);
}

async function assertLegacyEndpoints() {
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      for (const path of ["/api/status", "/api/capabilities"]) {
        const response = await fetch(new URL(path, baseUrl), {
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
          headers: { "user-agent": "distilled-legacy-transition/1" }
        });
        if (response.status !== 404) {
          throw new Error(
            `Pinned legacy fingerprint expected ${path} to return 404, got ${response.status}.`
          );
        }
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 10) await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
    }
  }
  throw lastError;
}

async function assertLiveClosed(origin, expectedSha) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const [status, capabilities] = await Promise.all([
        jsonFetch(new URL("/api/status", origin)),
        jsonFetch(new URL("/api/capabilities", origin))
      ]);
      if (status.status !== "operational" || status.releaseSha !== expectedSha) {
        throw new Error(`live release is ${status.releaseSha ?? "unknown"}`);
      }
      if (capabilities.registrationMode !== "closed") {
        throw new Error(`registration mode is ${capabilities.registrationMode ?? "unknown"}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    }
  }
  throw new Error(
    `Hardened closed-state verification failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }.`
  );
}

async function jsonFetch(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "distilled-legacy-transition/1" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return payload;
}

function writeEvidence(payload) {
  const evidenceArgument = optionValue("--evidence");
  if (!evidenceArgument) return;
  const path = resolve(evidenceArgument);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function appendGithubEnv(name, value) {
  const path = optionValue("--github-env");
  if (!path) return;
  appendFileSync(path, `${name}=${value}\n`);
}

function fullSha(value) {
  return /^[a-f0-9]{40,64}$/i.test(value);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
