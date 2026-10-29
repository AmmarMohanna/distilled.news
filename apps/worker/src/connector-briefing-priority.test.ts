import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {dispatchReadyConnectorBriefing} from './connector-briefing-priority';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const now=new Date('2026-10-15T12:00:00Z');
const send=vi.fn();
beforeAll(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','owner@example.invalid','owner@example.invalid','owner','user','hash','2026-10-01','2026-10-01','2026-10-01'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner','feed','Feed','news',1,'2026-10-01','2026-10-01');");
 await new V1FeedStore(ctx.db).registerFeed(feedFixture);
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('briefing_requests','request','feed-1',JSON.stringify({id:'request',feedId:'feed-1',state:'PENDING',engine:'v3',attempts:0,window:{start:'2026-10-15T11:00:00Z',end:'2026-10-15T12:00:00Z',kind:'HOURLY'}})).run();
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',PROCESSING_QUEUE:{send}} as unknown as Env;
},30000);
beforeEach(async()=>{send.mockReset().mockResolvedValue(undefined);await ctx.db.exec("DELETE FROM v1_queue_dispatches; DELETE FROM v1_feed_documents WHERE kind='briefing_requests' AND id<>'request'; UPDATE v1_feed_documents SET json=json_remove(json,'$.reason') WHERE kind='briefing_requests' AND id='request';");});
afterAll(async()=>ctx?.dispose());
it('retains publication priority after an earlier send was declined by a full intelligence lane',async()=>{
 send.mockResolvedValueOnce(false);
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(false);
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(true);
 expect(send).toHaveBeenCalledTimes(2);
});
it('recovers an expired delivery without duplicating a live delivery',async()=>{
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(true);
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(false);
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',new Date(now.getTime()+121000))).toBe(true);
 expect(send).toHaveBeenCalledTimes(2);
});
it('respects a retained transport retry deadline',async()=>{
 await ctx.db.prepare('INSERT INTO v1_queue_dispatches(kind,id,token,lease_until,not_before,send_count) VALUES(?,?,?,?,?,?)').bind('v1_briefing','request','prior',0,now.getTime()+60000,3).run();
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(false);
 expect(send).not.toHaveBeenCalled();
});
it('does not refill the priority lane with an older unknown operation ahead of ready news',async()=>{
 const unknown={id:'unknown-request',feedId:'feed-1',state:'PENDING',engine:'v3',attempts:0,reason:'SEMANTIC_OUTCOME_UNKNOWN',window:{start:'2026-10-15T10:00:00Z',end:'2026-10-15T11:00:00Z',kind:'HOURLY'}};
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('briefing_requests',unknown.id,'feed-1',JSON.stringify(unknown)).run();
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(true);
 expect(send.mock.calls[0][0]).toMatchObject({type:'v1_briefing',window:{end:'2026-10-15T12:00:00Z'}});
 expect(await ctx.db.prepare("SELECT id FROM v1_queue_dispatches WHERE kind='v1_briefing' AND id=?").bind(unknown.id).first()).toBeNull();
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id=?").bind(unknown.id).first<{json:string}>())!.json)).toEqual(unknown);
});
it('retains priority for a transient provider admission wait',async()=>{
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.reason','PROVIDER_RESOURCE_WAIT') WHERE kind='briefing_requests' AND id='request'").run();
 expect(await dispatchReadyConnectorBriefing(env,'feed-1',now)).toBe(true);
 expect(send.mock.calls[0][0]).toMatchObject({type:'v1_briefing',window:{end:'2026-10-15T12:00:00Z'}});
});
