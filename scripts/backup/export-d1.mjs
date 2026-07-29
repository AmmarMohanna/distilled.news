#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  repositoryRoot,
  runWrangler
} from "../lib/release-config.mjs";

const production = environmentConfig(readWorkerConfig(), "production");
const database = d1Binding(production);
const expected = `distilled-news:production:export:${database.database_id}`;

if (production.workers_dev !== false || production.preview_urls !== false) {
  throw new Error("Production export refused: production routing guard is invalid.");
}
if (process.env.CONFIRM_PRODUCTION_EXPORT !== expected) {
  throw new Error(`Set CONFIRM_PRODUCTION_EXPORT=${expected} to export the production D1 database.`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve(repositoryRoot, "backups", "production");
const outputPath = resolve(outputDirectory, `d1-${timestamp}.sql`);
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });

runWrangler([
  "d1", "export", "DB",
  "--remote",
  "--env", "production",
  "--skip-confirmation",
  "--output", outputPath
]);

const digest = createHash("sha256").update(readFileSync(outputPath)).digest("hex");
writeFileSync(`${outputPath}.sha256`, `${digest}  ${outputPath.split("/").at(-1)}\n`, { mode: 0o600 });
console.log(`Production D1 export written to ${outputPath}`);
console.log(`SHA-256: ${digest}`);
