#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolveMx, resolveTxt } from "node:dns/promises";
import {
  createReadStream,
  mkdtempSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  environmentConfig,
  readWorkerConfig,
  repositoryRoot,
  runWrangler
} from "../lib/release-config.mjs";
import { verifyApifyReadiness } from "../lib/apify-readiness.mjs";
import { assertModelReadinessEvidence } from "../lib/model-readiness-evidence.mjs";
import {
  acceptEmergencyHttpClosure,
  planEmergencyRegistrationClose
} from "../lib/registration-close.mjs";
import {
  assertFinalizedLegacyTransition,
  assertLegacyRegistrationFreeze,
  legacyProductionVersionId,
  legacyPaidFeedFreezeTrigger,
  legacyTransitionMarker,
  legacyRegistrationFreezeTrigger
} from "../lib/transition-control.mjs";
import {
  assertPublicLaunchAttestation,
  verifyPublicEdgeArtifactReference,
  verifyWafRateLimitReference
} from "../lib/public-launch-attestation.mjs";
import {
  readPrivateStoreState,
  validatePrivateStoreState
} from "../backup/private-store.mjs";

const mode = process.argv[2];
if (!["preflight", "open", "close"].includes(mode)) {
  throw new Error("Usage: registration-control.mjs preflight|open|close");
}
const emailReceiptNonce = process.env.EMAIL_CANARY_RECEIPT_NONCE?.trim() ?? "";
if (mode === "open" && !/^[A-Za-z0-9_-]{24,128}$/.test(emailReceiptNonce)) {
  throw new Error("Opening requires the unexpired one-time nonce from the preflight email.");
}
const expectedConfirmation = `distilled-news:production:registration:${mode}`;
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation}.`);
}

const releaseSha = process.env.RELEASE_SHA ?? "";
const internalSecret = process.env.INTERNAL_MAINTENANCE_SECRET?.trim() ?? "";
const emailCanaryRecipient = normalizeEmail(process.env.EMAIL_CANARY_RECIPIENT ?? "");
const config = readWorkerConfig();
const production = environmentConfig(config, "production");
const baseUrl = production.vars?.PUBLIC_WEB_BASE_URL;
if (!baseUrl || production.vars?.REGISTRATION_MODE !== "closed") {
  throw new Error("Checked-in production registration must remain closed.");
}

if (mode === "close") {
  await emergencyCloseRegistration();
  process.exit(0);
}

if (!/^[a-f0-9]{40,64}$/i.test(releaseSha)) {
  throw new Error("RELEASE_SHA must be the full reviewed production commit SHA.");
}
if (internalSecret.length < 32) {
  throw new Error("INTERNAL_MAINTENANCE_SECRET must be available from the protected environment.");
}

const before = await readLive(baseUrl);
assertRelease(before, releaseSha);
assertCapacity(before.capabilities, production, false);
const currentVersion = deployedVersionId();
const currentDetails = versionDetails(currentVersion);
assertVersionRelease(currentDetails, releaseSha);

if (plainBinding(currentDetails, "REGISTRATION_MODE") !== "closed") {
  throw new Error("Opening refused: the current production version is not the reviewed closed baseline.");
}
const transition = verifyFinalizedLegacyTransition(currentVersion);
const launchAttestation = assertPublicLaunchAttestation(
  process.env.PUBLIC_LAUNCH_ATTESTATION ?? "",
  {
    releaseSha,
    productionVersionId: currentVersion,
    transitionMarker: transition.markerValue,
    versionCreatedAt: currentDetails.metadata?.created_on,
    canaryAttestation: process.env.CANARY_ATTESTATION ?? "",
    zoneId: process.env.CLOUDFLARE_ZONE_ID ?? ""
  }
);
verifyCanaryAttestation();
await verifyPublicLaunchRuntime(launchAttestation);
const apifyEvidence = await verifyApifyReadiness(production, {
  readinessToken: process.env.APIFY_READINESS_TOKEN || process.env.APIFY_API_TOKEN
});
if (apifyEvidence.skipped) {
  console.log(`Live Apify readiness skipped: ${apifyEvidence.reason}`);
} else {
  console.log(
    `Live Apify readiness passed with $${apifyEvidence.remainingMonthlyUsageUsd.toFixed(2)} ` +
    `remaining for the $${apifyEvidence.monthlyCollectionCapUsd.toFixed(2)} collection cap.`
  );
}
await verifyHostedEmailCapability(production, emailCanaryRecipient);
await verifyRegistrationPreflight(baseUrl, releaseSha, production, mode === "preflight");
await verifyTurnstileSecret();
if (mode === "preflight") {
  console.log(`Production registration preflight passed for ${releaseSha}; registration remains closed.`);
  process.exit(0);
}
await consumeRegistrationEmailReceipt(baseUrl, emailReceiptNonce);

let openVersionDeployed = false;
try {
  runWrangler([
    "deploy",
    "--strict",
    "--env", "production",
    "--var", "REGISTRATION_MODE:open",
    "--var", `RELEASE_SHA:${releaseSha}`,
    "--message", `Open registration for ${releaseSha}`
  ]);
  openVersionDeployed = true;
  const openVersion = deployedVersionId();
  const openDetails = versionDetails(openVersion);
  assertVersionRelease(openDetails, releaseSha);
  if (plainBinding(openDetails, "REGISTRATION_MODE") !== "open") {
    throw new Error("Uploaded registration version does not contain REGISTRATION_MODE=open.");
  }

  const operatorState = await setOperatorRegistration(baseUrl, true);
  if (
    operatorState.enabled !== true ||
    Number(operatorState.accountCap) !== Number(production.vars.HOSTED_ACCOUNT_CAP) ||
    Number(operatorState.pendingAccountCap) !== Number(production.vars.HOSTED_PENDING_ACCOUNT_CAP) ||
    operatorState.capacityReached === true ||
    operatorState.pendingCapacityReached === true
  ) {
    throw new Error("Runtime registration capacity refused the open operation.");
  }
  const live = await waitForRegistration(baseUrl, releaseSha, "open");
  assertCapacity(live.capabilities, production, true);
  console.log(`Production registration is open for ${releaseSha}.`);
} catch (error) {
  try {
    await setOperatorRegistration(baseUrl, false);
  } catch {
    // The closed Worker version is still the rollback authority.
  }
  if (openVersionDeployed) {
    runWrangler([
      "rollback", currentVersion,
      "--env", "production",
      "--message", `Automatic registration-open rollback for ${releaseSha}`,
      "--yes"
    ], { allowFailure: true });
    await waitForRegistration(baseUrl, releaseSha, "closed").catch(() => undefined);
  }
  throw error;
}

async function emergencyCloseRegistration() {
  let d1Closure = closeD1RegistrationSwitch();
  const currentVersion = deployedVersionId();
  const currentDetails = versionDetails(currentVersion);
  const currentMode = plainBinding(currentDetails, "REGISTRATION_MODE");
  const currentReleaseSha = plainBinding(currentDetails, "RELEASE_SHA");
  const candidates = currentMode === "open" ? historicalVersionCandidates(currentVersion) : [];
  const plan = planEmergencyRegistrationClose({
    currentVersionId: currentVersion,
    currentMode,
    currentReleaseSha,
    candidates,
    pinnedLegacyVersionId: legacyProductionVersionId
  });

  if (plan.kind === "pinned-legacy") {
    assertLegacyRegistrationFreeze(legacyFreezeRows());
  }
  if (plan.rollbackVersionId) {
    runWrangler([
      "rollback", plan.rollbackVersionId,
      "--env", "production",
      "--message", `Emergency registration close for live release ${plan.liveReleaseSha}`,
      "--yes"
    ]);
  }

  if (internalSecret.length >= 32) {
    try {
      await setOperatorRegistration(baseUrl, false);
      d1Closure = closeD1RegistrationSwitch();
    } catch (error) {
      console.warn(
        `Runtime registration endpoint was unavailable; control-plane close continues: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  } else {
    console.warn("INTERNAL_MAINTENANCE_SECRET is unavailable; emergency close used D1/control-plane authority.");
  }

  const finalVersion = deployedVersionId();
  if (finalVersion !== plan.closedVersionId) {
    throw new Error(
      `Emergency close verification found version ${finalVersion}, expected ${plan.closedVersionId}.`
    );
  }
  if (plan.kind === "pinned-legacy") {
    assertLegacyRegistrationFreeze(legacyFreezeRows());
    console.log(`Production registration is frozen on pinned legacy version ${finalVersion}.`);
    console.log(`- D1 switch: ${d1Closure.closed ? "false" : "not authoritative for legacy"}`);
    return;
  }

  const finalDetails = versionDetails(finalVersion);
  if (
    plainBinding(finalDetails, "REGISTRATION_MODE") !== "closed" ||
    plainBinding(finalDetails, "RELEASE_SHA") !== plan.liveReleaseSha
  ) {
    throw new Error("Emergency close target metadata does not prove the live SHA is closed.");
  }
  const httpResult = await emergencyHttpClosure(baseUrl, plan.liveReleaseSha);
  acceptEmergencyHttpClosure(httpResult);
  console.log(`Production registration is closed for live release ${plan.liveReleaseSha}.`);
  console.log(`- version: ${finalVersion}`);
  console.log(`- D1 switch: ${d1Closure.closed ? "false" : "unavailable; closed Worker binding is authoritative"}`);
  console.log(`- HTTP verification: ${httpResult}`);
}

