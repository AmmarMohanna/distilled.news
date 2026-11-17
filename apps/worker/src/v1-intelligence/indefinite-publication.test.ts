import {it,expect} from 'vitest';
import retained from './fixtures/staging-partitive-quantity.json';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
import {projectEditionLedger} from './ledger';
it.each([true,false])('retained partitive paraphrase reaches independent verification (entailed=%s)',async entailed=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);
  await store.registerFeed({...feedFixture,title:'AI industry',interests:['AI companies and industry developments'],geography:[]});
  await seedIntelligence(store,1,retained.fundingFact+'. '+retained.partitiveFact);
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
  const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end);
  const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled',admission:syntheticModelAdmission,usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(shortlist).encodeKeyed(fallbackEditorialPlan(shortlist)),usage:{calls:1,costUsd:.001,reported:true}})});
  const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
  const usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};let verifications=0;
  const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,requiresFullEntailment:true,
   synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:retained.originalDraft,communicatedFactIds:s.approvedFacts!.map(f=>f.id),support:s.approvedFacts!.flatMap(f=>f.support)}]}))},usage}),
   verify:async claims=>{verifications++;return {
    supportedClaimIds:entailed?claims.map(c=>c.id):[],preservedFactIds:entailed?claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]):[],novelFactIds:entailed?claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]):[],
    claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:entailed,reason:'Independent complete-meaning verdict.',unsupportedMeaning:entailed?[]:['Independent verifier rejects meaning.']})),
    semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:entailed,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Independent retained-prose evaluation.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,previousFactTexts:[],reason:'Not previously communicated.'}}))),usage};}
  };
  if(entailed){
   const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true});
   expect(edition.stories).toHaveLength(1);expect(edition.stories[0].claims[0].text).toBe(retained.originalDraft);
   expect(edition.stories[0].claims[0].communicatedFactIds).toHaveLength(2);expect(edition.stories[0].claims[0].support).toHaveLength(2);
   await projectEditionLedger(store,'feed-1',edition.id);expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);
   expect(await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).toEqual(edition);
  }else{
   await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
   expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','ledger_entries')).toHaveLength(0);
  }
  expect(verifications).toBe(1);
 }finally{await ctx.dispose()}
},30000);
