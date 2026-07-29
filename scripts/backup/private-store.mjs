#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  runWrangler,
  usableValue
} from "../lib/release-config.mjs";

export const productionBackupBucket = "distilled-news-production-backups";
export const productionBackupPrefix = "pre-migration/";
export const productionBackupRetentionSeconds = 30 * 24 * 60 * 60;
export const productionBackupLifecycleRule = "production-backup-expiry-30d";

export function validatePrivateStoreState(state) {
  const failures = [];
  if (state.bucket?.name !== productionBackupBucket) failures.push("dedicated bucket is missing or mismatched");
  if (state.managedDomain?.enabled !== false) failures.push("r2.dev public access is not disabled");
  if (!Array.isArray(state.customDomains?.domains) || state.customDomains.domains.length !== 0) {
    failures.push("custom domains are attached");
  }
  const rule = state.lifecycle?.rules?.find((candidate) => candidate.id === productionBackupLifecycleRule);
  if (
    !rule ||
    rule.enabled !== true ||
    rule.conditions?.prefix !== productionBackupPrefix ||
    rule.deleteObjectsTransition?.condition?.type !== "Age" ||
    Number(rule.deleteObjectsTransition?.condition?.maxAge) !== productionBackupRetentionSeconds
  ) {
    failures.push("exact 30-day pre-migration deletion lifecycle is missing");
  }
  if (failures.length > 0) {
    throw new Error(`Private production backup store is unsafe:\n- ${failures.join("\n- ")}`);
  }
  return true;
}

export async function readPrivateStoreState(fetcher = fetch, env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!usableValue(accountId) || !usableValue(token)) {
    throw new Error("Private backup verification requires existing Cloudflare account credentials.");
  }
  const bucket = encodeURIComponent(productionBackupBucket);
  const base = `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${bucket}`;
  const request = (path) => cloudflare(path, token, fetcher);
  const [bucketState, lifecycle, managedDomain, customDomains] = await Promise.all([
    request(base),
    request(`${base}/lifecycle`),
    request(`${base}/domains/managed`),
    request(`${base}/domains/custom`)
  ]);
  return { bucket: bucketState, lifecycle, managedDomain, customDomains };
}

async function main() {
  const mode = process.argv[2];
  if (!["verify", "put"].includes(mode)) {
    throw new Error("Usage: private-store.mjs verify | put --file backup.enc --evidence evidence.json");
  }
  const state = await readPrivateStoreState();
  validatePrivateStoreState(state);
  if (mode === "verify") {
    console.log("Private production backup bucket, access policy, and 30-day lifecycle verified.");
    return;
  }

  const input = resolve(optionValue("--file") ?? "");
  const evidencePath = resolve(optionValue("--evidence") ?? "");
  if (!input.endsWith(".enc") || !existsSync(input) || !statSync(input).isFile() || statSync(input).size === 0) {
    throw new Error("Private backup upload requires a non-empty .enc file.");
  }
  if (!optionValue("--evidence")) throw new Error("Private backup upload requires --evidence.");
  const expectedConfirmation = `distilled-news:production:backup-store:${productionBackupBucket}`;
  if (process.env.CONFIRM_PRODUCTION_BACKUP_STORE !== expectedConfirmation) {
    throw new Error(`Set CONFIRM_PRODUCTION_BACKUP_STORE=${expectedConfirmation}.`);
  }
  const releaseSha = String(process.env.RELEASE_SHA ?? "").trim().toLowerCase();
  const runId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT ?? "").trim();
  if (!/^[a-f0-9]{40}$/.test(releaseSha) || !/^[1-9][0-9]*$/.test(runId) || !/^[1-9][0-9]*$/.test(runAttempt)) {
    throw new Error("Private backup upload requires a full release SHA and GitHub run identity.");
  }

  const objectKey =
    `${productionBackupPrefix}${releaseSha}/${runId}-${runAttempt}/${sanitizeBasename(basename(input))}`;
  const remotePath = `${productionBackupBucket}/${objectKey}`;
  runWrangler([
    "r2", "object", "put", remotePath,
    "--remote",
    "--file", input,
    "--content-type", "application/octet-stream",
    "--cache-control", "no-store",
    "--force"
  ]);

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "distilled-private-backup-check-"));
  const downloaded = resolve(temporaryRoot, "downloaded.enc");
  try {
    runWrangler(["r2", "object", "get", remotePath, "--remote", "--file", downloaded]);
    const [localSha256, remoteSha256] = await Promise.all([
      sha256File(input),
      sha256File(downloaded)
    ]);
    if (localSha256 !== remoteSha256 || statSync(input).size !== statSync(downloaded).size) {
      throw new Error("Private backup upload verification failed.");
    }
    const evidence = {
      schemaVersion: 1,
      storedAt: new Date().toISOString(),
      releaseSha,
      bucket: productionBackupBucket,
      objectKey,
      encryptedSha256: localSha256,
      encryptedBytes: statSync(input).size,
      authenticatedRoundTripVerified: true,
      publicAccess: false,
      lifecycleRule: productionBackupLifecycleRule,
      retentionSeconds: productionBackupRetentionSeconds
    };
    mkdirSync(dirname(evidencePath), { recursive: true, mode: 0o700 });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(`Encrypted production backup stored in private R2. Evidence: ${evidencePath}`);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function cloudflare(path, token, fetcher) {
  const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare private backup read failed with HTTP ${response.status}.`);
  }
  return payload.result;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function sanitizeBasename(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Encrypted backup filename is unsafe.");
  return value;
}

function optionValue(name) {
  const direct = process.argv.slice(3).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
