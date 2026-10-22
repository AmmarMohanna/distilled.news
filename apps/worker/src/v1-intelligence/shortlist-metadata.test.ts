import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {FeedTransaction,V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {shortlistInTransaction,SHORTLIST_POLICY} from './shortlist';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)},30000);
afterEach(async()=>ctx.dispose(),30000);
async function seed(n:number){
 const docs=Array.from({length:n},(_,i)=>({id:'shortlist-'+i,feedId:'feed-1',policyVersion:'retained-policy-'+i,candidates:[{text:'Immutable supported historical context. '.repeat(200)}]}));
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'shortlists',json_extract(value,'$.id'),'feed-1',value FROM json_each(?)").bind(JSON.stringify(docs)).run();return docs;
}
it('reads only exact policy metadata in bounded batches without historical shortlist bodies',async()=>{
 const docs=await seed(200),tx=new FeedTransaction(store,await store.snapshot('feed-1'));
 const policies=await tx.shortlistPolicyVersions([...docs.map(d=>d.id),docs[0].id,'missing']);
 expect([...policies]).toEqual([...docs.map(d=>[d.id,d.policyVersion]),['missing',undefined]]);
 expect(tx.metrics.preloadQueries).toBe(3);expect(tx.metrics.documentReads).toBe(0);
 // A metadata read must not poison the complete immutable-document cache.
 expect(await tx.read('shortlists',docs[0].id)).toEqual(docs[0]);
},30000);
it('includes newly staged policies and keeps returned metadata independent of later reads',async()=>{
 const tx=new FeedTransaction(store,await store.snapshot('feed-1'));
 await tx.write('shortlists','staged',{id:'staged',feedId:'feed-1',policyVersion:'new-policy',candidates:[]});
 const policies=await tx.shortlistPolicyVersions(['staged']);expect(policies.get('staged')).toBe('new-policy');
 policies.set('staged','poison');expect((await tx.shortlistPolicyVersions(['staged'])).get('staged')).toBe('new-policy');
 expect(tx.metrics.preloadQueries).toBe(0);
},30000);
it('rejects a foreign shortlist identity rather than treating it as missing',async()=>{
 await store.registerFeed({...feedFixture,id:'other-feed'});
 await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('shortlists','foreign','other-feed',?)").bind(JSON.stringify({id:'foreign',feedId:'other-feed',policyVersion:'retained'})).run();
 const tx=new FeedTransaction(store,await store.snapshot('feed-1'));await expect(tx.shortlistPolicyVersions(['foreign'])).rejects.toMatchObject({code:'SCOPE_DENIED'});
},30000);
it('rejects stale Feed/source epochs after policy inspection',async()=>{
 const docs=await seed(1),tx=new FeedTransaction(store,await store.snapshot('feed-1'));await tx.shortlistPolicyVersions([docs[0].id]);
 await new V1IntakeStore(ctx.db).registerScope({...scopeFixture,feedRevision:2});expect(await store.commit(tx)).toBe(false);
},30000);
it.each([SHORTLIST_POLICY,'old-policy',undefined])('omission reuse preserves policy compatibility (%s) without loading historical candidates',async policy=>{
 await seedIntelligence(store);
 const firstTx=new FeedTransaction(store,await store.snapshot('feed-1')),window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
 const scope=await shortlistInTransaction(firstTx,window,window.end),candidate=scope.candidates[0];expect(candidate).toBeTruthy();
 const records=[['editorial_deferred_work',{id:'omitted',feedId:'feed-1',planId:'old-plan',windowEnd:'2026-10-03T12:00:00Z',stableTargetId:candidate.stableTargetId,targetVersionId:candidate.targetVersionId,protectedReasons:[],createdAt:window.start}],['editorial_work_resolutions',{id:'resolved',feedId:'feed-1',workId:'omitted',reason:'OMITTED_BY_EDITOR'}],['editorial_plans',{id:'old-plan',feedId:'feed-1',feedRevision:feedFixture.revision,shortlistId:'old-shortlist'}]] as const;
 for(const [kind,value] of records)await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,value.id,'feed-1',JSON.stringify(value)).run();
 if(policy)await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('shortlists','old-shortlist','feed-1',?)").bind(JSON.stringify({...scope,id:'old-shortlist',policyVersion:policy})).run();
 const tx=new FeedTransaction(store,await store.snapshot('feed-1')),read=vi.spyOn(tx,'read'),preload=vi.spyOn(tx,'preload');
 const result=await shortlistInTransaction(tx,window,window.end);
 expect(result.candidates).toHaveLength(policy===SHORTLIST_POLICY?0:1);
 if(policy!==SHORTLIST_POLICY)expect(result.candidates[0].flags).toContain('EDITORIAL_CONTEXT_CHANGED');
 expect(read.mock.calls.some(([kind,id])=>kind==='shortlists'&&id==='old-shortlist')).toBe(false);
 expect(preload.mock.calls.some(([kind])=>kind==='shortlists')).toBe(false);
},30000);
