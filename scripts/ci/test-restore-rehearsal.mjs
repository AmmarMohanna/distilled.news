#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { main, verifyRestoreInputs } from "../backup/rehearse-restore.mjs";

const root = mkdtempSync(resolve(tmpdir(), "distilled-restore-rehearsal-test-"));
const backupPath = resolve(root, "export.sql");
const checksumPath = `${backupPath}.sha256`;
const evidencePath = resolve(root, "restore-verification.json");
const restoreName = "distilled-news-staging-restore-fixture";
const restoreId = "11111111-2222-4333-8444-555555555555";
const config = {
  env: {
    staging: {
      d1_databases: [{
        binding: "DB",
        database_name: "distilled-news-staging-primary",
        database_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
      }]
    },
    production: {
      d1_databases: [{
        binding: "DB",
        database_name: "distilled-news-production",
        database_id: "99999999-8888-4777-8666-555555555555"
      }]
    }
  }
};
const values = new Map([
  ["STAGING_RESTORE_DATABASE_NAME", restoreName],
  ["STAGING_RESTORE_DATABASE_ID", restoreId]
]);
const environment = {
  CONFIRM_CLOUDFLARE_MUTATION: `distilled-news:staging:restore:${restoreName}`
};

try {
  writeFileSync(backupPath, "CREATE TABLE accounts (id TEXT PRIMARY KEY);\n", { mode: 0o600 });
  writeVerificationArtifacts();

  const verified = verifyRestoreInputs({ backupPath, evidencePath });
  assert.equal(verified.exportBytes, readFileSync(backupPath).byteLength);

  for (const mismatch of [
    {
      label: "name",
      info: { name: `${restoreName}-other`, uuid: restoreId },
      pattern: /resolved restore database name/
    },
    {
      label: "ID",
      info: { name: restoreName, uuid: "00000000-1111-4222-8333-444444444444" },
      pattern: /resolved restore database ID/
    }
  ]) {
    const calls = [];
    assert.throws(
      () => main({
        argv: ["--file", backupPath, "--evidence", evidencePath],
        environment,
        config,
        values,
        runWrangler(args) {
          calls.push(args);
          return { stdout: JSON.stringify(mismatch.info) };
        }
      }),
      mismatch.pattern,
      `remote ${mismatch.label} mismatch must fail closed`
    );
    assert.equal(calls.length, 1, `remote ${mismatch.label} mismatch must stop after D1 info`);
    assert.deepEqual(calls[0].slice(0, 3), ["d1", "info", restoreName]);
    assert.equal(calls.some((args) => args.includes("--file")), false);
  }

  writeFileSync(backupPath, `${readFileSync(backupPath, "utf8")}-- modified\n`, { mode: 0o600 });
  const modifiedCalls = [];
  assert.throws(
    () => main({
      argv: ["--file", backupPath, "--evidence", evidencePath],
      environment,
      config,
      values,
      runWrangler(args) {
        modifiedCalls.push(args);
        return { stdout: "{}" };
      }
    }),
    /Backup SHA-256 verification failed/
  );
  assert.equal(modifiedCalls.length, 0, "modified SQL must fail before any Cloudflare call");

  console.log("Restore rehearsal identity and backup-integrity negative fixtures passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function writeVerificationArtifacts() {
  const bytes = readFileSync(backupPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(checksumPath, `${digest}  export.sql\n`, { mode: 0o600 });
  writeFileSync(evidencePath, `${JSON.stringify({
    schemaVersion: 1,
    verifiedAt: "2026-07-29T00:00:00.000Z",
    releaseSha: null,
    exportSha256: digest,
    exportBytes: bytes.byteLength,
    quickCheck: "ok",
    coreTableCount: 6,
    applicationTableCount: 30,
    verifier: "wrangler-local-d1-import"
  }, null, 2)}\n`, { mode: 0o600 });
}
