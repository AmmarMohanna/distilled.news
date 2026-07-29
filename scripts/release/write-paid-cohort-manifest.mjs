#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readProtectedPaidCohortManifest } from "../lib/paid-cohort-control.mjs";

const output = optionValue("--output");
const githubEnv = optionValue("--github-env");
const source = process.env.PRODUCTION_PAID_COHORT_MANIFEST ?? "";
if (!output || !githubEnv) {
  throw new Error("Usage: write-paid-cohort-manifest.mjs --output <path> --github-env <path>");
}
if (!source.trim()) {
  throw new Error("Protected production environment secret PRODUCTION_PAID_COHORT_MANIFEST is required.");
}

const path = resolve(output);
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
writeFileSync(path, source, { encoding: "utf8", mode: 0o600, flag: "wx" });
readProtectedPaidCohortManifest(path);
appendFileSync(resolve(githubEnv), `PAID_COHORT_MANIFEST_FILE=${path}\n`);
console.log("Protected paid-cohort manifest passed strict shape, digest, and permission validation.");

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
