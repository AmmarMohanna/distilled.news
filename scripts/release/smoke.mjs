#!/usr/bin/env node

import {
  assertIsolatedStaging,
  d1Binding,
  environmentConfig,
  queueNames,
  readWorkerConfig,
  runWrangler
} from "../lib/release-config.mjs";

const environment = process.argv[2];
const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
const expectedReleaseSha = process.env.RELEASE_SHA ?? "";

if (!/^[a-f0-9]{40,64}$/i.test(expectedReleaseSha)) {
  throw new Error("RELEASE_SHA must be the full deployed commit SHA.");
}
if (environment === "staging") assertIsolatedStaging(config);
if (environment === "production" && selected.vars?.REGISTRATION_MODE !== "closed") {
  throw new Error("Production smoke refused: checked-in registration mode is not closed.");
}

const database = d1Binding(selected);
const quickCheck = d1Json("PRAGMA quick_check;")[0]?.quick_check;
if (quickCheck !== "ok") throw new Error(`Remote D1 quick_check failed for ${database.database_name}.`);

const bucket = selected.r2_buckets?.find((candidate) => candidate.binding === "RAW_ARCHIVE")?.bucket_name;
if (!bucket) throw new Error("RAW_ARCHIVE binding is missing.");
runWrangler(["r2", "bucket", "info", bucket], { capture: true });

for (const queue of new Set(queueNames(selected))) {
  runWrangler(["queues", "info", queue], { capture: true });
}

const baseUrl = selected.vars?.PUBLIC_WEB_BASE_URL;
if (!baseUrl) throw new Error("PUBLIC_WEB_BASE_URL is missing.");
const live = await waitForRelease(baseUrl, expectedReleaseSha);
if (live.capabilities.registrationMode !== selected.vars?.REGISTRATION_MODE) {
  throw new Error(
    `Live registration mode "${live.capabilities.registrationMode}" does not match checked-in ` +
    `"${selected.vars?.REGISTRATION_MODE}".`
  );
}
if (environment === "production" && live.capabilities.registrationMode !== "closed") {
  throw new Error("Production registration is live before the separate opening gate.");
}

const csp = live.home.headers.get("content-security-policy") ?? "";
for (const directive of [
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'"
]) {
  if (!csp.includes(directive)) throw new Error(`Live CSP is missing: ${directive}`);
}
if (csp.includes("'unsafe-inline'")) throw new Error("Live CSP permits unsafe inline content.");

console.log(`Remote smoke passed for ${environment}.`);
console.log(`- release: ${expectedReleaseSha}`);
console.log(`- route: ${new URL(baseUrl).origin}`);
console.log(`- D1: ${database.database_name} (quick_check=ok)`);
console.log(`- R2: ${bucket}`);
console.log(`- queues: ${new Set(queueNames(selected)).size}`);
console.log(`- registration: ${live.capabilities.registrationMode}`);

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

async function waitForRelease(origin, releaseSha) {
  let lastError;
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    try {
      const home = await checkedFetch(new URL("/", origin));
      const statusResponse = await checkedFetch(new URL("/api/status", origin));
      const capabilitiesResponse = await checkedFetch(new URL("/api/capabilities", origin));
      const status = await statusResponse.json();
      const capabilities = await capabilitiesResponse.json();
      if (status.status !== "operational") {
        throw new Error(
          `status endpoint reports ${status.status ?? "unknown"}: ` +
          JSON.stringify(status.services ?? []).slice(0, 1_000)
        );
      }
      if (status.releaseSha !== releaseSha) {
        throw new Error(`live release is ${status.releaseSha ?? "unknown"}, expected ${releaseSha}`);
      }
      return { home, status, capabilities };
    } catch (error) {
      lastError = error;
      if (attempt < 25) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(`Post-deploy HTTP readiness failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function checkedFetch(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "distilled-release-smoke/1" }
  });
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return response;
}
