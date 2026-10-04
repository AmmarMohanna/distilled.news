import { connectorHandoffRequestSchema, HandoffError } from '@distilled/contracts';
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

function enabledSources(env:Env):string[] {
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 return env.V1_DOWNSTREAM_ENABLED==='true' && ids.length<=10?ids:[];
}

export function v1SourceEnabled(env:Env,id:string):boolean {
 return enabledSources(env).includes(id);
}
export function createV1RuntimePolicy(fetcher:typeof fetch=fetch):IntakePolicy {
 return {version:'v1-runtime-1',now:()=>new Date().toISOString(),factsFor:async()=>({}),verifySuppliedContent:async()=>undefined,
 orderingFor:async observation=>{
  let authoritativeReplacementAllowed=false;
  // An origin 410 is independent explicit deletion evidence. Provider-specific deletion checks remain connector integrations.
  if(observation.operation==='DELETE' && observation.authoritativeCurrentState && observation.canonicalUrl) {
   try {authoritativeReplacementAllowed=(await new WorkerPublicSourceFetch(observation.canonicalUrl,fetcher).get(observation.canonicalUrl)).status===410} catch { /* unresolved, fail closed */ }
  }
  return {authoritativeReplacementAllowed,compareRevisions:(a,b)=>{
   if(a.scheme!==b.scheme || a.authority!==b.authority) return null;
   if(['provider_integer','telegram_edit_date'].includes(a.scheme) && /^\d{1,30}$/.test(a.value) && /^\d{1,30}$/.test(b.value)) return BigInt(a.value)===BigInt(b.value)?0:BigInt(a.value)>BigInt(b.value)?1:-1;
   if(a.scheme==='telegram_edit_date' && Number.isFinite(Date.parse(a.value)) && Number.isFinite(Date.parse(b.value))) return Math.sign(Date.parse(a.value)-Date.parse(b.value)) as -1|0|1;
   return null;
  }};
 }};
}
export async function acceptV1Handoff(env:Env,raw:unknown) {
 const parsed=connectorHandoffRequestSchema.safeParse(raw);
 if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
 if(!v1SourceEnabled(env,parsed.data.coverage.feedSourceId)) throw new HandoffError('SCOPE_DENIED');
 await synchronizeV1ProductSource(env.DB,parsed.data.coverage.feedSourceId,new Date().toISOString());
 return createCandidateIntakePort(new V1IntakeStore(env.DB),createV1RuntimePolicy()).acceptBatch(parsed.data);
}
const payloadSchema=z.object({sourceObservationId:z.string().min(1),title:z.string().optional(),body:z.string().min(1).max(512000),language:z.string().optional(),languageResolution:languageResolutionSchema.optional(),publishedAt:z.string().datetime().optional()}).strict();
export async function processV1Acquisition(env:Env,id:string,fetcher:typeof fetch=fetch) {
 const store=new V1IntakeStore(env.DB),job=await store.read<{feedSourceId:string}>('jobs',id);
 if(!job || !v1SourceEnabled(env,job.feedSourceId)) return 'SKIPPED' as const;
 await synchronizeV1ProductSource(env.DB,job.feedSourceId,new Date().toISOString());
 const policy=createV1RuntimePolicy(fetcher);
 const router=createCandidateAcquisitionRouter({now:policy.now,fetcher,stagesForClaim:claim=>createV1BrowserStages(env,claim),readPayload:async claim=>{
  const ref=claim.input.observation.suppliedPayloadRef;
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
  const rows=await env.DB.prepare(`SELECT j.id FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id WHERE j.feed_source_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL AND json_extract(j.json,'$.kind')='ACQUIRE' AND (json_extract(j.json,'$.state')='PENDING' OR (json_extract(j.json,'$.state')='RUNNING' AND json_extract(j.json,'$.leaseUntil')<=?)) AND COALESCE(json_extract(j.json,'$.exhausted'),0)=0 AND (json_extract(j.json,'$.nextAttemptAt') IS NULL OR json_extract(j.json,'$.nextAttemptAt')<=?) ORDER BY j.id LIMIT 5`).bind(id,now.toISOString(),now.toISOString()).all<{id:string}>();
  for(const row of rows.results) {await env.PROCESSING_QUEUE.send({type:'v1_acquisition',jobId:row.id});sent++}
 }
 return sent;
}
