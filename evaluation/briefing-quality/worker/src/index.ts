import {PROTOCOL,JOB_IDENTITY_PROTOCOL,type Case,check,flagged,hash,inventory,inventoryRequest,metrics,operational,review,reviewRequest,timestamp} from './protocol';
import {activeFenceFor,recoverReviews} from './recovery';
import {boundedJson,budget,judge} from './budget';
import {discover,isEvaluable,snapshot,type Published} from './source';
import {dashboardPage} from './page';
import {exportGrafana} from './grafana';

interface Job {id:string;edition_id:string|null;feed_id:string;language:string;window_end:string;published_at:string;status:string;snapshot_key:string|null;snapshot_hash:string|null;report_key:string|null;error:string|null;attempt_id:string|null;outcome:string;review_version:string}
interface MessageBody {jobId:string}
const time=()=>new Date().toISOString();
const errorCode=(e:unknown)=> e instanceof Error&&/^[A-Z][A-Z0-9_]*$/.test(e.message)?e.message:'EVALUATION_FAILURE';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function setMeta(env:Env,key:string,value:unknown){await env.EVAL_DB.prepare('INSERT INTO eval_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run()}
async function meta<T>(env:Env,key:string):Promise<T|null>{const row=await env.EVAL_DB.prepare('SELECT value FROM eval_meta WHERE key=?').bind(key).first<{value:string}>();return row?JSON.parse(row.value) as T:null}
async function job(env:Env,id:string){return env.EVAL_DB.prepare('SELECT * FROM eval_jobs WHERE id=?').bind(id).first<Job>()}

export async function tick(env:Env){
 budget(env);timestamp(env.ENROLL_FROM);check(env.SOURCE_LABEL!=='unconfigured','SOURCE_NOT_CONFIGURED');
 await recoverReviews(env);
 try{
  // Sweep immutable edition IDs repeatedly. Restarting a completed sweep catches
  // new publications whose stable IDs sort before the previous cursor.
  const after=await meta<string>(env,'discovery_cursor')??'';
  const rows=await discover(env.SOURCE_DB,env.ENROLL_FROM,after);
  for(const row of rows){
   const id=await hash({source:env.SOURCE_LABEL,edition:row.id,feed:row.feed_id,protocol:JOB_IDENTITY_PROTOCOL,judge:env.JUDGE_MODEL});
   await env.EVAL_DB.prepare(`INSERT INTO eval_jobs(id,feed_id,language,window_end,published_at,status,updated_at,edition_id,outcome,review_version)
    VALUES(?,?,?,?,?,'pending_snapshot',?,?,?,?) ON CONFLICT(id) DO UPDATE SET edition_id=excluded.edition_id`).bind(id,row.feed_id,row.language??'unknown',row.window_end??row.published_at,row.published_at,time(),row.id,row.outcome??'published',PROTOCOL).run();
  }
  await setMeta(env,'discovery_cursor',rows.length===50?rows.at(-1)!.id:'');
  await setMeta(env,'discovery',{at:time(),status:'ok',pageSize:rows.length,sweepComplete:rows.length<50,enrollFrom:env.ENROLL_FROM,source:env.SOURCE_LABEL});
 }catch(error){await setMeta(env,'discovery',{at:time(),status:'failed',error:errorCode(error)});throw error}
 // A crash while reading evidence is safely retryable; a crash during paid review
 // is explicitly unresolved and never silently returned to the work queue.
 const cutoff=new Date(Date.now()-20*60_000).toISOString();
 await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='pending_snapshot',attempt_id=NULL WHERE status='collecting' AND updated_at<?").bind(cutoff).run();
 await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='interrupted_unknown',error='REVIEW_INTERRUPTED' WHERE status='reviewing' AND updated_at<?").bind(cutoff).run();
 const day=time().slice(0,10),b=budget(env);
 const totals=b.unlimited?null:await env.EVAL_DB.prepare("SELECT COALESCE(SUM(CASE WHEN day_utc=? OR state IN ('RESERVED','UNKNOWN') THEN COALESCE(cost_micro,reservation_micro) ELSE 0 END),0) spent,SUM(CASE WHEN day_utc=? THEN 1 ELSE 0 END) calls FROM eval_calls").bind(day,day).first<{spent:number;calls:number}>();
 const blocked=await env.EVAL_DB.prepare(activeFenceFor(b.unlimited)).first();
 const canReview=env.EVALUATION_ENABLED==='true'&&!blocked&&(b.unlimited||((totals?.spent??0)<b.dailyMicro&&(totals?.calls??0)<b.maxCalls));
 // Fairness: balance completed work across language/feed groups before taking
 // the oldest pending briefing. No feed IDs enter public/Grafana metric labels.
 const pending=(await env.EVAL_DB.prepare(`SELECT j.id FROM eval_jobs j WHERE j.status='pending_snapshot' OR (?=1 AND j.status IN ('ready','budget_deferred'))
 ORDER BY (SELECT COUNT(*) FROM eval_jobs done WHERE done.language=j.language AND done.feed_id=j.feed_id AND done.status IN ('flagged','reviewed_no_findings')),j.window_end DESC,j.id LIMIT 30`).bind(canReview?1:0).all<{id:string}>()).results;
 for(const row of pending)await env.REVIEWS.send({jobId:row.id});
 await retain(env);
 await setMeta(env,'last_tick',{at:time(),status:'ok',enabled:env.EVALUATION_ENABLED==='true',queued:pending.length,spendingFenced:!!blocked});
 try{await setMeta(env,'grafana',await exportGrafana(env,env.GRAFANA_EXPORT_ENABLED==='true'?await (await prometheus(env)).text():''))}catch(error){await setMeta(env,'grafana',{at:time(),status:'failed',reason:errorCode(error)})}
}

export async function processJob(env:Env,id:string){
 let value=await job(env,id);if(!value)return;
 if(value.status==='pending_snapshot'){
  const attempt=crypto.randomUUID();
  const claim=await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='collecting',attempt_id=?,updated_at=? WHERE id=? AND status='pending_snapshot'").bind(attempt,time(),id).run();
  if(!claim.meta.changes)return;
  try{
   // Compatibility with queue jobs created immediately before migration 0002.
   const editionId=value.edition_id??(value.error?.startsWith('{')?(JSON.parse(value.error) as {editionId?:string}).editionId:undefined);check(editionId,'EDITION_ID_MISSING');
   const row:Published={id:editionId,feed_id:value.feed_id,published_at:value.published_at,language:value.language,window_end:value.window_end,outcome:value.outcome==='quiet'?'quiet':'published'};
   const c=await snapshot(env.SOURCE_DB,row,env.SOURCE_LABEL,time()),bytes=JSON.stringify(c);
   check(new TextEncoder().encode(bytes).length<=2_000_000,'SNAPSHOT_SIZE_LIMIT');
   const key=`snapshots/${id}.json`,snapshotHash=await hash(c);await env.EVIDENCE.put(key,bytes);
   const expires=new Date(Date.now()+Number(env.RETENTION_DAYS)*86400000).toISOString();
   await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='ready',snapshot_key=?,snapshot_hash=?,error=NULL,expires_at=?,updated_at=?,operational_json=?,language=? WHERE id=? AND attempt_id=?").bind(key,snapshotHash,expires,time(),JSON.stringify(operational(c)),c.language,id,attempt).run();
  }catch(error){await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='unassessable',error=?,updated_at=? WHERE id=? AND attempt_id=?").bind(errorCode(error),time(),id,attempt).run();return}
  value=await job(env,id);if(!value)return;
 }
 if(env.EVALUATION_ENABLED!=='true'||!['ready','budget_deferred'].includes(value.status))return;
 const attempt=crypto.randomUUID();
 const claim=await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='reviewing',attempt_id=?,updated_at=?,review_version=? WHERE id=? AND status IN ('ready','budget_deferred')").bind(attempt,time(),PROTOCOL,id).run();
 if(!claim.meta.changes)return;
 try{
  check(value.snapshot_key,'SNAPSHOT_MISSING');const object=await env.EVIDENCE.get(value.snapshot_key);check(object&&object.size<=2_000_000,'SNAPSHOT_MISSING');
  const c=await object.json<Case>();check(await hash(c)===value.snapshot_hash&&c.feedId===value.feed_id&&c.sourceLabel===env.SOURCE_LABEL,'SNAPSHOT_INTEGRITY_MISMATCH');check(await isEvaluable(env.SOURCE_DB,c.feedId,c.id,c.pipelineStatus),'PUBLICATION_NO_LONGER_VISIBLE');
  const deterministic=operational(c);
  const d=inventory(await judge(env,id,'independent_developments',inventoryRequest(c)),c);
  const inventoryHash=await hash(d);await env.EVIDENCE.put(`inventories/${id}.json`,JSON.stringify({protocol:PROTOCOL,inventoryHash,inventory:d}));
  const r=review(await judge(env,id,'atomic_claims_and_coverage',reviewRequest(c,d)),c,d),m=metrics(r,d,c),hasFindings=flagged(r,d,c);
  const report={protocol:PROTOCOL,jobId:id,source:env.SOURCE_LABEL,model:env.JUDGE_MODEL,evidenceHash:await hash(c),inventoryHash,labelOrigin:'machine_judge_not_human',calibration:'not_measured',claimExtractionCompleteness:'not_independently_established',reviewedAt:time(),operational:deterministic,inventory:d,review:r,metrics:m,status:hasFindings?'flagged':'reviewed_no_findings'};
  const key=`reports/${id}.json`;await env.EVIDENCE.put(key,JSON.stringify(report));
  await env.EVAL_DB.prepare('UPDATE eval_jobs SET status=?,report_key=?,flagged=?,metrics_json=?,error=NULL,updated_at=? WHERE id=? AND attempt_id=?').bind(report.status,key,hasFindings?1:0,JSON.stringify(m),time(),id,attempt).run();
  console.log(JSON.stringify({event:'evaluation_completed',status:report.status,language:c.language}));
 }catch(error){const code=errorCode(error),status=code==='DAILY_BUDGET_EXHAUSTED'?'budget_deferred':code==='PUBLICATION_NO_LONGER_VISIBLE'?'withdrawn':'review_failed';await env.EVAL_DB.prepare('UPDATE eval_jobs SET status=?,error=?,updated_at=? WHERE id=? AND attempt_id=?').bind(status,code,time(),id,attempt).run();console.log(JSON.stringify({event:'evaluation_incomplete',reason:code}))}
}

async function retain(env:Env){
 const days=Number(env.RETENTION_DAYS);check(Number.isSafeInteger(days)&&days>=7,'INVALID_RETENTION');
 const expired=(await env.EVAL_DB.prepare(`SELECT id,snapshot_key,report_key,status FROM eval_jobs j WHERE expires_at<?
 AND status NOT IN ('reviewing','collecting')
 AND NOT EXISTS(SELECT 1 FROM eval_calls c WHERE c.job_id=j.id AND c.state IN ('RESERVED','UNKNOWN','OVERAGE')) LIMIT 20`).bind(time()).all<{id:string;snapshot_key:string|null;report_key:string|null;status:string}>()).results;
 for(const row of expired){
  const calls=(await env.EVAL_DB.prepare("SELECT response_key FROM eval_calls WHERE job_id=? AND state='SETTLED'").bind(row.id).all<{response_key:string|null}>()).results;
  const keys=[row.snapshot_key,row.report_key,`inventories/${row.id}.json`,...calls.map(c=>c.response_key)].filter((x):x is string=>!!x);
  if(keys.length)await env.EVIDENCE.delete(keys);
  await env.EVAL_DB.prepare('UPDATE eval_jobs SET snapshot_key=NULL,report_key=NULL,expires_at=NULL,status=? WHERE id=?').bind(['reviewed_no_findings','flagged','withdrawn'].includes(row.status)?row.status:'unreviewed_expired',row.id).run();
 }
}

export async function authorized(request:Request,secret:string){
 if(!secret||secret.length<32)return false;
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token||token.length>1024)return false;
 // Fixed-length hash comparison avoids timing differences from direct secrets.
 const encoder=new TextEncoder(),a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(secret)));let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function summary(env:Env){
 const groups=(await env.EVAL_DB.prepare('SELECT language,status,COUNT(*) count FROM eval_jobs GROUP BY language,status').all<{language:string;status:string;count:number}>()).results;
 const total=groups.reduce((n,r)=>n+r.count,0),allReviewed=groups.filter(r=>['flagged','reviewed_no_findings'].includes(r.status)).reduce((n,r)=>n+r.count,0);
 const progress=await env.EVAL_DB.prepare("SELECT COUNT(*) reviewed,MAX(updated_at) lastSuccessfulReview FROM eval_jobs WHERE review_version=? AND status IN ('flagged','reviewed_no_findings')").bind(PROTOCOL).first<{reviewed:number;lastSuccessfulReview:string|null}>();
 const reviewed=progress?.reviewed??0,spendingFenced=!!await env.EVAL_DB.prepare(activeFenceFor(env.SPENDING_MODE==='unlimited')).first();
 const costs=(await env.EVAL_DB.prepare('SELECT day_utc,state,COUNT(*) calls,SUM(COALESCE(cost_micro,reservation_micro))/1000000.0 usd FROM eval_calls GROUP BY day_utc,state ORDER BY day_utc DESC LIMIT 100').all()).results;
 const trends=(await env.EVAL_DB.prepare(`SELECT substr(published_at,1,10) day_utc,language,COUNT(*) eligible,
 SUM(CASE WHEN status IN ('flagged','reviewed_no_findings') THEN 1 ELSE 0 END) reviewed,SUM(flagged) flagged FROM eval_jobs GROUP BY 1,2 ORDER BY 1 DESC LIMIT 90`).all()).results;
 return {protocol:PROTOCOL,source:env.SOURCE_LABEL,enabled:env.EVALUATION_ENABLED==='true',spendingMode:env.SPENDING_MODE==='unlimited'?'unlimited':'bounded',dailyBudgetUsd:env.SPENDING_MODE==='unlimited'?null:Number(env.DAILY_BUDGET_USD),budgetTimezone:'UTC',eligible:total,reviewed,historicalReviewed:allReviewed-reviewed,lastSuccessfulReview:progress?.lastSuccessfulReview??null,spendingFenced,evaluationCoverage:total?reviewed/total:null,groups,costs,trends,discovery:await meta(env,'discovery'),lastTick:await meta(env,'last_tick'),grafana:await meta(env,'grafana'),humanCalibration:'not_measured',scientificAccuracy:'not_established'};
}
async function prometheus(env:Env){
 const s=await summary(env);const lines=['# HELP distilled_eval_eligible Discovered published briefings since enrollment.','# TYPE distilled_eval_eligible gauge',`distilled_eval_eligible ${s.eligible}`,'# TYPE distilled_eval_reviewed gauge',`distilled_eval_reviewed ${s.reviewed}`];
 for(const r of s.groups){const language=['en','ar','fr'].includes(r.language)?r.language:'other';check(/^[a-z_]+$/.test(r.status),'INVALID_METRIC_STATUS');lines.push(`distilled_eval_jobs{language="${language}",status="${r.status}"} ${r.count}`)}
 const calls=await env.EVAL_DB.prepare("SELECT COUNT(*) n,COALESCE(SUM(CASE WHEN state IN ('RESERVED','UNKNOWN','OVERAGE') THEN 1 ELSE 0 END),0) unresolved,COALESCE(SUM(COALESCE(cost_micro,reservation_micro)),0)/1000000.0 usd FROM eval_calls WHERE day_utc=?").bind(time().slice(0,10)).first<{n:number;unresolved:number;usd:number}>();
 lines.push(`distilled_eval_daily_cost_or_hold_usd ${calls?.usd??0}`,`distilled_eval_spending_unlimited ${s.spendingMode==='unlimited'?1:0}`,`distilled_eval_enabled ${s.enabled?1:0}`);
 if(s.dailyBudgetUsd!==null)lines.push(`distilled_eval_daily_budget_usd ${s.dailyBudgetUsd}`);
 const unresolved=await env.EVAL_DB.prepare("SELECT COUNT(*) n FROM eval_calls WHERE state IN ('RESERVED','UNKNOWN','OVERAGE')").first<{n:number}>();lines.push(`distilled_eval_unresolved_calls ${unresolved?.n??0}`);
 const isolated=await env.EVAL_DB.prepare("SELECT COUNT(*) n FROM eval_call_isolations i JOIN eval_calls c ON c.id=i.call_id WHERE c.state IN ('UNKNOWN','RESERVED')").first<{n:number}>();
 lines.push(`distilled_eval_isolated_calls ${isolated?.n??0}`,`distilled_eval_spending_fenced ${s.spendingFenced?1:0}`,`distilled_eval_historical_reviewed ${s.historicalReviewed}`,`distilled_eval_last_successful_review_timestamp_seconds ${s.lastSuccessfulReview?Math.floor(Date.parse(s.lastSuccessfulReview)/1000):0}`);
 const last=await meta<{at:string}>(env,'last_tick');lines.push(`distilled_eval_last_tick_timestamp_seconds ${last?Math.floor(Date.parse(last.at)/1000):0}`);
 const discovery=await meta<{status:string}>(env,'discovery');lines.push(`distilled_eval_discovery_success ${discovery?.status==='ok'?1:0}`);
 const partial=await env.EVAL_DB.prepare("SELECT COUNT(*) n FROM eval_jobs WHERE metrics_json IS NOT NULL AND json_extract(metrics_json,'$.importantDevelopmentRecallScope')<>'complete_retained_input'").first<{n:number}>();lines.push(`distilled_eval_partial_evidence_reviews ${partial?.n??0}`);
 for(const metric of ['claimSupport','citationCorrectness','importantDevelopmentRecall','repetition','relevance','temporalCorrectness','languageCorrectness']){
  // Report numerator AND denominator, never an undefined ratio as 100%.
  const rows=(await env.EVAL_DB.prepare(`SELECT language,SUM(json_extract(metrics_json,'$.${metric}.numerator')) n,SUM(json_extract(metrics_json,'$.${metric}.denominator')) d FROM eval_jobs WHERE metrics_json IS NOT NULL AND review_version=? ${metric==='importantDevelopmentRecall'?"AND json_extract(metrics_json,'$.importantDevelopmentRecallScope')='complete_retained_input'":''} GROUP BY language`).bind(PROTOCOL).all<{language:string;n:number;d:number}>()).results;
  const name=metric.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());for(const r of rows){const language=['en','ar','fr'].includes(r.language)?r.language:'other';lines.push(`distilled_eval_${name}_numerator{language="${language}"} ${r.n??0}`,`distilled_eval_${name}_denominator{language="${language}"} ${r.d??0}`)}
 }
 return new Response(lines.join('\n')+'\n',{headers:{'content-type':'text/plain; version=0.0.4','cache-control':'no-store'}});
}

