import {expect,it} from 'vitest';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {fallbackEditorialPlan,prepareEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {DEFAULT_BRIEFING_BUDGET,scoreAndSelect} from './scoring';
import {publishSelection,QuietPublication,type BriefingModelPort} from './publication';

it.each(['INTAKE','SEMANTIC','COMPLETE'] as const)('quiet synthesis commits %s coverage before any runtime catch can run',async kind=>{
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  await seedIntelligence(store,1,'OpenAI introduced an interactive visual interface.');
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
  const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);scope.id+=':atomic-quiet';
  const candidate=scope.candidates[0],previous='OpenAI has introduced an interactive visual interface.';
  scope.ledger.push({id:'prior-history',claimText:previous,claimFacts:[previous],eventIds:[candidate.stableTargetId],storylineIds:[],certainty:{kind:'UNSPECIFIED',hedges:[]},editionId:'prior'});
  await feedTransact(store,'feed-1',tx=>tx.write('shortlists',scope.id,scope));
  const body=fallbackEditorialPlan(scope);body.stories[0].previousLedgerEntryIds=['prior-history'];
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled',admission:syntheticModelAdmission,usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encodeKeyed(body),usage:{calls:1,costUsd:.001,reported:true}})});
  const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
  const requestId=await sha256(canonicalJson({feedId:'feed-1',start:selection.window.start,end:selection.window.end}));
  await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',requestId,{id:requestId,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,coverage:{state:'COMPLETE',pendingJobs:0,failedJobs:0,failures:[]},...(kind==='SEMANTIC'?{semanticCoverage:{unresolvedTargets:[{targetVersionId:'missing-target',reason:'EVENT_FACT_OWNERSHIP_UNRESOLVED'}]}}:{})}));
  // A failure discovered after the initial request coverage must be read inside
  // publication's final CAS, rather than relying on a later runtime correction.
  if(kind==='INTAKE')await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind('quiet-failed-acquire','feed-source-1','failed',JSON.stringify({id:'quiet-failed-acquire',kind:'ACQUIRE',state:'FAILED',exhausted:true,attempts:5,failureCode:'EXTRACTION_FAILED'})).run();
  const usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
  const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,
   synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support}))}))},usage}),
   repair:async()=>{throw Error('A verified repeated fact must not be rewritten')},
   verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:[],semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Grounded repeated prose.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'ALREADY_COMMUNICATED' as const,reason:'Supplied same-story history.',previousFactTexts:c.previousLedgerFacts!}}))),usage})};
  // Invoke publication alone: a crash or lost runtime lease after this rejection
  // prevents processV1Briefing's catch from repairing an incorrect durable label.
  await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).rejects.toBeInstanceOf(QuietPublication);
  expect(await store.read('feed-1','editions',requestId)).toBeUndefined();
  expect(await store.read('feed-1','synthesis_jobs',requestId)).toMatchObject({state:'DONE'});
  const request=await store.read<any>('feed-1','briefing_requests',requestId);
  expect(request).toMatchObject({state:'DONE',result:kind==='COMPLETE'?'QUIET':'DEFERRED',reason:kind==='INTAKE'?'INCOMPLETE_INTAKE_COVERAGE':kind==='SEMANTIC'?'INCOMPLETE_SEMANTIC_OWNERSHIP':'NO_NEW_VERIFIED_STORIES',attempts:0});
  if(kind==='INTAKE')expect(request.coverage).toMatchObject({state:'INCOMPLETE',failedJobs:1});
  if(kind==='SEMANTIC')expect(request.semanticCoverage.unresolvedTargets).toHaveLength(1);
 }finally{await ctx.dispose()}
},30000);
