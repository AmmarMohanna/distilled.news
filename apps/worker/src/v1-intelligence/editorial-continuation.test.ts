import {afterEach,beforeEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist,boundShortlist,type ShortlistRecord} from './shortlist';
import {rankEditorialCandidates} from './editorial-ranking';
import type {Env} from '../types';
import {prepareAdaptiveEditorialPlan} from './editorial-continuation';
import {expandEditorialInput} from './editorial-transport';
import {admitModelOperation,modelCapability} from './model-capacity';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'AI Industry Watch',interests:['AI industry, research, governance, infrastructure and products']});await seedIntelligence(store,1,Array.from({length:120},(_,i)=>`Maker${i} introduced Device${i} for AI research.`).join(' '))});afterEach(async()=>ctx.dispose());
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
const answer=(state:any)=>{const expanded=expandEditorialInput(state) as any;return {stories:Object.fromEntries(expanded.candidates.map((c:any,i:number)=>[c.targetVersionId,{targetType:c.targetType,editorialImportance:.8,decision:'SELECT',order:i,treatment:'STANDARD',deltaType:'NEW',newUnderstandingFactIds:c.facts.map((f:any)=>f.id),mustIncludeFactIds:c.facts.map((f:any)=>f.id),contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[],correctionObligationIds:[],previousLedgerEntryIds:[],rationale:'Supported reader-new research development.',relevanceRationale:'Research is explicitly within this Feed interests.',feedFit:'DIRECT'}])),obligations:{}}};
it.each([40,100,120])('all %s eligible candidates receive owned comparative decisions without a count quota',async count=>{
 const original=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now()),base=original.candidates[0];expect(base.facts.length).toBeGreaterThanOrEqual(count);
 const shortlist:ShortlistRecord={...original,id:'growth-'+count,candidates:base.facts.slice(0,count).map((f,i)=>({...base,targetVersionId:'fixture-version-'+i,stableTargetId:'fixture-event-'+i,eventVersionIds:['fixture-version-'+i],facts:[f],ranking:base.ranking?{...base.ranking,semanticKey:f.text}:undefined,fallbackEditorial:{...base.fallbackEditorial,newUnderstanding:[{text:f.text,evidenceRevisionIds:f.evidenceRevisionIds}]},protectedReasons:[],correctionObligationIds:[]})),overflow:[]};await feedTransact(store,'feed-1',tx=>tx.write('shortlists',shortlist.id,shortlist));
 expect(boundShortlist(shortlist.candidates,20).selected).toHaveLength(20);expect(boundShortlist(shortlist.candidates).selected).toHaveLength(count);
 let calls=0;const model='openai/gpt-4.1-mini',strong={model,admission:(state:unknown,schema:object)=>admitModelOperation(model,state,schema,modelCapability(model)),usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_f:string,_phase:string,state:any)=>{calls++;return {value:answer(state),usage:{calls:1,costUsd:.001,reported:true}}}};
 const plan=await prepareAdaptiveEditorialPlan(store,shortlist,testPolicy.now(),strong);expect(plan.route,JSON.stringify({reason:plan.fallbackReason,proposals:await store.list('feed-1','editorial_proposals'),failures:(await store.list<any>('feed-1','semantic_results')).filter(r=>r.status!=='SUCCEEDED')})).toBe('GPT');expect(plan.stories).toHaveLength(count);expect(plan.stories.every(s=>s.decision==='SELECT'&&s.mustIncludeFactIds.length===1)).toBe(true);expect(plan.inputCoverage!.offeredTargetVersionIds).toHaveLength(count);expect(plan.inputCoverage!.notComparativelyReviewedTargetVersionIds).toEqual([]);expect(calls).toBe(1);
 expect((await prepareAdaptiveEditorialPlan(new V1FeedStore(ctx.db),shortlist,testPolicy.now(),strong)).id).toBe(plan.id);expect(calls).toBe(1);
},30000);

