import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {hashContent,sha256,type ConnectorHandoffRequest} from '@distilled/contracts';
import type {Env} from './types';
import {V1FeedStore} from './v1-intelligence/store';
import {V1IntakeStore} from './v1-intake/store';
import {createCandidateIntakePort} from './v1-intake/intake';
import {acceptAcquiredContent} from './v1-intake/evidence';
import {processV1Reassessment,processV1Briefing,windowIdentity} from './v1-intelligence/runtime';
import {publicV1Edition} from './v1-intelligence/public-read';
import {authorizeModelSpending} from './v1-intelligence/model-spending';
import {qaAccountedFetch} from './v3-qa-spending';
import type {IntakePolicy} from './v1-intake/types';

export type V3QaEnv=Env&{SPENDING_DB:D1Database;V3_QA_TOKEN:string;V3_QA_SCOPE:string;V3_QA_LIMIT_USD:string;V3_QA_VALID_UNTIL:string};
const article=z.object({id:z.string().min(1),title:z.string(),text:z.string().min(1),url:z.string().url(),source:z.string(),publishedAt:z.string().datetime(),observedAt:z.string().datetime(),contentCompleteness:z.enum(['COMPLETE','PARTIAL','UNKNOWN']).default('UNKNOWN'),rawRef:z.string().optional()});
const run=z.object({feedId:z.string().regex(/^qa-v3-[a-z0-9-]{1,60}$/),interest:z.string().min(1),language:z.enum(['en','ar','fr']).default('en'),windowStart:z.string().datetime(),windowEnd:z.string().datetime(),articles:z.array(article).max(40)});

/** Dedicated opt-in QA entry point. No public app, Cron, collectors, queues,
 * notification handlers or production routing are attached to this Worker. */
