#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWrangler } from "../lib/release-config.mjs";

for (const environment of ["staging", "production"]) {
  const output = mkdtempSync(join(tmpdir(), `distilled-${environment}-dry-run-`));
  try {
    console.log(`Dry-running ${environment} Worker bundle`);
    runWrangler([
      "deploy",
      "--dry-run",
      "--strict",
      "--env",
      environment,
      "--outdir",
      output
    ]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

console.log("Both named environments compiled. Nothing was uploaded.");
