#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputArgument = optionValue("--output");
const githubEnvPath = optionValue("--github-env");
const separator = process.argv.indexOf("--");
const names = separator >= 0 ? process.argv.slice(separator + 1) : [];
if (!outputArgument || names.length === 0) {
  throw new Error(
    "Usage: write-secrets-file.mjs --output <path> [--github-env <path>] -- SECRET_NAME..."
  );
}

const payload = {};
for (const name of names) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(name)) throw new Error(`Invalid secret name "${name}".`);
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Protected environment secret ${name} is missing.`);
  }
  payload[name] = value;
}

const outputPath = resolve(outputArgument);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
if (githubEnvPath) appendFileSync(githubEnvPath, `WRANGLER_SECRETS_FILE=${outputPath}\n`);
console.log(`Prepared an ephemeral Wrangler secrets file with ${names.length} protected bindings.`);

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