export default {async fetch(request:Request,env:V3QaEnv):Promise<Response>{
 const supplied=request.headers.get('authorization');
 if(!env.V3_QA_TOKEN||!supplied||!timingSafeEqual(new TextEncoder().encode(await sha256(supplied)),new TextEncoder().encode(await sha256('Bearer '+env.V3_QA_TOKEN))))return new Response('Not found',{status:404});
 if(env.BRIEFING_ENGINE!=='v3'||!env.SPENDING_DB)return Response.json({error:'QA_V3_CONFIGURATION_REQUIRED'},{status:503});
 const path=new URL(request.url).pathname;
 if(path.startsWith('/editions/')&&request.method==='GET'){const edition=await publicV1Edition(env.DB,path.slice('/editions/'.length));return edition?Response.json(edition):new Response('Not found',{status:404})}
 if(path!=='/run'||request.method!=='POST')return new Response('Not found',{status:404});
 if(Number(request.headers.get('content-length')??0)>2_000_000)return new Response('Input too large',{status:413});
 try{
  const text=await request.text();if(new TextEncoder().encode(text).length>2_000_000)return new Response('Input too large',{status:413});
  const input=run.parse(JSON.parse(text)),start=Date.parse(input.windowStart),end=Date.parse(input.windowEnd),created=new Date(start-1).toISOString();
  if(!(start<end)||end-start>7*86400000||end>Date.now())throw Error('QA_WINDOW_INVALID');
  const store=new V1FeedStore(env.DB),intake=new V1IntakeStore(env.DB),feed=await store.getFeed(input.feedId),now=new Date().toISOString();
  if(!feed)await store.registerFeed({id:input.feedId,ownerId:'isolated-v3-qa',title:'Isolated V3 evaluation',interests:[input.interest],geography:[],outputLanguage:input.language,briefingFrequency:'DAILY',paused:false,revision:1,createdAt:created,updatedAt:now});
  const localGrantId=env.V3_QA_SCOPE+':data-ledger-authority';
  if(!await env.DB.prepare('SELECT id FROM v1_model_spending_authorizations WHERE id=?').bind(localGrantId).first())await authorizeModelSpending(env.DB,{id:localGrantId,accountId:'isolated-v3-data',modelIds:['openai/gpt-4.1','openai/gpt-4.1-mini'],validFrom:'2026-10-21T00:00:00.000Z',validUntil:env.V3_QA_VALID_UNTIL,maxExposureUsd:19,maxConcurrentOperations:3});
  const sourceIds:string[]=[];
  for(const a of input.articles){
   const sourceId=await sha256(new URL(a.url).hostname),feedSourceId=input.feedId+':'+sourceId.slice(0,16);sourceIds.push(feedSourceId);
   if(!await intake.getScope(feedSourceId))await intake.registerScope({feedId:input.feedId,feedSourceId,sourceId,feedRevision:1,enabled:true,restrictions:{}});
   const id=await sha256(JSON.stringify({feedId:input.feedId,id:a.id,text:a.text})),fetchRunId='replay:'+id,sourceItemKey=a.id,sequence=Math.max(1,Math.floor(Date.parse(a.observedAt))),contentHash=await hashContent({representation:'ARTICLE_EXCERPT',body:a.text,title:a.title});
   const policy:IntakePolicy={version:'retained-source-replay-v1',now:()=>a.observedAt,factsFor:async()=>({}),orderingFor:async()=>({compareRevisions:()=>null,authoritativeReplacementAllowed:false}),verifySuppliedContent:async()=>undefined};
   const observation={id,feedId:input.feedId,feedSourceId,sourceId,fetchRunId,fetchStartSequence:sequence,sourceItemKey,operation:'UPSERT' as const,representation:'ARTICLE_EXCERPT' as const,contentCompleteness:a.contentCompleteness,contentHash,authoritativeCurrentState:false,canonicalUrl:a.url,suppliedPayloadRef:a.rawRef??'retained:'+a.id,observedAt:a.observedAt,publisherId:a.source};
   const batch:ConnectorHandoffRequest={contractVersion:'distilled-v1',handoffId:'qa:'+id,coverage:{id:'coverage:'+id,feedId:input.feedId,feedSourceId,fetchRunId,fetchStartSequence:sequence,requestedBounds:{},observedBounds:{},status:'PARTIAL',continuationState:'EXHAUSTED',createdAt:a.observedAt},observations:[observation],proposals:[{observationId:id,feedId:input.feedId,feedSourceId,sourceId,sourceItemKey,connectorType:'rss',url:a.url,representation:'ARTICLE_EXCERPT',contentCompleteness:a.contentCompleteness,suppliedPayloadRef:observation.suppliedPayloadRef,discoveredAt:a.observedAt,discoveryRunId:fetchRunId}]};
   const accepted=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
   if(accepted.receipts[0].candidateItemId)await acceptAcquiredContent(intake,{id:'content:'+id,feedId:input.feedId,candidateId:accepted.receipts[0].candidateItemId,sourceObservationId:id,representation:'ARTICLE_EXCERPT',contentCompleteness:a.contentCompleteness,title:a.title,body:a.text,canonicalUrl:a.url,publishedAt:a.publishedAt,language:input.language,acquiredAt:a.observedAt,acquisitionMethod:'supplied_payload',provenance:{routerVersion:'retained-source-replay-v1',stages:['SAVED_EVIDENCE_REPLAY'],rawPayloadRef:a.rawRef}},policy);
  }
  const scopes=await env.DB.prepare('SELECT id FROM v1_intake_scopes WHERE feed_id=?').bind(input.feedId).all<{id:string}>(),runtime={...env,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:scopes.results.map(s=>s.id).join(',')};
  const jobs=await env.DB.prepare("SELECT id FROM v1_jobs WHERE json_extract(json,'$.feedId')=? AND json_extract(json,'$.kind')='REASSESS' AND json_extract(json,'$.state')!='DONE'").bind(input.feedId).all<{id:string}>();
  for(const job of jobs.results)await processV1Reassessment(runtime,job.id);
  const window={start:input.windowStart,end:input.windowEnd,kind:'DAILY' as const},id=await windowIdentity(input.feedId,window),started=Date.now();
  const fetcher=qaAccountedFetch(env.SPENDING_DB,env.DB,env.V3_QA_SCOPE,input.feedId,input.windowEnd,Number(env.V3_QA_LIMIT_USD),env.V3_QA_VALID_UNTIL);
  const edition=await processV1Briefing(runtime,{type:'v1_briefing',feedId:input.feedId,window},()=>new Date().toISOString(),undefined,fetcher,{requireModel:true});
  const state=await store.read(input.feedId,'briefing_requests',id),reader=edition?await publicV1Edition(env.DB,id):undefined;
  return Response.json({engine:'v3',id,edition,reader,state,processingMs:Date.now()-started,replay:true,notifications:false});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'QA_RUN_FAILED'},{status:409})}
}};
