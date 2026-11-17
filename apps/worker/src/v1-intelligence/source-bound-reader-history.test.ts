import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {batchFixture,testPolicy} from '../v1-intake/test-utils';
import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan,validateEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
import {projectEditionLedger,ledgerProjectionId} from './ledger';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import {extractClaimMentions} from './claims';
import {readerHistoryMatches,readerVerificationHistoryMatches} from './reader-history';
import {equivalentFact} from './editorial';

it('article identity expands verification context without proving equivalence or shared Event identity',()=>{
 const target={stableTargetId:'new-event',evidenceRevisionIds:['new-revision'],evidenceIds:['article']},entry={eventIds:['old-event'],evidenceRevisionIds:['old-revision'],evidenceIds:['article']};
 expect(readerHistoryMatches(target,entry)).toBe(false);
 expect(readerVerificationHistoryMatches(target,entry)).toBe(true);
 expect(readerVerificationHistoryMatches(target,{...entry,evidenceIds:['unrelated-article']})).toBe(false);
 expect(readerVerificationHistoryMatches(target,{...entry,evidenceIds:undefined})).toBe(false);
 expect(readerVerificationHistoryMatches(target,{...entry,withdrawn:true})).toBe(false);
});

it('source-only history requires the exact revision and does not launder withdrawn prose',()=>{
 const target={stableTargetId:'new-event',evidenceRevisionIds:['same-revision']},entry={eventIds:['old-event'],storylineIds:[],evidenceRevisionIds:['same-revision']};
 expect(readerHistoryMatches(target,entry)).toBe(true);
 expect(readerHistoryMatches(target,{...entry,evidenceRevisionIds:['different-revision']})).toBe(false);
 expect(readerHistoryMatches(target,{...entry,evidenceRevisionIds:undefined})).toBe(false);
 expect(readerHistoryMatches(target,{...entry,withdrawn:true})).toBe(false);
 expect(readerHistoryMatches({...target,stableTargetId:'old-event'},{...entry,withdrawn:true})).toBe(true);
});

