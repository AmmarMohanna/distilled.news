#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("DSBKUP01", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + NONCE_BYTES;

export function decodeEncryptionKey(value) {
  const candidate = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be an unpadded 43-character base64url value encoding exactly 32 random bytes."
    );
  }
  if (new Set(candidate).size < 16) {
    throw new Error("BACKUP_ENCRYPTION_KEY lacks the diversity expected from a generated 32-byte key.");
  }
  const key = Buffer.from(candidate, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== candidate) {
    throw new Error("BACKUP_ENCRYPTION_KEY is not canonical 32-byte base64url.");
  }
  return key;
}

export async function encryptFile(inputPath, outputPath, key, nonce = randomBytes(NONCE_BYTES)) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  assertReadableFile(input);
  if (existsSync(output)) throw new Error(`Encrypted output already exists: ${output}`);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
    throw new Error(`AES-256-GCM requires a ${NONCE_BYTES}-byte nonce.`);
  }

  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const partial = `${output}.partial-${process.pid}`;
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  try {
    writeFileSync(partial, Buffer.concat([MAGIC, nonce]), { mode: 0o600, flag: "wx" });
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(partial, { flags: "a", mode: 0o600 })
    );
    appendFileSync(partial, cipher.getAuthTag(), { mode: 0o600 });
    renameSync(partial, output);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}

export async function decryptFile(inputPath, outputPath, key) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  assertReadableFile(input);
  if (existsSync(output)) throw new Error(`Decrypted output already exists: ${output}`);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");

  const size = statSync(input).size;
  if (size <= HEADER_BYTES + TAG_BYTES) throw new Error("Encrypted backup is truncated.");
  const descriptor = openSync(input, "r");
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    if (readSync(descriptor, header, 0, HEADER_BYTES, 0) !== HEADER_BYTES ||
      readSync(descriptor, tag, 0, TAG_BYTES, size - TAG_BYTES) !== TAG_BYTES) {
      throw new Error("Encrypted backup header or authentication tag is truncated.");
    }
  } finally {
    closeSync(descriptor);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Encrypted backup format marker is invalid.");
  }
  const nonce = header.subarray(MAGIC.length, HEADER_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);

  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  try {
    await pipeline(
      createReadStream(input, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(output, { mode: 0o600, flags: "wx" })
    );
  } catch (error) {
    rmSync(output, { force: true });
    throw new Error(`Encrypted backup authentication or decryption failed: ${error.message}`);
  }
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resolve(path))) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const input = optionValue("--file");
  const output = optionValue("--output");
  const evidence = optionValue("--evidence");
  if (!input || !output || !evidence) {
    throw new Error("Usage: encrypt-d1.mjs --file export.sql --output export.sql.enc --evidence evidence.json");
  }
  const resolvedInput = resolve(input);
  const resolvedOutput = resolve(output);
  if (!resolvedInput.endsWith(".sql") || !resolvedOutput.endsWith(".enc")) {
    throw new Error("Backup encryption requires a .sql input and .enc output.");
  }

  const key = decodeEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "distilled-backup-decrypt-check-"));
  const restored = resolve(temporaryRoot, basename(resolvedInput));
  try {
    await encryptFile(resolvedInput, resolvedOutput, key);
    await decryptFile(resolvedOutput, restored, key);
    const [plaintextSha256, restoredSha256, encryptedSha256] = await Promise.all([
      sha256File(resolvedInput),
      sha256File(restored),
      sha256File(resolvedOutput)
    ]);
    if (plaintextSha256 !== restoredSha256) {
      throw new Error("Encrypted backup decrypt verification did not reproduce the export.");
    }
    const payload = {
      schemaVersion: 1,
      verifiedAt: new Date().toISOString(),
      releaseSha: process.env.RELEASE_SHA ?? null,
      algorithm: "AES-256-GCM",
      format: "DSBKUP01",
      plaintextSha256,
      encryptedSha256,
      plaintextBytes: statSync(resolvedInput).size,
      encryptedBytes: statSync(resolvedOutput).size,
      authenticatedDecryptVerified: true
    };
    const evidencePath = resolve(evidence);
    mkdirSync(dirname(evidencePath), { recursive: true, mode: 0o700 });
    writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    console.log(`Authenticated backup encryption verified. Evidence: ${evidencePath}`);
  } finally {
    key.fill(0);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertReadableFile(path) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error(`Backup input must be a non-empty regular file: ${path}`);
  }
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
