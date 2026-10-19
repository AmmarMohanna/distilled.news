import type {Env} from './types';
import {STAGING_GROUPING_RUN_POLICY,STAGING_DISPOSITION_ATTEMPT_ID,STAGING_GROUPING_CEILING_USD,STAGING_GROUPING_CALL_LIMITS,STAGING_GROUPING_CAPABILITIES_JSON,freshStagingRematch} from './staging-grouping-run-policy';
import {stagingMissionDb} from './staging-mission-budget';
import {fetchRssCandidates,BoundedFeedHttp,HttpSourceExecution} from '@distilled/connectors';
import {readPublicArticle} from './v1-intake/public-article-http';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {enrollV1Source} from './v1-intelligence/product';
import {prepareRssHandoff,rssLanguageHint} from './v1-intake/rss-handoff';
import {acceptV1Handoff,processV1Acquisition} from './v1-downstream-runtime';
import {processV1Reassessment,processV1Rematch,processV1Briefing} from './v1-intelligence/runtime';
import {V1FeedStore,feedTransact} from './v1-intelligence/store';
import {windowIntakeCoverage} from './v1-intelligence/window-coverage';
import {withFeedWriteTurn} from './connector-intelligence-turn';
import {withLatency,measureLatency} from './v1-intelligence/latency';

/** Operator-only, default-off staging entrypoint. Not imported by production.
 * Fresh private product feed; no subscriptions, queue sends or delivery handler.
 * Immutable start markers prohibit automatic paid-attempt retries after a crash. */
