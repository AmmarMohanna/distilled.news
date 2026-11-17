import {createHash} from 'node:crypto';
import type {Env} from '../apps/worker/src/types';
import {V1FeedStore} from '../apps/worker/src/v1-intelligence/store';
import {V1IntakeStore} from '../apps/worker/src/v1-intake/store';
import type {DownstreamJob} from '../apps/worker/src/v1-intake/types';
import {withSemanticWorkLease} from '../apps/worker/src/v1-intelligence/semantic-work-lease';
import {withFeedWriteTurn} from '../apps/worker/src/connector-intelligence-turn';
import {withLatency} from '../apps/worker/src/v1-intelligence/latency';
import {windowIdentity} from '../apps/worker/src/v1-intelligence/runtime';
import type {StrongSemanticModel} from '../apps/worker/src/v1-intelligence/semantic-model';
import type {BriefingModelPort} from '../apps/worker/src/v1-intelligence/publication';
import {prepareSemanticMatch} from '../apps/worker/src/v1-intelligence/semantic-preparation';
import {processEvidenceIntelligence} from '../apps/worker/src/v1-intelligence/engine';
import {prepareSemanticShortlist} from '../apps/worker/src/v1-intelligence/shortlist';
import {prepareV2Shortlist} from '../apps/worker/src/v1-intelligence/shortlist-v2';
import {prepareV2EditorialPlan} from '../apps/worker/src/v1-intelligence/editorial-plan-v2';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING,type PublicationWindow} from '../apps/worker/src/v1-intelligence/scoring';
import {publishSelection} from '../apps/worker/src/v1-intelligence/publication';

export const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Production uses a strict admission-before-cutoff rule. A saved-source
 * replay must place its cutoff after import, never alter evidence receipts. */
