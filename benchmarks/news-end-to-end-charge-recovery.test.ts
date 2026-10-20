import {it,expect} from 'vitest';
import {readFileSync,existsSync,unlinkSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {readStructuredStream} from '../apps/worker/src/provider-stream';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {hash} from './news-end-to-end';
import {loadNews,saveNews,newsRoot} from './news-evaluation-transport';
it.skipIf(process.env.DISTILLED_NEWS_E2E_RECOVER!=='SAVED_OPENROUTER_GENERATION_ONLY')('recovers only the saved complete OpenRouter generation charge without inference or semantic promotion',async()=>{
 const prefix=newsRoot+'/openrouter-195802d1580e83b79bb4',intent=loadNews(prefix+'-intent.json'),saved=loadNews(prefix+'-response.json'),unsettled=loadNews(prefix+'-unsettled.json');
 expect(hash(intent.body)).toBe(intent.requestHash);expect(intent.requestHash).toBe('195802d1580e83b79bb468630a0b4431a70dea59acfbf068dc69879fd07819e9');
 const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{},saved.headers['x-generation-id']);
 expect(parsed.choices[0].finish_reason).toBe('stop');
 const vars=readFileSync(process.env.DISTILLED_EVALUATION_VARS_FILE!,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');expect(key).toBeTruthy();
 const response=await fetch('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(parsed.id),{method:'GET',headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});expect(response.ok).toBe(true);const proof=await response.json() as any;
 expect(proof.data.id).toBe(parsed.id);expect(proof.data.model).toBe('openai/gpt-4.1-2025-04-14');expect(proof.data.finish_reason).toBe('stop');expect(proof.data.total_cost).toBe(parsed.usage.cost);expect(parsed.usage.cost).toBe(.110432);
 saveNews(prefix+'-generation-proof.json',{at:new Date().toISOString(),source:'OPENROUTER_GENERATION_METADATA_MATCHING_RETAINED_COMPLETE_STREAM',...proof});
 const ledger=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=ledger.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];expect(token).toBeTruthy();const db=evaluationD1(token!) as unknown as D1Database;
 const reservation=await db.prepare('SELECT token,model,feed_id FROM v1_model_spending_reservations WHERE id=?').bind(intent.reservation.id).first<any>();expect(reservation).toMatchObject({token:intent.reservation.token,model:intent.reservation.model,feed_id:intent.reservation.feedId});
 await settleModelSpending(db,intent.reservation.id,intent.reservation.token,{costUsd:proof.data.total_cost,reported:true});
 const result=JSON.parse(parsed.choices[0].message.content);
 saveNews(prefix+'-accounted.json',{id:intent.reservation.id,token:intent.reservation.token,route:'openrouter',model:intent.reservation.model,phase:intent.phase,requestHash:intent.requestHash,result,errorCode:unsettled.errorCode,usage:{tokensIn:parsed.usage.prompt_tokens,tokensOut:parsed.usage.completion_tokens,cost:parsed.usage.cost,confirmed:true},networkMs:unsettled.networkMs,responseAndValidationMs:unsettled.responseAndValidationMs,billingMs:0,scopeWaitMs:0,calls:1,costUsd:parsed.usage.cost,reservedUsd:intent.reservation.reservedCostUsd,settled:true,recovery:'ACCOUNTING_ONLY_NO_SEMANTIC_PROMOTION'});
 expect(readdirSync(newsRoot).filter(n=>n.endsWith('-intent.json')&&!existsSync(join(newsRoot,n.replace('-intent.json','-accounted.json'))))).toEqual([]);
 const lock=loadNews(newsRoot+'/execution.lock');let alive=false;try{process.kill(lock.pid,0);alive=true}catch{}expect(alive).toBe(false);unlinkSync(newsRoot+'/execution.lock');
},60000);

