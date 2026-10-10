import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy,batchFixture} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers,type IntelligenceMatchers} from './matchers';
import {processV1Briefing} from './runtime';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {projectEditionLedger,rebuildCommunicationLedger} from './ledger';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
import type {Env} from '../types';
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},next={start:window.end,end:'2026-10-03T14:00:00Z',kind:'HOURLY' as const};
const ORIGINAL='Company A raised $90 million.';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,ORIGINAL);env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env});
afterEach(async()=>ctx.dispose());
async function revise(body:string){
 const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';
 const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'revision',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'},testPolicy);
}
const judged=(eventId:string,effects:string[],structuralRelation='SAME_EVENT',scorer='GPT'):IntelligenceMatchers=>({...deterministicMatchers,event:{match:()=>({structuralRelation,...(structuralRelation==='SAME_EVENT'?{eventId}:{}),epistemicEffects:effects,confidence:.99,provenance:{scorer,policyVersion:'settled-judgment',judgmentId:'judgment-1'}}) as any}});
const later='2026-10-03T13:30:00Z',process=(matchers:IntelligenceMatchers,job='observation-2')=>processEvidenceIntelligence(store,JSON.stringify(['REASSESS',job,'']),later,matchers);
const obligations=async(s=store)=>s.list<any>('feed-1','correction_obligations');
async function published(){await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);return {event:(await store.list<any>('feed-1','events'))[0],entries:await store.list<any>('feed-1','ledger_entries')}}
it('unchanged communicated claim plus independent new reporting: no correction, and the new fact stays eligible as new information',async()=>{
 const {event,entries}=await published();
 await revise(`${ORIGINAL} Company A also appointed a new CEO.`);await process(judged(event.id,['ADDS_DETAIL']));
 expect(await obligations()).toEqual([]);expect(await store.list('feed-1','ledger_entries')).toEqual(entries);
 const scope=await prepareSemanticShortlist(store,'feed-1',next,next.end),candidate=scope.candidates.find(c=>c.stableTargetId===event.id)!;
 expect(candidate.protectedReasons).not.toContain('CORRECTION_OBLIGATION');
 expect(candidate.facts.some(f=>/new CEO/.test(f.text))).toBe(true);expect(candidate.fallbackEditorial.newUnderstanding.some(f=>/new CEO/.test(f.text))).toBe(true);
},30000);
it('a retained sentence explicitly invalidated by a settled CORRECTS judgment opens one durable obligation, across replay, restart and rebuild',async()=>{
 const {event}=await published();
 await revise(`${ORIGINAL} Correction: the actual amount was $120 million.`);const matchers=judged(event.id,['CORRECTS']);
 await process(matchers);await process(matchers);
 const first=await obligations();expect(first).toHaveLength(1);expect(first[0]).toMatchObject({kind:'CORRECTED',triggerId:'judgment-1',state:'OPEN'});
 expect(first.filter(o=>o.kind==='SOURCE_REVISED')).toEqual([]);
 const restarted=new V1FeedStore(ctx.db);await rebuildCommunicationLedger(restarted,'feed-1');await processEvidenceIntelligence(restarted,JSON.stringify(['REASSESS','observation-2','']),later,matchers);
 expect(await obligations(restarted)).toEqual(first);
},30000);
it.each([true,false])('the CORRECTS obligation reaches the shortlist and resolves only with an attested corrective publication (attested=%s)',async attested=>{
 const {event}=await published();
 await revise(`${ORIGINAL} Correction: the actual amount was $120 million.`);await process(judged(event.id,['CORRECTS']));
 const scope=await prepareSemanticShortlist(store,'feed-1',next,next.end);expect(scope.obligations).toHaveLength(1);
 const candidate=scope.candidates.find(c=>c.stableTargetId===event.id)!;expect(candidate.protectedReasons).toContain('CORRECTION_OBLIGATION');expect(candidate.correctionObligationIds).toEqual([scope.obligations[0].id]);
 const body=fallbackEditorialPlan(scope),fresh=candidate.facts.filter(f=>/Correction:/.test(f.text)).map(f=>f.id);expect(fresh).toHaveLength(1);
 for(const story of body.stories)Object.assign(story,{decision:'SELECT',treatment:'STANDARD',deltaType:'CORRECTION',newUnderstandingFactIds:fresh,mustIncludeFactIds:fresh,previousLedgerEntryIds:scope.ledger.map(e=>e.id)});
 body.obligations=[{obligationId:scope.obligations[0].id,handling:'ADDRESS',targetVersionId:candidate.targetVersionId,reason:'Correct earlier reader communication.'}];
 const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,next.end,{model:'controlled-planner',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encodeKeyed(body),usage:{calls:1,costUsd:.001,reported:true}})});
const selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end,undefined,plan),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model=(attest:boolean):BriefingModelPort=>({model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:'Correction to an earlier briefing. '+s.approvedFacts!.map(f=>f.text).join(' '),support:s.approvedSpans!,communicatedFactIds:s.approvedFacts!.map(f=>f.id)}]}))},usage}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:[],addressedCorrectionObligationIds:attest?claims.flatMap(c=>(c.correctionObligations??[]).map(o=>o.id)):[],semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,...(attest?{nonRepetitive:true}:{}),reason:'Supported explicit correction.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage})});
 if(!attested){
  await expect(publishSelection(store,'feed-1',selected.id,{now:()=>next.end,model:model(false),requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(await store.list('feed-1','correction_resolutions')).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await obligations()).toHaveLength(1);return;
 }
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>next.end,model:model(true),requireModel:true});await projectEditionLedger(store,'feed-1',edition.id);
 expect(await store.list('feed-1','correction_resolutions')).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(2);
},45000);
it('semantic uncertainty and a bare "Correction" keyword neither create nor resolve an obligation, and the new reporting stays eligible',async()=>{
 const {event}=await published();
 await revise(`${ORIGINAL} Correction: the actual amount was $120 million.`);
 await process(judged(event.id,[],'DEFER','SEMANTIC'));
 expect(await obligations()).toEqual([]);
 const scope=await prepareSemanticShortlist(store,'feed-1',next,next.end);
 expect(scope.obligations).toEqual([]);expect(scope.candidates.some(c=>c.facts.some(f=>/\$120 million/.test(f.text)))).toBe(true);
 expect(scope.candidates.flatMap(c=>c.facts).filter(f=>/\$120 million/.test(f.text)).length).toBeGreaterThan(0);
},30000);
