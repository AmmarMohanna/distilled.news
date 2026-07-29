#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { repositoryRoot, wranglerPath } from "../lib/release-config.mjs";

const input = optionValue("--file");
if (!input) throw new Error("Pass --file /absolute/path/to/export.sql.");
const exportPath = resolve(input);
if (!existsSync(exportPath) || !exportPath.endsWith(".sql") || statSync(exportPath).size === 0) {
  throw new Error("Backup verification requires a non-empty .sql export.");
}

const checksumPath = `${exportPath}.sha256`;
if (!existsSync(checksumPath)) {
  throw new Error(`Backup checksum is missing: ${checksumPath}`);
}
const expectedDigest = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
const actualDigest = createHash("sha256").update(readFileSync(exportPath)).digest("hex");
if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? "") || expectedDigest !== actualDigest) {
  throw new Error("Backup SHA-256 verification failed.");
}

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "distilled-restore-verification-"));
const persistenceDirectory = resolve(temporaryRoot, "state");
const configPath = resolve(temporaryRoot, "wrangler.jsonc");
const workerMain = resolve(repositoryRoot, "apps", "worker", "src", "index.ts");

try {
  writeFileSync(configPath, `${JSON.stringify({
    name: "distilled-local-restore-verification",
    main: workerMain,
    compatibility_date: "2026-07-29",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    d1_databases: [{
      binding: "DB",
      database_name: "distilled-local-restore-verification",
      database_id: "00000000-0000-0000-0000-000000000002"
    }]
  }, null, 2)}\n`, { mode: 0o600 });

  run([
    "d1", "execute", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--yes",
    "--file", exportPath,
    "--config", configPath
  ]);

  const quickCheck = executeJson(
    configPath,
    persistenceDirectory,
    "PRAGMA quick_check;"
  )[0]?.quick_check;
  const coreTableCount = Number(executeJson(
    configPath,
    persistenceDirectory,
    `SELECT COUNT(*) AS tables
     FROM sqlite_master
     WHERE type = 'table'
       AND name IN ('accounts','briefings','sources','raw_messages','processing_jobs','briefing_editions');`
  )[0]?.tables ?? 0);
  const applicationTableCount = Number(executeJson(
    configPath,
    persistenceDirectory,
    "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%';"
  )[0]?.tables ?? 0);

  if (quickCheck !== "ok" || coreTableCount !== 6 || applicationTableCount < 6) {
    throw new Error("Export imported, but integrity or required-table verification failed.");
  }

  const evidence = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    releaseSha: process.env.RELEASE_SHA ?? null,
    exportSha256: actualDigest,
    exportBytes: statSync(exportPath).size,
    quickCheck,
    coreTableCount,
    applicationTableCount,
    verifier: "wrangler-local-d1-import"
  };
  const evidencePath = resolve(
    optionValue("--evidence") ?? `${exportPath}.restore-verification.json`
  );
  mkdirSync(dirname(evidencePath), { recursive: true, mode: 0o700 });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Backup restore verification passed. Evidence: ${evidencePath}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function executeJson(configPath, persistenceDirectory, command) {
  const result = run([
    "d1", "execute", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--json",
    "--command", command,
    "--config", configPath
  ], true);
  return JSON.parse(result.stdout)[0]?.results ?? [];
}

function run(args, capture = false) {
  const result = spawnSync(wranglerPath(), args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, CI: "true" }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() : "";
    throw new Error(`Wrangler restore verification failed.${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
