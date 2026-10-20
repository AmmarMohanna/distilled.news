import {it,expect,vi} from 'vitest';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {V1IntakeStore} from '../apps/worker/src/v1-intake/store';
import {seedIntakeScope} from '../apps/worker/src/v1-intake/test-utils';
import {V1FeedStore} from '../apps/worker/src/v1-intelligence/store';
import {feedFixture} from '../apps/worker/src/v1-intelligence/test-utils';
import {importSavedNews} from './news-evaluation-acquisition';
import {authorizeModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {createEvaluationEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {llmRoute,phaseTask} from '../apps/worker/src/v1-intelligence/provider-routing';
import type {StrongSemanticModel} from '../apps/worker/src/v1-intelligence/semantic-model';
import type {Env} from '../apps/worker/src/types';
import {processNewsToBriefing,hash,profileNewsDatabase,replayNewsWindow} from './news-end-to-end';
import {loadNews,saveNews,newsEvaluationTransport} from './news-evaluation-transport';

const newsRoot='.local-reports/news-correctness-openrouter';
it.skipIf(process.env.DISTILLED_NEWS_CORRECTNESS_PAID!=='USER_AUTHORIZED_12_CALLS_1_50')('publishes the corrected three-article OpenRouter briefing with bounded remote paid authority',async()=>{
 const manifest=loadNews(newsRoot+'/manifest.json'),corpus=loadNews(newsRoot+'/corpus.json');expect(hash(corpus)).toBe(manifest.corpusHash);
 const approval=loadNews(newsRoot+'/approval.json');for(;;){const wait=Date.parse(approval.validFrom)-Date.now();if(wait<=0)break;console.info(JSON.stringify({type:'NEWS_RUN_AUTHORIZATION_WAIT',until:approval.validFrom,remainingMs:wait}));await new Promise(r=>setTimeout(r,Math.min(30000,wait+50)))}
 const vars=readFileSync(process.env.DISTILLED_EVALUATION_VARS_FILE!,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('NEWS_EVALUATION_CREDENTIALS_REQUIRED');
 const baseEnv:any={OPENROUTER_API_KEY:key,V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',V1_SYNTHESIS_MODEL_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_INFERENCE_CONCURRENCY:'1',V1_RECONCILIATION_MODE:'DEVELOPMENTS'};
 const transport=newsEvaluationTransport(baseEnv,{correctnessOnly:true}),reports:any[]=[];
 const providers=['openrouter'] as const;
 try{for(const provider of providers){
  const mf=await persistentEvaluationDatabase(join(process.cwd(),newsRoot,'d1-correctness-final-'+provider));
  saveNews(newsRoot+'/'+provider+'-persistence.json',{path:mf.persistedPath,scope:'LOCAL_ONLY'});
  try{
   const db=mf.db;
   if(!await db.prepare("SELECT name FROM sqlite_master WHERE name='v1_intake_scopes'").first()){
    for(const name of readdirSync('apps/worker/migrations').filter(n=>n.endsWith('.sql')).sort()){const sql=readFileSync('apps/worker/migrations/'+name,'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' ').trim();if(sql)await db.exec(sql)}
    // Local coordination mirror only. Every actual provider call must ALSO
    // pass the remote immutable scope and reservation broker above.
    await authorizeModelSpending(db,{id:'isolated-local-mirror',accountId:'local-news-mirror',modelIds:['*'],validFrom:'2026-10-01T00:00:00Z',validUntil:'2026-10-22T00:00:00Z',maxExposureUsd:1.5,maxConcurrentOperations:3});
    await db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','evaluation@example.invalid','evaluation@example.invalid','evaluation-local','user','not-a-credential','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','evaluation','Isolated evaluation','AI news',0,'2026-10-03','2026-10-03');");await seedIntakeScope(new V1IntakeStore(db));await new V1FeedStore(db).registerFeed({...feedFixture,title:'AI industry news',interests:['AI products','AI companies','AI safety'],geography:[]});
   }
   const profile=profileNewsDatabase(db),records:any[]=[],originalInfo=console.info.bind(console),logging=vi.spyOn(console,'info').mockImplementation((line:any)=>{try{const r=JSON.parse(String(line));if(r.type==='V1_PIPELINE_LATENCY')records.push(r)}catch{}originalInfo(line)});
   const env={...baseEnv,DB:profile.db,DISTILLED_LLM_API_GATEWAY:provider,V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1',V1_LLM_ROUTES_JSON:JSON.stringify(Object.fromEntries(['construction','reconciliation','editorial','writer','verification','repair','relation','novelty'].map(task=>[task,{provider,model:'openai/gpt-4.1'}])))} as Env;
   const strong=(task:'construction'|'editorial'):StrongSemanticModel=>{
    let latest={calls:0,costUsd:0,reported:true};const route=llmRoute(env,task);
    return {model:route.identity,fork:()=>strong(task),forPhase:phase=>strong(phaseTask(phase)==='editorial'?'editorial':'construction'),admission:(state,schema)=>transport.admission(route,state,schema),usage:()=>latest,complete:async(feedId,phase,payload,schema)=>{
     const envelope=transport.admission(route,payload,schema);latest={calls:1,costUsd:envelope.reservationCostUsd,reported:false};const result=await transport.complete({route,feedId,phase,payload,schema,limits:{maxOutputTokens:envelope.maxOutputTokens,signal:AbortSignal.timeout(180000)}});latest={calls:1,costUsd:result.usage.cost,reported:result.usage.confirmed};return {value:result.result,usage:{...latest,tokensIn:result.usage.tokensIn,tokensOut:result.usage.tokensOut}};
    }};
   };
   const contextFile=newsRoot+'/'+provider+'-context.json',context=existsSync(contextFile)?loadNews(contextFile):{importedAt:new Date().toISOString(),window:{start:'2026-10-17T00:00:00Z',end:new Date().toISOString(),kind:'DAILY' as const}};if(!existsSync(contextFile))saveNews(contextFile,context);
   const store=new V1FeedStore(profile.db,undefined,'local-news-mirror'),now=context.importedAt,window=replayNewsWindow(context.importedAt,context.window);
   if(hash(window)!==hash(context.window))saveNews(newsRoot+'/'+provider+'-window-correction.json',{original:context.window,corrected:window,reason:'Strict admission-before-cutoff; immutable import receipts retained'});
   const workflowStart=performance.now(),attempts:Awaited<ReturnType<typeof processNewsToBriefing>>[]=[];
   const runOptions:Parameters<typeof processNewsToBriefing>[0]={editorialCompleteParentDecisions:true,store,env,feedId:'feed-1',jobIds:[],window,now:()=>new Date().toISOString(),semantic:strong('construction'),editorial:strong('editorial'),writer:createEvaluationEvidenceModel(env,transport)!,acquire:async()=>{
    const lineage=[];
    for(const [index,source] of corpus.entries()){
     const sequence=index+1,observationId='observation-'+sequence,metadata=manifest.cases.find((c:any)=>c.id===source.id);let existing=(await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId===observationId);
     if(!existing){await importSavedNews(store,source,sequence,now,metadata);existing=(await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId===observationId)}
     if(!existing||existing.revision.body!==source.body||existing.revision.title!==source.title)throw Error('NEWS_IMPORTED_SOURCE_CHANGED');lineage.push({originalRevisionId:source.id,localRevisionId:existing.revision.id,sourceHash:source.sourceHash,observationId});
    }
    saveNews(newsRoot+'/'+provider+'-source-lineage.json',lineage);return lineage.map(l=>JSON.stringify(['REASSESS',l.observationId,'']));
   },checkpoint:async(stage,value)=>{saveNews(newsRoot+'/'+provider+'-checkpoint-'+hash(stage).slice(0,12)+'.json',{stage,value})}};
   for(let attempt=0;attempt<3;attempt++){const result=await processNewsToBriefing(runOptions);attempts.push(result);saveNews(newsRoot+'/'+provider+'-attempts.json',attempts);if(!result.error||!/TEMPORARY_UNAVAILABLE|EXECUTION_YIELD|PAID_RESULT_AWAITING_CANONICAL_COMMIT/.test(result.error))break;if(readdirSync(newsRoot).some(f=>f.endsWith('-intent.json')&&!existsSync(join(newsRoot,f.replace('-intent.json','-accounted.json')))))break;await new Promise(r=>setTimeout(r,1000))}
   const last=attempts.at(-1)!,wallMs=performance.now()-workflowStart,report={...last,wallMs,timeToUsefulBriefingMs:last.timeToUsefulBriefingMs===null?null:wallMs,attempts,stages:attempts.flatMap(a=>a.stages)};
   logging.mockRestore();const measured={...report,elapsedSinceSnapshotImportMs:Date.now()-Date.parse(context.importedAt),database:{...profile.metrics},exclusiveTurnHeldMs:records.reduce((n,r)=>n+(r.stages?.FEED_TURN_HELD?.durationMs??0),0),casConflicts:records.reduce((n,r)=>n+(r.counts?.casConflicts??0),0),pipelineLatencyRecords:records};
   const documents=await db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all();saveNews(newsRoot+'/'+provider+'-local-state.json',documents.results);
   const reportPath=newsRoot+'/'+provider+'-report.json',previous=existsSync(reportPath)?loadNews(reportPath):undefined;
   if(previous)saveNews(newsRoot+'/'+provider+'-prior-report-'+hash(previous).slice(0,12)+'.json',previous);
   const operatorAssisted=existsSync(newsRoot+'/'+provider+'-editorial-recovery.json');
   const cumulative={...measured,operatorAssisted,unattendedSuccess:report.status==='SUCCEEDED'&&!operatorAssisted,editorialVariant:'COMPLETE_PARENT_DECISIONS',cumulativeActiveWallMs:(previous?.cumulativeActiveWallMs??previous?.wallMs??0)+measured.wallMs,harnessFailuresRetained:previous?true:false};
   saveNews(reportPath,cumulative);reports.push({provider,...cumulative});saveNews(newsRoot+'/reports.json',reports);
   console.info(JSON.stringify({type:'NEWS_END_TO_END_RESULT',provider,status:report.status,error:report.error,wallMs:report.wallMs,timeToUsefulBriefingMs:report.timeToUsefulBriefingMs,stories:report.value?.stories?.length??0}));
   // Semantic failure is a measured result. An uncertain financial outcome
   // remains a hard stop rather than silently moving to another provider.
   if(readdirSync(newsRoot).some(f=>f.endsWith('-intent.json')&&!existsSync(join(newsRoot,f.replace('-intent.json','-accounted.json')))))throw Error('UNCONFIRMED_NEWS_OPERATION_NO_FURTHER_PROVIDER');
  }finally{await mf.dispose()}
 }}finally{await transport.close()}
},5*60*60*1000);
