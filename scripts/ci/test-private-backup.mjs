#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  decodeEncryptionKey,
  decryptFile,
  encryptFile
} from "../backup/encrypt-d1.mjs";
import {
  productionBackupBucket,
  productionBackupLifecycleRule,
  productionBackupPrefix,
  productionBackupRetentionSeconds,
  validatePrivateStoreState
} from "../backup/private-store.mjs";

const keyText = randomBytes(32).toString("base64url");
assert.equal(decodeEncryptionKey(keyText).length, 32);
assert.throws(() => decodeEncryptionKey("human-password"), /43-character base64url/);
assert.throws(() => decodeEncryptionKey("A".repeat(43)), /diversity/);

const root = mkdtempSync(resolve(tmpdir(), "distilled-private-backup-test-"));
try {
  const input = resolve(root, "fixture.sql");
  const encrypted = resolve(root, "fixture.sql.enc");
  const restored = resolve(root, "restored.sql");
  writeFileSync(input, "CREATE TABLE example (id TEXT);\\n", { mode: 0o600 });
  const key = decodeEncryptionKey(keyText);
  await encryptFile(input, encrypted, key, Buffer.alloc(12, 7));
  await decryptFile(encrypted, restored, key);
  assert.deepEqual(readFileSync(restored), readFileSync(input));
  if (process.platform !== "win32") {
    assert.equal(statSync(encrypted).mode & 0o777, 0o600);
    assert.equal(statSync(restored).mode & 0o777, 0o600);
  }

  const tampered = Buffer.from(readFileSync(encrypted));
  tampered[Math.floor(tampered.length / 2)] ^= 1;
  const tamperedPath = resolve(root, "tampered.enc");
  writeFileSync(tamperedPath, tampered, { mode: 0o600 });
  await assert.rejects(
    decryptFile(tamperedPath, resolve(root, "tampered.sql"), key),
    /authentication or decryption failed/
  );

  const occupiedOutput = resolve(root, "occupied.enc");
  writeFileSync(occupiedOutput, "do not replace", { mode: 0o600 });
  await assert.rejects(
    encryptFile(input, occupiedOutput, key, Buffer.alloc(12, 8)),
    /Encrypted output already exists/
  );
  assert.equal(readFileSync(occupiedOutput, "utf8"), "do not replace");

  const occupiedRestore = resolve(root, "occupied.sql");
  writeFileSync(occupiedRestore, "do not replace", { mode: 0o600 });
  await assert.rejects(
    decryptFile(encrypted, occupiedRestore, key),
    /Decrypted output already exists/
  );
  assert.equal(readFileSync(occupiedRestore, "utf8"), "do not replace");

  if (process.platform !== "win32") {
    const linkedInput = resolve(root, "linked-input.sql");
    symlinkSync(input, linkedInput);
    await assert.rejects(
      encryptFile(linkedInput, resolve(root, "linked-input.enc"), key, Buffer.alloc(12, 9)),
      /Backup input must be a non-empty regular file/
    );

    const linkedEncrypted = resolve(root, "linked-encrypted.enc");
    symlinkSync(encrypted, linkedEncrypted);
    await assert.rejects(
      decryptFile(linkedEncrypted, resolve(root, "linked-restored.sql"), key),
      /Backup input must be a non-empty regular file/
    );
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const strongState = {
  bucket: { name: productionBackupBucket },
  managedDomain: { enabled: false },
  customDomains: { domains: [] },
  lifecycle: {
    rules: [{
      id: productionBackupLifecycleRule,
      enabled: true,
      conditions: { prefix: productionBackupPrefix },
      deleteObjectsTransition: {
        condition: { type: "Age", maxAge: productionBackupRetentionSeconds }
      }
    }]
  }
};
assert.equal(validatePrivateStoreState(strongState), true);
assert.throws(
  () => validatePrivateStoreState({ ...strongState, managedDomain: { enabled: true } }),
  /r2.dev public access/
);
assert.throws(
  () => validatePrivateStoreState({
    ...strongState,
    lifecycle: {
      rules: [{
        ...strongState.lifecycle.rules[0],
        deleteObjectsTransition: { condition: { type: "Age", maxAge: 31 * 24 * 60 * 60 } }
      }]
    }
  }),
  /30-day/
);

console.log("Private backup encryption, integrity, access, and lifecycle fixtures passed.");
