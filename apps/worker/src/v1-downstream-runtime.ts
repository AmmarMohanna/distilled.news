import {enqueueV1,pendingV1Jobs} from './v1-queue-dispatch';
import { connectorHandoffRequestSchema, HandoffError,type SourceObservation } from '@distilled/contracts';
import { z } from 'zod';
import type { Env } from './types';
import { V1IntakeStore } from './v1-intake/store';
import { createCandidateIntakePort } from './v1-intake/intake';
import { createCandidateAcquisitionRouter } from './v1-intake/acquisition-router';
import { runAcquisitionJob, AcquisitionFailure } from './v1-intake/acquisition';
import type { IntakePolicy } from './v1-intake/types';
import { WorkerPublicSourceFetch } from './public-source-fetch';
import {synchronizeV1ProductSource} from './v1-intelligence/product';
import {createV1BrowserStages} from './v1-intake/browser-stages';
import {languageResolutionSchema} from './v1-intelligence/language';
import {readConnectorPayload} from './connector-payload';
import {HttpSourceExecution,BoundedFeedHttp} from '@distilled/connectors';
import {verifyConnectorAuthority} from './connector-authority';
import {sharedPublicHttp} from './connector-public-cache';
import {withFeedWriteTurn,IntelligenceTurnBusy} from './connector-intelligence-turn';
import {readPublicArticle} from './v1-intake/public-article-http';

function enabledSources(env:Env):string[] {
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 return env.V1_DOWNSTREAM_ENABLED==='true'?ids:[];
}