export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(tick(env))},
 async queue(batch,env){for(const message of batch.messages){try{const body=message.body as MessageBody;check(/^[a-f0-9]{64}$/.test(body.jobId),'INVALID_MESSAGE');await processJob(env,body.jobId);message.ack()}catch{message.retry({delaySeconds:300})}}},
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/')return dashboardPage();
  const isMetrics=url.pathname==='/metrics';if(!await authorized(request,isMetrics?env.METRICS_TOKEN:env.DASHBOARD_TOKEN))return json({error:'Unauthorized'},401);
  try{
   if(request.method==='POST'&&url.pathname==='/api/discover'){await tick(env);return json(await summary(env))}
   if(request.method==='GET'&&isMetrics)return await prometheus(env);
   if(request.method==='GET'&&url.pathname==='/api/summary')return json(await summary(env));
   if(request.method==='GET'&&url.pathname==='/api/jobs'){
    const before=url.searchParams.get('before')??'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';check(/^[a-f0-9]{64}$/.test(before),'INVALID_CURSOR');
    const rows=(await env.EVAL_DB.prepare('SELECT j.id,j.feed_id,j.language,j.window_end,j.status,j.error,j.flagged,j.metrics_json,j.operational_json,a.disposition FROM eval_jobs j LEFT JOIN eval_annotations a ON a.job_id=j.id WHERE j.id<? ORDER BY j.id DESC LIMIT 50').bind(before).all()).results;
    return json({jobs:rows,next:rows.length===50?rows.at(-1)!.id:null});
   }
   const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{64})(?:\/(annotation|resume))?$/);
   if(match){const id=match[1],value=await job(env,id);if(!value)return json({error:'Not found'},404);
    if(request.method==='GET'&&!match[2]){const snapshotObject=value.snapshot_key?await env.EVIDENCE.get(value.snapshot_key):null,report=value.report_key?await env.EVIDENCE.get(value.report_key):null;check(!snapshotObject||snapshotObject.size<=2_000_000,'SNAPSHOT_SIZE_LIMIT');check(!report||report.size<=2_000_000,'REPORT_SIZE_LIMIT');return json({job:value,snapshot:snapshotObject?await snapshotObject.json():null,report:report?await report.json():null})}
    if(request.method==='POST'&&match[2]==='annotation'){
     const v=await boundedJson(new Response(request.body),10000) as {disposition:string;note:string;reviewer:string};check(['unresolved','confirmed','false_alarm','needs_evidence'].includes(v.disposition)&&typeof v.note==='string'&&v.note.length<=4000&&typeof v.reviewer==='string'&&v.reviewer.length>0&&v.reviewer.length<=120,'INVALID_ANNOTATION');
     await env.EVAL_DB.prepare('INSERT INTO eval_annotations VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET disposition=excluded.disposition,note=excluded.note,reviewer=excluded.reviewer,updated_at=excluded.updated_at').bind(id,v.disposition,v.note,v.reviewer,time()).run();return json({saved:true,labelOrigin:'operator_triage_not_independent_human_gold'});
    }
    if(request.method==='POST'&&match[2]==='resume'){
     check(!await env.EVAL_DB.prepare(activeFenceFor(env.SPENDING_MODE==='unlimited')).first(),'UNKNOWN_PROVIDER_OUTCOME_FENCE');
     if(value.status==='unassessable'&&value.edition_id){await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='pending_snapshot',error=NULL,updated_at=? WHERE id=? AND status='unassessable'").bind(time(),id).run();await env.REVIEWS.send({jobId:id});return json({queued:true,scope:'read_only_evidence_collection'})}
     check(value.snapshot_key&&['interrupted_unknown','budget_deferred'].includes(value.status),'JOB_NOT_SAFELY_RESUMABLE');await env.EVAL_DB.prepare("UPDATE eval_jobs SET status='ready',error=NULL,updated_at=? WHERE id=? AND status IN ('interrupted_unknown','budget_deferred')").bind(time(),id).run();await env.REVIEWS.send({jobId:id});return json({queued:true});
    }
   }
   return json({error:'Not found'},404);
  }catch(error){return json({error:errorCode(error)},400)}
 }
} satisfies ExportedHandler<Env,MessageBody>;