function closeD1RegistrationSwitch() {
  const table = runD1Json(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'settings';",
    { allowFailure: true }
  );
  if (!table.ok) {
    console.warn("Could not inspect the D1 registration switch; continuing to closed Worker authority.");
    return { supported: null, closed: false };
  }
  if (Number(table.rows[0]?.count) !== 1) {
    return { supported: false, closed: false };
  }
  const update = runD1Json(
    "INSERT INTO settings (key, value, updated_at) " +
    `VALUES ('registration_enabled', 'false', '${new Date().toISOString()}') ` +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;",
    { allowFailure: true }
  );
  if (!update.ok) {
    console.warn("D1 registration switch update failed; continuing to closed Worker authority.");
    return { supported: true, closed: false };
  }
  const verify = runD1Json(
    "SELECT value FROM settings WHERE key = 'registration_enabled' LIMIT 1;",
    { allowFailure: true }
  );
  return {
    supported: true,
    closed: verify.ok && String(verify.rows[0]?.value ?? "").toLowerCase() === "false"
  };
}

function runD1Json(command, options = {}) {
  const result = runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", "production",
    "--json",
    "--command", command
  ], { capture: true, allowFailure: options.allowFailure });
  if (result.status !== 0) return { ok: false, rows: [] };
  const payload = JSON.parse(result.stdout);
  return { ok: true, rows: payload[0]?.results ?? [] };
}

