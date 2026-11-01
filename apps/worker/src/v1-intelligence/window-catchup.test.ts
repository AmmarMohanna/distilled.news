import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {feedFixture} from './test-utils';
import {V1FeedStore,feedTransact} from './store';
import {windowIdentity,isAutomaticReportingWindow} from './runtime';
import {materializeV3Catchup,supersedeUnstartedV3Windows,V3_CATCHUP_REASON} from './window-catchup';
import {acquireSemanticWorkLease,releaseSemanticWorkLease} from './semantic-work-lease';
import {authorizeModelSpending,reserveModelSpending,modelSpendingStatements} from './model-spending';
import type {BriefingRequest} from './runtime';
import type {PublicationWindow} from './scoring';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const now='2026-10-03T13:00:00.000Z';
const window=(end:string):PublicationWindow=>({kind:'30M',start:new Date(Date.parse(end)-30*60000).toISOString(),end:new Date(end).toISOString()});
async function pending(end:string,extra:Partial<BriefingRequest>={}){
 const w=window(end),id=await windowIdentity('feed-1',w),request:BriefingRequest={id,feedId:'feed-1',window:w,engine:'v3',state:'PENDING',attempts:0,createdAt:w.end,...extra};
 await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,request));return request;
}
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true,modelSpending:false});await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,createdAt:'2026-10-03T08:00:00Z',briefingFrequency:'30M'});});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose();});

it('defers untouched old windows, retains frozen unpaid evidence, and is idempotent without reading full history',async()=>{
 const old=await pending('2026-10-03T11:00:00Z'),other=await pending('2026-10-03T12:00:00Z'),target=await pending(now);
 const input={id:old.id,feedId:'feed-1',fingerprint:'retained-unpaid-input',evidenceRevisionIds:['retained-evidence']};
 await feedTransact(store,'feed-1',tx=>tx.write('v3_window_inputs',old.id,input));
 vi.spyOn(store,'list').mockRejectedValue(Error('Do not load retained history'));
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([old.id,other.id]);
 expect(await store.read('feed-1','briefing_requests',old.id)).toMatchObject({window:old.window,state:'DONE',result:'DEFERRED',reason:V3_CATCHUP_REASON,attempts:0,catchup:{supersededBy:target.id}});
 expect(await store.read('feed-1','v3_window_inputs',old.id)).toEqual(input);
 expect(await store.read('feed-1','briefing_requests',target.id)).toEqual(target);
 expect(await store.unresolvedPublicationWindows('feed-1')).toEqual(expect.arrayContaining([{window:old.window}]));
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([]);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first())!.n).toBe(0);
});

it('preserves started/verified/legacy/uncertain/protected work and its financial hold byte for byte',async()=>{
 await authorizeModelSpending(ctx.db,{id:'grant',accountId:'account',modelIds:['test-model'],validFrom:'2026-10-03T00:00:00Z',validUntil:'2026-10-04T00:00:00Z',maxExposureUsd:1,maxConcurrentOperations:2});
 await reserveModelSpending(ctx.db,{id:'semantic_intents:paid',accountId:'account',token:'owner',model:'test-model',feedId:'feed-1',reservedCostUsd:.1,leaseUntil:0,createdAt:now});
 const paid=await pending('2026-10-03T08:30:00Z'),verified=await pending('2026-10-03T09:00:00Z'),v2=await pending('2026-10-03T09:30:00Z',{engine:'v2'}),unmarked=await pending('2026-10-03T10:00:00Z',{engine:undefined}),unknown=await pending('2026-10-03T10:30:00Z',{reason:'SEMANTIC_OUTCOME_UNKNOWN'}),legacy=await pending('2026-10-03T11:00:00Z'),blocked=await pending('2026-10-03T11:30:00Z',{blocked:{since:now} as any}),old=await pending('2026-10-03T12:00:00Z'),target=await pending(now);
 await feedTransact(store,'feed-1',async tx=>{
  await tx.write('semantic_intents','paid',{id:'paid',feedId:'feed-1',token:'owner',input:{kind:'V3_EDITOR_VERIFIER',budgetKey:`v3:${paid.id}`}});
  await tx.write('v3_window_results',verified.id,{id:verified.id,feedId:'feed-1',windowEnd:verified.window.end,result:{items:[],skipped:[],omitted:[],dropped:[]},operationIds:['verified-operation']});
  await tx.write('synthesis_jobs',legacy.id,{id:legacy.id,feedId:'feed-1',state:'PENDING',pendingCall:'legacy-operation'});
 });
 const before=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents WHERE feed_id=? ORDER BY kind,id').bind('feed-1').all()).results;
 const money=(await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations').all()).results;
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([old.id]);
 for(const row of before.filter(r=>r.id!==old.id))expect(await ctx.db.prepare('SELECT json FROM v1_feed_documents WHERE kind=? AND id=?').bind(row.kind,row.id).first()).toEqual({json:row.json});
 expect((await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations').all()).results).toEqual(money);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_settlements').first())!.n).toBe(0);
});

