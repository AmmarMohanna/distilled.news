#!/usr/bin/env node

import {
  environmentConfig,
  readWorkerConfig,
  requiredConfirmation
} from "../lib/release-config.mjs";

const environment = process.argv[2];
const selected = environmentConfig(readWorkerConfig(), environment);
const expectedConfirmation = requiredConfirmation(environment, "retention");
const secret = process.env.INTERNAL_MAINTENANCE_SECRET?.trim() ?? "";
const releaseSha = process.env.RELEASE_SHA ?? "";
const baseUrl = selected.vars?.PUBLIC_WEB_BASE_URL;
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation}.`);
}
if (secret.length < 32) throw new Error("INTERNAL_MAINTENANCE_SECRET is required.");
if (!/^[a-f0-9]{40,64}$/i.test(releaseSha)) throw new Error("RELEASE_SHA must be the full deployed SHA.");
if (!baseUrl) throw new Error("PUBLIC_WEB_BASE_URL is missing.");

const status = await jsonFetch(new URL("/api/status", baseUrl));
if (status.releaseSha !== releaseSha) {
  throw new Error(`Retention refused: live release is ${status.releaseSha ?? "unknown"}, expected ${releaseSha}.`);
}

const totals = {
  invocations: 0,
  deleted: 0,
  archivesDeleted: 0,
  sourceRunArchiveReferencesCleared: 0,
  rawPayloadReferencesCleared: 0
};
let hasMore = true;
while (hasMore && totals.invocations < 20) {
  const result = await jsonFetch(new URL("/api/internal/retention/run?limit=1000", baseUrl), {
    method: "POST",
    headers: {
      "x-distilled-internal": secret,
      "user-agent": "distilled-release-retention/1"
    }
  });
  totals.invocations += 1;
  if (Number(result.archiveDeleteFailures ?? 0) !== 0) {
    throw new Error("Retention endpoint reported an R2 archive deletion failure.");
  }
  for (const key of [
    "deleted",
    "archivesDeleted",
    "sourceRunArchiveReferencesCleared",
    "rawPayloadReferencesCleared"
  ]) {
    totals[key] += Number(result[key] ?? 0);
  }
  hasMore = result.hasMore === true;
}
if (hasMore) throw new Error("Retention cleanup exceeded 20 bounded invocations; verification remains blocked.");

console.log(JSON.stringify({ environment, releaseSha, ...totals }, null, 2));

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}.`);
  return payload;
}
