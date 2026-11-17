import { spawnSync } from "node:child_process";

const argumentsFromCli=process.argv.slice(2);
if (argumentsFromCli[0]==="--") argumentsFromCli.shift();
const [idempotencyKey]=argumentsFromCli;
if (!idempotencyKey) {
  console.error("usage: node scripts/trigger-openrouter-model-diagnostic.mjs <idempotency-key>");
  process.exit(2);
}
if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(idempotencyKey)) {
  throw new Error("idempotency key must be 8-128 URL-safe characters");
}

const requestId=`openrouter_diagnostic_${idempotencyKey}`;
const createdAt=new Date().toISOString();
const quote=(value)=>`'${value.replaceAll("'","''")}'`;
const sql=`INSERT OR IGNORE INTO openrouter_model_diagnostic_requests (request_id,idempotency_key,state,created_at) VALUES (${quote(requestId)},${quote(idempotencyKey)},'pending',${quote(createdAt)})`;
const pnpmEntrypoint=process.env.npm_execpath;
if (!pnpmEntrypoint) throw new Error("run this operator command through the repository pnpm script");
const result=spawnSync(process.execPath,[pnpmEntrypoint,
  "--filter","@distilled/worker","exec","wrangler","d1","execute","lownoise","--remote","--command",sql
],{cwd:new URL("..",import.meta.url),stdio:"inherit"});
if (result.error) throw result.error;
if (result.status!==0) process.exit(result.status??1);
console.log(JSON.stringify({requestId,idempotencyKey}));
