import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {withIntelligenceTurn,withFeedWriteTurn} from './connector-intelligence-turn';
import type {Env} from './types';
import {V1FeedStore,FeedTransaction,feedTransact} from './v1-intelligence/store';
import {V1IntakeStore} from './v1-intake/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {settleSemanticOperation} from './v1-intelligence/semantic-settlement';
import type {SemanticIntent,SemanticOperationResult} from './v1-intelligence/semantic-operations';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const window={start:'2026-10-14T10:00:00Z',end:'2026-10-14T11:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'} as Env;
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','turn@example.invalid','turn@example.invalid','turn-owner','user','hash','2026-10-14','2026-10-14','2026-10-14'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('turn-1','owner','turn-1','Turn','news',1,'2026-10-14','2026-10-14'),('turn-2','owner','turn-2','Turn','news',1,'2026-10-14','2026-10-14');");
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind('turn-source','turn-1','identity',JSON.stringify({feedId:'turn-1',feedSourceId:'turn-source',sourceId:'identity',feedRevision:1,enabled:true,restrictions:{}})).run();
 await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'turn-1'});
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('turn-job','turn-source',JSON.stringify({id:'turn-job',kind:'REASSESS',state:'PENDING',attempts:0})).run();
});
afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();await ctx.dispose()});
it('one Feed coordinates review and acquisition while another Feed remains independent',async()=>{
 let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve}),run=vi.fn(async()=>new Promise<void>(resolve=>{release=resolve;started()}));
 const first=withIntelligenceTurn(env,{type:'v1_reassess',jobId:'turn-job'},run);await entered;
 const blocked=vi.fn();await expect(withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},blocked)).rejects.toThrow('INTELLIGENCE_TURN_BUSY');expect(blocked).not.toHaveBeenCalled();
 expect(await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-2',window},async()=> 'other')).toBe('other');
 await expect(withIntelligenceTurn(env,{type:'v1_acquisition',jobId:'turn-job'},async()=> 'acquire')).rejects.toThrow('INTELLIGENCE_TURN_BUSY');
 await expect(withFeedWriteTurn(env,'turn-1',async()=> 'handoff')).rejects.toThrow('INTELLIGENCE_TURN_BUSY');
 release();await first;
 await ctx.db.prepare("DELETE FROM connector_feed_turn_waiters WHERE feed_id='turn-1'").run();
 expect(await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=> 'next')).toBe('next');
 expect(await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='turn-job'").first()).toEqual({json:JSON.stringify({id:'turn-job',kind:'REASSESS',state:'PENDING',attempts:0})});
});
it('durable FIFO prevents new review or collection work jumping an older waiter',async()=>{
 await ctx.db.prepare('INSERT INTO connector_feed_turn_waiters VALUES(?,?,?,?)').bind('turn-1','handoff:old',Date.now()-1000,Date.now()+60000).run();
 const run=vi.fn();await expect(withFeedWriteTurn(env,'turn-1',run,'review:new')).rejects.toThrow('INTELLIGENCE_TURN_BUSY');expect(run).not.toHaveBeenCalled();
 expect(await withFeedWriteTurn(env,'turn-1',async()=> 'collected','handoff:old')).toBe('collected');
 await expect(withFeedWriteTurn(env,'turn-1',run,'handoff:new')).rejects.toThrow('INTELLIGENCE_TURN_BUSY');
 expect(await withFeedWriteTurn(env,'turn-1',async()=> 'reviewed','review:new')).toBe('reviewed');
 expect(await withFeedWriteTurn(env,'turn-1',async()=> 'next','handoff:new')).toBe('next');
});
it('expired abandoned waiters cannot strand a feed and nested work inherits its turn',async()=>{
 await ctx.db.prepare('INSERT INTO connector_feed_turn_waiters VALUES(?,?,?,?)').bind('turn-1','abandoned',Date.now()-600000,Date.now()-1).run();
 expect(await withFeedWriteTurn(env,'turn-1',()=>withFeedWriteTurn(env,'turn-1',async()=> 'nested','nested'),'live')).toBe('nested');
 expect(await ctx.db.prepare("SELECT * FROM connector_feed_turn_waiters WHERE feed_id='turn-1'").all()).toMatchObject({results:[]});
});
it('expiry permits recovery and an older turn cannot release its replacement',async()=>{
 let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve});
 const first=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>new Promise<void>(resolve=>{release=resolve;started()}));await entered;
 await ctx.db.prepare("UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id='turn-1'").run();
 let releaseNext!:()=>void,nextStarted!:()=>void;const nextEntered=new Promise<void>(resolve=>{nextStarted=resolve});
 const next=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>new Promise<void>(resolve=>{releaseNext=resolve;nextStarted()}));await nextEntered;
 const replacement=await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first();
 const staleFailure=expect(first).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 release();await staleFailure;expect(await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first()).toEqual(replacement);
 releaseNext();await next;
});
it('exceptions release the turn; unresolved job IDs fail closed without running a callback',async()=>{
 await expect(withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>{throw Error('test failure')})).rejects.toThrow('test failure');
 expect(await ctx.db.prepare("SELECT lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first()).toEqual({lease_until:0});
 const run=vi.fn();await expect(withIntelligenceTurn(env,{type:'v1_reassess',jobId:'missing'},run)).rejects.toMatchObject({code:'SCOPE_DENIED'});expect(run).not.toHaveBeenCalled();
});
it('renews a long review and reports loss of admission without releasing a replacement',async()=>{
 let heartbeat!:()=>void;
 vi.spyOn(globalThis,'setInterval').mockImplementation(((callback:()=>void)=>{heartbeat=callback;return 0;}) as typeof setInterval);
 let release!:()=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve});
 const first=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>new Promise<void>(resolve=>{release=resolve;started()}));
 await entered;
 await ctx.db.prepare("UPDATE connector_intelligence_turns SET lease_until=? WHERE feed_id='turn-1'").bind(Date.now()+10000).run();
 heartbeat();
 await vi.waitFor(async()=>{const row=await ctx.db.prepare("SELECT lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first<{lease_until:number}>();expect(row!.lease_until).toBeGreaterThan(Date.now()+60000)});
 await ctx.db.prepare("UPDATE connector_intelligence_turns SET token='replacement' WHERE feed_id='turn-1'").run();
 heartbeat();
 const failure=expect(first).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 release();await failure;
 const row=await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first<{token:string;lease_until:number}>();
 expect(row!.token).toBe('replacement');expect(row!.lease_until).toBeGreaterThan(Date.now());
});

async function replaceBeforeCommit(run:()=>Promise<unknown>){
 let resume!:()=>void,entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve}),waiting=new Promise<void>(resolve=>{resume=resolve});
 const first=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>{entered();await waiting;return run()});
 const outcome=first.then(value=>({state:'FULFILLED' as const,value}),error=>({state:'REJECTED' as const,error}));
 await started;
 await ctx.db.prepare("UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id='turn-1'").run();
 let releaseNext!:()=>void,nextEntered!:()=>void;
 const replacementStarted=new Promise<void>(resolve=>{nextEntered=resolve});
 const replacement=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>{nextEntered();await new Promise<void>(resolve=>{releaseNext=resolve})});
 await replacementStarted;
 const owner=await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first();
 try{resume();return {outcome:await outcome,owner,retained:await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first()}}
 finally{resume();await outcome;releaseNext();await replacement}
}
it('a replaced turn cannot commit canonical work from a fresh Feed snapshot',async()=>{
 const before=await ctx.db.prepare("SELECT epoch FROM v1_feeds WHERE id='turn-1'").first();
 const result=await replaceBeforeCommit(async()=>{
  const store=new V1FeedStore(ctx.db),tx=new FeedTransaction(store,await store.snapshot('turn-1'));
  await tx.write('briefing_requests','stale-turn-request',{id:'stale-turn-request',feedId:'turn-1',state:'PENDING'});
  return store.commit(tx);
 });
 expect(await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id='stale-turn-request'").first()).toBeNull();
 expect(await ctx.db.prepare("SELECT epoch FROM v1_feeds WHERE id='turn-1'").first()).toEqual(before);
 expect(result.outcome).toMatchObject({state:'REJECTED',error:{code:'TEMPORARY_UNAVAILABLE'}});
 expect(result.retained).toEqual(result.owner);
});
it('a replaced turn cannot mutate reassessment attempts or source epochs',async()=>{
 const before=await ctx.db.prepare("SELECT epoch FROM v1_intake_scopes WHERE id='turn-source'").first();
 const result=await replaceBeforeCommit(async()=>{
  const store=new V1IntakeStore(ctx.db),snapshot=await store.snapshot('turn-source');
  return store.commit(snapshot,[{table:'jobs',id:'turn-job',value:{id:'turn-job',kind:'REASSESS',state:'FAILED',attempts:5,exhausted:true}}]);
 });
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='turn-job'").first<{json:string}>())!.json)).toMatchObject({state:'PENDING',attempts:0});
 expect(await ctx.db.prepare("SELECT epoch FROM v1_intake_scopes WHERE id='turn-source'").first()).toEqual(before);
 expect(result.outcome).toMatchObject({state:'REJECTED',error:{code:'TEMPORARY_UNAVAILABLE'}});
 expect(result.retained).toEqual(result.owner);
});
it('a replaced turn retains paid settlement but cannot consume it into canonical results',async()=>{
 const input={feedId:'turn-1',feedRevision:1,evidenceRevisionIds:['paid-evidence'],kind:'RELATION',policyVersion:'test',model:'fixture',budgetKey:'test',state:{}};
 const intent:SemanticIntent={id:'paid-turn-operation',feedId:'turn-1',input,token:'paid-intent-owner',leaseUntil:Date.now()+60000,reservedCostUsd:.02,createdAt:window.end};
 const receipt:SemanticOperationResult={id:intent.id,feedId:intent.feedId,input,status:'SUCCEEDED',value:{answer:true},usage:{calls:1,costUsd:.001,reported:true,tokensIn:10,tokensOut:5},latencyMs:1,createdAt:window.end};
 await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('semantic_intents',intent.id,intent.feedId,JSON.stringify(intent)).run();
 await ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind('semantic_intents:'+intent.id,'test-account','test-grant',intent.token,'fixture',intent.feedId,.02,Date.now()+60000,window.end,'{}').run();
 const result=await replaceBeforeCommit(async()=>{
  const store=new V1FeedStore(ctx.db);
  await settleSemanticOperation(store,intent,receipt);
  await feedTransact(store,'turn-1',async tx=>{await tx.write('semantic_results',receipt.id,receipt)});
 });
 expect(await ctx.db.prepare("SELECT cost_usd,reported FROM v1_model_spending_settlements WHERE id=?").bind('semantic_intents:'+intent.id).first()).toEqual({cost_usd:.001,reported:1});
 const settled=await new V1FeedStore(ctx.db).read<{token:string;status:string}>('turn-1','semantic_settlements',intent.id);
 expect(settled).toMatchObject({token:intent.token,status:'SUCCEEDED'});
 expect(await new V1FeedStore(ctx.db).read('turn-1','semantic_results',intent.id)).toBeUndefined();
 expect(result.outcome).toMatchObject({state:'REJECTED',error:{code:'TEMPORARY_UNAVAILABLE'}});
 expect(result.retained).toEqual(result.owner);
});

it.each(['Feed','intake'] as const)('%s commit fences replacement atomically at the D1 batch boundary',async kind=>{
 const batch=ctx.db.batch.bind(ctx.db);let replace=false,replaced=false;
 // Miniflare's RPC proxy does not retain a method spy; wrap its boundary instead.
 const db=new Proxy(ctx.db,{get(target,key){
  if(key==='batch')return async(statements:D1PreparedStatement[])=>{
   if(replace){replace=false;replaced=true;await ctx.db.prepare("UPDATE connector_intelligence_turns SET token='batch-replacement',lease_until=? WHERE feed_id='turn-1'").bind(Date.now()+60000).run()}
   return batch(statements);
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const result=await withIntelligenceTurn({...env,DB:db},{type:'v1_briefing',feedId:'turn-1',window},async()=>{
  if(kind==='Feed'){
   const store=new V1FeedStore(db),tx=new FeedTransaction(store,await store.snapshot('turn-1'));
   await tx.write('briefing_requests','batch-stale-request',{id:'batch-stale-request',feedId:'turn-1',state:'PENDING'});
   replace=true;return store.commit(tx);
  }
  const store=new V1IntakeStore(db),snapshot=await store.snapshot('turn-source');
  replace=true;return store.commit(snapshot,[{table:'jobs',id:'turn-job',value:{id:'turn-job',kind:'REASSESS',state:'FAILED',attempts:5}}]);
 }).then(value=>({state:'FULFILLED' as const,value}),error=>({state:'REJECTED' as const,error}));
 expect(replaced).toBe(true);
 expect(await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id='batch-stale-request'").first()).toBeNull();
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='turn-job'").first<{json:string}>())!.json)).toMatchObject({state:'PENDING',attempts:0});
 expect(result).toMatchObject({state:'REJECTED',error:{code:'TEMPORARY_UNAVAILABLE'}});
 expect(await ctx.db.prepare("SELECT token FROM connector_intelligence_turns WHERE feed_id='turn-1'").first()).toEqual({token:'batch-replacement'});
});
