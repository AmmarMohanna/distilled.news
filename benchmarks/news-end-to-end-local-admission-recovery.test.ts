import {it,expect} from 'vitest';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {hash} from './news-end-to-end';
const root='.local-reports/news-correctness-openrouter/';
it.skipIf(process.env.NEWS_LOCAL_UNPAID_RECOVERY!=='CONFIRMED_NO_REMOTE_EDITORIAL_OPERATION')('removes only the proven unexecuted local editorial frame, retaining all financial rows and successful intelligence',async()=>{
 const load=(name:string)=>JSON.parse(readFileSync(root+name,'utf8'));
 const previous=load('openrouter-local-state.json');const bad=previous.filter((r:any)=>r.kind==='semantic_results').map((r:any)=>JSON.parse(r.json)).filter((v:any)=>v.input.kind==='COMPARATIVE_EDITORIAL_PLAN');expect(bad).toHaveLength(1);const failed=bad[0];expect(failed.failure).toBe('SEMANTIC_PROVIDER_FAILURE');expect(failed.usage.reported).toBe(false);expect(failed.usage.costUsd).toBeGreaterThan(.35);
 const accounts=readdirSync(root).filter(n=>n.endsWith('-accounted.json')).map(load);expect(accounts).toHaveLength(4);expect(accounts.every(r=>r.phase!=='COMPARATIVE_EDITORIAL_PLAN')).toBe(true);
 const config=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],remote=evaluationD1(token!) as any;
 const feed='news-correctness:'+load('manifest.json').corpusHash.slice(0,20),rows=(await remote.prepare('SELECT id,token FROM v1_model_spending_reservations WHERE feed_id=?').bind(feed).all()).results;
 expect(rows.map((r:any)=>r.id).sort()).toEqual(accounts.map(r=>r.id).sort());for(const row of rows)expect(accounts.find(r=>r.id===row.id)?.token).toBe(row.token);
 const ctx=await persistentEvaluationDatabase(join(process.cwd(),root,'d1-real-publication-openrouter'));try{
  expect(ctx.persistedPath).toBe(load('openrouter-persistence.json').path);
  const docs=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all<any>()).results;
  const financialBefore=(await ctx.db.prepare('SELECT id,token,reserved_cost_usd FROM v1_model_spending_reservations ORDER BY id').all<any>()).results;
  const ids=['semantic_intents','semantic_results','semantic_settlements'];const removed=docs.filter((r:any)=>ids.includes(r.kind)&&r.id===failed.id);expect(removed).toHaveLength(3);
  const audit={scope:'LOCAL_ONLY_PRECALL_BOOKKEEPING_RECOVERY',reason:'Conservative reservation .351256 rejected by the .35 broker cap before remote intent, reservation or provider dispatch',operationId:failed.id,remoteReservationIds:rows.map((r:any)=>r.id),removed,financialRowsRetained:true,noSemanticProposalInjected:true,at:new Date().toISOString()};
  writeFileSync(root+'openrouter-admission-recovery.json',JSON.stringify(audit,null,2));
  await ctx.db.batch(removed.map((r:any)=>ctx.db.prepare('DELETE FROM v1_feed_documents WHERE kind=? AND id=? AND json=?').bind(r.kind,r.id,r.json)));
  const after=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all<any>()).results;
  expect(hash(after)).toBe(hash(docs.filter((r:any)=>!removed.some((x:any)=>x.kind===r.kind&&x.id===r.id))));
  expect((await ctx.db.prepare('SELECT id,token,reserved_cost_usd FROM v1_model_spending_reservations ORDER BY id').all<any>()).results).toEqual(financialBefore);
 }finally{await ctx.dispose()}
});