export function replayNewsWindow(importedAt:string,window:PublicationWindow):PublicationWindow {
 const imported=Date.parse(importedAt),end=Date.parse(window.end);if(!Number.isFinite(imported)||!Number.isFinite(end))throw Error('INVALID_REPLAY_WINDOW');
 return {...window,end:new Date(Math.max(end,imported+1)).toISOString()};
}
/** Statement counts include real batch members; batches do not recount their proxies. */
export function profileNewsDatabase(db:D1Database){
 const metrics={reads:0,writes:0},wrapped=new WeakMap<object,{statement:any;sql:string}>();
 const count=(sql:string)=>{if(/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))metrics.reads++;else metrics.writes++};
 const wrap=(statement:any,sql:string):any=>{const proxy=new Proxy(statement,{get(target,key){if(key==='bind')return(...args:any[])=>wrap(target.bind(...args),sql);if(['first','all','run','raw'].includes(String(key)))return(...args:any[])=>{count(sql);return target[key](...args)};return Reflect.get(target,key)}});wrapped.set(proxy,{statement,sql});return proxy};
 const proxy=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>wrap(target.prepare(sql),sql);if(key==='batch')return(statements:any[])=>{const entries=statements.map(s=>wrapped.get(s)??{statement:s,sql:''});entries.forEach(e=>count(e.sql));return target.batch(entries.map(e=>e.statement))};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
 return {db:proxy,metrics};
}
export function assertNewsBudget(prior:{reservedUsd:number;settled:boolean;costUsd?:number}[],next:number,limits={maxCalls:24,maxReservationsUsd:2.5}){
 if(!Number.isFinite(next)||next<0||next>.35)throw Error('NEWS_EVALUATION_PER_CALL_CAP');
 if(prior.some(r=>!r.settled))throw Error('UNCONFIRMED_PRIOR_NEWS_CALL');
 if(prior.length>=limits.maxCalls)throw Error('NEWS_EVALUATION_CALL_CAP');
 if(prior.some(r=>!Number.isFinite(r.reservedUsd)||r.reservedUsd<0||!Number.isFinite(r.costUsd)||r.costUsd!<0))throw Error('INVALID_NEWS_ACCOUNTING');
 if(prior.reduce((n,r)=>n+Math.max(r.reservedUsd,r.costUsd??0),0)+next>limits.maxReservationsUsd+1e-9)throw Error('NEWS_EVALUATION_RESERVATION_CAP');
}
export function sourceCorpus(values:{id:string;title?:string;text:string}[]){
 const records=new Map<string,{id:string;title?:string;body:string;sourceHash:string}>();
 for(const v of values){if(!v.id||!v.text)throw Error('INCOMPLETE_SAVED_SOURCE');const {text,...identity}=v,record={...identity,body:text,sourceHash:hash(v)},prior=records.get(v.id);if(prior&&prior.sourceHash!==record.sourceHash)throw Error('CONFLICTING_SOURCE_COPY');records.set(v.id,record)}
 return [...records.values()];
}
type Stage={name:string;wallMs:number;status:'SUCCEEDED'|'FAILED';error?:string};
export type MeasureStage=<T>(name:string,run:()=>Promise<T>)=>Promise<T>;
/** No additive stage totals: nested phases can overlap. Failures stay in the denominator. */
export async function measureNewsRun(run:(stage:MeasureStage)=>Promise<any>,clock=()=>performance.now()){
 const start=clock(),stages:Stage[]=[];let value:any,error:string|undefined;
 const stage:MeasureStage=async(name,work)=>{const tick=clock();try{const value=await work();stages.push({name,wallMs:clock()-tick,status:'SUCCEEDED'});return value}catch(e){stages.push({name,wallMs:clock()-tick,status:'FAILED',error:e instanceof Error?e.message:'UNKNOWN'});throw e}};
 try{value=await run(stage)}catch(e){error=e instanceof Error?e.message:'UNKNOWN'}
 const wallMs=clock()-start,useful=!error&&Boolean(value?.stories?.some((s:any)=>s.claims?.some((c:any)=>c.text?.trim())));
 return {status:error?'FAILED' as const:'SUCCEEDED' as const,wallMs,timeToUsefulBriefingMs:useful?wallMs:null,stages,...(error?{error}:{}),value};
}
export function briefingReviewSheet(edition:any){
 const seen=new Map<string,string[]>();for(const s of edition?.stories??[])for(const c of s.claims??[]){const text=c.text.trim().replace(/\s+/g,' ');seen.set(text,[...(seen.get(text)??[]),s.candidateId])}
 return {qualityReview:'PENDING',independentHumanGold:false,exactRepeatedClaims:[...seen].filter(([,owners])=>owners.length>1).map(([text,candidateIds])=>({text,candidateIds})),dimensions:['IMPORTANCE','FACTUAL_ACCURACY','MISSING_DETAILS','REPETITION','CORRECTIONS','ATTRIBUTION_AND_TIME'].map(dimension=>({dimension,verdict:'PENDING',findings:[] as {sourceId:string;sourceQuote:string;briefingQuote?:string;explanation:string}[]})),limitations:['Exact text repetition is diagnostic only; paraphrase duplication and justified correction repetition require semantic review.','An accepted verification verdict does not establish editorial importance, complete source coverage or independent human certification.']};
}
/** Shared real production path. The caller owns isolated acquisition, leases,
 * durable paid authorization/accounting and provider transports; this runner
 * creates no grant and changes no deployment or task qualification. */
