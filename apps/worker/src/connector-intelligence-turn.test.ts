import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {withIntelligenceTurn} from './connector-intelligence-turn';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const window={start:'2026-10-14T10:00:00Z',end:'2026-10-14T11:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'} as Env;
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','turn@example.invalid','turn@example.invalid','turn-owner','user','hash','2026-10-14','2026-10-14','2026-10-14'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('turn-1','owner','turn-1','Turn','news',1,'2026-10-14','2026-10-14'),('turn-2','owner','turn-2','Turn','news',1,'2026-10-14','2026-10-14');");
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind('turn-source','turn-1','identity',JSON.stringify({feedId:'turn-1',feedSourceId:'turn-source',sourceId:'identity',feedRevision:1,enabled:true,restrictions:{}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('turn-job','turn-source',JSON.stringify({id:'turn-job',kind:'REASSESS',state:'PENDING',attempts:0})).run();
});
afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();await ctx.dispose()});
it('one Feed gets one review turn while another Feed and acquisition remain independent',async()=>{
 let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve}),run=vi.fn(async()=>new Promise<void>(resolve=>{release=resolve;started()}));
 const first=withIntelligenceTurn(env,{type:'v1_reassess',jobId:'turn-job'},run);await entered;
 const blocked=vi.fn();await expect(withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},blocked)).rejects.toThrow('INTELLIGENCE_TURN_BUSY');expect(blocked).not.toHaveBeenCalled();
 expect(await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-2',window},async()=> 'other')).toBe('other');
 expect(await withIntelligenceTurn(env,{type:'v1_acquisition',jobId:'turn-job'},async()=> 'acquire')).toBe('acquire');
 release();await first;
 expect(await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=> 'next')).toBe('next');
 expect(await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='turn-job'").first()).toEqual({json:JSON.stringify({id:'turn-job',kind:'REASSESS',state:'PENDING',attempts:0})});
});
it('expiry permits recovery and an older turn cannot release its replacement',async()=>{
 let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve});
 const first=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>new Promise<void>(resolve=>{release=resolve;started()}));await entered;
 await ctx.db.prepare("UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id='turn-1'").run();
 let releaseNext!:()=>void,nextStarted!:()=>void;const nextEntered=new Promise<void>(resolve=>{nextStarted=resolve});
 const next=withIntelligenceTurn(env,{type:'v1_briefing',feedId:'turn-1',window},async()=>new Promise<void>(resolve=>{releaseNext=resolve;nextStarted()}));await nextEntered;
 const replacement=await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first();
 release();await first;expect(await ctx.db.prepare("SELECT token,lease_until FROM connector_intelligence_turns WHERE feed_id='turn-1'").first()).toEqual(replacement);
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
