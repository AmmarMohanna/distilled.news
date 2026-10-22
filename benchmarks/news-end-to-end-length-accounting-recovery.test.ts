import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {readStructuredStream} from '../apps/worker/src/provider-stream';
import {modelSettlementStatement} from '../apps/worker/src/v1-intelligence/model-spending';
import {sha256} from '../packages/contracts/src/index';
import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
import {V1FeedStore} from '../apps/worker/src/v1-intelligence/store';
import {confirmedEditorialOutcome} from '../apps/worker/src/v1-intelligence/editorial-paid-outcome';
import {hash} from './news-end-to-end';
const root='.local-reports/news-correctness-openrouter/';
it.skipIf(process.env.NEWS_LENGTH_ACCOUNTING_RECOVERY!=='SAVED_SETTLED_LENGTH_ONLY')('confirms only the exact settled output-limit charge without promoting a semantic response',async()=>{
 const load=(name:string)=>JSON.parse(readFileSync(root+name,'utf8')),prefix='openrouter-baa2da98c3ee4818f6dc';
 const paid=load(prefix+'-accounted.json'),wire=load(prefix+'-intent.json'),saved=load(prefix+'-response.json');expect(paid.errorCode).toBe('MODEL_OUTPUT_CONTINUATION_REQUIRED');expect(paid.costUsd).toBe(.142528);expect(paid.usage.confirmed).toBe(true);expect(hash(wire.body)).toBe(paid.requestHash);
 const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{});expect(parsed.choices[0].finish_reason).toBe('length');expect(parsed.usage.cost).toBe(paid.costUsd);
 const config=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],remote=evaluationD1(token!) as any;
 const receipt=await remote.prepare('SELECT r.token,r.model,s.cost_usd,s.reported FROM v1_model_spending_reservations r JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.id=?').bind(paid.id).first();expect(receipt).toMatchObject({token:paid.token,model:paid.model,cost_usd:paid.costUsd,reported:1});
 const ctx=await persistentEvaluationDatabase(join(process.cwd(),root,'d1-real-publication-openrouter'));try{
  const docs=(await ctx.db.prepare("SELECT kind,id,json FROM v1_feed_documents WHERE kind IN ('semantic_results','semantic_intents','semantic_settlements')").all<any>()).results;
  const result=docs.find((r:any)=>r.kind==='semantic_results'&&JSON.parse(r.json).input.kind==='COMPARATIVE_EDITORIAL_PLAN');expect(result).toBeTruthy();const old=JSON.parse(result.json);expect(old.status).toBe('DEFERRED');expect(old.usage.reported).toBe(false);expect(old.value).toBeUndefined();const {outputSchema,...payload}=old.input.state;expect(hash(payload)).toBe(hash(wire.payload));expect(hash(outputSchema)).toBe(hash(wire.schema));
  const intent=JSON.parse(docs.find((r:any)=>r.kind==='semantic_intents'&&r.id===result.id)!.json),settled=docs.find((r:any)=>r.kind==='semantic_settlements'&&r.id===result.id)!;
  const corrected={...old,failure:'SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED',usage:{calls:1,costUsd:paid.costUsd,reported:true,tokensIn:paid.usage.tokensIn,tokensOut:paid.usage.tokensOut}};
  const oldSettlement=JSON.parse(settled.json);expect(oldSettlement.token).toBe(intent.token);expect(oldSettlement.usage.reported).toBe(false);
  const audit={id:'length-accounting:'+result.id,operationId:result.id,scope:'LOCAL_ONLY_FINANCIAL_CONFIRMATION_NO_SEMANTIC_PROMOTION',originalResult:old,originalResultHash:await sha256(canonicalJson(old)),localReservationToken:intent.token,originalSettlement:oldSettlement,remotePaidOperationId:paid.id,remoteReceipt:receipt,providerFinishReason:'length',rawResponseHash:hash(saved.raw),correctedUsage:corrected.usage,at:new Date().toISOString()};writeFileSync(root+'openrouter-length-accounting-recovery.json',JSON.stringify(audit,null,2));
  await ctx.db.batch([ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('editorial_response_recoveries',?,?,?)").bind(audit.id,old.feedId,JSON.stringify(audit)),modelSettlementStatement(ctx.db,'semantic_intents:'+result.id,intent.token,{costUsd:paid.costUsd,reported:true})]);
  expect((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_results' AND id=?").bind(result.id).first<any>())?.json).toBe(result.json);expect((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_settlements' AND id=?").bind(result.id).first<any>())?.json).toBe(settled.json);expect(await confirmedEditorialOutcome(new V1FeedStore(ctx.db),old.input,old)).toEqual(corrected);
 }finally{await ctx.dispose()}
});