it.each(['v3_window_inputs','v3_window_results'] as const)('never adds old evidence to an already-frozen target (%s)',async kind=>{
 const old=await pending('2026-10-03T12:00:00Z'),target=await pending(now);
 await feedTransact(store,'feed-1',tx=>tx.write(kind,target.id,{id:target.id,feedId:'feed-1',windowEnd:target.window.end,result:{items:[],skipped:[],omitted:[],dropped:[]}}));
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([]);
 expect(await store.read('feed-1','briefing_requests',old.id)).toEqual(old);
});

it('does not invalidate preparation before its first model intent',async()=>{
 const old=await pending('2026-10-03T12:00:00Z'),target=await pending(now),lease=await acquireSemanticWorkLease(store,'feed-1');
 try{expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([]);expect(await store.read('feed-1','briefing_requests',old.id)).toEqual(old);}finally{await releaseSemanticWorkLease(store,lease);}
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([old.id]);
});

it('rechecks a concurrent model-intent admission after its feed CAS loses',async()=>{
 const old=await pending('2026-10-03T12:00:00Z'),target=await pending(now),commit=store.commit.bind(store);
 const spy=vi.spyOn(store,'commit').mockImplementationOnce(async tx=>{
  spy.mockRestore();await feedTransact(store,'feed-1',other=>other.write('semantic_intents','racing-intent',{id:'racing-intent',feedId:'feed-1',input:{kind:'V3_EDITOR_VERIFIER',budgetKey:`v3:${old.id}`}}));return commit(tx);
 });
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([]);
 expect(await store.read('feed-1','briefing_requests',old.id)).toEqual(old);
});

it('records at most fifty missed intervals with real observation time and preserves prior request identities',async()=>{
 const old=await pending('2026-10-03T09:00:00Z',{engine:'v2'}),windows=Array.from({length:50},(_,n)=>window(new Date(Date.parse('2026-10-03T09:00:00Z')+n*30*60000).toISOString()));
 const at=windows.at(-1)!.end;
 await materializeV3Catchup(store,'feed-1',windows,at,w=>windowIdentity('feed-1',w));
 expect(await store.read('feed-1','briefing_requests',old.id)).toEqual(old);
 const id=await windowIdentity('feed-1',windows[1]);expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({window:windows[1],createdAt:at,engine:'v3',state:'PENDING'});
 await expect(materializeV3Catchup(store,'feed-1',[...windows,windows[0]],now,w=>windowIdentity('feed-1',w))).rejects.toThrow('CATCHUP_BATCH_TOO_LARGE');
});

it.each(['future','legacy','uncertain'] as const)('does not redirect old windows to a target that is %s',async mode=>{
 const old=await pending('2026-10-03T12:00:00Z'),target=await pending(now,mode==='legacy'?{engine:'v2'}:mode==='uncertain'?{reason:'SEMANTIC_OUTCOME_UNKNOWN'}:{});
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,mode==='future'?'2026-10-03T12:59:59Z':now,isAutomaticReportingWindow)).toEqual([]);
 expect(await store.read('feed-1','briefing_requests',old.id)).toEqual(old);
});

it('the database fence rejects a stale runtime intent and rolls back its financial reservation atomically',async()=>{
 const old=await pending('2026-10-03T12:00:00Z'),target=await pending(now);
 await authorizeModelSpending(ctx.db,{id:'grant',accountId:'account',modelIds:['test-model'],validFrom:'2026-10-03T00:00:00Z',validUntil:'2026-10-04T00:00:00Z',maxExposureUsd:1,maxConcurrentOperations:2});
 expect(await supersedeUnstartedV3Windows(store,'feed-1',target.id,now,isAutomaticReportingWindow)).toEqual([old.id]);
 const reservation={id:'semantic_intents:stale',accountId:'account',token:'old-worker',model:'test-model',feedId:'feed-1',reservedCostUsd:.1,leaseUntil:Date.now()+60000,createdAt:now};
 const statements=await modelSpendingStatements(ctx.db,reservation);
 const intent={id:'stale',feedId:'feed-1',token:'old-worker',input:{kind:'V3_EDITOR_VERIFIER',budgetKey:`v3:${old.id}`}};
 statements.push(ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents',?,?,?)").bind(intent.id,'feed-1',JSON.stringify(intent)));
 await expect(ctx.db.batch(statements)).rejects.toThrow('V3_WINDOW_SUPERSEDED');
 expect(await store.read('feed-1','semantic_intents','stale')).toBeUndefined();
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first())!.n).toBe(0);
 expect(await store.read('feed-1','briefing_requests',old.id)).toMatchObject({state:'DONE',result:'DEFERRED'});
});
