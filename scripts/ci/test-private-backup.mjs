#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
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

  const tampered = Buffer.from(readFileSync(encrypted));
  tampered[Math.floor(tampered.length / 2)] ^= 1;
  const tamperedPath = resolve(root, "tampered.enc");
  writeFileSync(tamperedPath, tampered, { mode: 0o600 });
  await assert.rejects(
    decryptFile(tamperedPath, resolve(root, "tampered.sql"), key),
    /authentication or decryption failed/
  );
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
