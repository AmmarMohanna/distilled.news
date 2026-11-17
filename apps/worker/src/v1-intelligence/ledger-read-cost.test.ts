import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence,testPolicy,scopeFixture} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {FeedTransaction,V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {refreshSourceCorrectionObligations,type LedgerEntry} from './ledger';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,intake:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)},30000);
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()},30000);
async function seedHistory(n:number){
 const {evidence,revision}=await seedCurrentEvidence(intake,'Officials approved a banking reform affecting 100 people.');
 const items=[],revisions=[],entries:LedgerEntry[]=[];
 for(let i=0;i<n;i++){
  const id=JSON.stringify(['feed-source-1','retained-'+i]),revisionId='retained-revision-'+i;
  items.push({...evidence,id,sourceItemKey:'retained-'+i,currentRevisionId:revisionId});
  revisions.push({...revision,id:revisionId,evidenceId:id});
  entries.push({id:'entry-'+i,feedId:'feed-1',editionId:'edition-'+i,claimId:'claim-'+i,candidateId:'candidate-'+i,claimText:revision.body!,claimFacts:[revision.body!],claimMentionIds:[],propositionIds:[],eventIds:[],storylineIds:[],targetType:'EVENT',targetVersionId:'version-'+i,evidenceRevisionIds:[revisionId],certainty:{kind:'ASSERTED',hedges:[]},communicatedAt:testPolicy.now(),policyVersion:'grounded-communication-ledger-v1'});
 }
 await ctx.db.batch([
  ctx.db.prepare("INSERT INTO v1_evidence(id,feed_source_id,item_key,json) SELECT json_extract(value,'$.id'),'feed-source-1',json_extract(value,'$.sourceItemKey'),value FROM json_each(?)").bind(JSON.stringify(items)),
  ctx.db.prepare("INSERT INTO v1_revisions(id,feed_source_id,json) SELECT json_extract(value,'$.id'),'feed-source-1',value FROM json_each(?)").bind(JSON.stringify(revisions)),
  ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'ledger_entries',json_extract(value,'$.id'),'feed-1',value FROM json_each(?)").bind(JSON.stringify(entries)),
 ]);
 return {items,revisions,entries};
}
it('unchanged ledger history uses bounded metadata reads without loading historical article bodies',async()=>{
 await seedHistory(240);const tx=new FeedTransaction(store,await store.snapshot('feed-1'));
 await refreshSourceCorrectionObligations(tx,testPolicy.now());
 expect(tx.metrics.revisionReads).toBe(0);expect(tx.metrics.preloadQueries).toBe(3);
 expect(tx.writes.size).toBe(0);expect(await tx.list('correction_obligations')).toEqual([]);
},30000);
it('batched refresh preserves material revision, tombstone and missing-source behavior',async()=>{
 const {items,revisions}=await seedHistory(4),next={...revisions[0],id:'changed-revision',revision:2,body:'Officials rejected a banking reform affecting 200 people.'};
 await ctx.db.batch([
  ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind(next.id,'feed-source-1',JSON.stringify(next)),
  ctx.db.prepare('UPDATE v1_evidence SET json=? WHERE id=?').bind(JSON.stringify({...items[0],currentRevisionId:next.id}),items[0].id),
  ctx.db.prepare('UPDATE v1_evidence SET json=? WHERE id=?').bind(JSON.stringify({...items[1],state:'DELETED',currentObservationId:'delete-observation'}),items[1].id),
  ctx.db.prepare('DELETE FROM v1_evidence WHERE id=?').bind(items[2].id),
 ]);
 const tx=new FeedTransaction(store,await store.snapshot('feed-1'));await refreshSourceCorrectionObligations(tx,testPolicy.now());
 const obligations=[...tx.writes.values()].filter(w=>w.kind==='correction_obligations').map(w=>w.value as any);
 expect(obligations.map(o=>[o.ledgerEntryId,o.kind,o.triggerId]).sort()).toEqual([['entry-0','SOURCE_REVISED','changed-revision'],['entry-1','SOURCE_DELETED','delete-observation']]);
 expect(tx.metrics.revisionReads).toBe(2);
},30000);
it('a scope change after batched correction inspection still rejects atomic consumption',async()=>{
 await seedHistory(2);const tx=new FeedTransaction(store,await store.snapshot('feed-1'));
 await refreshSourceCorrectionObligations(tx,testPolicy.now());await intake.registerScope({...scopeFixture,feedRevision:2});
 expect(await store.commit(tx)).toBe(false);
},30000);
// Frozen pre-optimization unchanged-history path, compared on identical real D1 data.
async function baselineUnchanged(tx:FeedTransaction){
 for(const entry of await tx.list<LedgerEntry>('ledger_entries'))for(const id of entry.evidenceRevisionIds){
  const revision=await tx.revision(id);if(!revision)continue;
  const row=await tx.store.db.prepare("SELECT e.json FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id WHERE s.feed_id=? AND json_extract(e.json,'$.id')=?").bind(tx.snapshot.feed.id,revision.evidenceId).first<{json:string}>();
  expect(row).toBeTruthy();expect(JSON.parse(row!.json).currentRevisionId).toBe(id);
 }
}
it('benchmarks exact unchanged correction inspection on retained history without provider calls',async()=>{
 await seedHistory(100);const times={baseline:[] as number[],optimized:[] as number[]};
 for(let sample=0;sample<5;sample++)for(const mode of (sample%2?['optimized','baseline']:['baseline','optimized']) as ('baseline'|'optimized')[]){
  const tx=new FeedTransaction(store,await store.snapshot('feed-1')),started=performance.now();
  if(mode==='baseline')await baselineUnchanged(tx);else await refreshSourceCorrectionObligations(tx,testPolicy.now());
  times[mode].push(performance.now()-started);expect(tx.writes.size).toBe(0);
 }
 for(const [mode,values] of Object.entries(times)){values.sort((a,b)=>a-b);console.info(JSON.stringify({type:'V1_LEDGER_READ_BENCHMARK',mode,entries:100,samples:5,p50Ms:values[2],p95Ms:values[4],providerCalls:0}))}
},90000);
