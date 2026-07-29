#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  assertIsolatedStaging,
  environmentConfig,
  readWorkerConfig,
  repositoryRoot,
  runWrangler
} from "../lib/release-config.mjs";
import {
  closedVersionIdentity,
  singleFullTrafficVersion
} from "../lib/rollback-control.mjs";
import {
  stagingBootstrapCompletedMarker,
  stagingBootstrapStartedMarker,
  workerDoesNotExist
} from "../lib/transition-control.mjs";

const environment = "staging";
const releaseSha = process.env.RELEASE_SHA ?? "";
const evidencePath = optionValue("--evidence");
const githubEnvPath = optionValue("--github-env");
if (!evidencePath) {
  throw new Error(
    "Usage: bootstrap-staging.mjs --evidence <baseline-json> [--github-env <path>]"
  );
}
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== "distilled-news:staging:bootstrap-once") {
  throw new Error(
    "Set CONFIRM_CLOUDFLARE_MUTATION=distilled-news:staging:bootstrap-once."
  );
}
if (!/^[a-f0-9]{40,64}$/i.test(releaseSha)) {
  throw new Error("RELEASE_SHA must be the full reviewed staging SHA.");
}
if (!process.env.WRANGLER_SECRETS_FILE || !existsSync(process.env.WRANGLER_SECRETS_FILE)) {
  throw new Error("The protected staging WRANGLER_SECRETS_FILE is required.");
}

const config = readWorkerConfig();
const staging = environmentConfig(config, environment);
assertIsolatedStaging(config);
if (staging.vars?.ENVIRONMENT !== "staging" || staging.vars?.REGISTRATION_MODE !== "closed") {
  throw new Error("Staging bootstrap requires the isolated closed-registration environment.");
}

let started = readSetting(stagingBootstrapStartedMarker);
const completed = readSetting(stagingBootstrapCompletedMarker);
if (completed) {
  throw new Error(`Staging bootstrap is one-time and already completed: ${completed}.`);
}
let deployment = currentDeploymentOrNull();
if (deployment) {
  const identity = currentClosedIdentity(deployment);
  if (started !== releaseSha || identity.releaseSha !== releaseSha) {
    throw new Error("Staging Worker already exists outside recovery of this bootstrap SHA.");
  }
  console.log(`Recovering verification for in-progress staging bootstrap ${releaseSha}.`);
} else {
  if (started && started !== releaseSha) {
    throw new Error(`A different staging bootstrap is already recorded: ${started}.`);
  }

  runNode("scripts/release/migrate.mjs", [environment], {
    CONFIRM_CLOUDFLARE_MUTATION: "distilled-news:staging:migrate"
  });
  setBootstrapStarted();
  started = releaseSha;

  deployment = currentDeploymentOrNull();
  if (!deployment) {
    const deploy = runNode("scripts/release/deploy.mjs", [environment, "--preflight-verified"], {
      CONFIRM_CLOUDFLARE_MUTATION: "distilled-news:staging:deploy",
      RELEASE_PREFLIGHT_SHA: releaseSha
    }, { allowFailure: true });
    deployment = currentDeploymentOrNull();
    if (deploy.status !== 0) {
      if (!deployment || currentClosedIdentity(deployment).releaseSha !== releaseSha) {
        throw new Error("Initial staging deploy failed without establishing the reviewed closed version.");
      }
      console.warn("Wrangler returned nonzero after establishing the reviewed staging version; continuing verification.");
    }
  }
}

const identity = currentClosedIdentity(deployment);
if (identity.releaseSha !== releaseSha) {
  throw new Error(`Staging bootstrap deployed ${identity.releaseSha}, expected ${releaseSha}.`);
}
runNode("scripts/release/capture-rollback-baseline.mjs", [
  environment,
  "--evidence", evidencePath,
  ...(githubEnvPath ? ["--github-env", githubEnvPath] : [])
]);
runNode("scripts/release/smoke.mjs", [environment]);
completeBootstrap(identity.versionId);

console.log(`One-time staging bootstrap completed at ${identity.versionId}.`);
console.log("All normal staging releases must now use strict pre-mutation baseline capture.");

function setBootstrapStarted() {
  d1Json(
    "INSERT INTO settings (key, value, updated_at) VALUES " +
    `('registration_enabled', 'false', '${new Date().toISOString()}'), ` +
    `('${stagingBootstrapStartedMarker}', '${releaseSha}', '${new Date().toISOString()}') ` +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
  );
  if (readSetting("registration_enabled") !== "false") {
    throw new Error("Staging bootstrap could not close the D1 registration switch.");
  }
}

function completeBootstrap(versionId) {
  const value = `${releaseSha}:${versionId}`;
  d1Json(
    `INSERT INTO settings (key, value, updated_at) VALUES ('${stagingBootstrapCompletedMarker}', '${value}', '${new Date().toISOString()}') ` +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at; " +
    `DELETE FROM settings WHERE key = '${stagingBootstrapStartedMarker}';`
  );
  if (readSetting(stagingBootstrapCompletedMarker) !== value) {
    throw new Error("Staging bootstrap completion marker did not verify.");
  }
}

function readSetting(key) {
  const tables = d1Json(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'settings';"
  );
  if (Number(tables[0]?.count) !== 1) return null;
  const rows = d1Json(`SELECT value FROM settings WHERE key = '${key}' LIMIT 1;`);
  return rows[0]?.value ?? null;
}

function currentDeploymentOrNull() {
  const result = runWrangler(
    ["deployments", "status", "--env", environment, "--json"],
    { capture: true, allowFailure: true }
  );
  if (result.status === 0) return JSON.parse(result.stdout);
  if (workerDoesNotExist(result)) return null;
  throw new Error(`Could not determine whether the staging Worker exists.\n${result.stderr ?? ""}`);
}

function currentClosedIdentity(current) {
  const { versionId } = singleFullTrafficVersion(current);
  const details = wranglerJson(["versions", "view", versionId, "--env", environment, "--json"]);
  return closedVersionIdentity(details, versionId);
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

function runNode(script, arguments_, env = {}, options = {}) {
  const result = spawnSync(process.execPath, [script, ...arguments_], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${script} failed with exit ${result.status ?? "unknown"}.`);
  }
  return result;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
