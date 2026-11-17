import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./probe-google-news-apify.mjs',import.meta.url));
test('trial defaults to dry-run without credentials or paid requests',()=>{
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',windowsHide:true,env:{...process.env,APIFY_API_TOKEN:''}});
 assert.equal(result.status,0,result.stderr);
 const plan=JSON.parse(result.stdout);
 assert.equal(plan.mode,'dry-run');assert.equal(plan.maxChargeUsd,0.10);
 assert.equal(plan.recurring,false);assert.equal(plan.input.maxItemsPerQuery,10);
 assert.equal(plan.input.queries.length,1);
});
test('trial refuses a paid start without explicit budget approval',()=>{
 const result=spawnSync(process.execPath,[script,'--run'],{encoding:'utf8',windowsHide:true,env:{...process.env,APIFY_API_TOKEN:''}});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Explicit \$0\.10 trial approval is required/);
});