function legacyFreezeRows() {
  const result = runD1Json(
    "SELECT name, sql FROM sqlite_master " +
    `WHERE type = 'trigger' AND name = '${legacyRegistrationFreezeTrigger}';`
  );
  return result.rows;
}

function verifyFinalizedLegacyTransition(versionId) {
  const marker = runD1Json(
    `SELECT value FROM settings WHERE key = '${legacyTransitionMarker}' LIMIT 1;`
  ).rows[0]?.value ?? null;
  const freezeRows = runD1Json(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' " +
    `AND name IN ('${legacyRegistrationFreezeTrigger}', '${legacyPaidFeedFreezeTrigger}') ` +
    "ORDER BY name;"
  ).rows;
  const registrationFreezeRows = freezeRows.filter(
    (row) => row.name === legacyRegistrationFreezeTrigger
  );
  const paidFeedFreezeRows = freezeRows.filter(
    (row) => row.name === legacyPaidFeedFreezeTrigger
  );
  const registration = runD1Json(
    "SELECT value FROM settings WHERE key = 'registration_enabled' LIMIT 1;"
  ).rows;
  if (
    registration.length !== 1 ||
    String(registration[0]?.value ?? "").trim().toLowerCase() !== "false"
  ) {
    throw new Error("Opening refused: the D1 registration switch is not explicitly closed.");
  }
  return assertFinalizedLegacyTransition({
    markerValue: marker,
    releaseSha,
    versionId,
    registrationFreezeRows,
    paidFeedFreezeRows
  });
}

