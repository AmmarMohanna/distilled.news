import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {FeedTransaction,V1FeedStore} from './store';
import {eventMemberships} from './engine';
import {feedFixture} from './test-utils';
import type {EventMembership} from '@distilled/contracts';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});
const member=(id:string,version:string,revision:string):EventMembership=>({id,eventVersionId:version,evidenceRevisionId:revision,confidence:.6,algorithmVersion:'fixture',createdAt:testPolicy.now()});
async function insertMembers(members:EventMembership[]){for(let i=0;i<members.length;i+=80)await ctx.db.batch(members.slice(i,i+80).map(m=>ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('memberships',m.id,feedFixture.id,JSON.stringify(m))))}

it('indexes retained support once while preserving version identity, duplicates, and original member order',async()=>{
 await insertMembers([member('a','older','same-evidence'),member('b','current','same-evidence'),member('c','current','independent'),member('d','unrelated','other')]);
 const tx=new FeedTransaction(store,await store.snapshot(feedFixture.id)),list=vi.spyOn(tx,'list');
 expect((await eventMemberships(tx,'current')).map(m=>m.id)).toEqual(['b','c']);
 expect((await eventMemberships(tx,'older')).map(m=>m.id)).toEqual(['a']);
 expect(await eventMemberships(tx,'missing')).toEqual([]);
 expect((await tx.membershipsForVersions(['current','older','current'])).map(m=>m.id)).toEqual(['b','c','a']);
 expect(list.mock.calls.filter(([kind])=>kind==='memberships')).toHaveLength(1);
});

it('exposes staged support after an earlier indexed miss and isolates returned records and CAS retries',async()=>{
 const {revision}=await seedCurrentEvidence(new V1IntakeStore(ctx.db));
 const tx=new FeedTransaction(store,await store.snapshot(feedFixture.id));
 expect(await eventMemberships(tx,'new-version')).toEqual([]);
 // The transaction supplies the version that write() validates; final graph
 // shape is exercised separately by the engine's full D1 regressions.
 await tx.write('event_versions','new-version',{id:'new-version',feedId:feedFixture.id});
 await tx.write('memberships','new-member',member('new-member','new-version',revision.id));
 const observed=await eventMemberships(tx,'new-version');expect(observed.map(m=>m.evidenceRevisionId)).toEqual([revision.id]);
 observed[0].evidenceRevisionId='tampered';observed.splice(0);
 expect((await eventMemberships(tx,'new-version')).map(m=>m.evidenceRevisionId)).toEqual([revision.id]);
 expect(await tx.read('memberships','new-member')).toMatchObject({evidenceRevisionId:revision.id});
 await insertMembers([member('concurrent-member','other-version',revision.id)]);
 expect(await eventMemberships(tx,'other-version')).toEqual([]);
 const retry=new FeedTransaction(store,await store.snapshot(feedFixture.id));
 expect((await eventMemberships(retry,'other-version')).map(m=>m.id)).toEqual(['concurrent-member']);
});