export async function processNewsToBriefing(options:{store:V1FeedStore;env:Env;feedId:string;jobIds:string[];acquire?:()=>Promise<string[]>;window:PublicationWindow;editorialWholeParentReferences?:boolean;editorialCompleteParentDecisions?:boolean;reviewedDraftId?:string;now:string|(()=>string);semantic:StrongSemanticModel;editorial:StrongSemanticModel;writer:BriefingModelPort;checkpoint:(stage:string,value:unknown)=>Promise<void>}){
 const {store,env,feedId,window,checkpoint}=options,now=()=>typeof options.now==='function'?options.now():options.now,coordinatedEnv={...env,DB:store.db};
 if(env.V1_PUBLICATION_VALIDATION_CONTRACT!=='EVIDENCE_GROUNDED_V2'||options.writer.validationContract!=='EVIDENCE_GROUNDED_V2')throw Error('EVALUATION_REQUIRES_V2');
 let editionReused=false;
 const measurement=await measureNewsRun(async stage=>{
  const edition=await stage('EXISTING_EDITION_LOOKUP',async()=>store.read<any>(feedId,'editions',await windowIdentity(feedId,window)));
  if(edition){editionReused=true;return edition}
  // Independent inference can use packet concurrency; canonical article updates
  // remain sequential so subsequent articles see prior occurrences and corrections.
  const jobIds=options.acquire?await stage('ACQUISITION_IMPORT',options.acquire):options.jobIds;
  for(const jobId of jobIds){
   const job=await new V1IntakeStore(store.db).read<DownstreamJob>('jobs',jobId);
   if(job?.value.state==='DONE'){await checkpoint('ARTICLE_REUSED:'+jobId,{state:'DONE',newCalls:0});continue;}
   await withLatency({feedId,reviewId:jobId,phase:'REVIEW'},()=>stage('ARTICLE_LEASE:'+jobId,()=>withSemanticWorkLease(store.db,feedId,async owned=>{
    const leased=new V1FeedStore(store.db,owned.semanticLease,store.spendingAccountId);
    const prepared=await stage('ARTICLE_SEMANTIC:'+jobId,()=>prepareSemanticMatch(leased,env,jobId,now(),{strong:options.semantic}));
    if(!prepared)throw Error('MISSING_SEMANTIC_PREPARATION');
    const receipt=await stage('CANONICAL_COMMIT:'+jobId,()=>withFeedWriteTurn(coordinatedEnv,feedId,()=>processEvidenceIntelligence(leased,jobId,now(),prepared.matchers),'evaluation-review:'+jobId));
    await checkpoint('ARTICLE:'+jobId,receipt);if(receipt.semanticDeferred)throw Error('ARTICLE_SEMANTICS_DEFERRED:'+prepared.prepared.decision.provenance.fallbackReason);
   },'evaluation-review:'+jobId)));
  }
  return withLatency({feedId,phase:'PUBLICATION_TURN'},()=>stage('BRIEFING_EXCLUSIVE_TURN',()=>withFeedWriteTurn(coordinatedEnv,feedId,async()=>{
  const shortlist=await stage('SHORTLIST',async()=>prepareV2Shortlist(store,await prepareSemanticShortlist(store,feedId,window,now())));
  await checkpoint('SHORTLIST',shortlist);
  const plan=await stage('EDITORIAL_SELECTION',()=>prepareV2EditorialPlan(store,shortlist,now(),options.editorial,{wholeParentReferences:options.editorialWholeParentReferences,completeParentDecisions:options.editorialCompleteParentDecisions}));await checkpoint('EDITORIAL_SELECTION',plan);
  const selection=await stage('SCORING',()=>scoreAndSelect(store,feedId,window,ADAPTIVE_BRIEFING_PROCESSING,now(),undefined,plan));await checkpoint('SCORING',selection);
  const instrumented:BriefingModelPort={...options.writer,synthesize:async(...args)=>stage('WRITING',()=>options.writer.synthesize(...args)),...(options.writer.verify?{verify:async(...args:Parameters<NonNullable<BriefingModelPort['verify']>>)=>stage('FACTUAL_VERIFICATION',()=>options.writer.verify!(...args))}:{}),...(options.writer.repair?{repair:async(...args:Parameters<NonNullable<BriefingModelPort['repair']>>)=>stage('WRITER_REPAIR',()=>options.writer.repair!(...args))}:{})};
  const edition=await stage('WRITE_VERIFY_LOCAL_COMMIT',()=>publishSelection(store,feedId,selection.id,{now,model:instrumented,requireModel:true,validationContract:'EVIDENCE_GROUNDED_V2',reviewedDraftId:options.reviewedDraftId}));
  await checkpoint('LOCAL_EDITION',edition);return edition;
  },'evaluation-briefing:'+hash(window))));
 });
 await checkpoint('MEASUREMENT',measurement);return {...measurement,editionReused,quality:briefingReviewSheet(measurement.value),scope:'ISOLATED_LOCAL_EDITION_NOT_EXTERNAL_PUBLICATION',acquisition:'CALLER_SUPPLIED_IMMUTABLE_SNAPSHOT_NOT_LIVE_NETWORK'};
}
