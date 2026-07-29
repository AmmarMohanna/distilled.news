#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  environmentConfig,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";
import { reviewedLegacyPaidCohort } from "../lib/paid-cohort-control.mjs";

const environment = "production";
const production = environmentConfig(readWorkerConfig(), environment);
const baseUrl = production.vars?.PUBLIC_WEB_BASE_URL;
const releaseSha = process.env.RELEASE_SHA ?? "";
const secret = process.env.INTERNAL_MAINTENANCE_SECRET?.trim() ?? "";
const expectedConfirmation =
  `distilled-news:production:legacy-canary-cleanup:${releaseSha}`;
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation}.`);
}
if (!baseUrl) throw new Error("Production PUBLIC_WEB_BASE_URL is missing.");
if (!/^[a-f0-9]{40,64}$/i.test(releaseSha)) {
  throw new Error("RELEASE_SHA must be the full deployed hardened SHA.");
}
if (secret.length < 32) throw new Error("INTERNAL_MAINTENANCE_SECRET is required.");

const [status, capabilities] = await Promise.all([
  jsonFetch(new URL("/api/status", baseUrl)),
  jsonFetch(new URL("/api/capabilities", baseUrl))
]);
if (status.releaseSha !== releaseSha || capabilities.registrationMode !== "closed") {
  throw new Error("Legacy canary cleanup requires the exact hardened closed production release.");
}

let cleanup;
let lastError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    cleanup = await jsonFetch(new URL("/api/internal/legacy-canary-cleanup", baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-distilled-internal": secret,
        "user-agent": "distilled-legacy-canary-cleanup/1"
      },
      body: JSON.stringify({
        reviewDigest: reviewedLegacyPaidCohort.digest,
        releaseSha
      })
    });
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!cleanup) throw lastError;
if (
  cleanup.ok !== true ||
  Number(cleanup.reviewedAccounts) !== reviewedLegacyPaidCohort.canaryAccounts.length ||
  Number(cleanup.deletedAccounts) + Number(cleanup.alreadyDeletedAccounts) !==
    reviewedLegacyPaidCohort.canaryAccounts.length
) {
  throw new Error("Hardened cleanup endpoint returned an incomplete result.");
}

const verification = d1Json(`
  SELECT
    (SELECT COUNT(*) FROM accounts WHERE username LIKE 'canary-%') AS remaining_canary_accounts,
    (SELECT value FROM settings WHERE key = 'legacy_canary_cleanup_completed') AS completion_marker;
`)[0];
if (
  Number(verification?.remaining_canary_accounts) !== 0 ||
  verification?.completion_marker !== `${reviewedLegacyPaidCohort.digest}:${releaseSha}`
) {
  throw new Error("D1 did not verify the completed legacy canary cleanup.");
}

writeEvidence({
  schemaVersion: 1,
  environment,
  hardenedReleaseSha: releaseSha,
  reviewDigest: reviewedLegacyPaidCohort.digest,
  reviewedAccounts: Number(cleanup.reviewedAccounts),
  deletedAccounts: Number(cleanup.deletedAccounts),
  alreadyDeletedAccounts: Number(cleanup.alreadyDeletedAccounts),
  deletedPayloads: Number(cleanup.deletedPayloads),
  sharedPayloadsRetained: Number(cleanup.sharedPayloadsRetained),
  deletionManifests: Number(cleanup.deletionManifests),
  remainingCanaryAccounts: 0,
  identifiersIncludedInEvidence: false,
  verifiedAt: new Date().toISOString()
});
console.log(
  `Payload-safe cleanup verified for ${cleanup.reviewedAccounts} reviewed legacy canary accounts.`
);

function d1Json(command) {
  const result = runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", environment,
    "--json",
    "--command", command
  ], { capture: true });
  return JSON.parse(result.stdout)[0]?.results ?? [];
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(120_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}.`);
  }
  return payload;
}

function writeEvidence(payload) {
  const pathValue = optionValue("--evidence");
  if (!pathValue) return;
  const path = resolve(pathValue);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