export function v1SourceEnabled(env:Env,id:string):boolean {
 return enabledSources(env).includes(id);
}
async function approvedDynamicSource(env:Env,id:string):Promise<boolean>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')return v1SourceEnabled(env,id);
 return !!await env.DB.prepare("SELECT s.id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.collection_owner='connector' AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL").bind(id).first();
}
export function createV1RuntimePolicy(fetcher:typeof fetch=fetch,bucket?:R2Bucket,verifyAuthority?:(o:SourceObservation)=>Promise<boolean>):IntakePolicy {
 // Scope-bound content-addressed payload verification is immutable. Keep only
 // its small verified metadata for this call's CAS retries, never article bytes
 // or current-origin/restriction checks, and never share it across requests.
 const supplied=new Map<string,ReturnType<IntakePolicy['verifySuppliedContent']>>();
 return {version:'v1-runtime-1',now:()=>new Date().toISOString(),factsFor:async()=>({}),verifySuppliedContent:async o=>{
  if(!bucket)return undefined;
  const key=JSON.stringify([o.feedId,o.feedSourceId,o.sourceId,o.id,o.suppliedPayloadRef,o.contentHash,o.representation,o.contentCompleteness,o.canonicalUrl,o.publisherId]);
  let verified=supplied.get(key);
  if(!verified){verified=readConnectorPayload(bucket,o).then(payload=>payload?{representation:o.representation,contentCompleteness:o.contentCompleteness,contentHash:o.contentHash!}:undefined);supplied.set(key,verified);}
  return verified;
 },
 orderingFor:async observation=>{
  let authoritativeReplacementAllowed=verifyAuthority?await verifyAuthority(observation):false;
  // An origin 410 is independent explicit deletion evidence. Provider-specific deletion checks remain connector integrations.
  if(!authoritativeReplacementAllowed&&observation.operation==='DELETE' && observation.authoritativeCurrentState && observation.canonicalUrl) {
   try {authoritativeReplacementAllowed=(await new WorkerPublicSourceFetch(observation.canonicalUrl,fetcher).get(observation.canonicalUrl)).status===410} catch { /* unresolved, fail closed */ }
  }
  return {authoritativeReplacementAllowed,compareRevisions:(a,b)=>{
   if(a.scheme!==b.scheme || a.authority!==b.authority) return null;
   if(['provider_integer','telegram_edit_date'].includes(a.scheme) && /^\d{1,30}$/.test(a.value) && /^\d{1,30}$/.test(b.value)) return BigInt(a.value)===BigInt(b.value)?0:BigInt(a.value)>BigInt(b.value)?1:-1;
   if(['telegram_edit_date','telegram_edit_timestamp'].includes(a.scheme) && Number.isFinite(Date.parse(a.value)) && Number.isFinite(Date.parse(b.value))) return Math.sign(Date.parse(a.value)-Date.parse(b.value)) as -1|0|1;
   return null;
  }};
 }};
}
export async function acceptV1Handoff(env:Env,raw:unknown,expectedFeedRevision?:number) {
 const parsed=connectorHandoffRequestSchema.safeParse(raw);
 if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
 if(env.V1_DOWNSTREAM_ENABLED!=='true'||!await approvedDynamicSource(env,parsed.data.coverage.feedSourceId)) throw new HandoffError('SCOPE_DENIED');
 try{return await withFeedWriteTurn(env,parsed.data.coverage.feedId,async()=>{
  await synchronizeV1ProductSource(env.DB,parsed.data.coverage.feedSourceId,new Date().toISOString());
  return createCandidateIntakePort(new V1IntakeStore(env.DB),{...createV1RuntimePolicy(fetch,env.RAW_ARCHIVE,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?o=>verifyConnectorAuthority(env,o):undefined),expectedFeedRevision}).acceptBatch(parsed.data);
 });}catch(error){if(error instanceof IntelligenceTurnBusy)throw new HandoffError('TEMPORARY_UNAVAILABLE');throw error;}
}
const payloadSchema=z.object({sourceObservationId:z.string().min(1),title:z.string().optional(),body:z.string().min(1).max(512000),language:z.string().optional(),languageResolution:languageResolutionSchema.optional(),publishedAt:z.string().datetime().optional()}).strict();
export async function processV1Acquisition(env:Env,id:string,fetcher:typeof fetch=fetch) {
 const store=new V1IntakeStore(env.DB),job=await store.read<{feedSourceId:string}>('jobs',id);
 if(!job || env.V1_DOWNSTREAM_ENABLED!=='true'||!await approvedDynamicSource(env,job.feedSourceId)) return 'SKIPPED' as const;
 await synchronizeV1ProductSource(env.DB,job.feedSourceId,new Date().toISOString());
 const policy=createV1RuntimePolicy(fetcher,env.RAW_ARCHIVE,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?o=>verifyConnectorAuthority(env,o):undefined);
 const authorizeArticle=async(url:string)=>{new WorkerPublicSourceFetch(url,fetcher);if(!await approvedDynamicSource(env,job.feedSourceId))throw new AcquisitionFailure('POLICY_DENIED',false);};
 const articleMaxBytes=512000;
 const articleHttp=env.SOURCE_SHARED_PUBLIC_FETCH_ENABLED==='true'?sharedPublicHttp(env.DB,env.RAW_ARCHIVE,new BoundedFeedHttp(async(url,init)=>{await authorizeArticle(url);return fetcher(url,{...init,redirect:'manual'})},{maxBytes:articleMaxBytes}),authorizeArticle,Date.now,articleMaxBytes):undefined;
 const execution=env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN&&env.SOURCE_EXECUTION_SERVICE&&env.SOURCE_NATIVE_EXECUTION_ENABLED!=='true'?
  new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,async(value,init)=>{if(!await approvedDynamicSource(env,job.feedSourceId))throw new AcquisitionFailure('POLICY_DENIED',false);return env.SOURCE_EXECUTION_SERVICE!.fetch(value,init)},true):env.SOURCE_NATIVE_EXECUTION_ENABLED==='true'?nativeSourceExecution(async(value,init)=>{await authorizeArticle(String(value));return fetcher(value,init)}):undefined;
 const router=createCandidateAcquisitionRouter({now:policy.now,fetcher,preferFullArticle:env.SOURCE_FULL_ARTICLES_ENABLED==='true',
 publicGet:articleHttp?url=>readPublicArticle(articleHttp,url):undefined,
 publicArticle:execution&&env.SOURCE_FULL_ARTICLES_ENABLED==='true'?async(url)=>{await authorizeArticle(url);const result=await execution.execute('public_article',{url},{timeoutMs:25000});await authorizeArticle(url);return result;}:undefined,
 extractHtml:execution?async(url,html)=>{
  await authorizeArticle(url);const result=await execution!.execute('extract',{url,html});await authorizeArticle(url);return result;
 }:undefined,stagesForClaim:claim=>createV1BrowserStages(env,claim),readPayload:async claim=>{
  const ref=claim.input.observation.suppliedPayloadRef;
  const connectorPayload=await readConnectorPayload(env.RAW_ARCHIVE,claim.input.observation);
  if(connectorPayload)return connectorPayload;
  // Scoped payload object keys are a capability, never an arbitrary R2 pointer supplied by a client.
  if(!ref?.startsWith(`v1/payloads/${encodeURIComponent(claim.job.feedSourceId)}/`)) return undefined;
  const object=await env.RAW_ARCHIVE.get(ref);if(!object) return undefined;
  if(object.size>512000) throw new AcquisitionFailure('INVALID_RESULT',false);
  let raw:unknown;try {raw=await object.json()} catch {throw new AcquisitionFailure('INVALID_RESULT',false)}
  const payload=payloadSchema.safeParse(raw);
  if(!payload.success || payload.data.sourceObservationId!==claim.job.observationId) throw new AcquisitionFailure('INVALID_RESULT',false);
  const {sourceObservationId:_,...content}=payload.data;return content;
 }});
 return runAcquisitionJob(store,id,policy,router);
}
/** Existing queue transport; bounded relay recovers crashes, lost sends and delayed transient retries. */
export async function dispatchV1Acquisitions(env:Env,now=new Date()):Promise<number> {
 if(env.V1_DOWNSTREAM_ENABLED!=='true') return 0;
 const ids=enabledSources(env);
 let sent=0;
 for(const id of ids) {
  try {await synchronizeV1ProductSource(env.DB,id,now.toISOString())} catch(error) {if(error instanceof HandoffError && ['SCOPE_DENIED','IDEMPOTENCY_CONFLICT','INVALID_REQUEST'].includes(error.code)) continue;throw error}
  const rows=await pendingV1Jobs(env,id,'ACQUIRE',now);
  for(const row of rows) if(await enqueueV1(env,'v1_acquisition',row.id,{type:'v1_acquisition',jobId:row.id},now))sent++
 }
 return sent;
}
import {nativeSourceExecution} from './native-source-execution';
