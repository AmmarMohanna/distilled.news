import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy,batchFixture} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {processV1Briefing} from './runtime';
import {projectEditionLedger,rebuildCommunicationLedger,recordCorrectionObligation,refreshSourceCorrectionObligations,type LedgerEntry} from './ledger';
import {withdrawV1Edition} from './public-read';
import {communicatedState} from './editorial';
import type {Env} from '../types';
import type {EventVersion} from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store);env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env});
afterEach(async()=>ctx.dispose());
it('withdrawal retains seen claims and creates a replayable correction obligation',async()=>{
 const edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end))!;
 const before=await store.list<LedgerEntry>('feed-1','ledger_entries');
 await withdrawV1Edition(ctx.db,edition.id,feedFixture.ownerId,'OWNER_REQUEST','2026-10-03T13:30:00Z');
 expect(await store.list('feed-1','ledger_entries')).toEqual(before);
 expect((await store.list<any>('feed-1','ledger_states')).some(s=>s.status==='WITHDRAWN')).toBe(true);
 expect(await store.list('feed-1','correction_obligations')).toMatchObject([{kind:'RETRACTED',ledgerEntryId:before[0].id}]);
 const version=(await store.list<EventVersion>('feed-1','event_versions'))[0];
 const previous=await feedTransact(store,'feed-1',tx=>communicatedState(tx,{type:'EVENT',id:version.id,stableId:version.eventId,eventVersionIds:[version.id],evidence:[]},'2026-10-03T14:00:00Z'));
 expect(previous).toMatchObject([{editionId:edition.id,withdrawn:true}]);
 await rebuildCommunicationLedger(store,'feed-1');expect(await store.list('feed-1','ledger_entries')).toEqual(before);expect(await store.list('feed-1','correction_obligations')).toHaveLength(1);
},15000);
it('changed support and authoritative deletion produce distinct durable obligations without erasing history',async()=>{
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);
 const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);
 batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';
 const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'updated-content',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'Parliament rejected the banking reform.',acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'},testPolicy);
 await feedTransact(store,'feed-1',tx=>refreshSourceCorrectionObligations(tx,testPolicy.now()));
 expect(await store.list('feed-1','correction_obligations')).toMatchObject([{kind:'SOURCE_REVISED'}]);
 const deleted=batchFixture(3);deleted.observations[0]={...deleted.observations[0],sourceItemKey:'item-1',operation:'DELETE',authoritativeCurrentState:true};deleted.proposals=[];
 const policy={...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(deleted.observations[0]),authoritativeReplacementAllowed:true})};
 await createCandidateIntakePort(intake,policy).acceptBatch(deleted);
 for(let i=0;i<2;i++)await feedTransact(store,'feed-1',tx=>refreshSourceCorrectionObligations(tx,testPolicy.now()));
 expect((await store.list<any>('feed-1','correction_obligations')).map(o=>o.kind).sort()).toEqual(['SOURCE_DELETED','SOURCE_REVISED']);
 expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);
},15000);
it('backfill remains possible after a Feed tombstone and contradiction obligations are idempotent',async()=>{
 const edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end))!,entry=(await store.list<LedgerEntry>('feed-1','ledger_entries'))[0];
 for(let i=0;i<2;i++)await feedTransact(store,'feed-1',tx=>recordCorrectionObligation(tx,entry,'CONTRADICTED','exact-approved-judgment',testPolicy.now()));
 expect(await store.list('feed-1','correction_obligations')).toHaveLength(1);
 await store.registerFeed({...feedFixture,paused:true,deletedAt:'2026-10-03T14:00:00Z',revision:2});
 await projectEditionLedger(store,'feed-1',edition.id);await rebuildCommunicationLedger(store,'feed-1');expect(await store.list('feed-1','ledger_entries')).toHaveLength(1);
},15000);
it('persisted communicated facts preserve decimal quantities instead of splitting them as sentences',async()=>{
 const body='Lebanon Parliament approved banking reform for 12.5 million people.';
 await seedIntelligence(store,2,body,'publisher-2','2026-10-03T12:30:00Z');
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);
 const entry=(await store.list<LedgerEntry>('feed-1','ledger_entries')).find(e=>e.claimText===body)!;expect(entry).toBeDefined();expect(entry.claimFacts).toEqual([body]);
},15000);

it('backfill recovers deletion obligations after publication committed before projection',async()=>{
 const edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end))!;
 // Simulate the publication/projection crash boundary using a fresh projection.
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE feed_id='feed-1' AND kind IN ('ledger_entries','ledger_projections','ledger_states')").run();
 const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0]={...batch.observations[0],sourceItemKey:'item-1',operation:'DELETE',authoritativeCurrentState:true};batch.proposals=[];
 await createCandidateIntakePort(intake,{...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(batch.observations[0]),authoritativeReplacementAllowed:true})}).acceptBatch(batch);
 await projectEditionLedger(store,'feed-1',edition.id);
 expect(await store.list('feed-1','correction_obligations')).toMatchObject([{kind:'SOURCE_DELETED'}]);
},25000);
