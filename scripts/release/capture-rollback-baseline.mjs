#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  assertIsolatedStaging,
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";
import {
  closedVersionIdentity,
  singleFullTrafficVersion
} from "../lib/rollback-control.mjs";

const environment = process.argv[2];
const evidencePath = resolve(optionValue("--evidence") ?? "");
const githubEnvPath = optionValue("--github-env");
if (!optionValue("--evidence")) {
  throw new Error(
    "Usage: capture-rollback-baseline.mjs staging|production --evidence <path> [--github-env <path>]"
  );
}

const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
if (environment === "staging") assertIsolatedStaging(config);
if (selected.vars?.REGISTRATION_MODE !== "closed") {
  throw new Error(`${environment} checked-in registration mode must be closed before release.`);
}
const baseUrl = selected.vars?.PUBLIC_WEB_BASE_URL;
if (!baseUrl) throw new Error(`${environment} PUBLIC_WEB_BASE_URL is missing.`);

const deployment = wranglerJson(["deployments", "status", "--env", environment, "--json"]);
const { versionId } = singleFullTrafficVersion(deployment);
const details = wranglerJson(["versions", "view", versionId, "--env", environment, "--json"]);
const identity = closedVersionIdentity(details, versionId);
const d1RegistrationEnabled = readD1RegistrationEnabled();
if (d1RegistrationEnabled !== false) {
  throw new Error("Rollback baseline refused: the D1 registration switch is not explicitly closed.");
}
await assertLiveClosed(baseUrl, identity.releaseSha);

const evidence = {
  schemaVersion: 1,
  environment,
  workerName: selected.name,
  baseUrl,
  deploymentId: deployment.id ?? null,
  deploymentCreatedOn: deployment.created_on ?? null,
  versionId,
  versionCreatedOn: identity.createdOn,
  releaseSha: identity.releaseSha,
  registrationMode: "closed",
  d1RegistrationEnabled,
  capturedAt: new Date().toISOString()
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

if (githubEnvPath) {
  for (const [name, value] of [
    ["ROLLBACK_BASELINE_FILE", evidencePath],
    ["ROLLBACK_BASELINE_VERSION_ID", versionId],
    ["ROLLBACK_BASELINE_RELEASE_SHA", identity.releaseSha]
  ]) {
    appendFileSync(githubEnvPath, `${name}=${value}\n`);
  }
}

console.log(`Captured closed ${environment} rollback baseline.`);
console.log(`- version: ${versionId} (100% traffic)`);
console.log(`- release: ${identity.releaseSha}`);
console.log("- D1 registration switch: false");
console.log(`- evidence: ${evidencePath}`);

function readD1RegistrationEnabled() {
  const table = d1Json(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'settings';"
  );
  if (Number(table[0]?.count) !== 1) {
    throw new Error("Rollback baseline refused: the D1 settings table is unavailable.");
  }
  const rows = d1Json(
    "SELECT value FROM settings WHERE key = 'registration_enabled' LIMIT 1;"
  );
  return String(rows[0]?.value ?? "false").trim().toLowerCase() === "true";
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

async function assertLiveClosed(origin, releaseSha) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
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
      if (attempt < 5) await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
  }
  throw new Error(
    `Rollback baseline refused: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }.`
  );
}

async function jsonFetch(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "distilled-release-baseline/1" }
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
