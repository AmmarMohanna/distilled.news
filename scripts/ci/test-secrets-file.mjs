#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSecretsFile } from "../lib/release-config.mjs";

const directory = mkdtempSync(join(tmpdir(), "distilled-secrets-test-"));
try {
  const jsonPath = join(directory, "secrets.json");
  writeFileSync(jsonPath, JSON.stringify({
    ADMIN_SESSION_SECRET: "json-secret-value",
    OPENAI_API_KEY: "json-openai-value"
  }), { mode: 0o600 });
  assert.deepEqual(
    Object.fromEntries(parseSecretsFile(jsonPath)),
    {
      ADMIN_SESSION_SECRET: "json-secret-value",
      OPENAI_API_KEY: "json-openai-value"
    }
  );

  const dotenvPath = join(directory, "secrets.env");
  writeFileSync(
    dotenvPath,
    "ADMIN_SESSION_SECRET='dotenv secret value'\nOPENAI_API_KEY=dotenv-openai-value\n",
    { mode: 0o600 }
  );
  assert.equal(parseSecretsFile(dotenvPath).get("ADMIN_SESSION_SECRET"), "dotenv secret value");

  const nestedPath = join(directory, "nested.json");
  writeFileSync(nestedPath, JSON.stringify({ ADMIN_SESSION_SECRET: { unsafe: true } }), {
    mode: 0o600
  });
  assert.throws(() => parseSecretsFile(nestedPath), /nonempty string/);

  const duplicatePath = join(directory, "duplicate.env");
  writeFileSync(
    duplicatePath,
    "ADMIN_SESSION_SECRET=one\nADMIN_SESSION_SECRET=two\n",
    { mode: 0o600 }
  );
  assert.throws(() => parseSecretsFile(duplicatePath), /Duplicate secret/);

  if (process.platform !== "win32") {
    chmodSync(jsonPath, 0o644);
    assert.throws(() => parseSecretsFile(jsonPath), /permissions/);
  }

  console.log("Validated strict Wrangler JSON/dotenv secret-file handling.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
