#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  combinedEnvironment,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  runWrangler,
  usableValue,
  unsetDatabaseId
} from "../lib/release-config.mjs";

const d1IdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const environment = options.environment ?? process.env;
  const run = options.runWrangler ?? runWrangler;

  const backupPath = optionValue(argv, "--file");
  if (!backupPath) throw new Error("Pass --file /absolute/path/to/export.sql.");
  const evidencePath = optionValue(argv, "--evidence");
  if (!evidencePath) {
    throw new Error("Pass --evidence /absolute/path/to/restore-verification.json from backup:verify.");
  }

  const verifiedBackup = verifyRestoreInputs({
    backupPath,
    checksumPath: optionValue(argv, "--checksum"),
    evidencePath
  });

  const config = options.config ?? readWorkerConfig();
  const staging = environmentConfig(config, "staging");
  const production = environmentConfig(config, "production");
  const values = options.values ?? combinedEnvironment("staging");
  const restoreName = String(values.get("STAGING_RESTORE_DATABASE_NAME") ?? "").trim();
  const restoreId = String(values.get("STAGING_RESTORE_DATABASE_ID") ?? "").trim();
  const expected = `distilled-news:staging:restore:${restoreName}`;

  if (!usableValue(restoreName) || !/staging/i.test(restoreName) || !/restore/i.test(restoreName)) {
    throw new Error("STAGING_RESTORE_DATABASE_NAME must visibly contain both staging and restore.");
  }
  if (!usableValue(restoreId) || !d1IdPattern.test(restoreId) || restoreId === unsetDatabaseId) {
    throw new Error("STAGING_RESTORE_DATABASE_ID must be the non-placeholder UUID of the isolated restore target.");
  }
  for (const selectedEnvironment of [staging, production]) {
    const primary = d1Binding(selectedEnvironment);
    if (restoreName === primary.database_name || restoreId === primary.database_id) {
      throw new Error("Restore rehearsal database matches an application database.");
    }
  }
  if (environment.CONFIRM_CLOUDFLARE_MUTATION !== expected) {
    throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expected} to restore into the disposable staging database.`);
  }

  const databaseInfoResult = run([
    "d1", "info", restoreName,
    "--env", "staging",
    "--json"
  ], { capture: true });
  const databaseInfo = parseRemoteDatabaseInfo(databaseInfoResult.stdout);
  assertRemoteRestoreIdentity({
    databaseInfo,
    expectedName: restoreName,
    expectedId: restoreId
  });

  const inventory = executeJson(
    run,
    restoreName,
    "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%';"
  );
  if (Number(inventory[0]?.tables ?? 0) > 0) {
    throw new Error("Restore target is not empty. Use a fresh disposable staging restore database.");
  }

  // Re-read the artifacts immediately before the first remote write. This
  // closes the ordinary check/use gap while the remote target was inspected.
  const preMutationBackup = verifyRestoreInputs({
    backupPath: verifiedBackup.backupPath,
    checksumPath: verifiedBackup.checksumPath,
    evidencePath: verifiedBackup.evidencePath
  });
  if (
    preMutationBackup.exportSha256 !== verifiedBackup.exportSha256 ||
    preMutationBackup.exportBytes !== verifiedBackup.exportBytes
  ) {
    throw new Error("Backup artifacts changed during restore preflight.");
  }

  run([
    "d1", "execute", restoreName,
    "--remote",
    "--env", "staging",
    "--yes",
    "--file", verifiedBackup.backupPath
  ]);

  const quickCheck = executeJson(run, restoreName, "PRAGMA quick_check;");
  const requiredTables = executeJson(
    run,
    restoreName,
    "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','briefings','sources','raw_messages','processing_jobs','briefing_editions');"
  );
  if (quickCheck[0]?.quick_check !== "ok" || Number(requiredTables[0]?.tables ?? 0) !== 6) {
    throw new Error("Restore completed but integrity or required-table verification failed.");
  }
  console.log(`Restore rehearsal passed in isolated database ${restoreName} (${restoreId}).`);
}

export function verifyRestoreInputs({ backupPath, checksumPath, evidencePath }) {
  const resolvedBackup = resolve(backupPath);
  const resolvedChecksum = resolve(checksumPath ?? `${resolvedBackup}.sha256`);
  const resolvedEvidence = resolve(evidencePath);

  assertRegularNonemptyFile(resolvedBackup, "Restore rehearsal requires an existing non-empty .sql export file.");
  if (!resolvedBackup.endsWith(".sql")) {
    throw new Error("Restore rehearsal requires an existing non-empty .sql export file.");
  }
  assertRegularNonemptyFile(resolvedChecksum, `Backup checksum is missing or invalid: ${resolvedChecksum}`);
  assertRegularNonemptyFile(
    resolvedEvidence,
    `Local restore-verification evidence is missing or invalid: ${resolvedEvidence}`
  );

  if (statSync(resolvedChecksum).size > 4096) {
    throw new Error("Backup checksum file is unexpectedly large.");
  }
  if (statSync(resolvedEvidence).size > 64 * 1024) {
    throw new Error("Local restore-verification evidence is unexpectedly large.");
  }

  const exportBytes = statSync(resolvedBackup).size;
  const exportSha256 = createHash("sha256").update(readFileSync(resolvedBackup)).digest("hex");
  const expectedDigest = readFileSync(resolvedChecksum, "utf8")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? "") || expectedDigest !== exportSha256) {
    throw new Error("Backup SHA-256 verification failed.");
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolvedEvidence, "utf8"));
  } catch {
    throw new Error("Local restore-verification evidence is not valid JSON.");
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Local restore-verification evidence must be a JSON object.");
  }
  const verifiedAt = Date.parse(evidence.verifiedAt);
  const evidenceIsValid = (
    evidence.schemaVersion === 1 &&
    evidence.exportSha256 === exportSha256 &&
    evidence.exportBytes === exportBytes &&
    evidence.quickCheck === "ok" &&
    evidence.coreTableCount === 6 &&
    Number.isInteger(evidence.applicationTableCount) &&
    evidence.applicationTableCount >= 6 &&
    evidence.verifier === "wrangler-local-d1-import" &&
    Number.isFinite(verifiedAt) &&
    verifiedAt <= Date.now()
  );
  if (!evidenceIsValid) {
    throw new Error("Local restore-verification evidence does not match this verified export.");
  }

  return {
    backupPath: resolvedBackup,
    checksumPath: resolvedChecksum,
    evidencePath: resolvedEvidence,
    exportSha256,
    exportBytes
  };
}

export function parseRemoteDatabaseInfo(stdout) {
  let payload;
  try {
    payload = JSON.parse(String(stdout ?? ""));
  } catch {
    throw new Error("Cloudflare D1 target lookup did not return valid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Cloudflare D1 target lookup returned an invalid object.");
  }
  return payload;
}

export function assertRemoteRestoreIdentity({ databaseInfo, expectedName, expectedId }) {
  if (databaseInfo.name !== expectedName) {
    throw new Error(
      `Cloudflare resolved restore database name "${String(databaseInfo.name ?? "")}", expected "${expectedName}".`
    );
  }
  if (
    typeof databaseInfo.uuid !== "string" ||
    databaseInfo.uuid.toLowerCase() !== expectedId.toLowerCase()
  ) {
    throw new Error(
      `Cloudflare resolved restore database ID "${String(databaseInfo.uuid ?? "")}", expected "${expectedId}".`
    );
  }
}

function executeJson(run, database, command) {
  const result = run([
    "d1", "execute", database,
    "--remote",
    "--env", "staging",
    "--json",
    "--command", command
  ], { capture: true });
  const payload = JSON.parse(result.stdout);
  return payload[0]?.results ?? [];
}

function assertRegularNonemptyFile(path, message) {
  if (!existsSync(path)) throw new Error(message);
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0) throw new Error(message);
}

function optionValue(argv, name) {
  const direct = argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
