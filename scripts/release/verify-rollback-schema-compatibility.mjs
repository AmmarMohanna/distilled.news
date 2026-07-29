#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  repositoryRoot,
  workerDirectory
} from "../lib/release-config.mjs";

const contractPath = "scripts/release/rollback-schema-contract.test.ts";
const workerSourceDirectory = "apps/worker/src";
const coreDirectory = "packages/core/src";
const migrationsDirectory = resolve(repositoryRoot, "apps/worker/migrations");

export function verifyCurrentRollbackSchemaCompatibility() {
  return runCompatibilityContract({ source: "working-tree" });
}

export function verifyCapturedRollbackSchemaCompatibility(baselinePath) {
  const baseline = readBaseline(baselinePath);
  assertGitObject(baseline.releaseSha);
  return runCompatibilityContract({
    source: "git",
    releaseSha: baseline.releaseSha
  });
}

function runCompatibilityContract(identity) {
  const temporaryDirectory = mkdtempSync(
    resolve(workerDirectory, ".rollback-schema-contract-")
  );
  try {
    if (identity.source === "working-tree") {
      copyWorkingTree(temporaryDirectory);
    } else {
      copyGitTree(identity.releaseSha, temporaryDirectory);
    }
    const configPath = writeVitestConfig(temporaryDirectory);
    const vitestPath = resolve(
      workerDirectory,
      "node_modules/.bin",
      process.platform === "win32" ? "vitest.cmd" : "vitest"
    );
    if (!existsSync(vitestPath)) {
      throw new Error("Worker Vitest is unavailable; run pnpm install before the rollback contract.");
    }
    const result = spawnSync(
      vitestPath,
      ["run", "--config", configPath],
      {
        cwd: workerDirectory,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          ROLLBACK_FORWARD_MIGRATIONS_DIR: migrationsDirectory
        }
      }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Rollback schema compatibility contract failed for ${displayIdentity(identity)}.\n` +
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
      );
    }
    console.log(
      `Verified ${displayIdentity(identity)} repository code against all forward migrations.`
    );
    return {
      source: identity.source,
      releaseSha: identity.releaseSha ?? null
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function copyWorkingTree(target) {
  const workerTarget = resolve(target, "worker");
  cpSync(resolve(repositoryRoot, workerSourceDirectory), workerTarget, {
    recursive: true
  });
  cpSync(resolve(repositoryRoot, contractPath), resolve(workerTarget, "contract.test.ts"));
  cpSync(resolve(repositoryRoot, coreDirectory), resolve(target, "core"), {
    recursive: true
  });
}

function copyGitTree(releaseSha, target) {
  copyGitDirectory(
    releaseSha,
    workerSourceDirectory,
    resolve(target, "worker")
  );
  writeFileSync(
    resolve(target, "worker/contract.test.ts"),
    gitShow(releaseSha, contractPath)
  );
  copyGitDirectory(releaseSha, coreDirectory, resolve(target, "core"));
}

function copyGitDirectory(releaseSha, sourceDirectory, targetDirectory) {
  const files = git(
    ["ls-tree", "-r", "--name-only", releaseSha, "--", sourceDirectory],
    { capture: true }
  ).stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (files.length === 0) {
    throw new Error(`Captured release ${releaseSha} has no ${sourceDirectory} tree.`);
  }
  for (const source of files) {
    const destination = resolve(targetDirectory, relative(sourceDirectory, source));
    mkdirSync(resolve(destination, ".."), { recursive: true });
    writeFileSync(destination, gitShow(releaseSha, source));
  }
}

function writeVitestConfig(directory) {
  const configPath = resolve(directory, "vitest.config.ts");
  const coreIndex = JSON.stringify(resolve(directory, "core/index.ts"));
  const contractTest = JSON.stringify(resolve(directory, "worker/contract.test.ts"));
  writeFileSync(
    configPath,
    `import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@distilled/core": ${coreIndex} } },
  test: {
    environment: "node",
    globals: true,
    include: [${contractTest}],
    testTimeout: 30_000
  }
});
`
  );
  return configPath;
}

function readBaseline(path) {
  if (!path) {
    throw new Error(
      "Usage: verify-rollback-schema-compatibility.mjs --baseline <rollback-baseline.json>"
    );
  }
  const baseline = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (
    baseline?.schemaVersion !== 1 ||
    baseline?.registrationMode !== "closed" ||
    baseline?.d1RegistrationEnabled !== false
  ) {
    throw new Error(
      "Rollback baseline must prove schema version 1 with both registration gates closed."
    );
  }
  if (!/^[a-f0-9]{40}$/i.test(baseline.releaseSha ?? "")) {
    throw new Error("Rollback baseline does not contain an exact 40-character Git release SHA.");
  }
  return baseline;
}

function assertGitObject(releaseSha) {
  const result = git(["cat-file", "-e", `${releaseSha}^{commit}`], {
    allowFailure: true,
    capture: true
  });
  if (result.status !== 0) {
    throw new Error(
      `Captured release commit ${releaseSha} is not available locally. ` +
      "Fetch the exact commit before running the compatibility gate."
    );
  }
}

function gitShow(releaseSha, path) {
  const result = git(["show", `${releaseSha}:${path}`], {
    allowFailure: true,
    capture: true
  });
  if (result.status !== 0) {
    throw new Error(
      `Captured release ${releaseSha} does not contain ${path}. ` +
      "It is not eligible as a normal rollback target for forward migrations."
    );
  }
  return result.stdout;
}

function git(arguments_, options = {}) {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
  }
  return result;
}

function displayIdentity(identity) {
  return identity.source === "working-tree"
    ? "working-tree rollback"
    : `captured N-1 ${identity.releaseSha}`;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  verifyCapturedRollbackSchemaCompatibility(optionValue("--baseline"));
}
