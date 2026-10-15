import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
import {projectEditionLedger} from './ledger';

const title='Laplace Intelligence red-teams robots and self-driving cars before they hit the real world';
const body='University of Michigan spinout Laplace Intelligence uses AI agents and interactive simulation to stress-test robots and self-driving vehicles before deployment.';
it.each(['faithful','negative','missing-witness','wrong-source'] as const)('title fact covered by a source-bound excerpt paraphrase: %s',async mode=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'AI industry',interests:['AI research and industry developments']});
  await acceptEvidence(store,1,body,'publisher-1',undefined,'en',undefined,title);
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:00:00Z');
  await seedIntelligence(store,2,'OpenAI introduced an interactive visual interface.');
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
  const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);
  const repeated=scope.candidates.find(c=>c.facts.some(f=>f.text.includes('Laplace')))!;
  expect(repeated.facts.some(f=>f.text===title)).toBe(true);
  const prior='Laplace Intelligence, a University of Michigan spinout, uses AI agents and interactive simulation to rigorously stress-test robots and self-driving vehicles before deployment. This red-teaming process subjects these technologies to challenging scenarios prior to their real-world operation.';
  scope.id+=':citation-coverage';scope.ledger.push({id:'laplace-history',claimText:prior,claimFacts:[prior],eventIds:[repeated.stableTargetId],storylineIds:[],certainty:{kind:'UNSPECIFIED',hedges:[]},editionId:'prior'});
  await feedTransact(store,'feed-1',tx=>tx.write('shortlists',scope.id,scope));
  const proposal=fallbackEditorialPlan(scope);for(const s of proposal.stories)if(s.targetVersionId===repeated.targetVersionId)s.previousLedgerEntryIds=['laplace-history'];
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled',admission:syntheticModelAdmission,usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encodeKeyed(proposal),usage:{calls:1,costUsd:.001,reported:true}})});
  const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
  let repairs=0,writerCalls=0;const usage={tokensIn:100,tokensOut:100,cost:.001,confirmed:true};
  const model:BriefingModelPort={model:'controlled',provider:'TEST',requiresFullEntailment:true,maxCallCostUsd:.01,
   synthesize:async input=>{writerCalls++;return {draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.some(f=>f.text.includes('Laplace'))?[{text:body,support:[{evidenceRevisionId:mode==='wrong-source'?input.stories.find(other=>other.candidate.id!==s.candidate.id)!.evidence[0].id:s.evidence[0].id,quote:body}]}]:s.approvedFacts!.map(f=>({text:f.text,support:f.support}))}))},usage}},
   repair:async()=>{repairs++;throw Error('No invented replacement or repeated-story rewrite');},
   verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.filter(c=>!c.text.includes('Laplace')).flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Source-bound complete meaning.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:!(mode==='negative'&&f.text===title),attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'The excerpt paraphrases the independently approved headline fact.',readerSpans:mode==='missing-witness'&&f.text===title?[]:[{claimId:c.id,text:c.text}],readerNovelty:{status:c.text.includes('Laplace')?'ALREADY_COMMUNICATED' as const:'NEW' as const,reason:'Compared with exact same-story communicated history.',previousFactTexts:c.text.includes('Laplace')?c.previousLedgerFacts!:[]}}))),usage})};
  if(mode==='faithful'){
   const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true});expect(edition.stories).toHaveLength(1);expect(edition.stories[0].claims[0].text).toContain('OpenAI');expect(repairs).toBe(0);
   await projectEditionLedger(store,'feed-1',edition.id);expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);
   expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).toEqual(edition);expect(writerCalls).toBe(1);
  }else{
   await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).rejects.toBeDefined();expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','ledger_entries')).toHaveLength(0);
   const saved=await store.read<any>('feed-1','drafts',selection.id);expect(saved.draft.stories[0].claims[0].support).toHaveLength(1);expect(await store.read('feed-1','selections',selection.id)).toEqual(selection);
   const feedback=await store.list<any>('feed-1','verification_feedback');
   expect(feedback.some(record=>record.issues.some((issue:any)=>mode==='wrong-source'?issue.code==='INVALID_SUPPORT_QUOTE':issue.code==='MISSING_REQUIRED_FACT'&&issue.factId===repeated.facts.find(f=>f.text===title)!.id))).toBe(true);
  }
 }finally{await ctx.dispose()}
},30000);