async function verifyPublicLaunchRuntime(attestation) {
  await Promise.all([
    verifyPublicEdgeArtifactReference(attestation, {
      token: process.env.GITHUB_TOKEN ?? "",
      repository: process.env.GITHUB_REPOSITORY ?? ""
    }),
    verifyWafRateLimitReference(attestation, {
      token: process.env.CLOUDFLARE_API_TOKEN ?? "",
      zoneId: process.env.CLOUDFLARE_ZONE_ID ?? ""
    }),
    verifyPrivateBackupReference(attestation.backup)
  ]);
}

async function verifyPrivateBackupReference(backup) {
  validatePrivateStoreState(await readPrivateStoreState());
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "distilled-launch-backup-"));
  const downloaded = resolve(temporaryRoot, "backup.enc");
  try {
    runWrangler([
      "r2", "object", "get",
      `${backup.bucket}/${backup.objectKey}`,
      "--remote",
      "--file", downloaded
    ]);
    if (!statSync(downloaded).isFile() || statSync(downloaded).size <= 0) {
      throw new Error("Approved encrypted production backup object is empty.");
    }
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(downloaded)) digest.update(chunk);
    if (digest.digest("hex") !== backup.encryptedSha256) {
      throw new Error("Live encrypted production backup does not match approved evidence.");
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function historicalVersionCandidates(excludeVersionId) {
  const result = runWrangler(
    ["deployments", "list", "--env", "production", "--json"],
    { capture: true }
  );
  const deployments = JSON.parse(result.stdout);
  const seen = new Set();
  const candidates = [];
  for (const traffic of deployments
    .slice()
    .reverse()
    .flatMap((deployment) => deployment.versions ?? [])) {
    if (!traffic.version_id || traffic.version_id === excludeVersionId || seen.has(traffic.version_id)) {
      continue;
    }
    seen.add(traffic.version_id);
    const details = versionDetails(traffic.version_id);
    candidates.push({
      versionId: traffic.version_id,
      releaseSha: plainBinding(details, "RELEASE_SHA"),
      registrationMode: plainBinding(details, "REGISTRATION_MODE")
    });
  }
  return candidates;
}

async function emergencyHttpClosure(origin, expectedSha) {
  let observedHttpState = false;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const live = await readLive(origin);
      observedHttpState = true;
      if (
        live.status.releaseSha === expectedSha &&
        live.capabilities.registrationMode === "closed"
      ) {
        return "closed";
      }
    } catch {
      // Control-plane metadata remains authoritative when application endpoints are down.
    }
    if (attempt < 6) await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
  }
  return observedHttpState ? "open" : "unavailable";
}

function verifyCanaryAttestation() {
  const result = spawnSync(
    process.execPath,
    ["scripts/canary/verify-attestation.mjs"],
    { cwd: repositoryRoot, stdio: "inherit", env: process.env }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Same-SHA 24-hour canary attestation failed.");
}

async function verifyRegistrationPreflight(origin, expectedSha, environment, sendEmailReceipt) {
  const expectedRecipientFingerprint = createHash("sha256")
    .update(emailCanaryRecipient)
    .digest("hex");
  const preflight = await jsonFetch(new URL("/api/internal/registration/preflight", origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-distilled-internal": internalSecret,
      "user-agent": "distilled-registration-control/1"
    },
    body: JSON.stringify({ sendEmailReceipt })
  });
  assertModelReadinessEvidence(preflight.modelTest);
  const receiptReady = sendEmailReceipt
    ? preflight.emailReceipt?.sent === true &&
      preflight.emailReceipt?.recipientFingerprint === expectedRecipientFingerprint &&
      recentTimestamp(preflight.emailReceipt?.acceptedAt, 5 * 60 * 1000) &&
      futureTimestamp(preflight.emailReceipt?.receiptExpiresAt, 20 * 60 * 1000)
    : preflight.emailReceipt?.requested === false &&
      preflight.emailReceipt?.sent === false;
  if (
    preflight.ready !== true ||
    preflight.releaseSha !== expectedSha ||
    !receiptReady ||
    Number(preflight.registration?.accountCap) !== Number(environment.vars.HOSTED_ACCOUNT_CAP) ||
    Number(preflight.registration?.pendingAccountCap) !== Number(environment.vars.HOSTED_PENDING_ACCOUNT_CAP)
  ) {
    throw new Error("Narrowly scoped live registration/email readiness preflight failed.");
  }
  const session = await jsonFetch(new URL("/api/auth/session", origin));
  if (session.turnstileSiteKey !== environment.vars.TURNSTILE_SITE_KEY) {
    throw new Error("Live Turnstile site key does not match reviewed production configuration.");
  }
}

