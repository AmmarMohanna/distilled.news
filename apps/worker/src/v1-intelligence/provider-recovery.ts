import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {modelSettlementStatement} from './model-spending';
type Recovery={state:'SETTLED';costUsd:number}|{state:'WAITING';reason:string};
// Exact canonical slugs from OpenRouter's model catalog, checked 2026-10-23.
// Never strip arbitrary version suffixes or equate different model families.
const canonicalModels:Record<string,string>={'openai/gpt-4.1':'openai/gpt-4.1-2025-04-14','openai/gpt-4.1-mini':'openai/gpt-4.1-mini-2025-04-14'};
/** Metadata GET only. No inference retries, operation replacement or canonical
 * semantic writes. A generation handle alone never releases financial exposure. */
export async function recoverProviderGeneration(db:D1Database,reservationId:string,apiKey:string,fetcher:typeof fetch=fetch):Promise<Recovery>{
 const reservation=await db.prepare('SELECT token,feed_id,model FROM v1_model_spending_reservations WHERE id=?').bind(reservationId).first<{token:string;feed_id:string;model:string}>();
 if(!reservation||!apiKey)return {state:'WAITING',reason:'RESERVATION_OR_CREDENTIAL_UNAVAILABLE'};
 const prior=await db.prepare('SELECT cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(reservationId).first<{cost_usd:number;reported:number}>();
 if(prior?.reported===1)return {state:'SETTLED',costUsd:prior.cost_usd};
 const row=await db.prepare("SELECT id,json FROM v1_feed_documents WHERE kind='model_provider_receipts' AND feed_id=? AND json_extract(json,'$.reservationId')=? AND json_extract(json,'$.provider')='OPENROUTER' AND json_extract(json,'$.stage') IN ('HEADERS','GENERATION') AND json_extract(json,'$.generationId') IS NOT NULL ORDER BY id LIMIT 1").bind(reservation.feed_id,reservationId).first<{id:string;json:string}>();
 if(!row)return {state:'WAITING',reason:'GENERATION_HANDLE_UNAVAILABLE'};
 const receipt=JSON.parse(row.json),generationId=receipt.generationId;
 if(receipt.feedId!==reservation.feed_id||receipt.model!==reservation.model||typeof generationId!=='string'||!/^gen-[a-zA-Z0-9-]{1,124}$/.test(generationId))return {state:'WAITING',reason:'GENERATION_BINDING_INVALID'};
 let data:any;
 try{
  const response=await fetcher('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(generationId),{method:'GET',redirect:'manual',headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(5000)});
  if(!response.ok){await response.body?.cancel();return {state:'WAITING',reason:'PROVIDER_LOOKUP_HTTP_'+response.status}}
  const reader=response.body?.getReader();if(!reader)return {state:'WAITING',reason:'PROVIDER_METADATA_INVALID'};
  let text='',size=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536)return {state:'WAITING',reason:'PROVIDER_METADATA_INVALID'};text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
  data=JSON.parse(text).data;
 }catch{return {state:'WAITING',reason:'PROVIDER_LOOKUP_UNAVAILABLE'}}
 if(data?.id!==generationId||typeof data?.model!=='string'||!(data?.model===reservation.model||canonicalModels[reservation.model]===data?.model)||typeof data?.total_cost!=='number'||!Number.isFinite(data.total_cost)||data.total_cost<0||!(data?.cancelled===true||['stop','length','tool_calls','function_call','content_filter','error','cancelled'].includes(data?.finish_reason)))return {state:'WAITING',reason:'PROVIDER_COMPLETION_UNPROVEN'};
 const proof={generationId,model:reservation.model,costUsd:data.total_cost,finishReason:data.cancelled===true?'cancelled':data.finish_reason,providerModel:data.model,cancelled:data.cancelled===true},proofId=JSON.stringify([reservationId,generationId,'provider-metadata-v1']),proofHash=await sha256(canonicalJson(proof));
 const audit={id:proofId,reservationId,feedId:reservation.feed_id,source:'OPENROUTER_GENERATION_METADATA',...proof,proofHash};
 const guard=crypto.randomUUID();
 await db.batch([
  db.prepare("INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='model_provider_receipts' AND id=? AND feed_id=? AND json=?) AND EXISTS(SELECT 1 FROM v1_model_spending_reservations WHERE id=? AND token=? AND model=? AND feed_id=?) AND NOT EXISTS(SELECT 1 FROM v1_model_spending_settlements WHERE id=? AND reported=1 AND cost_usd!=?) THEN 1 ELSE 0 END").bind(guard,row.id,reservation.feed_id,row.json,reservationId,reservation.token,reservation.model,reservation.feed_id,reservationId,data.total_cost),
  modelSettlementStatement(db,reservationId,reservation.token,{costUsd:data.total_cost,reported:true}),
  db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('model_provider_recoveries',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(proofId,reservation.feed_id,JSON.stringify(audit)),
  db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)
 ]);
 return {state:'SETTLED',costUsd:data.total_cost};
}
/** Bounded fair metadata polling; absent legacy handles are never guessed.
 * Backoff is observable and indefinite, not a semantic attempt or paid call. */
export async function pendingProviderGenerationCandidates(db:D1Database,now:Date){
 // The correlated history scans consumed the D1 CPU limit before recovery could
 // start. Materialize each metadata set once, retaining the complete global
 // reservation-identity backoff and the same oldest-attempt admission order.
 return db.prepare(`WITH pending AS MATERIALIZED (
 SELECT r.id,r.feed_id,r.created_at FROM v1_model_spending_reservations r
 LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
 WHERE COALESCE(s.reported,0)=0 AND r.lease_until<=?),
 receipts AS MATERIALIZED (
 SELECT DISTINCT d.feed_id,json_extract(d.json,'$.reservationId') AS reservation_id
 FROM v1_feed_documents d WHERE d.kind='model_provider_receipts'
 AND json_extract(d.json,'$.provider')='OPENROUTER' AND json_extract(d.json,'$.generationId') IS NOT NULL),
 history AS MATERIALIZED (
 SELECT json_extract(a.json,'$.reservationId') AS reservation_id,
 MAX(json_extract(a.json,'$.createdAt')) AS last_attempt,
 MAX(CASE WHEN json_extract(a.json,'$.nextAttemptAt')>? THEN 1 ELSE 0 END) AS waiting
 FROM v1_feed_documents a WHERE a.kind='model_provider_recovery_attempts'
 GROUP BY json_extract(a.json,'$.reservationId'))
 SELECT r.id,r.feed_id,h.last_attempt FROM pending r
 JOIN receipts d ON d.feed_id=r.feed_id AND d.reservation_id=r.id
 LEFT JOIN history h ON h.reservation_id=r.id WHERE COALESCE(h.waiting,0)=0
 ORDER BY h.last_attempt,r.created_at LIMIT 3`).bind(now.getTime(),now.toISOString()).all<{id:string;feed_id:string;last_attempt:string|null}>();
}
export async function recoverPendingProviderGenerations(db:D1Database,apiKey:string,now=new Date(),fetcher:typeof fetch=fetch):Promise<void>{
 if(!apiKey)return;
 const rows=await pendingProviderGenerationCandidates(db,now);
 for(const row of rows.results){
  const history=await db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='model_provider_recovery_attempts' AND json_extract(json,'$.reservationId')=?").bind(row.id).first<{n:number}>();
  let result:Recovery;try{result=await recoverProviderGeneration(db,row.id,apiKey,fetcher)}catch{result={state:'WAITING',reason:'RECOVERY_COMMIT_FAILED'}}
  const id=JSON.stringify([row.id,now.toISOString()]),jitter=[...row.id].reduce((n,c)=>(n*31+c.charCodeAt(0))%30000,0);
  const record={id,feedId:row.feed_id,reservationId:row.id,...result,createdAt:now.toISOString(),...(result.state==='WAITING'?{nextAttemptAt:new Date(now.getTime()+Math.min(1800000,60000*2**Math.min(history?.n??0,5))+jitter).toISOString()}:{})};
  await db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('model_provider_recovery_attempts',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(id,row.feed_id,JSON.stringify(record)).run();
  console.info(JSON.stringify({type:'V1_PROVIDER_ACCOUNTING_RECOVERY',feedId:row.feed_id,reservationId:row.id,...result}));
 }
}