it('semantically reviews candidates after position 64 without trimming source meaning',async()=>{
 const initial=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now()),base=initial.candidates[0],candidates=base.facts.slice(0,72).map((fact,index)=>({...base,targetVersionId:'rank-'+index,stableTargetId:'event-'+index,facts:[{...fact,text:fact.text+' Supported surrounding context. '.repeat(30)+' Attribution remains disputed.'}]}));
 let calls=0;const fetcher=(async(_url:any,init:any)=>{calls++;const payload=JSON.parse(init.body);expect(JSON.stringify(payload)).toContain('Attribution remains disputed.');const answers=Object.fromEntries(Object.keys(payload.questions).map(key=>[key,{type:'score',score:2,confidence:1,probabilities:{'0':0,'1':0,'2':1}}]));return Response.json({answers,usage:{input_tokens:100,output_tokens:20,cost:.001}})}) as typeof fetch;
 const feed=(await store.getFeed('feed-1'))!;const ranked=await rankEditorialCandidates(store,{DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'stand-in-only',V1_EDITORIAL_RANKING_POLICY:'SEMANTIC'} as Env,feed,candidates,window,testPolicy.now(),fetcher);
 expect(calls).toBe(9);expect(ranked.every(c=>c.ranking?.source==='JEV')).toBe(true);expect(ranked[71].ranking?.relevance).toBe(1);
 await rankEditorialCandidates(store,{DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'stand-in-only',V1_EDITORIAL_RANKING_POLICY:'SEMANTIC'} as Env,feed,candidates,{...window,start:'2026-10-04T00:00:00Z',end:'2026-10-05T00:00:00Z'},testPolicy.now(),fetcher);expect(calls).toBe(9);
},30000);
it('reader-unseen older developments remain candidates without an existing defer record',async()=>{
 await feedTransact(store,'feed-1',async tx=>{await tx.write('selections','previous-selection',{id:'previous-selection',feedId:'feed-1',feedRevision:1,window,candidateIds:[],selectedCandidateIds:[]});await tx.write('editions','previous-unrelated',{id:'previous-unrelated',feedId:'feed-1',feedRevision:1,selectionId:'previous-selection',windowStart:window.start,windowEnd:window.end,selectedCandidateIds:[],eventVersionIds:[],storylineVersionIds:[],evidenceRevisionIds:[],stories:[]})});
 const later=await prepareSemanticShortlist(store,'feed-1',{...window,start:'2026-11-03T00:00:00Z',end:'2026-11-04T00:00:00Z'},'2026-11-04T00:00:00Z');expect(later.candidates.length).toBeGreaterThan(0);expect(later.candidates[0].readerState).toBe('UNSEEN');
});

