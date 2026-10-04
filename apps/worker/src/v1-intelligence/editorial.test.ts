import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {processV1Briefing} from './runtime';
import type {Env} from '../types';
import {DeterministicSalienceScorer} from './salience';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const first={start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:01:00Z',kind:'HOURLY' as const};
const next={start:first.end,end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx?.dispose());
async function told(body:string) {
 await seedIntelligence(store,1,body);
 const selected=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 return publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
}
it('suppressed corroboration retains omission provenance without opening a paid salience intent',async()=>{
 await told('Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Lebanon Parliament passed banking reform law.','publisher-2','2026-10-03T12:30:00Z');
 let calls=0;const scorer={score:(input:import('./salience').SalienceInput)=>{calls++;return new DeterministicSalienceScorer().score(input)}};
 const selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end,scorer);
 expect(selected.omissions.map(o=>o.reason)).toContain('CORROBORATION_ONLY');expect(calls).toBe(0);expect(await store.list('feed-1','salience_intents')).toHaveLength(0);
},15000);
it('independent corroboration increases evidence support but suppresses a previously communicated development',async()=>{
 const edition=await told('Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Lebanon Parliament passed banking reform law.','publisher-2','2026-10-03T12:30:00Z');
 const selection=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(selection.selectedCandidateIds).toHaveLength(0);
 expect(selection.omissions.map(o=>o.reason)).toContain('CORROBORATION_ONLY');
 const metadata=selection as unknown as {editorialByCandidate:Record<string,{previouslyCommunicated:{editionId:string}[];decision:string}>};
 expect(Object.values(metadata.editorialByCandidate)[0]).toMatchObject({decision:'SUPPRESS',previouslyCommunicated:[expect.objectContaining({editionId:edition.id})]});
 expect(await store.list('feed-1','events')).toHaveLength(1);
 expect(await store.list('feed-1','memberships')).toHaveLength(3);
 const corroboration=(await store.list<{id:string;corroboration:number}>('feed-1','salience')).map(s=>s.corroboration);
 expect(corroboration).toContain(0.666667);
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
},15000);
it('unrelated approved evidence arriving during synthesis does not revoke the selected story',async()=>{
 await seedIntelligence(store);
 const selected=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());let calls=0;
 const edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,
  synthesize:async input=>{calls++;await seedIntelligence(store,2,'Japan scientists discovered lunar mineral deposits.','publisher-2','2026-10-03T12:30:00Z');const e=input.stories[0].evidence[0];return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}}},
  verify:async claims=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}}}}});
 expect(calls).toBe(2);expect(edition.stories).toHaveLength(1);
 expect(edition.stories[0].claims[0].text).toContain('banking reform');
 expect(edition.stories[0].claims[0].text).not.toContain('lunar');
},15000);
it('source revocation during synthesis prevents grounding provider use',async()=>{
 await seedIntelligence(store);
 const selected=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());let calls=0;
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,
  synthesize:async input=>{calls++;const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;await intake.registerScope({...scope,enabled:false});const e=input.stories[0].evidence[0];return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}}},
  verify:async claims=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}}}}})).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','model_intents')).toHaveLength(1);
},15000);
it('stale-history retry retains material facts and consumed model budgets',async()=>{
 const body='Lebanon Parliament approved banking reform legislation. Banking depositors will receive compensation next month.';
 await seedIntelligence(store,1,body);
 const a=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const overlapping={...next,start:first.start};
 const b=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 const firstClaimModel={model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,
  synthesize:async(input:import('./publication').SynthesisInput)=>({draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:body.split('. ')[0]+'.',support:[{evidenceRevisionId:input.stories[0].evidence[0].id,quote:body}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}}),
  verify:async(claims:import('./publication').VerificationClaim[])=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})};
 await expect(publishSelection(store,'feed-1',b.id,{now:()=>next.end,model:{...firstClaimModel,
  synthesize:async input=>{await publishSelection(store,'feed-1',a.id,{now:testPolicy.now,model:firstClaimModel});return firstClaimModel.synthesize(input)}}})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 const fresh=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(fresh.selectedCandidateIds).toHaveLength(1);
 const edition=await publishSelection(store,'feed-1',fresh.id,{now:()=>next.end});
 expect(edition.stories[0].claims[0].text).toContain('compensation');
 expect(edition.generation.tokensIn).toBe(100);expect(edition.generation.cost).toBe(.001);
 expect(await store.list('feed-1','model_intents')).toHaveLength(3);
},25000);
it('publication racing a model call cannot publish stale repetition or start a second call',async()=>{
 await seedIntelligence(store);
 const a=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const overlapping={...next,start:first.start};
 const b=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 let calls=0;
 await expect(publishSelection(store,'feed-1',b.id,{now:()=>next.end,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,
  synthesize:async input=>{calls++;await publishSelection(store,'feed-1',a.id,{now:testPolicy.now});const e=input.stories[0].evidence[0];return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}}},
  verify:async claims=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}}}}})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(1);
 expect(await store.list('feed-1','model_executions')).toHaveLength(1);
 const fresh=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(fresh.selectedCandidateIds).toHaveLength(0);
},15000);
it('reader knowledge includes only published claims, not every fact in their supporting evidence',async()=>{
 const body='Lebanon Parliament approved banking reform legislation. Banking depositors will receive compensation next month.';
 await seedIntelligence(store,1,body);
 const selected=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,
  synthesize:async input=>({draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:body.split('. ')[0]+'.',support:[{evidenceRevisionId:input.stories[0].evidence[0].id,quote:body}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}}),
  verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})}});
 expect(edition.stories[0].claims[0].text).not.toContain('compensation');
 await seedIntelligence(store,2,body,'publisher-2','2026-10-03T12:30:00Z');
 const later=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(later.selectedCandidateIds).toHaveLength(1);
 expect(Object.values(later.editorialByCandidate!)[0].newUnderstanding.map(f=>f.text).join(' ')).toContain('compensation');
},15000);
it('quiet corroboration settles a replayable request without creating an edition, model intent or notification',async()=>{
 await told('Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Lebanon Parliament approved banking reform legislation.','publisher-2','2026-10-03T12:30:00Z');
 const env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as unknown as Env;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:next};
 expect(await processV1Briefing(env,message,()=>next.end)).toBeUndefined();
 expect(await processV1Briefing(env,message,()=>next.end)).toBeUndefined();
 expect(await store.list('feed-1','briefing_requests')).toMatchObject([{state:'DONE'}]);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
 expect(await store.list('feed-1','model_intents')).toHaveLength(0);
},15000);
it('direct publication rejects an empty selection before opening synthesis or notification work',async()=>{
 const selected=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','synthesis_jobs')).toHaveLength(0);
 expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
},15000);
it('a newly published edition invalidates cached communication reasoning and blocks stale synthesis',async()=>{
 await seedIntelligence(store);
 const a=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const overlapping={...next,start:first.start};
 const stale=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(stale.selectedCandidateIds).toHaveLength(1);
 await publishSelection(store,'feed-1',a.id,{now:testPolicy.now});
 await expect(publishSelection(store,'feed-1',stale.id,{now:()=>next.end})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 const fresh=await scoreAndSelect(store,'feed-1',overlapping,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(fresh.id).not.toBe(stale.id);expect(fresh.selectedCandidateIds).toHaveLength(0);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
 expect(await store.list('feed-1','synthesis_jobs')).toHaveLength(1);
},15000);
it('a distinct supported consequence remains eligible while repeated background is recognized',async()=>{
 await told('Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Lebanon Parliament approved banking reform legislation. Banking depositors will receive compensation next month.','publisher-2','2026-10-03T12:30:00Z');
 const selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(selected.selectedCandidateIds).toHaveLength(1);
 const decision=Object.values((selected as unknown as {editorialByCandidate:Record<string,{reasonCodes:string[];newUnderstanding:{text:string}[]}>}).editorialByCandidate)[0];
 expect(decision.reasonCodes).toContain('MATERIAL_NEW_FACT');expect(decision.newUnderstanding.map(f=>f.text).join(' ')).toContain('compensation');
 expect(decision.newUnderstanding.map(f=>f.text).join(' ')).not.toContain('approved banking reform');
},15000);
it('state transition across Events in one Storyline adds understanding without losing historical support',async()=>{
 const edition=await told('Lebanon Parliament banking reform negotiations remain ongoing.');
 await seedIntelligence(store,2,'Lebanon Parliament signed the banking reform agreement.','publisher-2','2026-10-03T12:30:00Z');
 const selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end);
 expect(selected.selectedCandidateIds).toHaveLength(1);
 const decision=Object.values((selected as unknown as {editorialByCandidate:Record<string,{reasonCodes:string[];previouslyCommunicated:{editionId:string}[]}>}).editorialByCandidate)[0];
 expect(decision.reasonCodes).toContain('MAJOR_STATE_CHANGE');expect(decision.previouslyCommunicated[0].editionId).toBe(edition.id);
 expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);
},15000);
