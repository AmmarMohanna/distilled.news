import {sha256} from '@distilled/contracts';
import {R2SourcePayloadStore,type SourceFetchRequest} from '@distilled/connectors';
import {authorizeConnectorSource} from './connector-runtime';
import type {Env} from './types';
import {productConnectorSource} from './connector-source';
import {canonicalJson} from './v1-intake/canonical';

/** An old financial receipt may be recovered after a feed revision changes.
 * Source identity, owner, current approval and the exact GET hash still bind it.
 * This permission never authorizes replay of the old collection/handoff. */
async function retainedReadApproved(env:Env,request:SourceFetchRequest):Promise<boolean>{
 if(await authorizeConnectorSource(env,request))return true;
 const row=await env.DB.prepare(`SELECT s.provider,s.kind,s.source_url,s.input,s.actor_id FROM sources s
 JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
 JOIN v1_feeds f ON f.id=b.id AND json_extract(f.json,'$.ownerId')=b.owner_account_id
 JOIN v1_intake_scopes v ON v.id=s.id AND v.feed_id=b.id
 WHERE s.id=? AND b.id=? AND v.source_id=? AND s.enabled=1 AND s.collection_owner='connector'
 AND b.paused=0 AND a.disabled_at IS NULL AND json_extract(v.json,'$.enabled')=1
 AND json_extract(v.json,'$.deletedAt') IS NULL AND json_extract(f.json,'$.deletedAt') IS NULL`)
 .bind(request.scope.feedSourceId,request.scope.feedId,request.scope.sourceId).first<{provider:string;kind:string;source_url:string|null;input:string|null;actor_id:string|null}>();
 const approved=row&&productConnectorSource(row);
 return !!approved&&canonicalJson(approved.source)===canonicalJson(request.source)&&Number.isSafeInteger(request.limit)&&request.limit>0&&request.limit<=approved.limit;
}

/** Bounded recovery of a legacy result GET, never an actor submission. The
 * exact run/cursor and endpoint hash are revalidated by reconcileApifyRead.
 * New operations already record readOnlyApify and self-recover in paid HTTP. */
export async function recoverInterruptedApifyRead(env:Env,feedId:string,sourceId:string):Promise<boolean>{
 if(!env.APIFY_API_TOKEN)return false;
 const row=await env.DB.prepare(`SELECT p.job_id FROM connector_provider_poll_jobs p
 WHERE json_extract(p.request,'$.scope.feedId')=? AND json_extract(p.request,'$.scope.feedSourceId')=?
 AND p.state='BLOCKED' AND p.last_error='UNCERTAIN_PAID_SUBMISSION'
 AND json_extract(p.request,'$.continuation.providerId') IN ('x_apify','linkedin_apify','google_apify')
 AND (p.lease_until IS NULL OR p.lease_until<=?)
 AND EXISTS(SELECT 1 FROM connector_provider_operations o WHERE o.feed_id=? AND o.feed_source_id=?
 AND o.provider_id=json_extract(p.request,'$.continuation.providerId') AND o.status=-1 AND o.payload_ref IS NULL AND o.ceiling_usd<=0.000001
 AND (json_extract(o.headers,'$.claimExpiresAt') IS NULL OR json_extract(o.headers,'$.claimExpiresAt')<=?))
 ORDER BY p.scheduled_at,p.job_id LIMIT 1`).bind(feedId,sourceId,new Date().toISOString(),feedId,sourceId,new Date().toISOString()).first<{job_id:string}>();
 if(!row)return false;
 try{
  await reconcileApifyRead(env,row.job_id,fetch,{retainedReadOnly:true});
  const saved=await env.DB.prepare('SELECT request FROM connector_provider_poll_jobs WHERE job_id=?').bind(row.job_id).first<{request:string}>();
  if(!saved)return true;
  const request=JSON.parse(saved.request) as SourceFetchRequest;
  if(!await authorizeConnectorSource(env,request)){
   // A retired poll stays blocked, but must not starve a later interrupted read.
   // Mark only after every operation belonging to this exact run is retained.
   const run=await sha256(JSON.stringify([request.scope,request.runId,request.continuation!.providerId]));
   const identities=await Promise.all(['start','status','dataset'].map(kind=>sha256(JSON.stringify([request.scope,run+':'+kind]))));
   const unknown=await env.DB.prepare(`SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id IN (?,?,?) AND payload_ref IS NULL LIMIT 1`)
    .bind(request.continuation!.providerId,...identities).first();
   if(!unknown)await env.DB.prepare(`UPDATE connector_provider_poll_jobs SET last_error='RETAINED_READ_RECONCILED' WHERE job_id=? AND request=? AND state='BLOCKED' AND last_error='UNCERTAIN_PAID_SUBMISSION' AND (lease_until IS NULL OR lease_until<=?)`)
    .bind(row.job_id,saved.request,new Date().toISOString()).run();
   return true;
  }
  const {recoverConnectorPoll}=await import('./connector-scheduling');
  await recoverConnectorPoll(env,'provider',row.job_id);return true;
 }catch(error){
  // Retain every unknown operation and let its exact read lease bound retries.
  console.warn(JSON.stringify({type:'CONNECTOR_EXISTING_RUN_RECOVERY_WAIT',feedId,sourceId,reason:error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:'READ_RECOVERY_FAILED'}));return false;
 }
}