async function consumeRegistrationEmailReceipt(origin, nonce) {
  const response = await jsonFetch(new URL("/api/internal/registration/email-receipt", origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-distilled-internal": internalSecret,
      "user-agent": "distilled-registration-control/1"
    },
    body: JSON.stringify({ nonce })
  });
  if (response.consumed !== true) {
    throw new Error("The one-time registration email receipt was not consumed.");
  }
}

async function verifyHostedEmailCapability(environment, recipient) {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  const accountId = environment.vars?.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const senderDomain = emailDomain(environment.vars?.EMAIL_FROM);
  const [localPart, recipientDomain] = recipient.split("@");
  if (
    !token ||
    !accountId ||
    !senderDomain ||
    !localPart?.includes("+") ||
    !recipientDomain ||
    recipientDomain === senderDomain ||
    recipientDomain.endsWith(`.${senderDomain}`)
  ) {
    throw new Error(
      "EMAIL_CANARY_RECIPIENT must be a protected external plus-address and Cloudflare credentials must be available."
    );
  }

  const accountSettings = await cloudflareJson(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/account-settings`,
    token
  );
  if (accountSettings.default_usage_model !== "standard") {
    throw new Error("Cloudflare Workers Paid capability is required for arbitrary-recipient Email Sending.");
  }

  const bounceDomain = `cf-bounce.${senderDomain}`;
  const [mx, txt] = await Promise.all([resolveMx(bounceDomain), resolveTxt(bounceDomain)]);
  const mxHosts = new Set(mx.map((record) => record.exchange.toLowerCase().replace(/\.$/, "")));
  const requiredMxHosts = [
    "route1.mx.cloudflare.net",
    "route2.mx.cloudflare.net",
    "route3.mx.cloudflare.net"
  ];
  const spf = txt.map((parts) => parts.join("")).find((record) => /^v=spf1\b/i.test(record));
  if (
    !requiredMxHosts.every((hostname) => mxHosts.has(hostname)) ||
    !spf?.includes("include:_spf.mx.cloudflare.net")
  ) {
    throw new Error(`Cloudflare Email Sending onboarding DNS is incomplete for ${senderDomain}.`);
  }
}

async function verifyTurnstileSecret() {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is required for the live Turnstile check.");
  const body = new URLSearchParams({
    secret,
    response: "distilled-registration-preflight-invalid-token"
  });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json();
  const errors = new Set(payload["error-codes"] ?? []);
  if (
    !response.ok ||
    errors.has("invalid-input-secret") ||
    errors.has("missing-input-secret") ||
    !errors.has("invalid-input-response")
  ) {
    throw new Error("Live Turnstile secret validation failed.");
  }
}

async function cloudflareJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare readiness read failed with HTTP ${response.status}.`);
  }
  return payload.result;
}

function emailDomain(value) {
  const match = String(value ?? "").match(/<?[^<>\s@]+@([^<>\s@]+)>?/);
  return match?.[1]?.toLowerCase().replace(/\.$/, "") ?? "";
}

function normalizeEmail(value) {
  const normalized = String(value).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : "";
}

