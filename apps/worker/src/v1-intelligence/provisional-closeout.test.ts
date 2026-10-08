import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import {extractClaimMentions} from './claims';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan,validateEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
import {nextRematch} from './rematch';
it('published provisional identity and rematch remain durable through exhaustion and later semantic resolution',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store);
  const revision=(await store.currentEvidence('feed-1'))[0].revision,{mentions}=await extractClaimMentions(revision),job=JSON.stringify(['REASSESS','observation-1','']),provenance={scorer:'GPT',policyVersion:'controlled'};
  await processEvidenceIntelligence(store,job,testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:.4,provenance})},construction:()=>({groups:[{claimMentionIds:mentions.map(m=>m.id),eventId:null,storylineId:null,structuralRelation:'DEFER',epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],provenance})});
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);
  expect(scope.candidates[0].flags).toContain('PROVISIONAL');
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end});await projectEditionLedger(store,'feed-1',edition.id);
  expect(edition.provisionalSemanticStates).toHaveLength(1);expect(edition.provisionalSemanticStates![0].rematchRequestIds).toHaveLength(1);
  const [request]=await store.list<any>('feed-1','rematch_requests');expect(nextRematch(request,[{requestId:request.id,state:'EXHAUSTED',attempt:3} as any],window.end)).toBeUndefined();expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
  const [event]=await store.list<any>('feed-1','events');await processEvidenceIntelligence(store,job,'2026-10-03T13:10:00Z',{...deterministicMatchers,event:{match:()=>({structuralRelation:'SAME_EVENT',eventId:event.id,epistemicEffects:['CORROBORATES'],confidence:.99,provenance})}},'resolved-semantic-identity');
  expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);expect(await store.list('feed-1','ledger_entries')).not.toHaveLength(0);
  const current=(await store.list<any>('feed-1','events'))[0],state=await store.read<any>('feed-1','event_semantic_states',current.currentVersionId);expect(state.provisional).toBe(false);expect(await store.read<any>('feed-1','event_semantic_states',edition.eventVersionIds[0])).toMatchObject({provisional:true});
 }finally{await ctx.dispose()}
},30000);
it('unresolved identity cannot authorize a high-consequence protected selection',()=>{
 const candidate={targetType:'EVENT',targetVersionId:'event',stableTargetId:'root',facts:[{id:'fact',text:'Officials confirmed 40 deaths.',evidenceRevisionIds:['r']}],flags:['PROVISIONAL','IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'],effects:['CHANGES_STATE'],protectedReasons:['CHANGES_STATE'],correctionObligationIds:[],fallbackEditorial:{decision:'INCLUDE',treatment:'STANDARD',newUnderstanding:[{text:'Officials confirmed 40 deaths.'}]}};
 const scope={candidates:[candidate],ledger:[],obligations:[]} as any,plan=fallbackEditorialPlan(scope);expect(plan.stories[0].decision).toBe('DEFER');expect(()=>validateEditorialPlan({...plan,stories:[{...plan.stories[0],decision:'SELECT',treatment:'STANDARD',mustIncludeFactIds:['fact']}]},scope)).toThrow();
});
