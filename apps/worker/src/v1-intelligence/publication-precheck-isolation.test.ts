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

// Retained October 15 failure shape: two failed mandatory stories must not erase
// an independently supported third story. No paid models are used by this test.
it.each(['partial','restart','all-invalid','duplicate','verifier-rejects'] as const)('repaired writer prechecks preserve independent delivery without weakening verification: %s',async mode=>{
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
  expect(plan.route).toBe('GPT');
  const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,now(),undefined,plan);
  expect(selection.selectedCandidateIds).toHaveLength(3);
  const usage={tokensIn:100,tokensOut:100,cost:.001,confirmed:true};let writes=0,repairs=0,verifications=0;
  const draft=(input:SynthesisWriterInput,repaired=false)=>{
   const stories=input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text.replace('$75','$74.99').replace(' 2026',''),support:f.support,communicatedFactIds:[f.id]}))}));
   if(mode==='all-invalid')for(const s of stories)s.claims=[];
   if(mode==='duplicate'&&repaired)stories.push(stories[0]);
   return {language:'en',stories};
  };
  const model:BriefingModelPort={model:'writer-fixture',provider:'SYNTHETIC',requiresFullEntailment:true,maxCallCostUsd:0,admission:syntheticModelAdmission,
   synthesize:async input=>{writes++;return {draft:draft(input),usage}},
   repair:async input=>{repairs++;return {draft:draft(input,true),usage}},
   verify:async claims=>{
    verifications++;expect(claims.every(c=>c.text.includes('YouTube Music'))).toBe(true);
    return {supportedClaimIds:mode==='verifier-rejects'?[]:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]),novelFactIds:claims.flatMap(c=>c.newUnderstandingFacts?.map(f=>f.id)??[]),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:mode!=='verifier-rejects',unsupportedMeaning:mode==='verifier-rejects'?['Not entailed']:[],reason:'Independent verification.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Supported fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'Reader-new.',previousFactTexts:[]}}))),usage};
   }};
  if(mode!=='partial'&&mode!=='restart'){
   await expect(publishSelection(store,'feed-1',selection.id,{now,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
   expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','ledger_entries')).toHaveLength(0);
   expect(verifications).toBe(mode==='verifier-rejects'?1:0);
  }else{
   if(mode==='restart'){
    await ctx.db.exec("CREATE TRIGGER fail_independent_verification_commit BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='verification_results' BEGIN SELECT RAISE(ABORT,'simulated verification commit outage'); END;");
    await expect(publishSelection(store,'feed-1',selection.id,{now,model,requireModel:true})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
    await ctx.db.exec('DROP TRIGGER fail_independent_verification_commit;');
   }
   const edition=await publishSelection(store,'feed-1',selection.id,{now,model,requireModel:true});
   expect(edition.stories).toHaveLength(1);expect(edition.stories[0].claims[0].text).toContain('YouTube Music');expect(edition.generation.repairCount).toBe(1);
   expect(edition.generation.cost).toBeCloseTo(.003);
   expect(edition.generation.draftId).not.toBe(JSON.stringify([selection.id,'repair-1']));
   const pending=await store.list<any>('feed-1','publication_reconciliations');expect(pending.filter(r=>r.reason==='WRITER_PRECHECK_FAILED')).toHaveLength(2);
   expect(pending.every(r=>r.state==='SELECTED_UNCOMMUNICATED'&&r.requiredFactIds.length>0)).toBe(true);
   const deferred=await store.list<any>('feed-1','editorial_deferred_work');expect(deferred.filter(w=>w.reason==='WRITER_PRECHECK_FAILED').every(w=>!w.expiresAt)).toBe(true);
   const original=await store.read<any>('feed-1','drafts',JSON.stringify([selection.id,'repair-1']));expect(original.draft.stories).toHaveLength(3);
   await projectEditionLedger(store,'feed-1',edition.id);expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);
   expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now,model,requireModel:true})).toEqual(edition);
   expect(verifications).toBe(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
   const next=await prepareSemanticShortlist(store,'feed-1',{...window,start:window.end,end:'2026-10-05T00:00:00Z'},'2026-10-05T00:00:00Z');
   const unresolvedTargets=pending.map(r=>r.targetVersionId);
   expect(unresolvedTargets.every(id=>next.candidates.some(c=>c.targetVersionId===id&&c.readerState==='UNSEEN'))).toBe(true);
  }
  expect(writes).toBe(1);expect(repairs).toBe(1);
 }finally{await ctx.dispose()}
},60000);
