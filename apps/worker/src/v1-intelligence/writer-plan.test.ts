import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store)});
afterEach(async()=>ctx.dispose());
it('writer receives selected structured plan and exact required facts; publication replay preserves semantic ledger references',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);let calls=0;
 const usage={tokensIn:100,tokensOut:80,cost:.001,confirmed:true},model={model:'fake',provider:'TEST',maxCallCostUsd:.02,synthesize:async(input:any)=>{calls++;expect(input.editorialPlan.id).toBe(selection.editorialPlanId);expect(input.stories[0].plan.decision).toBe('SELECT');expect(input.stories[0].plan.mustIncludeFactIds).toEqual(shortlist.candidates[0].facts.map(f=>f.id));return {draft:{language:'en',stories:input.stories.map((s:any)=>({candidateId:s.candidate.id,claims:s.evidence.map((e:any)=>({text:e.body,support:[{evidenceRevisionId:e.id,quote:e.body}]}))}))},usage}},verify:async(claims:any[])=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map((f:any)=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map((f:any)=>f.id)),usage}}};
 const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model});await projectEditionLedger(store,'feed-1',edition.id);
 expect(await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model})).toEqual(edition);expect(calls).toBe(2);
 expect((await store.list<any>('feed-1','ledger_entries'))[0].propositionIds).toEqual(shortlist.candidates[0].facts.map(f=>f.propositionId));
},25000);

it('rejects fabricated reader quantities despite exact quotes and a permissive verifier',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
 const usage={tokensIn:100,tokensOut:80,cost:.001,confirmed:true},model={model:'adversarial',provider:'TEST',maxCallCostUsd:.02,synthesize:async(input:any)=>({draft:{language:'en',stories:input.stories.map((s:any)=>({candidateId:s.candidate.id,claims:s.evidence.map((e:any)=>({text:e.body+' Officials counted 40 affected people.',support:[{evidenceRevisionId:e.id,quote:e.body}]}))}))},usage}),verify:async(claims:any[])=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map((f:any)=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map((f:any)=>f.id)),usage})};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);expect((await store.read<any>('feed-1','fidelity_results',selection.id)).passed).toBe(false);
},25000);
it('fails explicitly when the writer drops one planned story',async()=>{
 await seedIntelligence(store,2,'An earthquake destroyed homes in Beirut.','publisher-b','2026-10-03T12:30:00Z');
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);expect(selection.selectedCandidateIds).toHaveLength(2);
 const usage={tokensIn:100,tokensOut:80,cost:.001,confirmed:true},model={model:'adversarial',provider:'TEST',maxCallCostUsd:.02,synthesize:async(input:any)=>({draft:{language:'en',stories:input.stories.slice(0,1).map((s:any)=>({candidateId:s.candidate.id,claims:s.evidence.map((e:any)=>({text:e.body,support:[{evidenceRevisionId:e.id,quote:e.body}]}))}))},usage}),verify:async(claims:any[])=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map((f:any)=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map((f:any)=>f.id)),usage})};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);expect((await store.read<any>('feed-1','fidelity_results',selection.id)).checks.some((c:any)=>c.missingStory)).toBe(true);
},25000);

it('replaying an old edition cannot resolve a newer version of protected deferred work',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
 const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end});await projectEditionLedger(store,'feed-1',edition.id);
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_deferred_work','later-work',{id:'later-work',feedId:'feed-1',targetVersionId:'later-version',stableTargetId:shortlist.candidates[0].stableTargetId,protectedReasons:['CHANGES_STATE'],createdAt:'2026-10-03T14:00:00Z'}));
 await projectEditionLedger(store,'feed-1',edition.id);
 expect((await store.list<any>('feed-1','editorial_work_resolutions')).some(r=>r.workId==='later-work')).toBe(false);
},25000);

it('selection includes older support required by the plan even when only the new fact drives delta ranking',async()=>{
 const firstShortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),firstPlan=await prepareEditorialPlan(store,firstShortlist,DEFAULT_BRIEFING_BUDGET,window.end),firstSelection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,firstPlan),edition=await publishSelection(store,'feed-1',firstSelection.id,{now:()=>window.end});await projectEditionLedger(store,'feed-1',edition.id);
 const old=(await store.currentEvidence('feed-1'))[0].revision.id;
 await seedIntelligence(store,2,'Lebanon Parliament approved banking reform legislation with a new amendment.','publisher-b','2026-10-03T13:30:00Z');
 const later={start:'2026-10-03T13:00:00Z',end:'2026-10-03T14:00:00Z',kind:'HOURLY' as const},shortlist=await prepareSemanticShortlist(store,'feed-1',later,later.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,later.end);
 const target=shortlist.candidates.find(c=>c.facts.some(f=>f.evidenceRevisionIds.includes(old)))!;expect(target).toBeDefined();const oldFact=target.facts.find(f=>f.evidenceRevisionIds.includes(old))!;
 plan.stories.find(s=>s.targetVersionId===target.targetVersionId)!.contextFactIds.push(oldFact.id);plan.stories.find(s=>s.targetVersionId===target.targetVersionId)!.mustIncludeFactIds.push(oldFact.id);
 const selection=await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end,undefined,plan);expect(Object.values(selection.evidenceByCandidate).flat()).toContain(old);
},30000);

it('publication respects a negative independent semantic novelty verdict despite supported prose and a declared plan delta',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
 const usage={tokensIn:100,tokensOut:80,cost:.001,confirmed:true},model={model:'verifier',provider:'TEST',maxCallCostUsd:.02,synthesize:async(input:any)=>({draft:{language:'en',stories:input.stories.map((s:any)=>({candidateId:s.candidate.id,claims:s.evidence.map((e:any)=>({text:e.body,support:[{evidenceRevisionId:e.id,quote:e.body}]}))}))},usage}),verify:async(claims:any[])=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map((f:any)=>f.id)),novelFactIds:[],usage})};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},25000);

it('communicating one supported fact does not resolve additional uncommunicated work for the same Event',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_deferred_work','partial-work',{id:'partial-work',feedId:'feed-1',targetVersionId:shortlist.candidates[0].targetVersionId,stableTargetId:shortlist.candidates[0].stableTargetId,protectedReasons:[],reason:'DEFERRED_EDITORIAL_WORK',factTexts:[shortlist.candidates[0].facts[0].text,'Parliament amended the tax clause.'],createdAt:window.start}));
 const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end});await projectEditionLedger(store,'feed-1',edition.id);
 expect((await store.list<any>('feed-1','editorial_work_resolutions')).some(r=>r.workId==='partial-work')).toBe(false);
},25000);
