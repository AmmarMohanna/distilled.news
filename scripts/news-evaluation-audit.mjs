// Read-only evaluation-ledger audit. Never modifies grants or settlements.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {evaluationD1} from './validation-evaluation-d1.mjs';
const correctness=process.argv.includes('--correctness'),root=correctness?'.local-reports/news-correctness-openrouter/':'.local-reports/news-end-to-end/',load=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const baseline=load('.local-reports/news-end-to-end/historical-ledger-snapshot.json'),manifest=load(root+'manifest.json');
const credential=join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml');
let config=readFileSync(credential,'utf8');
if(Date.parse(config.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1])<Date.now()+120000){execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','whoami'],{stdio:'pipe',timeout:60000});config=readFileSync(credential,'utf8')}
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const db=evaluationD1(token),account='openrouter-distilled-news-staging',feed=(correctness?'news-correctness:':'news-e2e:')+manifest.corpusHash.slice(0,20);
const grants=(await db.prepare('SELECT id,json FROM v1_model_spending_authorizations WHERE account_id=?').bind(account).all()).results;
const rows=(await db.prepare('SELECT r.id,r.json,r.feed_id,r.token,r.reserved_cost_usd,s.cost_usd,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=?').bind(account).all()).results;
const oldGrantsUnchanged=baseline.grants.every(old=>grants.find(g=>g.id===old.id)?.json===old.json);
const oldHoldsUnchanged=baseline.holds.every(old=>{const r=rows.find(r=>r.id===old.id);return r&&r.json===old.json&&r.cost_usd===old.cost_usd&&r.reported===old.reported});
const pending=rows.filter(r=>r.reported!==1),workflow=rows.filter(r=>r.feed_id===feed),sum=(values,fn)=>values.reduce((n,r)=>n+fn(r),0);
const workflowGrants=grants.filter(g=>JSON.parse(g.json).evaluationScope?.feedId===feed);
const ceilingUnchanged=workflowGrants.every(g=>{const j=JSON.parse(g.json);return j.maxExposureUsd===73&&j.evaluationScope.maxLifetimeExposureUsd===73});
const proof={at:new Date().toISOString(),oldGrantsUnchanged,oldHoldsUnchanged,originalHoldCount:baseline.holds.length,
 originalHeldUsd:sum(baseline.holds,r=>Math.max(JSON.parse(r.json).reservedCostUsd,r.cost_usd??0)),
 currentUnconfirmedCount:pending.length,workflowUnconfirmedCount:workflow.filter(r=>r.reported!==1).length,
 workflowCalls:workflow.length,workflowActualCostUsd:sum(workflow,r=>r.reported===1?r.cost_usd:0),
 workflowConservativeReservationsUsd:sum(workflow,r=>Math.max(r.reserved_cost_usd,r.cost_usd??0)),
 lifetimeActualAndHeldUsd:sum(rows,r=>r.reported===1?r.cost_usd:Math.max(r.reserved_cost_usd,r.cost_usd??0)),
 ceilingUsd:73,ceilingUnchanged,maxWorkflowCalls:correctness?12:24,maxWorkflowReservationsUsd:correctness?1.5:2.5};
writeFileSync(root+'financial-postflight.json',JSON.stringify(proof,null,2)+'\n');
if(!oldGrantsUnchanged||!oldHoldsUnchanged||!ceilingUnchanged||proof.currentUnconfirmedCount!==50||proof.workflowUnconfirmedCount||proof.workflowCalls>proof.maxWorkflowCalls||proof.workflowConservativeReservationsUsd>proof.maxWorkflowReservationsUsd||proof.lifetimeActualAndHeldUsd>73)throw Error('EVALUATION_ACCOUNTING_POSTFLIGHT_FAILED');
writeFileSync(correctness?'benchmarks/news-correctness-accounting.json':'benchmarks/news-end-to-end-accounting.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof,null,2));
