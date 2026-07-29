#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  assertIsolatedStaging,
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";
import {
  closedVersionIdentity,
  plainTextBinding,
  rollbackConfirmation,
  singleFullTrafficVersion,
  validateRollbackBaseline
} from "../lib/rollback-control.mjs";

const environment = process.argv[2];
const baselineArgument = optionValue("--baseline");
const resultArgument = optionValue("--evidence");
if (!baselineArgument) {
  throw new Error(
    "Usage: rollback.mjs staging|production --baseline <captured-json> [--evidence <result-json>]"
  );
}

const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
if (environment === "staging") assertIsolatedStaging(config);
if (selected.vars?.REGISTRATION_MODE !== "closed") {
  throw new Error(`${environment} checked-in registration mode must remain closed for rollback.`);
}
const baseUrl = selected.vars?.PUBLIC_WEB_BASE_URL;
if (!baseUrl) throw new Error(`${environment} PUBLIC_WEB_BASE_URL is missing.`);

const baselinePath = resolve(baselineArgument);
const baseline = validateRollbackBaseline(
  JSON.parse(readFileSync(baselinePath, "utf8")),
  { environment, workerName: selected.name, baseUrl }
);
const expectedConfirmation = rollbackConfirmation(environment, baseline.versionId);
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation}.`);
}
const failedReleaseSha = process.env.FAILED_RELEASE_SHA ?? "";
if (!/^[a-f0-9]{40,64}$/i.test(failedReleaseSha)) {
  throw new Error("FAILED_RELEASE_SHA must be the full SHA of the failed deployment.");
}

const targetDetails = versionDetails(baseline.versionId);
const target = closedVersionIdentity(targetDetails, baseline.versionId);
if (target.releaseSha !== baseline.releaseSha) {
  throw new Error("Captured rollback target release SHA no longer matches version metadata.");
}

const before = currentDeployment();
if (before.versionId !== baseline.versionId) {
  const failedDetails = versionDetails(before.versionId);
  if (plainTextBinding(failedDetails, "RELEASE_SHA") !== failedReleaseSha) {
    throw new Error(
      `Rollback refused: current version ${before.versionId} is not failed release ${failedReleaseSha}.`
    );
  }
}

disableD1Registration();

let rollbackInvoked = false;
if (before.versionId !== baseline.versionId) {
  runWrangler([
    "rollback", baseline.versionId,
    "--env", environment,
    "--message", `Automatic release rollback to ${baseline.releaseSha}`,
    "--yes"
  ]);
  rollbackInvoked = true;
}

const after = currentDeployment();
if (after.versionId !== baseline.versionId) {
  throw new Error(
    `Rollback verification failed: ${after.versionId} has 100% traffic, expected ${baseline.versionId}.`
  );
}
await waitForClosedRelease(baseUrl, baseline.releaseSha);

const result = {
  schemaVersion: 1,
  environment,
  failedReleaseSha,
  rollbackVersionId: baseline.versionId,
  rollbackReleaseSha: baseline.releaseSha,
  d1RegistrationEnabled: false,
  rollbackInvoked,
  verifiedAt: new Date().toISOString()
};
if (resultArgument) {
  const resultPath = resolve(resultArgument);
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
}

console.log(`Release rollback completed for ${environment}.`);
console.log("- D1 registration switch: false");
console.log(`- version: ${baseline.versionId} (100% traffic)`);
console.log(`- release: ${baseline.releaseSha}`);
console.log("- resource rollback: not attempted (D1 migrations and bound resources remain forward-only)");

function disableD1Registration() {
  const table = d1Json(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'settings';"
  );
  if (Number(table[0]?.count) !== 1) {
    console.warn("D1 settings table is unavailable; this version does not support the runtime switch.");
    return;
  }
  const updatedAt = new Date().toISOString();
  d1Json(
    "INSERT INTO settings (key, value, updated_at) " +
    `VALUES ('registration_enabled', 'false', '${updatedAt}') ` +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
  );
  const rows = d1Json(
    "SELECT value FROM settings WHERE key = 'registration_enabled' LIMIT 1;"
  );
  if (String(rows[0]?.value ?? "").trim().toLowerCase() !== "false") {
    throw new Error("D1 registration switch did not verify false; Worker rollback was not attempted.");
  }
}

function currentDeployment() {
  const deployment = wranglerJson(["deployments", "status", "--env", environment, "--json"]);
  return singleFullTrafficVersion(deployment);
}

function versionDetails(versionId) {
  return wranglerJson(["versions", "view", versionId, "--env", environment, "--json"]);
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

async function waitForClosedRelease(origin, releaseSha) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const [status, capabilities] = await Promise.all([
        jsonFetch(new URL("/api/status", origin)),
        jsonFetch(new URL("/api/capabilities", origin))
      ]);
      if (status.status !== "operational" || status.releaseSha !== releaseSha) {
        throw new Error(
          `live release is ${status.releaseSha ?? "unknown"} with status ${status.status ?? "unknown"}`
        );
      }
      if (capabilities.registrationMode !== "closed") {
        throw new Error(`live registration mode is ${capabilities.registrationMode ?? "unknown"}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    }
  }
  throw new Error(
    `Rolled-back release did not become healthy and closed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }.`
  );
}

async function jsonFetch(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "distilled-release-rollback/1" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return payload;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
