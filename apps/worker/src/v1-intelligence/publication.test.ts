import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it.each(['UNKNOWN',''])('unknown evidence language %s permits exact extraction without inventing metadata',async language=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1',testPolicy.now(),language||null);
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
 expect(edition.stories[0].claims[0].text).toBe('Lebanon Parliament approved banking reform legislation.');
 const revision=await store.revision('feed-1',edition.evidenceRevisionIds[0]);
 expect(revision?.language).toBe(language||undefined);
 expect(await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now})).toEqual(edition);
});
it('known different language requires translation and fails explicitly without publishing',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1',testPolicy.now(),'ar');
 const selected=await selection();
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now})).rejects.toMatchObject({reason:'TRANSLATION_REQUIRED'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
});
it('unknown language does not bypass extractive capacity limits',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation. '.repeat(15),'publisher-1',testPolicy.now(),'UNKNOWN');
 const selected=await selection();
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now})).rejects.toMatchObject({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'});
});
it('configured multilingual synthesis may translate Arabic evidence with exact quotes and verification',async()=>{
 const body='وافق البرلمان اللبناني على إصلاح القطاع المصرفي.';
 await seedIntelligence(store,1,body,'publisher-1',testPolicy.now(),'ar');const selected=await selection();
 const model:BriefingModelPort={model:'multilingual-fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:'Lebanon Parliament approved banking reform.',support:[{evidenceRevisionId:input.stories[0].evidence[0].id,quote:body}]}]}]},usage:{tokensIn:50,tokensOut:20,cost:.001,confirmed:true}}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),usage:{tokensIn:50,tokensOut:20,cost:.001,confirmed:true}})};
 const edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model});
 expect(edition.language).toBe('en');expect(edition.stories[0].claims[0].support[0].quote).toBe(body);expect((await store.revision('feed-1',edition.evidenceRevisionIds[0]))?.language).toBe('ar');
});
async function selection() {if(!(await store.list('feed-1','events')).length) await seedIntelligence(store);return scoreAndSelect(store,'feed-1',{start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY'},DEFAULT_BRIEFING_BUDGET,testPolicy.now())}
it('publishes exact grounded immutable support; lost acknowledgement returns the same edition and one delivery job',async()=>{
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
 expect(edition.stories).toHaveLength(1);expect(edition.evidenceRevisionIds).toHaveLength(1);
 expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selected.id,{now:testPolicy.now})).toEqual(edition);
 expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
 await expect(ctx.db.prepare("UPDATE v1_feed_documents SET json='{}' WHERE kind='editions'").run()).rejects.toThrow('V1_IMMUTABLE');
});
it('model receives only selected stored evidence; fabricated references and unsupported facts cannot publish',async()=>{
 const selected=await selection();let seen:unknown;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  seen=input;return {draft:{language:'en',stories:[{candidateId:selected.selectedCandidateIds[0],claims:[{text:'Parliament approved 900 billion dollars.',support:[{evidenceRevisionId:'made-up',quote:'made-up'}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 }};
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(seen).toBeDefined();expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','model_intents')).toHaveLength(1);expect(await store.list('feed-1','model_executions')).toHaveLength(1);
});
it('published snapshots and support survive Feed deletion; no future publication is permitted',async()=>{
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
 await store.registerFeed({...feedFixture,revision:2,deletedAt:testPolicy.now()});
 expect(await store.read('feed-1','editions',edition.id)).toEqual(edition);
 for(const id of edition.evidenceRevisionIds) expect(await store.revision('feed-1',id)).toBeDefined();
 await expect(scoreAndSelect(store,'feed-1',{start:'2026-10-04T00:00:00Z',end:'2026-10-05T00:00:00Z',kind:'DAILY'},DEFAULT_BRIEFING_BUDGET,testPolicy.now())).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('restart after durable model draft and grounding resumes publication without a second paid call',async()=>{
 const selected=await selection();let calls=0;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  calls++;const evidence=input.stories[0].evidence[0],quote=evidence.body!;
  return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:quote,support:[{evidenceRevisionId:evidence.id,quote}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:80,tokensOut:10,cost:.001,confirmed:true}})};
 await ctx.db.exec("CREATE TRIGGER fail_publication BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editions' BEGIN SELECT RAISE(ABORT,'simulated persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(await store.list('feed-1','drafts')).toHaveLength(1);expect(await store.list('feed-1','grounding_results')).toHaveLength(1);
 await ctx.db.exec('DROP TRIGGER fail_publication;');
 const edition=await publishSelection(new V1FeedStore(ctx.db),'feed-1',selected.id,{now:testPolicy.now,model});
 expect(calls).toBe(1);expect(edition.stories).toHaveLength(1);expect(await store.list('feed-1','model_intents')).toHaveLength(2);
});
it('extractive publication preserves decimals and the complete surrounding statement',async()=>{
 await seedIntelligence(store,2,'Lebanon Parliament approved banking aid of USD 1.5 billion for affected depositors.');
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
 expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ')).toContain('USD 1.5 billion');
});
it('a sentence embedded in a refutation must pass contextual verification even when the quote is exact',async()=>{
 const body='Claim reviewed: Parliament approved banking reform legislation. Verdict: false. No such vote occurred.';
 await seedIntelligence(store,2,body);const selected=await selection();let verified=false;
 const model:BriefingModelPort={model:'test',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories.find(s=>s.evidence.some(e=>e.body===body))!,evidence=story.evidence.find(e=>e.body===body)!;
  return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:'Parliament approved banking reform legislation.',support:[{evidenceRevisionId:evidence.id,quote:'Parliament approved banking reform legislation.'}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>{verified=true;expect(JSON.stringify(claims)).toContain('Verdict: false');return {supportedClaimIds:[],usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}}}};
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(verified).toBe(true);expect(await store.list('feed-1','editions')).toHaveLength(0);
});
it('a request with a stale outer read cannot reopen an already published window or invoke a model',async()=>{
 const selected=await selection();let delayed=false,calls=0;
 class DelayedStore extends V1FeedStore {override async read<T>(feedId:string,kind:Parameters<V1FeedStore['read']>[1],id:string):Promise<T|undefined> {
  if(kind==='editions' && !delayed) {delayed=true;await publishSelection(store,feedId,selected.id,{now:testPolicy.now});return undefined}
  return super.read<T>(feedId,kind,id);
 }}
 await publishSelection(new DelayedStore(ctx.db),'feed-1',selected.id,{now:testPolicy.now,model:{model:'test',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async()=>{calls++;throw Error('must not call')}}});
 expect(calls).toBe(0);expect(await store.list('feed-1','synthesis_jobs')).toMatchObject([{state:'DONE'}]);
});
it('a provider outcome lost before persistence consumes reservation and is not automatically retried',async()=>{
 const selected=await selection();let calls=0;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async()=>{calls++;throw new Error('provider response lost')}};
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await expect(publishSelection(new V1FeedStore(ctx.db),'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','model_executions')).toMatchObject([{status:'OUTCOME_UNKNOWN',reservationRetained:true}]);
});

it.each([false,true])('cached verification whole-meaning contract present=%s resumes safely without new provider calls',async full=>{
 const selected=await selection();let writerCalls=0,verifierCalls=0;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  writerCalls++;const evidence=input.stories[0].evidence[0],quote=evidence.body!;
  return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:quote,support:[{evidenceRevisionId:evidence.id,quote}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>{verifierCalls++;return {supportedClaimIds:claims.map(c=>c.id),claimEntailment:full?claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Complete meaning is supported.'})):undefined,usage:{tokensIn:80,tokensOut:10,cost:.001,confirmed:true}}}};
 await ctx.db.exec("CREATE TRIGGER fail_publication BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editions' BEGIN SELECT RAISE(ABORT,'simulated persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await ctx.db.exec('DROP TRIGGER fail_publication;');
 const resumed=publishSelection(new V1FeedStore(ctx.db),'feed-1',selected.id,{now:testPolicy.now,model:{...model,requiresFullEntailment:true}});
 if(full)expect((await resumed).stories).toHaveLength(1);
 else {await expect(resumed).rejects.toMatchObject({code:'INVALID_REQUEST',reason:'VERIFICATION_CONTRACT_MISMATCH'});expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','synthesis_jobs')).toMatchObject([{state:'FAILED',failure:'VERIFICATION_CONTRACT_MISMATCH'}]);}
 expect(writerCalls).toBe(1);expect(verifierCalls).toBe(1);
});
