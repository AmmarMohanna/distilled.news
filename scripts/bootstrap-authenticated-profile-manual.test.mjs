import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const script=fileURLToPath(new URL("./bootstrap-authenticated-profile-manual.mjs",import.meta.url));
const marker="SYNTHETIC_OPERATOR_SECRET_DO_NOT_LOG";
function run(args,environment={}){return spawnSync(process.execPath,[script,...args],{encoding:"utf8",env:{...process.env,...environment},timeout:30_000})}
test("manual bootstrap rejects unsupported secret arguments without echoing them",()=>{
  const result=run(["--password",marker]);assert.equal(result.status,2);assert.doesNotMatch(result.stdout+result.stderr,new RegExp(marker));
});
test("manual bootstrap suppresses debug output and malformed endpoint material",()=>{
  const result=run([],{WEB_OPERATOR_RUNTIME_URL:marker,WEB_OPERATOR_RUNTIME_TOKEN:marker,DEBUG:"pw:protocol",NODE_DEBUG:"http,https",PWDEBUG:"1"});
  assert.equal(result.status,1);assert.match(result.stderr,/Invalid operator endpoint configuration/);assert.doesNotMatch(result.stdout+result.stderr,new RegExp(marker));
});
test("manual bootstrap help is available without login or secret output",()=>{
  const result=run(["--help"],{WEB_OPERATOR_RUNTIME_TOKEN:marker});assert.equal(result.status,0);assert.match(result.stdout,/bootstrap:x:manual/);assert.doesNotMatch(result.stdout+result.stderr,new RegExp(marker));
});
