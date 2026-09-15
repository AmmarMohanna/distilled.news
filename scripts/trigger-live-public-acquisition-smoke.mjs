import { spawnSync } from "node:child_process";

const argumentsFromCli = process.argv.slice(2);
if (argumentsFromCli[0] === "--") argumentsFromCli.shift();
const [candidateUrlValue, idempotencyKey] = argumentsFromCli;
if (!candidateUrlValue || !idempotencyKey) {
  console.error("usage: node scripts/trigger-live-public-acquisition-smoke.mjs <https-url> <idempotency-key>");
  process.exit(2);
}
const candidateUrl = new URL(candidateUrlValue);
if (candidateUrl.protocol !== "https:") throw new Error("candidate URL must use HTTPS");
if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(idempotencyKey)) {
  throw new Error("idempotency key must be 8-128 URL-safe characters");
}

const requestId = `live_smoke_${idempotencyKey}`;
const createdAt = new Date().toISOString();
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sql = `INSERT OR IGNORE INTO web_operator_live_smoke_requests
  (request_id,idempotency_key,candidate_url,state,created_at)
  VALUES (${quote(requestId)},${quote(idempotencyKey)},${quote(candidateUrl.toString())},'pending',${quote(createdAt)});`;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, [
  "--filter", "@distilled/worker", "exec", "wrangler", "d1", "execute", "lownoise", "--remote", "--command", sql
], { cwd: new URL("..", import.meta.url), stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(JSON.stringify({ requestId, idempotencyKey, candidateUrl: candidateUrl.toString() }));
