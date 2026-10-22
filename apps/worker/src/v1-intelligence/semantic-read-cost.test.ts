import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence,scopeFixture} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,FeedTransaction} from './store';
import {targets} from './scoring';
import {feedFixture} from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,intake:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);const {revision}=await seedCurrentEvidence(intake);const statements:D1PreparedStatement[]=[];
 for(let i=0;i<104;i++){const id='retained-revision-'+i,value={...revision,id,evidenceId:'retained-evidence-'+i};statements.push(ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify(value)));const member={id:'retained-member-'+i,feedId:'feed-1',eventVersionId:'retained-version-'+(i%100),evidenceRevisionId:id};statements.push(ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('memberships',?,'feed-1',?)").bind(member.id,JSON.stringify(member)))}
 for(let i=0;i<100;i++){const root={id:'retained-event-'+i,feedId:'feed-1',currentVersionId:'retained-version-'+i},version={id:root.currentVersionId,feedId:'feed-1',eventId:root.id,version:1,state:'Approved understanding '+i};for(const [kind,value] of [['events',root],['event_versions',version]] as const)statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,value.id,'feed-1',JSON.stringify(value)))}await ctx.db.batch(statements)});
afterEach(async()=>ctx.dispose());
it('explicit current-support prefetch bounds the live 100-Event/104-revision read shape without losing immutable values',async()=>{
 const tx=new FeedTransaction(store,await store.snapshot('feed-1')),roots=await tx.list<any>('events');
 const members=await tx.membershipsForVersions(roots.map(root=>root.currentVersionId));
 // Recovery deliberately removed eager historical-body expansion from list().
 // Readers request only the immutable supports they actually intend to inspect.
 await tx.preloadRevisions(members.map(member=>member.evidenceRevisionId));
 for(const root of roots)expect((await tx.read<any>('event_versions',root.currentVersionId))?.state).toBe('Approved understanding '+root.id.split('-').at(-1));
 for(const member of members)expect((await tx.revision(member.evidenceRevisionId))?.id).toBe(member.evidenceRevisionId);
 expect(members).toHaveLength(104);
 expect(tx.metrics.documentReads+tx.metrics.revisionReads+tx.metrics.listReads+tx.metrics.preloadQueries).toBeLessThanOrEqual(6);
},30000);
it('batching does not bypass intake-scope changes between snapshot and atomic commit',async()=>{const tx=new FeedTransaction(store,await store.snapshot('feed-1'));await tx.list('events');await tx.list('memberships');await intake.registerScope({...scopeFixture,feedRevision:2});expect(await store.commit(tx)).toBe(false)},30000);

it('shortlist semantic references are batched without dropping facts, slots or entities',async()=>{const statements:D1PreparedStatement[]=[];for(let i=0;i<100;i++)for(const [kind,value] of [['event_semantic_states',{id:'retained-version-'+i,feedId:'feed-1',propositionIds:['p-'+i],stateSlotIds:['s-'+i]}],['propositions',{id:'p-'+i,feedId:'feed-1',text:'Supported fact '+i}],['state_slots',{id:'s-'+i,feedId:'feed-1',entityId:'e-'+i,propositionId:'p-'+i}],['entities',{id:'e-'+i,feedId:'feed-1',entityId:'canonical-'+i}]] as const)statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,value.id,'feed-1',JSON.stringify(value)));await ctx.db.batch(statements);const tx=new FeedTransaction(store,await store.snapshot('feed-1'));await tx.preloadSemanticReferences(Array.from({length:100},(_,i)=>'retained-version-'+i));for(let i=0;i<100;i++){expect((await tx.read<any>('propositions','p-'+i))?.text).toBe('Supported fact '+i);expect((await tx.read<any>('state_slots','s-'+i))?.entityId).toBe('e-'+i);expect((await tx.read<any>('entities','e-'+i))?.entityId).toBe('canonical-'+i)}expect(tx.metrics.documentReads).toBe(0);expect(tx.metrics.preloadQueries).toBe(8)},30000);

it('selection target retrieval warms every owned semantic reference in bounded batches',async()=>{
 const seed=(await intake.read<any>('evidence',JSON.stringify(['feed-source-1','guid-1'])))!.value,statements:D1PreparedStatement[]=[];
 for(let i=0;i<104;i++){const value={...seed,id:'retained-evidence-'+i,sourceItemKey:'retained-item-'+i,currentRevisionId:'retained-revision-'+i};statements.push(ctx.db.prepare('INSERT INTO v1_evidence(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(value.id,'feed-source-1',value.sourceItemKey,JSON.stringify(value)))}
 for(let i=0;i<100;i++)for(const [kind,value] of [['event_semantic_states',{id:'retained-version-'+i,feedId:'feed-1',propositionIds:['p-'+i],stateSlotIds:['s-'+i]}],['propositions',{id:'p-'+i,feedId:'feed-1',text:'Supported fact '+i}],['state_slots',{id:'s-'+i,feedId:'feed-1',entityId:'e-'+i,propositionId:'p-'+i}],['entities',{id:'e-'+i,feedId:'feed-1',entityId:'canonical-'+i}]] as const)statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,value.id,'feed-1',JSON.stringify(value)));
 await ctx.db.batch(statements);const tx=new FeedTransaction(store,await store.snapshot('feed-1')),found=await targets(tx,{start:'2026-10-01T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'HOURLY'},true);
 expect(found).toHaveLength(100);for(const target of found){const state=await tx.read<any>('event_semantic_states',target.id);for(const id of state.propositionIds)expect((await tx.read<any>('propositions',id)).text).toMatch(/^Supported fact /);for(const id of state.stateSlotIds){const slot=await tx.read<any>('state_slots',id);expect((await tx.read<any>('entities',slot.entityId)).entityId).toMatch(/^canonical-/)}}
 expect(tx.metrics.documentReads).toBe(0);expect(tx.metrics.preloadQueries).toBeLessThanOrEqual(12);
},30000);
