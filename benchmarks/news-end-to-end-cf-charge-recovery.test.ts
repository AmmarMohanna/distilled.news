import {it,expect} from 'vitest';
import {existsSync,readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {readFileSync} from 'node:fs';
import {confirmCloudflareCharge} from './cloudflare-evaluation-ledger';
import {settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {newsRoot,loadNews,saveNews} from './news-evaluation-transport';
import {hash} from './news-end-to-end';
it.skipIf(process.env.DISTILLED_NEWS_CF_CHARGE_RECOVERY!=='EXACT_SAVED_WRITER_ONLY')('settles only the saved Cloudflare control writer from actual billing without inference',async()=>{
 const prefix=newsRoot+'/cloudflare-7f728f564357d0300437',intent=loadNews(prefix+'-intent.json'),unsettled=loadNews(prefix+'-unsettled.json');expect(hash(intent.body)).toBe(intent.requestHash);expect(intent.phase).toBe('SYNTHESIS');expect(intent.reservation.model).toBe('cloudflare:openai/gpt-4.1');
 const old=loadNews('.local-reports/cloudflare-gpt41/live-results.json').rows.filter((r:any)=>r.route==='cloudflare'),prior=readdirSync(newsRoot).filter(n=>n.startsWith('cloudflare-')&&n.endsWith('-accounted.json')).map(n=>loadNews(newsRoot+'/'+n));
 const proof=await confirmCloudflareCharge(prefix,async()=>loadNews(join(process.env.APPDATA!,'xdg.config/cloudflare/config/default.json')).oauth_token,[...old,...prior],intent.reservation.reservedCostUsd);expect(proof.costUsd).toBe(.013908);
 const config=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(token!) as unknown as D1Database;
 const reservation=await db.prepare('SELECT token,model,feed_id FROM v1_model_spending_reservations WHERE id=?').bind(intent.reservation.id).first<any>();expect(reservation).toMatchObject({token:intent.reservation.token,model:intent.reservation.model,feed_id:intent.reservation.feedId});
 await settleModelSpending(db,intent.reservation.id,intent.reservation.token,{costUsd:proof.costUsd,reported:true});
 saveNews(prefix+'-accounted.json',{executionScope:'AI_CURATED_DOWNSTREAM_CONTROL',id:intent.reservation.id,token:intent.reservation.token,route:'cloudflare',model:intent.reservation.model,phase:intent.phase,requestHash:intent.requestHash,result:unsettled.result,usage:{tokensIn:unsettled.usage.inputTokens,tokensOut:unsettled.usage.outputTokens,cost:proof.costUsd,confirmed:true},networkMs:unsettled.networkMs,responseAndValidationMs:unsettled.responseAndValidationMs,calls:1,costUsd:proof.costUsd,reservedUsd:intent.reservation.reservedCostUsd,settled:true,gatewayLogId:proof.gatewayLogId,recovery:'EXACT_SAVED_COMPLETION_ACTUAL_BILLING_NO_INFERENCE',timingRecoveryMissing:['billingMs','scopeWaitMs']});
 expect(readdirSync(newsRoot).filter(n=>n.endsWith('-intent.json')&&!existsSync(join(newsRoot,n.replace('-intent.json','-accounted.json'))))).toEqual([]);const lock=loadNews(newsRoot+'/execution.lock');let alive=false;try{process.kill(lock.pid,0);alive=true}catch{}expect(alive).toBe(false);unlinkSync(newsRoot+'/execution.lock');
},60000);