export async function stagingMission(request:Request,env:Env):Promise<Response>{
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
 const feedId=env.STAGING_MISSION_FEED_ID,secret=env.STAGING_MISSION_TOKEN;
 if(!feedId?.startsWith('staging-fresh-')||!secret)return reply({error:'NOT_FOUND'},404);
 const supplied=request.headers.get('authorization')??'';
 const hashes=await Promise.all([supplied,'Bearer '+secret].map(s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
 if(new Uint8Array(hashes[0]).reduce((a,b,i)=>a|(b^new Uint8Array(hashes[1])[i]),0)!==0)return reply({error:'NOT_FOUND'},404);
 const action=new URL(request.url).pathname.split('/').at(-1)!;
 if(!['prepare','collect','diagnose','review','review-resume','review-contract-v2','review-disposition-v1','publish-disposition-v1','publish','status'].includes(action)||request.method!==(action==='status'?'GET':'POST'))return reply({error:'INVALID_ACTION'},400);
 const groupingRun=env.STAGING_GROUPING_RUN_POLICY===STAGING_GROUPING_RUN_POLICY;
 if(action==='review-contract-v2'&&!groupingRun)return reply({error:'NEW_RUN_NOT_ACTIVATED'},409);
 if(['review-disposition-v1','publish-disposition-v1'].includes(action)&&!groupingRun)return reply({error:'NEW_RUN_NOT_ACTIVATED'},409);
 if(groupingRun&&!['review-disposition-v1','publish-disposition-v1','status'].includes(action))return reply({error:'NEW_ATTEMPT_ACTION_REQUIRED'},409);
 const databaseMetrics={queries:0,sqlCpuMs:0,responseBytes:0,wallMs:0};
 const db=stagingMissionDb(env.DB,feedId,groupingRun?STAGING_GROUPING_CEILING_USD:10,databaseMetrics,groupingRun?STAGING_GROUPING_CALL_LIMITS:undefined),sourceId=feedId+'-rss';
 const scoped={...env,...(groupingRun?{V1_MODEL_CAPABILITIES_JSON:STAGING_GROUPING_CAPABILITIES_JSON}:{}),DB:db,SOURCE_QUEUE_SCHEDULING_ENABLED:'false',V1_DOWNSTREAM_FEED_SOURCE_IDS:sourceId,V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',V1_PROCESSING_QUEUE:undefined,V1_ACQUISITION_QUEUE:undefined,PROCESSING_QUEUE:new Proxy(env.PROCESSING_QUEUE,{get(){throw Error('MISSION_QUEUE_SEND_FORBIDDEN')}}),SOURCE_COLLECTION_QUEUE:undefined} as Env;
 const read=async(id:string)=>{const row=await db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='staging_mission' AND id=?").bind(feedId,feedId+':'+id).first<{json:string}>();return row?JSON.parse(row.json):undefined;};
 const save=async(id:string,value:unknown)=>db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('staging_mission',?,?,?)").bind(feedId+':'+id,feedId,JSON.stringify(value)).run();
 const started=performance.now(),now=()=>new Date().toISOString();
 try{
  if(action!=='prepare'){const p=await db.prepare('SELECT public_feed_enabled FROM briefings WHERE id=?').bind(feedId).first<{public_feed_enabled:number}>();if(!p||p.public_feed_enabled!==0)throw Error('PRIVATE_FEED_REQUIRED');}
  if(action==='prepare'){
   if(await db.prepare('SELECT id FROM briefings WHERE id=?').bind(feedId).first())return reply({error:'FRESH_FEED_ALREADY_EXISTS_NO_RESET'},409);
   const owner=await db.prepare('SELECT owner_account_id FROM briefings WHERE id=?').bind('briefing_4d69fb82-7190-4e19-bcc3-cb0a7decc8d7').first<{owner_account_id:string}>();if(!owner)throw Error('STAGING_OWNER_REQUIRED');
   const at=now(),url='https://techcrunch.com/category/artificial-intelligence/feed';
   await db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,language,created_at,updated_at) VALUES(?,?,?,'Fresh staging AI briefing','Important AI product and industry developments',0,'en',?,?)").bind(feedId,owner.owner_account_id,feedId,at,at).run();
   await db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES(?,?,'TechCrunch AI','channel','rss','rss_feed',?,1,'legacy',?,?,?)").bind(sourceId,feedId,url,at,at,at).run();
   const source=await enrollV1Source(db,sourceId,owner.owner_account_id,at);await save('prepare-start',{at,ceilingUsd:10,maxDevelopments:3,sourceUrl:url,feedRevision:source.feed.revision});
  }
  if(action==='prepare'||action==='collect'){
   const preparedStart=await read('prepare-start');if(!preparedStart)throw Error('PREPARE_REQUIRED');if(await read('prepared'))throw Error('ALREADY_COLLECTED');
   if(action==='collect'){if(await read('collection-resume-start'))throw Error('COLLECTION_RESUME_ALREADY_STARTED');await save('collection-resume-start',{at:now(),reason:'SAME_ORIGIN_REDIRECT_TRANSPORT_FIX_NO_PAID_RETRY'});}
   const at=preparedStart.at,url=preparedStart.sourceUrl;
   const owner=await db.prepare('SELECT owner_account_id FROM briefings WHERE id=?').bind(feedId).first<{owner_account_id:string}>();if(!owner)throw Error('OWNER_REQUIRED');
   const source=await enrollV1Source(db,sourceId,owner.owner_account_id,now());
   let raw='';const batch=await fetchRssCandidates({url,resourceId:sourceId,checkpoint:{version:'0'},maxItems:1},{get:async()=>{const http=new BoundedFeedHttp(async(value,init)=>fetch(value,{...init,redirect:'manual'}),{maxBytes:512000});const r=await readPublicArticle(http,url);raw=r.body;return {status:r.status,body:r.body,headers:{}};}});
   if(batch.retry.kind!=='none'||batch.observations.length!==1){await save('collection-failure:'+action,{at:now(),retry:batch.retry,observations:batch.observations.length,telemetry:batch.telemetry});throw Error('FRESH_COLLECTION_NOT_READY');}
   const coverage={id:feedId+':coverage',feedId,feedSourceId:sourceId,fetchRunId:feedId+':run',fetchStartSequence:1,requestedBounds:{},observedBounds:{startTime:at,endTime:now()},status:'PARTIAL' as const,continuationState:'NONE' as const,createdAt:now()};
   const handoff=await prepareRssHandoff(batch,{scope:source.scope,coverage,languageHint:rssLanguageHint(raw)},env.RAW_ARCHIVE);
   const acceptance=await acceptV1Handoff(scoped,handoff);await save('prepared',{at:now(),start:at,observationId:handoff.observations[0].id,sourceUrl:url,articleUrl:batch.observations[0].url,coverage:'BOUNDED_ONE_ARTICLE_PARTIAL_SOURCE_COVERAGE',collectionWallMs:performance.now()-started,acceptance});
  }
  if(action==='diagnose'){
   const p=await read('prepared');if(!p)throw Error('PREPARE_REQUIRED');
   const http=new BoundedFeedHttp(async(value,init)=>fetch(value,{...init,redirect:'manual'}),{maxBytes:512000}),page=await readPublicArticle(http,p.articleUrl);
   let helperHttpStatus:number|undefined;
   const executor=new HttpSourceExecution(env.SOURCE_EXECUTION_URL!,env.SOURCE_EXECUTION_TOKEN!,async(value,init)=>{const r=await env.SOURCE_EXECUTION_SERVICE!.fetch(value,init);helperHttpStatus=r.status;return r;},true,25000);
   let extraction:unknown;try{const r=await executor.execute('extract',{url:p.articleUrl,html:page.body}) as any;extraction={error:r?.error,pageKind:r?.pageKind,bodyCharacters:r?.body?.length,hasPublishedAt:!!r?.publishedAt};}catch(e){extraction={error:e instanceof Error?e.message:'UNKNOWN'}}
   return reply({feedId,helperHttpStatus,articleHttpStatus:page.status,htmlBytes:new TextEncoder().encode(page.body).length,extraction});
  }
  if(action==='review'||action==='review-resume'){
   const prepared=await read('prepared');if(!prepared)throw Error('PREPARE_REQUIRED');if(action==='review'&&await read('review-start'))return reply({error:'REVIEW_ALREADY_STARTED_NO_AUTOMATIC_RETRY'},409);
   if(action==='review-resume'){const paid=await db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations WHERE feed_id=?').bind(feedId).first<number>('n');if(paid||await read('review-resume-start'))throw Error('PAID_OR_REPEATED_REVIEW_RESUME_FORBIDDEN');}
   await save(action==='review'?'review-start':'review-resume-start',{at:now(),reason:action==='review'?'INITIAL':'UNPAID_ACQUISITION_RECOVERY_ONLY'});const acquisition=await processV1Acquisition(scoped,JSON.stringify(['ACQUIRE',prepared.observationId,'']));
   const review=await processV1Reassessment(scoped,JSON.stringify(['REASSESS',prepared.observationId,'']));
   const coverage=await windowIntakeCoverage(db,feedId,now());if(coverage.state!=='COMPLETE')throw Error('INTAKE_NOT_COMPLETE');
   const pending=await db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE feed_id=? AND kind='intelligence_receipts' AND json_extract(json,'$.semanticDeferred')=1").bind(feedId).first<number>('n');if(pending)throw Error('SEMANTIC_REVIEW_DEFERRED');
   await save('reviewed',{at:now(),acquisition,review,coverage,wallMs:performance.now()-started});
  }
  if(action==='review-contract-v2'||action==='review-disposition-v1'){
   const disposition=action==='review-disposition-v1',scope=disposition?STAGING_DISPOSITION_ATTEMPT_ID:'review-contract-v2';
   const prepared=await read('prepared');if(!prepared)throw Error('PREPARE_REQUIRED');
   if(await read(scope+'-start'))throw Error('CONTRACT_REVIEW_ALREADY_STARTED_NO_RETRY');
   const totals=await db.prepare('SELECT COUNT(*) n,SUM(CASE WHEN s.reported=1 THEN 0 ELSE 1 END) unknown FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=?').bind(feedId).first<{n:number;unknown:number}>();
   if(totals?.n!==(disposition?10:2)||totals.unknown)throw Error('EXPECTED_SETTLED_BASELINE_REQUIRED');
   const store=new V1FeedStore(db),requests=await store.list<import('./v1-intelligence/rematch').RematchRequest>(feedId,'rematch_requests');
   if(requests.length!==1)throw Error('EXACT_REMATCH_REQUIRED');
   const attemptAt=now(),runRequest=disposition?await freshStagingRematch(requests[0],scope,attemptAt):requests[0];await save(scope+'-start',{at:attemptAt,attemptId:scope,baseCommit:disposition?'38f1a9d':undefined,policy:STAGING_GROUPING_RUN_POLICY,ceilingUsd:STAGING_GROUPING_CEILING_USD,baselineOperations:totals.n,rematchRequestId:runRequest.id,previousRequestId:requests[0].id});
   if(disposition)await feedTransact(store,feedId,async tx=>{if(await tx.read('rematch_requests',runRequest.id))throw Error('FRESH_REMATCH_ALREADY_EXISTS');await tx.write('rematch_requests',runRequest.id,runRequest)});
   await processV1Rematch(scoped,feedId,runRequest.id);
   const attempts=await store.list<{requestId:string;state:string}>(feedId,'rematch_attempts');
   if(!attempts.some(a=>a.requestId===runRequest.id&&a.state==='SUCCEEDED'&&(!disposition||(a as any).createdAt>=attemptAt)))throw Error('SEMANTIC_REMATCH_NOT_SUCCEEDED');
   const coverage=await windowIntakeCoverage(db,feedId,now());if(coverage.state!=='COMPLETE')throw Error('INTAKE_NOT_COMPLETE');
   await save(disposition?scope+'-reviewed':'reviewed',{at:now(),attemptId:scope,review:'CONTRACT_REMATCH_SUCCEEDED',coverage,policy:STAGING_GROUPING_RUN_POLICY,wallMs:performance.now()-started});
  }
  if(action==='publish'||action==='publish-disposition-v1'){
   const disposition=action==='publish-disposition-v1',scope=disposition?STAGING_DISPOSITION_ATTEMPT_ID:'publication';
   const startId=disposition?scope+'-publication-start':'publication-start',outcomeId=disposition?scope+'-publication-outcome':'publication-outcome';
   const prepared=await read('prepared'),reviewed=await read(disposition?scope+'-reviewed':'reviewed');if(!prepared||!reviewed)throw Error('REVIEW_REQUIRED');if(await read(startId))return reply({error:'PUBLICATION_ALREADY_STARTED_NO_AUTOMATIC_RETRY'},409);
   const window={start:prepared.start,end:reviewed.at,kind:'HOURLY' as const};await save(startId,{at:now(),attemptId:scope,window,ceilingUsd:groupingRun?STAGING_GROUPING_CEILING_USD:10});
   const edition=await withLatency({feedId,phase:'PUBLICATION_TURN'},()=>measureLatency('PUBLICATION_EXCLUSIVE_TURN',()=>withFeedWriteTurn({...scoped,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'},feedId,()=>processV1Briefing(scoped,{type:'v1_briefing',feedId,window},now,undefined,fetch,{requireModel:true,maxSelectedDevelopments:3}),'fresh-staging-publication')));
   await save(outcomeId,{at:now(),editionId:edition?.id??null,wallMs:performance.now()-started,status:edition?'PUBLISHED':'DEFERRED'});
  }
  const privacy=await db.prepare('SELECT public_feed_enabled FROM briefings WHERE id=?').bind(feedId).first<{public_feed_enabled:number}>();if(!privacy||privacy.public_feed_enabled!==0)throw Error('PRIVATE_FEED_REQUIRED');
  const stages=await db.prepare("SELECT id,json FROM v1_feed_documents WHERE feed_id=? AND kind='staging_mission' ORDER BY id").bind(feedId).all();
  const costs=await db.prepare(`SELECT r.id,r.model,r.reserved_cost_usd,s.cost_usd,s.reported,r.created_at,json_extract(d.json,'$.input.kind') kind,json_extract(d.json,'$.input.state.phase') phase FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id LEFT JOIN v1_feed_documents d ON d.feed_id=r.feed_id AND r.id=d.kind||':'||d.id WHERE r.feed_id=? ORDER BY r.created_at`).bind(feedId).all();
  const store=new V1FeedStore(db);console.info(JSON.stringify({type:'STAGING_MISSION_DB_METRICS',feedId,action,...databaseMetrics}));return reply({feedId,action,databaseMetrics,wallMs:performance.now()-started,stages:stages.results,costs:costs.results,editions:await store.list(feedId,'editions'),requests:await store.list(feedId,'briefing_requests'),verification:await store.list(feedId,'publication_validation_results')});
 }catch(error){console.info(JSON.stringify({type:'STAGING_MISSION_DB_METRICS',feedId,action,...databaseMetrics}));return reply({feedId,action,databaseMetrics,error:error instanceof Error?error.message:'MISSION_FAILED',wallMs:performance.now()-started},409)}
}