it('context-sized cohorts receive Feed-wide comparison before final decisions, with durable replay',async()=>{
 const original=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now()),base=original.candidates[0];
 const shortlist:ShortlistRecord={...original,id:'forced-context-cohorts',candidates:base.facts.slice(0,18).map((f,i)=>({...base,targetVersionId:'global-version-'+i,stableTargetId:'global-event-'+i,eventVersionIds:['global-version-'+i],facts:[f],ranking:undefined,fallbackEditorial:{...base.fallbackEditorial,newUnderstanding:[{text:f.text,evidenceRevisionIds:f.evidenceRevisionIds}]},protectedReasons:[],correctionObligationIds:[]})),overflow:[]};await feedTransact(store,'feed-1',tx=>tx.write('shortlists',shortlist.id,shortlist));
 let calls=0,globalCalls=0,finalCalls=0;
 const capability={contextTokens:30000,maxOutputTokens:2000,inputUsdPerToken:0,outputUsdPerToken:0,source:'small-context transport fixture; not a quality model'};
 const strong={model:'fixture-global',admission:(state:unknown,schema:object)=>admitModelOperation('fixture-global',state,schema,capability),usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_f:string,_p:string,state:any)=>{
  calls++;if(state.children){globalCalls++;return {value:{themes:[{childIds:state.children.map((c:any)=>c.id),understanding:'Fixture-supported independent research developments.',significance:'Assess all supplied developments comparatively.',relevance:'Research, governance and industry are within the full Feed interests.',novelty:'Reader history determines novelty independently of source age.',uncertainty:'Preserve source qualifications.'}],guidance:'Communicate supported useful new developments without local quotas.'},usage:{calls:1,costUsd:.001,reported:true}}}
  finalCalls++;const expanded=expandEditorialInput(state) as any;expect(expanded.comparativeContext.globalSynopsis.guidance).toContain('without local quotas');expect(Object.values(expanded.comparativeContext.localCandidateReferences).sort()).toEqual(expanded.candidates.map((c:any)=>c.targetVersionId).sort());return {value:answer(state),usage:{calls:1,costUsd:.001,reported:true}};
 }};
 const plan=await prepareAdaptiveEditorialPlan(store,shortlist,testPolicy.now(),strong,{deadlineMs:Date.now()+600000});expect(globalCalls).toBeGreaterThan(1);expect(finalCalls).toBeGreaterThan(1);expect(plan.stories.every(s=>s.decision==='SELECT')).toBe(true);expect(plan.inputCoverage?.notComparativelyReviewedTargetVersionIds).toEqual([]);expect(plan.inputCoverage?.globalContextOperationIds?.length).toBe(globalCalls);
 const savedCalls=calls;await prepareAdaptiveEditorialPlan(new V1FeedStore(ctx.db),shortlist,testPolicy.now(),strong);expect(calls).toBe(savedCalls);
},60000);
it('an execution yield retains every candidate and resumes without a false editorial suppression',async()=>{
 const original=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());let calls=0;const model='openai/gpt-4.1-mini',strong={model,admission:(state:unknown,schema:object)=>admitModelOperation(model,state,schema,modelCapability(model)),usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_f:string,_phase:string,state:any)=>{calls++;return {value:answer(state),usage:{calls:1,costUsd:.001,reported:true}}}};
 const waiting=await prepareAdaptiveEditorialPlan(store,original,testPolicy.now(),strong,{deadlineMs:Date.now()-1});expect(calls).toBe(0);expect(waiting.stories.every(s=>s.decision==='DEFER')).toBe(true);expect(waiting.fallbackReason).toBe('EDITORIAL_EXECUTION_YIELD');expect(waiting.inputCoverage?.notComparativelyReviewedTargetVersionIds).toHaveLength(original.candidates.length);
 const pending=await store.list<any>('feed-1','editorial_deferred_work');expect(pending.every(w=>w.continuationPolicy==='ADAPTIVE'&&!w.expiresAt)).toBe(true);
 const complete=await prepareAdaptiveEditorialPlan(store,original,testPolicy.now(),strong);expect(calls).toBe(1);expect(complete.route).toBe('GPT');
},30000);

import {prepareGlobalEditorialContext} from './editorial-global-context';
import {syntheticModelAdmission} from './test-utils';
it('an unknown leaf remains fenced while independent global context can complete',async()=>{
 const original=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now()),base=original.candidates[0];
 const leaves=base.facts.slice(0,3).map((f,i)=>({...original,id:'leaf-'+i,candidates:[{...base,targetVersionId:'leaf-target-'+i,facts:[f]}]}));
 let calls=0,lastUsage={calls:1,costUsd:0,reported:true};
 const strong={model:'unknown-leaf-fixture',admission:syntheticModelAdmission,usage:()=>lastUsage,complete:async(_f:string,_p:string,state:any)=>{
  calls++;if(state.children[0].id==='leaf-target-0'){lastUsage={calls:1,costUsd:.01,reported:false};throw Error('provider outcome unknown')}
  lastUsage={calls:1,costUsd:.001,reported:true};return {value:{themes:[{childIds:state.children.map((c:any)=>c.id),understanding:'Supported independent facts.',significance:'Compare meaningful facts.',relevance:'Within Feed research interests.',novelty:'Reader unseen.',uncertainty:'Unresolved work remains pending.'}],guidance:'No local winner quota.'},usage:lastUsage};
 }};
 const first=await prepareGlobalEditorialContext(store,original,strong,leaves,testPolicy.now(),Date.now()+600000);
 expect(first.root?.targetVersionIds.sort()).toEqual(['leaf-target-1','leaf-target-2']);expect(first.pending?.[0].targetVersionIds).toEqual(['leaf-target-0']);
 const lost=(await store.list<any>('feed-1','semantic_results')).find(r=>r.usage.calls>0&&!r.usage.reported);
 expect((first as any).operationIds).toContain(lost.id);
 const count=calls;const second=await prepareGlobalEditorialContext(new V1FeedStore(ctx.db),original,strong,leaves,testPolicy.now(),Date.now()+600000);
 expect(second.root?.id).toBe(first.root?.id);expect(calls).toBe(count);
},30000);
