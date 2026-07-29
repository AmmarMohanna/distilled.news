#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { repositoryRoot } from "../lib/release-config.mjs";

const files = collect(resolve(repositoryRoot, "scripts")).filter((path) => extname(path) === ".mjs");
const failures = [];

for (const path of files) {
  const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (syntax.status !== 0) {
    failures.push(`${path}: ${syntax.stderr.trim() || "syntax check failed"}`);
    continue;
  }

  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g)) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (specifier.startsWith(".")) {
      const resolved = fileURLToPath(new URL(specifier, pathToFileURL(path)));
      if (!existsSync(resolved)) failures.push(`${path}: local import does not exist: ${specifier}`);
      continue;
    }
    if (!specifier.startsWith("node:")) continue;
    const namespace = await import(specifier);
    const named = clause.match(/\{([\s\S]*?)\}/)?.[1] ?? "";
    for (const part of named.split(",").map((value) => value.trim()).filter(Boolean)) {
      const imported = part.split(/\s+as\s+/)[0].trim();
      if (!(imported in namespace)) {
        failures.push(`${path}: ${specifier} does not export ${imported}`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`Validated syntax and imports for ${files.length} release/operations scripts.`);
}

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collect(path) : [path];
  });
}
