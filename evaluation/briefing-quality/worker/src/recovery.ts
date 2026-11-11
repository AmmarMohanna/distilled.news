import {check,PROTOCOL} from './protocol';
import {boundedJson,money} from './budget';
/** An isolated request stays financially UNKNOWN and cannot be sent again. */
export const activeFence=`SELECT c.id FROM eval_calls c WHERE c.state='OVERAGE' OR (c.state IN ('RESERVED','UNKNOWN') AND NOT EXISTS(SELECT 1 FROM eval_call_isolations i WHERE i.call_id=c.id)) LIMIT 1`;
export async function recoverReviews(env:Env,now=new Date()){
 if(env.UNCERTAIN_REVIEW_RECOVERY!=='isolate-after-20m-v1')return;
 await recoverGenerationAccounting(env).catch(()=>{});
 // Keep the existing interrupted-review grace; never infer provider completion.
 const cutoff=new Date(now.getTime()-20*60000).toISOString();
 await env.EVAL_DB.prepare(`INSERT INTO eval_call_isolations(call_id,policy,created_at,reason)
 SELECT id,?,?,? FROM eval_calls WHERE state IN ('RESERVED','UNKNOWN') AND created_at<=?
 ON CONFLICT(call_id) DO NOTHING`).bind(env.UNCERTAIN_REVIEW_RECOVERY,now.toISOString(),'REMOTE_TERMINATION_UNPROVEN_FINANCIAL_EXPOSURE_RETAINED',cutoff).run();
 // Only settled-invalid or never-sent jobs may start a corrected review. Unknown
 // work remains fenced at job/stage scope even when request formatting changes.
 const rows=(await env.EVAL_DB.prepare(`SELECT j.id,j.status,j.error FROM eval_jobs j
 WHERE j.status='review_failed' AND j.review_version<>? AND j.snapshot_key IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM eval_calls c WHERE c.job_id=j.id AND (c.state IN ('RESERVED','UNKNOWN','OVERAGE') OR (c.state='SETTLED' AND c.response_key IS NULL)))
 ORDER BY j.published_at DESC LIMIT 30`).bind(PROTOCOL).all<{id:string;status:string;error:string|null}>()).results;
 for(const row of rows)await env.EVAL_DB.batch([
  env.EVAL_DB.prepare('INSERT OR IGNORE INTO eval_recovery_events VALUES(?,?,?,?,?)').bind(row.id,row.status,row.error,now.toISOString(),PROTOCOL),
  env.EVAL_DB.prepare("UPDATE eval_jobs SET status='ready',error=NULL,updated_at=?,review_version=? WHERE id=? AND status='review_failed' AND NOT EXISTS(SELECT 1 FROM eval_calls c WHERE c.job_id=eval_jobs.id AND (c.state IN ('RESERVED','UNKNOWN','OVERAGE') OR (c.state='SETTLED' AND c.response_key IS NULL)))").bind(now.toISOString(),PROTOCOL,row.id)
 ]);
}
/** Provider metadata GET only. A known charge is not a recovered review body. */
export async function recoverGenerationAccounting(env:Env,fetcher:typeof fetch=fetch){
 if(!env.EVALUATION_OPENROUTER_KEY)return;
 const rows=(await env.EVAL_DB.prepare("SELECT c.id,c.reservation_micro,r.generation_id FROM eval_calls c JOIN eval_provider_receipts r ON r.call_id=c.id WHERE c.state='UNKNOWN' ORDER BY c.created_at LIMIT 3").all<{id:string;reservation_micro:number;generation_id:string}>()).results;
 for(const row of rows)try{
  const response=await fetcher('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(row.generation_id),{redirect:'manual',headers:{authorization:'Bearer '+env.EVALUATION_OPENROUTER_KEY},signal:AbortSignal.timeout(5000)});
  if(!response.ok){await response.body?.cancel();continue}
  const body=await boundedJson(response,65536) as {data?:{id:string;model:string;total_cost:number;finish_reason?:string;cancelled?:boolean}},d=body.data;
  if(!d||d.id!==row.generation_id||![env.JUDGE_MODEL,env.JUDGE_MODEL==='openai/gpt-4.1'?'openai/gpt-4.1-2025-04-14':''].filter(Boolean).includes(d.model)||!(d.cancelled===true||['stop','length','tool_calls','content_filter','error','cancelled'].includes(d.finish_reason??'')))continue;
  const cost=money(d.total_cost),key='accounting/'+row.id+'.json';
  await env.EVIDENCE.put(key,JSON.stringify({source:'OPENROUTER_GENERATION_METADATA',id:d.id,model:d.model,total_cost:d.total_cost,finish_reason:d.finish_reason,cancelled:d.cancelled===true}));
  await env.EVAL_DB.batch([
   env.EVAL_DB.prepare("UPDATE eval_calls SET state=?,cost_micro=?,provider_id=? WHERE id=? AND state='UNKNOWN' AND EXISTS(SELECT 1 FROM eval_provider_receipts r WHERE r.call_id=eval_calls.id AND r.generation_id=?)").bind(cost>row.reservation_micro?'OVERAGE':'SETTLED',cost,d.id,row.id,d.id),
   env.EVAL_DB.prepare('INSERT OR IGNORE INTO eval_accounting_recoveries VALUES(?,?,?)').bind(row.id,key,new Date().toISOString())
  ]);
 }catch{/* Missing metadata is retained as uncertainty, never a zero charge. */}
}
export async function captureGeneration(env:Env,callId:string,generationId:unknown){
 if(typeof generationId!=='string'||!/^gen-[a-zA-Z0-9-]{1,124}$/.test(generationId))return;
 await env.EVAL_DB.prepare('INSERT INTO eval_provider_receipts VALUES(?,?,?) ON CONFLICT(call_id) DO NOTHING').bind(callId,generationId,new Date().toISOString()).run();
 const row=await env.EVAL_DB.prepare('SELECT generation_id FROM eval_provider_receipts WHERE call_id=?').bind(callId).first<{generation_id:string}>();
 check(row?.generation_id===generationId,'PROVIDER_IDENTITY_MISMATCH');
}
