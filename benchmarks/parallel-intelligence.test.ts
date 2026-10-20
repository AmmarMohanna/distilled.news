import {it,expect,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../apps/worker/src/v1-intake/test-utils';
import {V1IntakeStore} from '../apps/worker/src/v1-intake/store';
import {V1FeedStore} from '../apps/worker/src/v1-intelligence/store';
import {feedFixture,acceptEvidence,syntheticModelAdmission} from '../apps/worker/src/v1-intelligence/test-utils';
import {extractClaimMentions,isNewsMention} from '../apps/worker/src/v1-intelligence/claims';
import {continueSemanticConstruction} from '../apps/worker/src/v1-intelligence/semantic-continuation';
import {processEvidenceIntelligence} from '../apps/worker/src/v1-intelligence/engine';
import {deterministicMatchers} from '../apps/worker/src/v1-intelligence/matchers';
const body='The Harbor bridge reopened on Monday. Engineers approved repairs to the Harbor bridge. The city confirmed that the Harbor bridge passed inspection. The Valley hospital opened a ward. Doctors confirmed that the Valley hospital added beds. The Valley hospital hired nurses.';
const group=(ids:string[])=>({claimMentionIds:ids,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[]});
const label=(text:string)=>text.includes('Harbor bridge')?'bridge':'hospital';
function buckets<T>(values:T[],key:(v:T)=>string){const map=new Map<string,T[]>();for(const v of values){const k=key(v);map.set(k,[...(map.get(k)??[]),v])}return [...map.values()]}
function countedDatabase(db:D1Database,counts:{reads:number;writes:number}){
 const wrapped=new WeakMap<object,{stmt:any;sql:string}>();const count=(sql:string)=>{/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)?counts.reads++:counts.writes++};
 const wrap=(stmt:any,sql:string):any=>{const proxy=new Proxy(stmt,{get(t,k){if(k==='bind')return(...args:any[])=>wrap(t.bind(...args),sql);if(['first','all','run','raw'].includes(String(k)))return(...args:any[])=>{count(sql);return t[k](...args)};return Reflect.get(t,k)}});wrapped.set(proxy,{stmt,sql});return proxy};
 return new Proxy(db,{get(t,k){if(k==='prepare')return(sql:string)=>wrap(t.prepare(sql),sql);if(k==='batch')return(statements:any[])=>{const items=statements.map(s=>wrapped.get(s)??{stmt:s,sql:''});items.forEach(s=>count(s.sql));return t.batch(items.map(s=>s.stmt))};const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value}});
}
it('compares four equivalent real local D1 paths with deterministic synthetic model latency',async()=>{
 const results:any[]=[];const records:any[]=[];const log=vi.spyOn(console,'info').mockImplementation((line:any)=>{try{const r=JSON.parse(String(line));if(r.type==='V1_PIPELINE_LATENCY')records.push(r)}catch{}});
 try{for(const reconciliation of ['CLAIMS','DEVELOPMENTS'] as const)for(const concurrency of [1,2]){
  const ctx=await createIntakeDatabase();try{
   await seedIntakeScope(new V1IntakeStore(ctx.db));let store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store,1,body);
   const counts={reads:0,writes:0};store=new V1FeedStore(countedDatabase(ctx.db,counts));const start=performance.now(),revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};
   let calls=0,active=0,peak=0;const individual:any[]=[];const snapshot=records.length;
   const model={model:'offline-benchmark-stand-in',usage:()=>({calls:1,costUsd:.001,reported:true}),admission:(state:any,_schema:object,phase?:string)=>({...syntheticModelAdmission(),fits:phase?.includes('RECONCILIATION')||state.claimMentions.length<=2}),complete:async(_feed:string,phase:string,state:any)=>{
    calls++;active++;peak=Math.max(peak,active);const tick=performance.now();await new Promise(r=>setTimeout(r,1500));active--;
    let value:any;if(phase==='SEMANTIC_DEVELOPMENT_RECONCILIATION')value={confidence:.9,groups:buckets<any>(state.developments,d=>label(d.evidence[0].sourceText)).map(ds=>({developmentIds:ds.map(d=>d.id),mergeSameOccurrence:ds.length>1,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],relationship:'SAME_OCCURRENCE',relatedDevelopmentIds:[]}))};
    else value={confidence:.9,groups:buckets<any>(state.claimMentions,m=>label(m.text)).map(ms=>group(ms.map(m=>m.id))),backgroundMentionIds:[]};
    individual.push({phase,latencyMs:performance.now()-tick,inputBytes:new TextEncoder().encode(JSON.stringify(state)).length,outputBytes:new TextEncoder().encode(JSON.stringify(value)).length});return {value,usage:{calls:1,tokensIn:100,tokensOut:20,costUsd:.001,reported:true}};
   }};
   const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'offline-comparison-v1',model:model.model,budgetKey:'semantic:2026-10-03',state:{}},state={source:{id:revision.id,text:revision.body},claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText}))};
   const constructed=await continueSemanticConstruction(store,base,mentions,input,model,state,testPolicy.now(),{concurrency,reconciliation});expect(constructed.status).toBe('SUCCEEDED');expect(calls).toBe(4);expect(constructed.value!.construction.groups).toHaveLength(2);
   const constructionMs=performance.now()-start,canonicalStart=performance.now(),job=JSON.stringify(['REASSESS','observation-1','']),construction=constructed.value!.construction;
   await processEvidenceIntelligence(store,job,testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:'NEW_STORYLINE',epistemicEffects:[],confidence:.9,provenance:construction.provenance})},construction:()=>construction});
   const canonicalMutationMs=performance.now()-canonicalStart,articleProcessingWallMs=performance.now()-start;
   expect(await store.list('feed-1','events')).toHaveLength(2);const states:any[]=await store.list('feed-1','event_semantic_states');expect(states.every(s=>!s.provisional)).toBe(true);
   const retainedEventIds=(await store.list<any>('feed-1','events')).map(e=>e.id).sort();
   const before=calls;await continueSemanticConstruction(store,base,mentions,input,model,state,testPolicy.now(),{concurrency,reconciliation});expect(calls).toBe(before);
   await Promise.all([processEvidenceIntelligence(store,job,testPolicy.now()),processEvidenceIntelligence(new V1FeedStore(store.db),job,testPolicy.now())]);expect(await store.list('feed-1','events')).toHaveLength(2);
   const events:any[]=await store.list('feed-1','events'),propositions:any[]=await store.list('feed-1','propositions');expect(events.map(e=>e.id).sort()).toEqual(retainedEventIds);const graphEvidenceSignature=states.map(state=>state.propositionIds.map((id:string)=>propositions.find(p=>p.id===id).text).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));expect(new Set(propositions.flatMap(p=>p.claimMentionIds)).size).toBe(mentions.length);
   const latency=records.slice(snapshot),casConflicts=latency.reduce((n,r)=>n+(r.counts.casConflicts??0),0);expect(casConflicts).toBe(0);
   results.push({reconciliation,concurrency,sourceMentions:mentions.length,articleProcessingWallMs,constructionMs,canonicalMutationMs,articlesPerMinute:60000/articleProcessingWallMs,peakInference:peak,inferenceCallCount:calls,syntheticTokensIn:calls*100,syntheticTokensOut:calls*20,syntheticCostUsd:calls*.001,actualProviderCostUsd:0,databaseReads:counts.reads,databaseWrites:counts.writes,casConflicts,recoveryExtraCalls:calls-before,eventIds:events.map(e=>e.id).sort(),identityRetainedAfterReplay:true,graphEvidenceSignature,completeEvidence:true,syntheticFalseMerges:0,syntheticFalseSplits:0,firstResponseConstructionSuccess:true,completeIntelligenceReviewSuccess:true,individualModelCalls:individual,exclusiveTurnDurationMs:null,liveSemanticAccuracy:null,liveProviderLatencyMs:null});
  }finally{await ctx.dispose()}
 }
 expect(results.every(r=>JSON.stringify(r.graphEvidenceSignature)===JSON.stringify(results[0].graphEvidenceSignature))).toBe(true);
 writeFileSync('benchmarks/parallel-intelligence-results.json',JSON.stringify({mode:'OFFLINE_LOCAL_D1_WITH_SYNTHETIC_MODEL_LATENCY',baseCommit:'c813a27',source:'hand-authored synthetic two-development fixture',modelLatencyFloorMs:1500,paidProviderCalls:0,actualProviderCostUsd:0,labels:'Deterministic synthetic oracle; not real model compatibility or quality evidence',results,limitations:['Acquisition network latency and actual feed-turn lease duration are not measured.','Tokens and dollar receipts are synthetic. Real model output reliability, false merges/splits, invalid ACCEPT rate, repair frequency and costs require separately authorized evaluation.','Read/write totals include replay and duplicate graph-delivery checks.','Shared publication safeguards are covered by separate regression tests; this benchmark stops after canonical intelligence.']},null,2)+'\n');
 }finally{log.mockRestore()}
});