/** Operator-only reconciliation of an already identified Apify run. It never
 * invokes an actor, refunds a reservation, changes a sequence or fabricates a
 * response. Endpoint/method hashes must match the original durable operation. */
export async function reconcileApifyRead(env:Env,jobId:string,fetcher:typeof fetch=fetch,options?:{retainedReadOnly:true}){
 const job=await env.DB.prepare('SELECT request,last_error,lease_until FROM connector_provider_poll_jobs WHERE job_id=?').bind(jobId).first<{request:string;last_error:string|null;lease_until:string|null}>();
 if(!job)throw Error('POLL_NOT_FOUND');
 if(job.lease_until&&Date.parse(job.lease_until)>Date.now())throw Error('POLL_LEASE_ACTIVE');
 const request=JSON.parse(job.request) as SourceFetchRequest,providerId=request.continuation?.providerId;
 if(!providerId||!['x_apify','google_apify','linkedin_apify'].includes(providerId)||!env.APIFY_API_TOKEN)throw Error('READ_RECOVERY_UNAVAILABLE');
 const approved=()=>options?.retainedReadOnly?retainedReadApproved(env,request):authorizeConnectorSource(env,request);
 if(!await approved())throw Error('SOURCE_NOT_APPROVED');
 const cursor=JSON.parse(request.continuation!.token) as {runId:string;offset:number};
 if(!/^\w+$/.test(cursor.runId)||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)throw Error('INVALID_CONTINUATION');
 const scope=request.scope,runId=await sha256(JSON.stringify([scope,request.runId,providerId])),payloads=new R2SourcePayloadStore(env.RAW_ARCHIVE);
 const startId=await sha256(JSON.stringify([scope,runId+':start']));
 if(await env.DB.prepare('SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND payload_ref IS NULL').bind(providerId,startId).first())throw Error('ACTOR_START_RECONCILIATION_REQUIRED');
 let recovered=0,statusData:any;
 for(const kind of ['status','dataset'] as const){
  let url=`https://api.apify.com/v2/actor-runs/${cursor.runId}`;
  if(kind==='dataset'){
   if(!/^\w+$/.test(statusData?.defaultDatasetId??''))break;
   const u=new URL(`https://api.apify.com/v2/datasets/${statusData.defaultDatasetId}/items`);
   u.searchParams.set('format','json');u.searchParams.set('clean','false');u.searchParams.set('offset',String(cursor.offset));u.searchParams.set('limit',String(request.limit));url=u.href;
  }
  const operationId=await sha256(JSON.stringify([scope,runId+':'+kind]));
  const row=await env.DB.prepare('SELECT request_hash,payload_ref,status,ceiling_usd FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND feed_id=? AND feed_source_id=?').bind(providerId,operationId,scope.feedId,scope.feedSourceId).first<{request_hash:string;payload_ref:string|null;status:number;ceiling_usd:number}>();
  if(!row)break;
  const hash=await sha256(JSON.stringify([url,'GET',null]));
  if(row.request_hash!==hash||row.ceiling_usd>0.000001)throw Error('READ_IDENTITY_MISMATCH');
  let bytes:Uint8Array;
  if(row.payload_ref)bytes=await payloads.get(scope,row.payload_ref);
  else{
   if(job.last_error!=='UNCERTAIN_PAID_SUBMISSION')throw Error('POLL_NOT_RECONCILABLE');
   if(row.status!==-1)throw Error('READ_STATE_CHANGED');
   const token=crypto.randomUUID(),now=Date.now();
   const claim=await env.DB.prepare(`INSERT INTO connector_provider_read_recoveries(feed_id,feed_source_id,source_id,run_id,provider_id,operation_id,token,lease_until)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(feed_id,feed_source_id,run_id,operation_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until
    WHERE state='PENDING' AND lease_until<=? RETURNING token`).bind(scope.feedId,scope.feedSourceId,scope.sourceId,runId,providerId,operationId,token,now+120000,now).first();
   if(!claim)throw Error('READ_RECOVERY_BUSY');
   const signal=AbortSignal.timeout(60000);
   const bounded=async<T>(operation:Promise<T>):Promise<T>=>{
    signal.throwIfAborted();let abort:()=>void=()=>{};
    const deadline=new Promise<never>((_,reject)=>{abort=()=>reject(Error('READ_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});});
    try{return await Promise.race([operation,deadline]);}finally{signal.removeEventListener('abort',abort);}
   };
   const response=await bounded(fetcher(url,{method:'GET',redirect:'manual',headers:{authorization:`Bearer ${env.APIFY_API_TOKEN}`},signal}));
   if(!response.ok)throw Error('READ_NOT_CONFIRMED');
   const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{if(reader)for(;;){const part=await bounded(reader.read());if(part.done)break;size+=part.value.length;if(size>4000000)throw Error('READ_TOO_LARGE');chunks.push(part.value);}}
   finally{void reader?.cancel().catch(()=>{});reader?.releaseLock();}
   bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const parsed=JSON.parse(new TextDecoder().decode(bytes));
   if(kind==='status'?parsed?.data?.id!==cursor.runId:!Array.isArray(parsed))throw Error('READ_NOT_CONFIRMED');
   if(!await approved())throw Error('SOURCE_NOT_APPROVED');
   const payload=await payloads.put(scope,bytes,'application/json');
   const headers=JSON.stringify({'content-type':response.headers.get('content-type')??'application/json'});
   const result=await env.DB.batch([
    env.DB.prepare(`UPDATE connector_provider_operations SET payload_ref=?,status=?,headers=? WHERE provider_id=? AND operation_id=? AND request_hash=? AND payload_ref IS NULL AND status=-1 AND EXISTS
     (SELECT 1 FROM connector_provider_read_recoveries WHERE feed_id=? AND feed_source_id=? AND run_id=? AND operation_id=? AND token=? AND lease_until>?) RETURNING operation_id`)
     .bind(payload.ref,response.status,headers,providerId,operationId,hash,scope.feedId,scope.feedSourceId,runId,operationId,token,Date.now()),
    env.DB.prepare(`UPDATE connector_provider_read_recoveries SET state='RESOLVED',checked_at=?,payload_ref=?,lease_until=0 WHERE feed_id=? AND feed_source_id=? AND run_id=? AND operation_id=? AND token=? AND EXISTS
     (SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND payload_ref=?)`)
     .bind(new Date().toISOString(),payload.ref,scope.feedId,scope.feedSourceId,runId,operationId,token,providerId,operationId,payload.ref)
   ]);
   if(!result[0].results.length)throw Error('READ_RECOVERY_CLAIM_LOST');recovered++;
  }
  const parsed=JSON.parse(new TextDecoder().decode(bytes));if(kind==='status'){if(parsed?.data?.id!==cursor.runId)throw Error('READ_NOT_CONFIRMED');statusData=parsed.data;}
 }
 return {state:'READ_RECONCILED',recovered,actorStatus:statusData?.status??'UNKNOWN'};
}
