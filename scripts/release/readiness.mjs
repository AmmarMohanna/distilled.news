#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { repositoryRoot } from "../lib/release-config.mjs";

const commands = [
  ["node", ["scripts/doctor.mjs", "--ci", "--environment", "production"]],
  ["pnpm", ["ci:scripts"]],
  ["node", ["scripts/release/static-readiness.mjs"]],
  ["pnpm", ["wrangler:types:check"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
  ["pnpm", ["build"]],
  ["pnpm", ["ci:migrations"]],
  ["pnpm", ["release:dry-run"]]
];

if (process.argv.includes("--e2e")) commands.push(["pnpm", ["test:e2e"]]);
if (process.argv.includes("--audit")) commands.push(["pnpm", ["audit:dependencies"]]);

for (const [command, args] of commands) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nRelease readiness passed. No Cloudflare state was changed.");
