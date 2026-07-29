#!/usr/bin/env node

import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  observationDirectory as defaultObservationDirectory
} from "./observation-window.mjs";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_STATE_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_BUNDLE_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const ALLOWED_FILE = /^(?:window\.json|observations\.ndjson|production-attestation\.txt|observation-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json)$/;

export function createStateBundle({
  directory = defaultObservationDirectory,
  key,
  releaseSha,
  now = new Date()
}) {
  assertKey(key);
  assertReleaseSha(releaseSha);
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
    throw new Error("Canary observation state directory is missing.");
  }

  const names = readdirSync(directory).sort();
  if (names.length === 0 || names.length > MAX_FILES) {
    throw new Error("Canary observation state has an invalid file count.");
  }

  let totalBytes = 0;
  const files = names.map((name) => {
    assertAllowedName(name);
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Canary state entry is not a regular file: ${name}`);
    }
    if (stat.size < 0 || stat.size > MAX_FILE_BYTES) {
      throw new Error(`Canary state entry exceeds its size limit: ${name}`);
    }
    totalBytes += stat.size;
    if (totalBytes > MAX_STATE_BYTES) {
      throw new Error("Canary observation state exceeds its total size limit.");
    }
    const content = readFileSync(path);
    return {
      name,
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
      content: content.toString("base64")
    };
  });

  validateStateFiles(files, releaseSha);
  const payload = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    releaseSha,
    createdAt: now.toISOString(),
    files
  })).toString("base64url");

  return JSON.stringify({
    algorithm: "HS256",
    payload,
    signature: createHmac("sha256", key).update(payload).digest("base64url")
  });
}

export function restoreStateBundle({
  input,
  directory = defaultObservationDirectory,
  key,
  releaseSha,
  now = new Date()
}) {
  assertKey(key);
  assertReleaseSha(releaseSha);
  const encoded = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  if (encoded.length === 0 || encoded.length > MAX_BUNDLE_BYTES) {
    throw new Error("Canary state bundle has an invalid size.");
  }

  let envelope;
  let payload;
  try {
    envelope = JSON.parse(encoded.toString("utf8"));
    payload = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Canary state bundle is not valid signed JSON.");
  }
  if (
    envelope.algorithm !== "HS256" ||
    typeof envelope.payload !== "string" ||
    typeof envelope.signature !== "string"
  ) {
    throw new Error("Canary state bundle envelope is invalid.");
  }

  const expected = createHmac("sha256", key).update(envelope.payload).digest();
  const provided = Buffer.from(envelope.signature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Canary state bundle signature is invalid.");
  }

  const createdAt = Date.parse(payload.createdAt);
  const age = now.getTime() - createdAt;
  if (
    payload.schemaVersion !== 1 ||
    payload.releaseSha !== releaseSha ||
    !Number.isFinite(createdAt) ||
    age < -5 * 60 * 1000 ||
    age > MAX_BUNDLE_AGE_MS ||
    !Array.isArray(payload.files) ||
    payload.files.length === 0 ||
    payload.files.length > MAX_FILES
  ) {
    throw new Error("Canary state bundle metadata is invalid.");
  }

  validateStateFiles(payload.files, releaseSha);
  if (existsSync(directory)) {
    throw new Error("Canary observation state already exists; refusing to overwrite it.");
  }
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  for (const file of payload.files) {
    const content = decodeStateFile(file);
    writeFileSync(resolve(directory, file.name), content, {
      mode: 0o600,
      flag: "wx"
    });
  }

  return {
    createdAt: payload.createdAt,
    files: payload.files.length,
    releaseSha: payload.releaseSha
  };
}

function validateStateFiles(files, releaseSha) {
  const names = new Set();
  const contents = new Map();
  let totalBytes = 0;
  let window;
  let observations;

  for (const file of files) {
    if (!file || typeof file !== "object") throw new Error("Canary state file entry is invalid.");
    assertAllowedName(file.name);
    if (names.has(file.name)) throw new Error(`Duplicate canary state entry: ${file.name}`);
    names.add(file.name);
    const content = decodeStateFile(file);
    contents.set(file.name, content);
    totalBytes += content.length;
    if (totalBytes > MAX_STATE_BYTES) throw new Error("Canary state exceeds its total size limit.");
    if (file.name === "window.json") window = content;
    if (file.name === "observations.ndjson") observations = content;
  }

  if (!window || !observations) {
    throw new Error("Canary state bundle must include window.json and observations.ndjson.");
  }

  let parsedWindow;
  try {
    parsedWindow = JSON.parse(window.toString("utf8"));
  } catch {
    throw new Error("Canary state window is invalid JSON.");
  }
  if (
    parsedWindow.releaseSha !== releaseSha ||
    !parsedWindow.versionId ||
    !Number.isFinite(Date.parse(parsedWindow.startedAt))
  ) {
    throw new Error("Canary state window does not match the frozen release.");
  }

  let matchingObservation = false;
  const parsedObservations = [];
  for (const line of observations.toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let observation;
    try {
      observation = JSON.parse(line);
    } catch {
      throw new Error("Canary observation history contains invalid JSON.");
    }
    parsedObservations.push(observation);
    if (
      observation.window?.releaseSha === parsedWindow.releaseSha &&
      observation.window?.versionId === parsedWindow.versionId &&
      observation.window?.startedAt === parsedWindow.startedAt
    ) {
      matchingObservation = true;
    }
  }
  if (!matchingObservation) {
    validateCriticalResetTransition({
      activeWindow: parsedWindow,
      observations: parsedObservations,
      contents
    });
  }
}

function validateCriticalResetTransition({ activeWindow, observations, contents }) {
  const reset = activeWindow.resetFrom;
  const criticalGates = reset?.criticalGates;
  if (
    !reset ||
    typeof reset !== "object" ||
    !Array.isArray(criticalGates) ||
    criticalGates.length === 0 ||
    criticalGates.some((name) => typeof name !== "string" || !/^[a-z0-9-]+$/.test(name)) ||
    new Set(criticalGates).size !== criticalGates.length
  ) {
    throw new Error("Canary state has no observation for its active release window.");
  }

  const expectedReason = `critical-gate-failure:${criticalGates.join(",")}`;
  const expectedFile = `observation-${String(reset.observedAt).replace(/[:.]/g, "-")}.json`;
  const resetAt = Date.parse(activeWindow.startedAt);
  const observedAt = Date.parse(reset.observedAt);
  const priorWindowStartedAt = Date.parse(reset.window?.startedAt);
  if (
    activeWindow.reason !== expectedReason ||
    reset.observationFile !== expectedFile ||
    !Number.isFinite(resetAt) ||
    !Number.isFinite(observedAt) ||
    resetAt < observedAt ||
    resetAt - observedAt > 15 * 60 * 1000 ||
    !Number.isFinite(priorWindowStartedAt) ||
    priorWindowStartedAt > observedAt ||
    reset.window?.releaseSha !== activeWindow.releaseSha ||
    reset.window?.versionId !== activeWindow.versionId
  ) {
    throw new Error("Canary critical-reset metadata is invalid.");
  }

  const failedObservation = observations.find((observation) =>
    observation?.observedAt === reset.observedAt &&
    observation.window?.startedAt === reset.window.startedAt &&
    observation.window?.releaseSha === reset.window.releaseSha &&
    observation.window?.versionId === reset.window.versionId
  );
  const failedGateNames = new Set(
    (failedObservation?.gates ?? [])
      .filter((gate) => gate?.passed === false)
      .map((gate) => gate.name)
  );
  if (
    failedObservation?.passed !== false ||
    criticalGates.some((name) => !failedGateNames.has(name))
  ) {
    throw new Error("Canary critical-reset state has no matching failed observation.");
  }

  const evidence = contents.get(reset.observationFile);
  let evidenceObservation;
  try {
    evidenceObservation = JSON.parse(evidence?.toString("utf8") ?? "");
  } catch {
    throw new Error("Canary critical-reset observation file is invalid.");
  }
  if (JSON.stringify(evidenceObservation) !== JSON.stringify(failedObservation)) {
    throw new Error("Canary critical-reset evidence does not match observation history.");
  }
}

function decodeStateFile(file) {
  if (
    typeof file.name !== "string" ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    file.size > MAX_FILE_BYTES ||
    !/^[a-f0-9]{64}$/i.test(file.sha256 ?? "") ||
    typeof file.content !== "string"
  ) {
    throw new Error(`Canary state entry metadata is invalid: ${file.name ?? "unknown"}`);
  }
  const content = Buffer.from(file.content, "base64");
  if (
    content.length !== file.size ||
    content.toString("base64") !== file.content ||
    createHash("sha256").update(content).digest("hex") !== file.sha256
  ) {
    throw new Error(`Canary state entry integrity failed: ${file.name}`);
  }
  return content;
}

function assertAllowedName(name) {
  if (typeof name !== "string" || !ALLOWED_FILE.test(name)) {
    throw new Error(`Canary state contains a disallowed path: ${String(name)}`);
  }
}

function assertKey(key) {
  if (typeof key !== "string" || key.length < 32) {
    throw new Error("CANARY_STATE_HMAC_KEY must be at least 32 characters.");
  }
}

function assertReleaseSha(releaseSha) {
  if (!/^[a-f0-9]{40,64}$/i.test(releaseSha ?? "")) {
    throw new Error("CANARY_RELEASE_SHA must be the full frozen release SHA.");
  }
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const mode = process.argv[2];
  const key = process.env.CANARY_STATE_HMAC_KEY ?? "";
  const releaseSha = process.env.CANARY_RELEASE_SHA ?? "";
  if (mode === "pack") {
    const output = optionValue("--output");
    if (!output) throw new Error("Usage: state-bundle.mjs pack --output <path>");
    writeFileSync(resolve(output), `${createStateBundle({ key, releaseSha })}\n`, {
      mode: 0o600,
      flag: "wx"
    });
    console.log("Signed canary evidence bundle created.");
    return;
  }
  if (mode === "restore") {
    const input = optionValue("--input");
    if (!input) throw new Error("Usage: state-bundle.mjs restore --input <path>");
    const result = restoreStateBundle({
      input: readFileSync(resolve(input)),
      key,
      releaseSha
    });
    console.log(`Verified canary evidence bundle restored (${result.files} files).`);
    return;
  }
  throw new Error("Usage: state-bundle.mjs pack|restore --input|--output <path>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
