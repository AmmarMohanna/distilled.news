import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
import {projectEditionLedger} from './ledger';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
it('a verified writer paraphrase retains the communicated approved proposition across capitalization-only evidence',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'AI',interests:['AI funding']});await seedIntelligence(store,1,'The developer of Hermes agent raised $90 million in funding.');
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},scope=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(scope);
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encodeKeyed(body),usage:{calls:1,costUsd:.001,reported:true}})}),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
  const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:'The developer of the Hermes agent has raised $90 million in a funding round.',support:s.approvedSpans!}]}))},usage}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Paraphrase preserves exact funding meaning.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage})};
  const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true});await projectEditionLedger(store,'feed-1',edition.id);
  await seedIntelligence(store,2,'The developer of Hermes Agent raised $90 million in funding.','publisher-2','2026-10-03T13:15:00Z');
  const current=(await store.list<any>('feed-1','events'))[0];await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),'2026-10-03T13:16:00Z',{...deterministicMatchers,event:{match:()=>({structuralRelation:'SAME_EVENT',eventId:current.id,epistemicEffects:['CHANGES_STATE'],confidence:.99,provenance:{scorer:'GPT',policyVersion:'regression-false-effect'}})}},'false-material-effect');
  const next={...window,start:window.end,end:'2026-10-03T14:00:00Z'},later=await prepareSemanticShortlist(store,'feed-1',next,next.end);
  expect(later.candidates).toHaveLength(0);expect(later.obligations).toHaveLength(0);expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);
 }finally{await ctx.dispose()}
},30000);
