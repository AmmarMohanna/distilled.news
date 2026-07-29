#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { main, verifyRestoreInputs } from "../backup/rehearse-restore.mjs";
import { verifyExportArtifacts } from "../backup/verify-export.mjs";

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
  assert.deepEqual(verified.exportContents, readFileSync(backupPath));

  if (process.platform !== "win32") {
    const linkedBackup = resolve(root, "linked-export.sql");
    const linkedChecksum = resolve(root, "linked-export.sha256");
    const linkedEvidence = resolve(root, "linked-restore-verification.json");
    symlinkSync(backupPath, linkedBackup);
    symlinkSync(checksumPath, linkedChecksum);
    symlinkSync(evidencePath, linkedEvidence);

    assert.throws(
      () => verifyRestoreInputs({
        backupPath: linkedBackup,
        checksumPath,
        evidencePath
      }),
      /non-empty .sql export file/,
      "restore input symlinks must fail closed"
    );
    assert.throws(
      () => verifyRestoreInputs({
        backupPath,
        checksumPath: linkedChecksum,
        evidencePath
      }),
      /Backup checksum is missing or invalid/,
      "restore checksum symlinks must fail closed"
    );
    assert.throws(
      () => verifyRestoreInputs({
        backupPath,
        checksumPath,
        evidencePath: linkedEvidence
      }),
      /restore-verification evidence is missing or invalid/,
      "restore evidence symlinks must fail closed"
    );
    assert.throws(
      () => verifyExportArtifacts(linkedBackup),
      /non-empty .sql export/,
      "local verification input symlinks must fail closed"
    );
  }

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

  const originalBytes = readFileSync(backupPath);
  const successfulCalls = [];
  let importedSnapshotPath;
  main({
    argv: ["--file", backupPath, "--evidence", evidencePath],
    environment,
    config,
    values,
    runWrangler(args) {
      successfulCalls.push(args);
      if (args[0] === "d1" && args[1] === "info") {
        return { stdout: JSON.stringify({ name: restoreName, uuid: restoreId }) };
      }
      const commandIndex = args.indexOf("--command");
      if (commandIndex >= 0) {
        const command = args[commandIndex + 1];
        if (command === "PRAGMA quick_check;") {
          return { stdout: JSON.stringify([{ results: [{ quick_check: "ok" }] }]) };
        }
        if (command.includes("name IN")) {
          return { stdout: JSON.stringify([{ results: [{ tables: 6 }] }]) };
        }
        return { stdout: JSON.stringify([{ results: [{ tables: 0 }] }]) };
      }
      const fileIndex = args.indexOf("--file");
      if (fileIndex >= 0) {
        importedSnapshotPath = args[fileIndex + 1];
        assert.notEqual(importedSnapshotPath, backupPath);
        assert.deepEqual(readFileSync(importedSnapshotPath), originalBytes);
        if (process.platform !== "win32") {
          assert.equal(statSync(importedSnapshotPath).mode & 0o777, 0o600);
        }
        writeFileSync(backupPath, "-- changed after final local validation\n", { mode: 0o600 });
        assert.deepEqual(
          readFileSync(importedSnapshotPath),
          originalBytes,
          "the verified private snapshot must isolate Wrangler from a later caller-path mutation"
        );
        return { stdout: "" };
      }
      throw new Error(`Unexpected Wrangler fixture call: ${args.join(" ")}`);
    }
  });
  assert.equal(successfulCalls.some((args) => args.includes("--file")), true);
  assert.equal(existsSync(importedSnapshotPath), false, "verified restore snapshot must be cleaned up");

  writeFileSync(backupPath, originalBytes, { mode: 0o600 });
  writeVerificationArtifacts();
  let failedImportSnapshotPath;
  assert.throws(
    () => main({
      argv: ["--file", backupPath, "--evidence", evidencePath],
      environment,
      config,
      values,
      runWrangler(args) {
        if (args[0] === "d1" && args[1] === "info") {
          return { stdout: JSON.stringify({ name: restoreName, uuid: restoreId }) };
        }
        const commandIndex = args.indexOf("--command");
        if (commandIndex >= 0) {
          return { stdout: JSON.stringify([{ results: [{ tables: 0 }] }]) };
        }
        const fileIndex = args.indexOf("--file");
        if (fileIndex >= 0) {
          failedImportSnapshotPath = args[fileIndex + 1];
          assert.equal(existsSync(failedImportSnapshotPath), true);
          throw new Error("simulated remote import failure");
        }
        throw new Error(`Unexpected Wrangler fixture call: ${args.join(" ")}`);
      }
    }),
    /simulated remote import failure/
  );
  assert.equal(
    existsSync(failedImportSnapshotPath),
    false,
    "failed remote imports must still remove the verified restore snapshot"
  );

  const racedCalls = [];
  assert.throws(
    () => main({
      argv: ["--file", backupPath, "--evidence", evidencePath],
      environment,
      config,
      values,
      runWrangler(args) {
        racedCalls.push(args);
        if (args[0] === "d1" && args[1] === "info") {
          return { stdout: JSON.stringify({ name: restoreName, uuid: restoreId }) };
        }
        if (args.includes("--command")) {
          writeFileSync(backupPath, "-- changed during remote preflight\n", { mode: 0o600 });
          return { stdout: JSON.stringify([{ results: [{ tables: 0 }] }]) };
        }
        throw new Error("A mutated backup must never reach a remote write.");
      }
    }),
    /Backup SHA-256 verification failed/,
    "mutation between validation and the first remote write must fail closed"
  );
  assert.equal(racedCalls.length, 2);
  assert.equal(racedCalls.some((args) => args.includes("--file")), false);

  writeFileSync(backupPath, originalBytes, { mode: 0o600 });
  writeVerificationArtifacts();
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