const communicated='Science Corporation implanted its vision-restoring chip in its first patient with Stargardt disease.';
const unseen='Cedar University opened a separate clinical trial.';
it.each([false,true,'provisional','revision'] as const)('communication survives a new Event identity for the exact same evidence; unseen sibling=%s',async sibling=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'Medical research',interests:['Medical devices and clinical research'],geography:[]});
  await seedIntelligence(store,1,communicated+(sibling&&sibling!=='revision'?' '+unseen:''));
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);
  const proposal=fallbackEditorialPlan(scope),fact=scope.candidates[0].facts.find(f=>f.text===communicated)!;
  for(const story of proposal.stories){story.feedFit='DIRECT';story.editorialImportance=.8;story.mustIncludeFactIds=[fact.id];story.newUnderstandingFactIds=[fact.id];for(const key of ['contextFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'] as const)story[key]=story[key].filter(id=>id===fact.id);}
  const plan={...validateEditorialPlan(proposal,scope),id:'historical-plan',policyVersion:'retained-plan-fixture',evidenceRevisionIds:scope.evidenceRevisionIds,feedId:'feed-1',feedRevision:scope.feedRevision,shortlistId:scope.id,window:scope.window,communicationFingerprint:scope.communicationFingerprint,route:'GPT' as const,createdAt:window.end};
  await feedTransact(store,'feed-1',tx=>tx.write('editorial_plans',plan.id,plan));
  const selected=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,window.end,undefined,plan),usage={tokensIn:100,tokensOut:100,cost:.001,confirmed:true};
  const model:BriefingModelPort={model:'controlled',provider:'TEST',admission:syntheticModelAdmission,maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.filter(f=>f.id===fact.id).map(f=>({text:f.text,support:f.support}))}))},usage}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:[fact.id],novelFactIds:[fact.id],semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Exact approved reader-new fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'No prior communication.',previousFactTexts:[]}}))),usage})};
  // Retained verified publication is the precondition; the follow-up below uses
  // the complete real publication boundary with controlled model responses.
  const candidateId=selected.selectedCandidateIds[0],claim={id:'historical-claim',text:communicated,support:[{evidenceRevisionId:fact.evidenceRevisionIds[0],quote:communicated}]};
  const edition:any={id:'historical-edition',feedId:'feed-1',feedRevision:selected.feedRevision,selectionId:selected.id,windowStart:selected.window.start,windowEnd:selected.window.end,createdAt:window.end,eventVersionIds:scope.candidates[0].eventVersionIds,storylineVersionIds:[],evidenceRevisionIds:fact.evidenceRevisionIds,selectedCandidateIds:[candidateId],stories:[{candidateId,claims:[claim]}],generation:{provider:'FIXTURE',verificationId:selected.id,cost:0}};
  const entry:any={id:'historical-ledger',feedId:'feed-1',editionId:edition.id,claimId:claim.id,candidateId,claimText:communicated,claimFacts:[communicated],claimMentionIds:fact.claimMentionIds,propositionIds:fact.propositionId?[fact.propositionId]:[],eventIds:[scope.candidates[0].stableTargetId],storylineIds:[],targetType:'EVENT',targetVersionId:scope.candidates[0].targetVersionId,evidenceRevisionIds:fact.evidenceRevisionIds,certainty:{kind:'UNSPECIFIED',hedges:[]},communicatedAt:window.end,policyVersion:'grounded-communication-ledger-v1'};
  await feedTransact(store,'feed-1',async tx=>{await tx.write('editions',edition.id,edition);await tx.write('publication_status',edition.id,{id:edition.id,feedId:'feed-1',status:'PUBLISHED',publishedAt:window.end});await tx.write('ledger_entries',entry.id,entry);await tx.write('ledger_projections',ledgerProjectionId(edition.id),{id:ledgerProjectionId(edition.id),feedId:'feed-1',editionId:edition.id,entryIds:[entry.id]});await tx.write('verification_results',selected.id,{id:selected.id,feedId:'feed-1',semanticChecks:[{candidateId,factId:fact.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,readerSpans:[{claimId:claim.id,text:communicated}]}]})});
  if(sibling==='revision'){const policy={...testPolicy,now:()=> '2026-10-03T13:10:00Z'},batch=batchFixture(2);batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';const intake=new V1IntakeStore(ctx.db),receipt=await createCandidateIntakePort(intake,policy).acceptBatch(batch);await acceptAcquiredContent(intake,{id:'updated-article',feedId:'feed-1',candidateId:receipt.receipts[0].candidateItemId!,sourceObservationId:'observation-2',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:communicated+' '+unseen,acquiredAt:policy.now(),acquisitionMethod:'supplied_payload'},policy)}
  const provenance={scorer:'GPT',policyVersion:'split-event-fixture'},mentions=(await extractClaimMentions((await store.currentEvidence('feed-1'))[0].revision)).mentions;
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS',sibling==='revision'?'observation-2':'observation-1','']),'2026-10-03T13:10:00Z',sibling==='provisional'?{...deterministicMatchers,storyline:{match:()=>({relation:'NEW',confidence:.99,provenance})},event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:.4,provenance})},construction:()=>({groups:mentions.map(m=>({claimMentionIds:[m.id],structuralRelation:'DEFER',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],provenance})}:{...deterministicMatchers,event:{match:()=>({structuralRelation:'NEW_STORYLINE',epistemicEffects:[],confidence:.99,provenance})},...(sibling===true?{construction:()=>({groups:mentions.map(m=>({claimMentionIds:[m.id],structuralRelation:'NEW_STORYLINE' as const,eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],provenance})}:{})},'new-event-identity');
  const later=await prepareSemanticShortlist(store,'feed-1',{...window,start:window.end,end:'2026-10-03T14:00:00Z'},'2026-10-03T14:00:00Z');
  if(sibling===true){expect(later.candidates.flatMap(c=>c.fallbackEditorial.newUnderstanding.filter(f=>!c.facts.some(owned=>equivalentFact(owned.text,f.text))))).toEqual([]);expect(later.candidates).toHaveLength(1);}
  if(!sibling)expect(later.candidates).toHaveLength(0);
  else{
   expect(later.candidates.length).toBeGreaterThan(0);expect(later.candidates.some(c=>c.facts.some(f=>f.text===unseen))).toBe(true);expect(later.candidates.some(c=>c.facts.some(f=>f.text===unseen))).toBe(true);expect(later.ledger[0].evidenceRevisionIds).toEqual(scope.candidates[0].evidenceRevisionIds);
   const changed=later.candidates.find(c=>c.stableTargetId!==scope.candidates[0].stableTargetId&&c.facts.some(f=>f.text===unseen))!,newFact=changed.facts.find(f=>f.text===unseen)!,nextProposal=fallbackEditorialPlan(later);
   if(sibling==='provisional'){expect(changed.readerState).toBe('UNSEEN');expect(changed.flags).toContain('PROVISIONAL');expect(changed.flags).not.toContain('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE');expect(nextProposal.stories.find(s=>s.targetVersionId===changed.targetVersionId)!.decision).toBe('SELECT');expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);return;}
   expect(changed.readerState).toBe('UNSEEN');
   for(const story of nextProposal.stories){const picked=story.targetVersionId===changed.targetVersionId;story.feedFit='DIRECT';story.editorialImportance=.8;story.decision=picked?'SELECT':'SUPPRESS';story.treatment=picked?'STANDARD':'OMIT';story.deltaType='NEW';story.mustIncludeFactIds=picked?[newFact.id]:[];story.newUnderstandingFactIds=picked?[newFact.id]:[];story.previousLedgerEntryIds=[];for(const key of ['contextFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'] as const)story[key]=[];}
   const nextPlan=await prepareEditorialPlan(store,later,ADAPTIVE_BRIEFING_PROCESSING,later.window.end,{model:'controlled',admission:syntheticModelAdmission,usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(later).encodeKeyed(nextProposal),usage:{calls:1,costUsd:.001,reported:true}})});
   expect(nextPlan.route,JSON.stringify({fallbackReason:nextPlan.fallbackReason,failures:(await store.list<any>('feed-1','semantic_results')).filter(r=>r.status!=='SUCCEEDED').map(r=>({failure:r.failure,details:r.value}))})).toBe('GPT');
   const nextSelection=await scoreAndSelect(store,'feed-1',later.window,ADAPTIVE_BRIEFING_PROCESSING,later.window.end,undefined,nextPlan);
   let seenHistory:string[]=[],writerHistory:string[]=[];const nextModel:BriefingModelPort={...model,synthesize:async input=>{writerHistory=input.stories[0].plan!.previousLedgerEntries.flatMap(e=>e.claimFacts);return {draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support}))}))},usage}},verify:async claims=>{seenHistory=claims[0].previousLedgerFacts??[];return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:[newFact.id],novelFactIds:[newFact.id],semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'The same article contains this separate uncommunicated fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'Prior history communicates only the implant fact.',previousFactTexts:[]}}))),usage}}};
   const nextEdition=await publishSelection(store,'feed-1',nextSelection.id,{now:()=>later.window.end,model:nextModel,requireModel:true});expect(nextEdition.stories[0].claims[0].text).toBe(unseen);expect(writerHistory).toContain(communicated);expect(seenHistory).toContain(communicated);await projectEditionLedger(store,'feed-1',nextEdition.id);
  }
  expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);expect(await store.list('feed-1','ledger_entries')).toHaveLength(sibling?2:1);
 }finally{await ctx.dispose()}
},30000);
