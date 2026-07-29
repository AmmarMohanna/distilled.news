#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertIsolatedStaging,
  environmentConfig,
  parseSecretsFile,
  parseEnvFile,
  readWorkerConfig,
  repositoryRoot,
  requiredConfirmation,
  runWrangler
} from "../lib/release-config.mjs";
import { verifyApifyReadiness } from "../lib/apify-readiness.mjs";
import { resetObservationWindow } from "../canary/observation-window.mjs";

const environment = process.argv[2];
const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
const releaseSha = process.env.RELEASE_SHA ?? "";
const expectedConfirmation = requiredConfirmation(environment, "deploy");
const secretsFile = process.env.WRANGLER_SECRETS_FILE
  ? resolve(process.env.WRANGLER_SECRETS_FILE)
  : null;

if (!/^[a-f0-9]{40,64}$/i.test(releaseSha)) {
  throw new Error("RELEASE_SHA must be the full 40-64 character commit SHA.");
}
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation} to deploy ${environment}.`);
}
if (secretsFile && !existsSync(secretsFile)) {
  throw new Error(`WRANGLER_SECRETS_FILE does not exist: ${secretsFile}`);
}
if (secretsFile) parseSecretsFile(secretsFile);

if (environment === "production") {
  if (selected.workers_dev !== false || selected.preview_urls !== false) {
    throw new Error("Production deploy refused: workers.dev and preview URLs must both be disabled.");
  }
  if (selected.vars?.REGISTRATION_MODE !== "closed") {
    throw new Error("Production registration must remain closed for this release process.");
  }
} else {
  assertIsolatedStaging(config);
}

const preflightVerified =
  process.argv.includes("--preflight-verified") &&
  process.env.RELEASE_PREFLIGHT_SHA === releaseSha;
if (!preflightVerified) {
  const readiness = spawnSync("pnpm", ["release:check"], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: process.env
  });
  if (readiness.error) throw readiness.error;
  if (readiness.status !== 0) process.exit(readiness.status ?? 1);
}

const deploymentDoctor = spawnSync(
  process.execPath,
  ["scripts/doctor.mjs", "--ci", "--deployment", "--environment", environment],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: process.env
  }
);
if (deploymentDoctor.error) throw deploymentDoctor.error;
if (deploymentDoctor.status !== 0) process.exit(deploymentDoctor.status ?? 1);

const secretsFileValues = secretsFile ? parseEnvFile(secretsFile) : new Map();
const apifyEvidence = await verifyApifyReadiness(selected, {
  readinessToken:
    process.env.APIFY_READINESS_TOKEN?.trim() ||
    process.env.APIFY_API_TOKEN?.trim() ||
    secretsFileValues.get("APIFY_API_TOKEN")
});
if (!apifyEvidence.skipped) {
  console.log(
    `Live Apify readiness passed with $${apifyEvidence.remainingMonthlyUsageUsd.toFixed(2)} ` +
    `remaining for the $${apifyEvidence.monthlyCollectionCapUsd.toFixed(2)} collection cap.`
  );
}

const deployArguments = [
  "deploy",
  "--strict",
  "--env",
  environment,
  "--var",
  `RELEASE_SHA:${releaseSha}`,
  "--message",
  `Release ${releaseSha}`
];
if (secretsFile) deployArguments.push("--secrets-file", secretsFile);
runWrangler(deployArguments);

if (environment === "staging") {
  resetObservationWindow("staging-deploy", { releaseSha });
  console.log("Staging canary observation window restarted after deployment.");
}
