import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareAdaptiveEditorialPlan} from './editorial-continuation';
import {fallbackEditorialPlan,editorialPlannerState} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {publishSelection,type BriefingModelPort,type SynthesisWriterInput} from './publication';
import {projectEditionLedger} from './ledger';

// QA, Oct 16: the verifier rejected one story after repair and every other
// verified story in the edition was lost. A verifier-attributed rejection now
// defers only that story; the rest are verified again before publication.
it('a verifier rejection of one story after repair keeps the independently verified stories',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  const facts=["Amazon's Bee launches two new personal AI devices, starting at $75.",'Gudea pitched its mission at TechCrunch Disrupt 2026.','YouTube Music introduced labels identifying AI-generated songs.'];
  for(const [i,text] of facts.entries())await seedIntelligence(store,i+1,text);
  const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const},now=testPolicy.now;
  const shortlist=await prepareSemanticShortlist(store,'feed-1',window,now()),body=fallbackEditorialPlan(shortlist);
  body.stories.forEach(s=>{s.feedFit='DIRECT';s.editorialImportance=.8});
  const transport=compactEditorialInput(editorialPlannerState(shortlist,ADAPTIVE_BRIEFING_PROCESSING,await store.getFeed('feed-1'),'CURRENT'));
  const semanticUsage={calls:1,costUsd:.001,reported:true};
  const plan=await prepareAdaptiveEditorialPlan(store,shortlist,now(),{model:'planner-fixture',admission:syntheticModelAdmission,usage:()=>semanticUsage,complete:async()=>({value:transport.encodeKeyed(body),usage:semanticUsage})});
  const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,now(),undefined,plan);
  expect(selection.selectedCandidateIds).toHaveLength(3);
  const usage={tokensIn:100,tokensOut:100,cost:.001,confirmed:true};let repairs=0,verifications=0;
  const draft=(input:SynthesisWriterInput)=>({language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support,communicatedFactIds:[f.id]}))}))});
  const model:BriefingModelPort={model:'writer-fixture',provider:'SYNTHETIC',requiresFullEntailment:true,maxCallCostUsd:0,admission:syntheticModelAdmission,
   synthesize:async input=>({draft:draft(input),usage}),
   repair:async input=>{repairs++;return {draft:draft(input),usage}},
   verify:async claims=>{
    verifications++;const ok=(c:typeof claims[number])=>!c.text.includes('Gudea');
    return {supportedClaimIds:claims.filter(ok).map(c=>c.id),preservedFactIds:claims.filter(ok).flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]),novelFactIds:claims.filter(ok).flatMap(c=>c.newUnderstandingFacts?.map(f=>f.id)??[]),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:ok(c),unsupportedMeaning:ok(c)?[]:['Not entailed'],reason:'Independent verification.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:ok(c),attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Supported fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'Reader-new.',previousFactTexts:[]}}))),usage};
   }};
  const edition=await publishSelection(store,'feed-1',selection.id,{now,model,requireModel:true});
  expect(repairs).toBe(1);
  expect(edition.stories).toHaveLength(2);
  expect(edition.stories.flatMap(s=>s.claims.map(c=>c.text)).some(t=>t.includes('Gudea'))).toBe(false);
  const pending=await store.list<any>('feed-1','publication_reconciliations');
  expect(pending.filter(r=>r.reason==='WRITER_VERIFICATION_FAILED')).toHaveLength(1);
 }finally{await ctx.dispose()}
},60000);