function recentTimestamp(value, maximumAgeMs) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp <= maximumAgeMs;
}

function futureTimestamp(value, maximumFutureMs) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() && timestamp - Date.now() <= maximumFutureMs;
}

async function setOperatorRegistration(origin, enabled) {
  return jsonFetch(new URL("/api/internal/registration", origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-distilled-internal": internalSecret,
      "user-agent": "distilled-registration-control/1"
    },
    body: JSON.stringify({ enabled })
  });
}

async function waitForRegistration(origin, expectedSha, expectedMode, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const live = await readLive(origin);
      if (live.status.releaseSha !== expectedSha) {
        throw new Error(`release is ${live.status.releaseSha ?? "unknown"}`);
      }
      if (options.requireOperational !== false && live.status.status !== "operational") {
        throw new Error(`status is ${live.status.status ?? "unknown"}`);
      }
      if (live.capabilities.registrationMode !== expectedMode) {
        throw new Error(`registration mode is ${live.capabilities.registrationMode ?? "unknown"}`);
      }
      return live;
    } catch (error) {
      lastError = error;
      if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(`Registration verification failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function readLive(origin) {
  const [status, capabilities] = await Promise.all([
    jsonFetch(new URL("/api/status", origin)),
    jsonFetch(new URL("/api/capabilities", origin))
  ]);
  return { status, capabilities };
}

function assertRelease(live, expectedSha) {
  if (live.status.status !== "operational" || live.status.releaseSha !== expectedSha) {
    throw new Error("Live production is not operational on the exact reviewed release SHA.");
  }
}

function assertCapacity(capabilities, environment, expectOpen) {
  const registration = capabilities.registration ?? {};
  const paidProviderBeta = capabilities.paidProviderBeta ?? {};
  const limits = capabilities.limits ?? {};
  if (
    capabilities.hosted !== true ||
    capabilities.registrationMode !== (expectOpen ? "open" : "closed") ||
    Number(registration.accountCap) !== Number(environment.vars.HOSTED_ACCOUNT_CAP) ||
    Number(registration.pendingAccountCap) !== Number(environment.vars.HOSTED_PENDING_ACCOUNT_CAP) ||
    Number(registration.remaining) <= 0 ||
    Number(registration.pendingRemaining) <= 0 ||
    registration.capacityReached === true ||
    registration.pendingCapacityReached === true ||
    Number(limits.feedsPerAccount) !== 2 ||
    Number(limits.hourlyFeedsPerAccount) !== 1 ||
    Number(limits.sourcesPerFeed) !== 5 ||
    Number(limits.sourcesPerAccount) !== 10 ||
    Number(limits.paidSourcesPerAccount) !== 2 ||
    Number(paidProviderBeta.accountCap) !== 4 ||
    Number(paidProviderBeta.claimedAccounts) > 4 ||
    Number(paidProviderBeta.remainingAccounts) < 0
  ) {
    throw new Error("Live hosted registration capacity/quotas do not match the reviewed launch policy.");
  }
}

function deployedVersionId() {
  const result = runWrangler(["deployments", "status", "--env", "production", "--json"], { capture: true });
  const deployment = JSON.parse(result.stdout);
  const full = (deployment.versions ?? []).filter((version) => Number(version.percentage) === 100);
  if (full.length !== 1 || !full[0].version_id) {
    throw new Error("Registration control requires one production version at 100% traffic.");
  }
  return full[0].version_id;
}

function versionDetails(versionId) {
  const result = runWrangler(["versions", "view", versionId, "--env", "production", "--json"], { capture: true });
  return JSON.parse(result.stdout);
}

function plainBinding(details, name) {
  const binding = (details.resources?.bindings ?? []).find((candidate) =>
    candidate.type === "plain_text" && candidate.name === name
  );
  return binding?.text;
}

function assertVersionRelease(details, expectedSha) {
  if (plainBinding(details, "RELEASE_SHA") !== expectedSha) {
    throw new Error("Deployed Worker version does not carry the exact reviewed RELEASE_SHA.");
  }
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}.`);
  return payload;
}
