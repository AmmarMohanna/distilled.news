#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import {
  constants,
  createReadStream,
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import {
  assertOpenFileUnchanged,
  openRegularFileForRead
} from "./safe-files.mjs";

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
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
    throw new Error(`AES-256-GCM requires a ${NONCE_BYTES}-byte nonce.`);
  }

  const source = openRegularFileForRead(input, {
    message: `Backup input must be a non-empty regular file: ${input}`
  });
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const temporaryRoot = mkdtempSync(resolve(dirname(output), ".distilled-encrypt-"));
  const partial = resolve(temporaryRoot, "payload.enc");
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  let destination;
  try {
    destination = openSync(
      partial,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600
    );
    let position = writeBufferSync(destination, Buffer.concat([MAGIC, nonce]), 0);
    await pipeline(
      createReadStream(source.path, {
        fd: source.descriptor,
        autoClose: false,
        start: 0,
        end: source.size - 1
      }),
      cipher,
      descriptorWritable(destination, position)
    );
    assertOpenFileUnchanged(
      source,
      `Backup input changed while it was being encrypted: ${input}`
    );
    position += source.size;
    writeBufferSync(destination, cipher.getAuthTag(), position);
    fsyncSync(destination);
    closeSync(destination);
    destination = undefined;
    publishPrivateOutput(partial, output, "Encrypted");
  } catch (error) {
    throw error;
  } finally {
    if (destination !== undefined) closeSync(destination);
    closeSync(source.descriptor);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function decryptFile(inputPath, outputPath, key) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");

  const source = openRegularFileForRead(input, {
    message: `Backup input must be a non-empty regular file: ${input}`
  });
  const size = source.size;
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    if (size <= HEADER_BYTES + TAG_BYTES) throw new Error("Encrypted backup is truncated.");
    if (readExactSync(source.descriptor, header, 0) !== HEADER_BYTES ||
      readExactSync(source.descriptor, tag, size - TAG_BYTES) !== TAG_BYTES) {
      throw new Error("Encrypted backup header or authentication tag is truncated.");
    }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("Encrypted backup format marker is invalid.");
    }
    const nonce = header.subarray(MAGIC.length, HEADER_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);

    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    const temporaryRoot = mkdtempSync(resolve(dirname(output), ".distilled-decrypt-"));
    const partial = resolve(temporaryRoot, "payload.sql");
    let destination;
    try {
      destination = openSync(
        partial,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600
      );
      await pipeline(
        createReadStream(source.path, {
          fd: source.descriptor,
          autoClose: false,
          start: HEADER_BYTES,
          end: size - TAG_BYTES - 1
        }),
        decipher,
        descriptorWritable(destination, 0)
      );
      assertOpenFileUnchanged(
        source,
        `Encrypted backup changed while it was being decrypted: ${input}`
      );
      fsyncSync(destination);
      closeSync(destination);
      destination = undefined;
      publishPrivateOutput(partial, output, "Decrypted");
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Decrypted output already exists:") ||
          error.message.startsWith("Encrypted backup changed while"))
      ) {
        throw error;
      }
      throw new Error(`Encrypted backup authentication or decryption failed: ${error.message}`, {
        cause: error
      });
    } finally {
      if (destination !== undefined) closeSync(destination);
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  } finally {
    closeSync(source.descriptor);
  }
}

export async function sha256File(path) {
  return (await sha256FileDetails(path)).digest;
}

async function sha256FileDetails(path) {
  const resolvedPath = resolve(path);
  const source = openRegularFileForRead(resolvedPath, {
    message: `Backup input must be a non-empty regular file: ${resolvedPath}`
  });
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(source.path, {
      fd: source.descriptor,
      autoClose: false,
      start: 0,
      end: source.size - 1
    })) {
      hash.update(chunk);
    }
    assertOpenFileUnchanged(
      source,
      `Backup input changed while it was being hashed: ${resolvedPath}`
    );
    return {
      digest: hash.digest("hex"),
      size: source.size
    };
  } finally {
    closeSync(source.descriptor);
  }
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
    const [plaintext, restoredCopy, encrypted] = await Promise.all([
      sha256FileDetails(resolvedInput),
      sha256FileDetails(restored),
      sha256FileDetails(resolvedOutput)
    ]);
    if (plaintext.digest !== restoredCopy.digest) {
      throw new Error("Encrypted backup decrypt verification did not reproduce the export.");
    }
    const payload = {
      schemaVersion: 1,
      verifiedAt: new Date().toISOString(),
      releaseSha: process.env.RELEASE_SHA ?? null,
      algorithm: "AES-256-GCM",
      format: "DSBKUP01",
      plaintextSha256: plaintext.digest,
      encryptedSha256: encrypted.digest,
      plaintextBytes: plaintext.size,
      encryptedBytes: encrypted.size,
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

function descriptorWritable(descriptor, start) {
  let position = start;
  return new Writable({
    write(chunk, _encoding, callback) {
      try {
        position = writeBufferSync(descriptor, chunk, position);
        callback();
      } catch (error) {
        callback(error);
      }
    }
  });
}

function writeBufferSync(descriptor, buffer, start) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const written = writeSync(
      descriptor,
      buffer,
      offset,
      buffer.byteLength - offset,
      start + offset
    );
    if (written <= 0) throw new Error("Backup file write made no progress.");
    offset += written;
  }
  return start + offset;
}

function readExactSync(descriptor, buffer, start) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const bytesRead = readSync(
      descriptor,
      buffer,
      offset,
      buffer.byteLength - offset,
      start + offset
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset;
}

function publishPrivateOutput(partial, output, label) {
  try {
    linkSync(partial, output);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`${label} output already exists: ${output}`, { cause: error });
    }
    throw error;
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
