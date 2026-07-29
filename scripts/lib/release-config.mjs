import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const workerDirectory = resolve(repositoryRoot, "apps", "worker");
export const workerConfigPath = resolve(workerDirectory, "wrangler.jsonc");
export const unsetDatabaseId = "00000000-0000-0000-0000-000000000000";
export const canonicalHostnames = new Set([
  "distilled.news",
  "www.distilled.news",
  "lownoise.news",
  "www.lownoise.news"
]);

export function readWorkerConfig(path = workerConfigPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function environmentConfig(config, environment) {
  if (!["staging", "production"].includes(environment)) {
    throw new Error(`Unsupported environment "${environment}". Use staging or production.`);
  }
  const selected = config.env?.[environment];
  if (!selected) throw new Error(`Wrangler environment "${environment}" is missing.`);
  return selected;
}

export function d1Binding(environment) {
  const binding = environment.d1_databases?.find((candidate) => candidate.binding === "DB");
  if (!binding) throw new Error("The DB binding is missing from the selected environment.");
  return binding;
}

export function queueNames(environment) {
  return [
    ...(environment.queues?.producers ?? []).map((queue) => queue.queue),
    ...(environment.queues?.consumers ?? []).map((queue) => queue.queue)
  ];
}

export function assertIsolatedStaging(config, options = {}) {
  const staging = environmentConfig(config, "staging");
  const production = environmentConfig(config, "production");
  const stagingDb = d1Binding(staging);
  const productionDb = d1Binding(production);
  const failures = [];

  if (!/staging/i.test(staging.name ?? "")) failures.push("staging Worker name is not visibly staging-only");
  if (!/staging/i.test(stagingDb.database_name ?? "")) failures.push("staging D1 name is not visibly staging-only");
  if (!options.allowUnsetDatabaseId && (!stagingDb.database_id || stagingDb.database_id === unsetDatabaseId)) {
    failures.push("staging D1 ID is unset");
  }
  if (staging.name === production.name) failures.push("staging and production Worker names match");
  if (stagingDb.database_name === productionDb.database_name) failures.push("staging and production D1 names match");
  if (stagingDb.database_id === productionDb.database_id) failures.push("staging and production D1 IDs match");

  const stagingBucket = staging.r2_buckets?.find((bucket) => bucket.binding === "RAW_ARCHIVE")?.bucket_name;
  const productionBucket = production.r2_buckets?.find((bucket) => bucket.binding === "RAW_ARCHIVE")?.bucket_name;
  if (!/staging/i.test(stagingBucket ?? "")) failures.push("staging R2 bucket is not visibly staging-only");
  if (stagingBucket === productionBucket) failures.push("staging and production R2 buckets match");

  const productionQueues = new Set(queueNames(production));
  for (const queue of queueNames(staging)) {
    if (!/staging/i.test(queue)) failures.push(`staging queue "${queue}" is not visibly staging-only`);
    if (productionQueues.has(queue)) failures.push(`staging queue "${queue}" matches production`);
  }

  const baseUrl = options.baseUrl ?? staging.vars?.PUBLIC_WEB_BASE_URL;
  if (baseUrl) {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (canonicalHostnames.has(hostname)) failures.push(`staging URL resolves to canonical host "${hostname}"`);
    for (const route of production.routes ?? []) {
      if (route.pattern === hostname) failures.push(`staging URL matches production route "${hostname}"`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Staging isolation guard refused the operation:\n- ${failures.join("\n- ")}`);
  }

  return { staging, production, stagingDb, productionDb, baseUrl };
}

export function parseEnvFile(path) {
  const values = new Map();
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    values.set(trimmed.slice(0, index), parseEnvValue(trimmed.slice(index + 1)));
  }
  return values;
}

export function parseSecretsFile(path) {
  const resolved = resolve(path);
  const stat = statSync(resolved);
  if (!stat.isFile()) throw new Error(`Secrets path is not a regular file: ${resolved}`);
  if (stat.size <= 0 || stat.size > 64 * 1024) {
    throw new Error(`Secrets file must be between 1 byte and 64 KiB: ${resolved}`);
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(`Secrets file permissions must not grant group/other access: ${resolved}`);
  }

  const source = readFileSync(resolved, "utf8");
  const trimmed = source.trim();
  if (trimmed.startsWith("{")) {
    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      throw new Error(`Secrets file is not valid JSON: ${resolved}`);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`Wrangler JSON secrets must be a top-level object: ${resolved}`);
    }
    const values = new Map();
    for (const [key, value] of Object.entries(payload)) {
      assertSecretEntry(key, value, resolved);
      values.set(key, value);
    }
    if (values.size === 0) throw new Error(`Secrets file is empty: ${resolved}`);
    return values;
  }

  const values = new Map();
  for (const [lineNumber, line] of source.split(/\r?\n/).entries()) {
    const candidate = line.trim();
    if (!candidate || candidate.startsWith("#")) continue;
    const index = candidate.indexOf("=");
    if (index <= 0) {
      throw new Error(`Invalid dotenv secret at ${resolved}:${lineNumber + 1}`);
    }
    const key = candidate.slice(0, index).trim();
    const value = parseEnvValue(candidate.slice(index + 1));
    assertSecretEntry(key, value, resolved);
    if (values.has(key)) throw new Error(`Duplicate secret ${key} in ${resolved}`);
    values.set(key, value);
  }
  if (values.size === 0) throw new Error(`Secrets file is empty: ${resolved}`);
  return values;
}

export function combinedEnvironment(environment) {
  const values = new Map();
  for (const path of [
    resolve(repositoryRoot, ".env"),
    resolve(repositoryRoot, `.env.${environment}`)
  ]) {
    for (const [key, value] of parseEnvFile(path)) values.set(key, value);
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) values.set(key, value);
  }
  return values;
}

export function usableValue(value) {
  const normalized = String(value ?? "").trim();
  const hasAnglePlaceholder = Array.from(normalized.matchAll(/<([^>]*)>/g))
    .some((match) => !/^[^@\s]+@[^@\s]+$/.test(match[1]));
  return Boolean(
    normalized &&
    !hasAnglePlaceholder &&
    !/(?:fill|replace)[-_ ]?(?:me|this|value)/i.test(normalized)
  );
}

export function wranglerPath() {
  return resolve(
    workerDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler"
  );
}

export function runWrangler(arguments_, options = {}) {
  const result = spawnSync(
    wranglerPath(),
    [...arguments_, "--config", workerConfigPath],
    {
      cwd: workerDirectory,
      encoding: options.encoding ?? "utf8",
      stdio: options.stdio ?? (options.capture ? "pipe" : "inherit"),
      input: options.input,
      env: options.env ?? process.env
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`Wrangler command failed (${result.status}).${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

export function requiredConfirmation(environment, purpose) {
  return `distilled-news:${environment}:${purpose}`;
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function assertSecretEntry(key, value, path) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(key)) {
    throw new Error(`Invalid secret name "${key}" in ${path}`);
  }
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`Secret ${key} must be a nonempty string in ${path}`);
  }
}
