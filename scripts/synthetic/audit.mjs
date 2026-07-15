import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const auditSql = await readFile(resolve(scriptDirectory, "audit.sql"), "utf8");

// audit.sql intentionally contains only standalone SELECT statements. Running
// them one at a time is slower than --file, but Cloudflare's --file mode only
// returns execution metadata and hides the result rows this audit must expose.
const statements = auditSql
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.replace(/^--.*(?:\r?\n|$)/gm, "").trim())
  .filter((statement) => statement.length > 0);

if (statements.length === 0) {
  throw new Error("Synthetic canary audit contains no SQL statements.");
}

const wrangler = resolve(
  repositoryRoot,
  "apps",
  "worker",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler"
);

for (const [index, statement] of statements.entries()) {
  const { stdout } = await execFileAsync(
    wrangler,
    [
      "d1",
      "execute",
      "lownoise",
      "--config",
      "apps/worker/wrangler.toml",
      "--remote",
      "--json",
      "--command",
      statement
    ],
    { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024 }
  );

  const response = JSON.parse(stdout);
  const result = response[0];
  if (!result?.success) {
    throw new Error(`Synthetic canary audit query ${index + 1} failed.`);
  }

  console.log(`\n--- canary audit ${index + 1}/${statements.length} ---`);
  console.log(JSON.stringify(result.results ?? [], null, 2));
}
