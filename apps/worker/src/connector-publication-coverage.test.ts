import {windowIdentity} from './v1-intelligence/runtime';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {collectionReadyForWindow} from './connector-scheduling';
import {dispatchReadyConnectorBriefing} from './connector-briefing-priority';
import {livePublicationWindow} from './v1-intelligence/schedule';
import type {Env} from './types';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {pendingWindowCollections} from './connector-publication-coverage';
import {readFileSync} from 'node:fs';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const end='2026-10-28T22:32:09.437Z';
beforeAll(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','gate@example.invalid','gate@example.invalid','gate','user','hash','2026-10-01','2026-10-01','2026-10-01'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at) VALUES('feed','owner','gate','Gate','news','2026-10-01','2026-10-01'); INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('source','feed','Telegram','channel','telegram','telegram_channel','https://t.me/example',1,'connector','2026-10-01','2026-10-01','2026-10-01');");
});
afterAll(async()=>ctx.dispose());
beforeEach(async()=>{await ctx.db.exec('DELETE FROM connector_provider_poll_jobs');});
const laterPage=()=>({state:'HANDED_OFF',checkpoint:'UNCHANGED',request:{coverage:{createdAt:end},observations:[{id:'observation',observedAt:end}]},response:{durable:true,receipts:[{observationId:'observation',checkpointResolution:'RESOLVED'}]}});
async function poll(result:unknown,options:{scheduledAt?:string;family?:string;bounds?:unknown}={}){
 const request={scope:{feedId:'feed',feedSourceId:'source'},source:{family:options.family??'telegram'},requestedBounds:options.bounds??{}};
 await ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at,result) VALUES(?,?,?,?,?,?,?)').bind('poll',JSON.stringify(request),'test','[]',end,options.scheduledAt??'2026-10-28T22:32:02.550Z',JSON.stringify(result)).run();
}
it('releases V3 after a durably resolved later Telegram page while retaining incomplete coverage',async()=>{
 await poll(laterPage());
 expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:0,sources:[],continuing:1,continuingSources:['Telegram']});
 expect(await pendingWindowCollections(ctx.db,'feed',end)).toMatchObject({pending:1,sources:['Telegram']});
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='poll'").first()).toEqual({state:'PENDING'});
});
it('releases the retained later-page handoff projection without changing the original V2 gate',async()=>{
 const retained=JSON.parse(readFileSync(new URL('../../../benchmarks/results/v3-selective-database-reads/collection-readiness-retained-page.json',import.meta.url),'utf8'));
 await poll(retained.result,{scheduledAt:retained.scheduledAt});
 expect(retained.cutoff).toBe(end);
 expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:0,continuing:1});
 expect(await pendingWindowCollections(ctx.db,'feed',end,false)).toMatchObject({pending:1,continuing:0});
});
it.each(['before','unresolved','missing-receipt','unknown-observation','earlier-observation','no-durable-receipt','blocked','missing-result'] as const)('retains the gate for %s data',async mode=>{
 const result:any=laterPage();
 if(mode==='before')result.request.coverage.createdAt='2026-10-28T22:32:09.436Z';
 if(mode==='unresolved')result.response.receipts[0].checkpointResolution='UNRESOLVED';
 if(mode==='missing-receipt')result.response.receipts=[];
 if(mode==='unknown-observation')delete result.request.observations[0].observedAt;
 if(mode==='earlier-observation')result.request.observations[0].observedAt='2026-10-28T22:31:00Z';
 if(mode==='no-durable-receipt')result.response.durable=false;
 if(mode==='blocked')result.checkpoint='BLOCKED';
 await poll(mode==='missing-result'?null:result);
 expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1,sources:['Telegram']});
});
it('never gates a poll scheduled at or after the cutoff',async()=>{
 await poll(null,{scheduledAt:end});expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:0});
});
it('does not apply the Telegram exception to a bounded request or another provider',async()=>{
 await poll(laterPage(),{bounds:{endTime:end}});expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1});
 await ctx.db.exec('DELETE FROM connector_provider_poll_jobs');await poll(laterPage(),{family:'linkedin_profile'});expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1});
});

const delivery='2026-10-28T22:37:09.437Z';
it('starts scheduled V3 preparation at cutoff despite a busy source, preserving its pending job',async()=>{
 const blocked={state:'HANDED_OFF',checkpoint:'UNCHANGED',request:{coverage:{createdAt:'2026-10-28T22:20:00Z'},observations:[],proposals:[]},response:{durable:true,receipts:[]},attempts:[{failure:'BACKPRESSURE',diagnostic:{detail:'HELPER_GLOBAL_CAPACITY_BUSY',httpStatus:503}}]};
 await poll(blocked,{family:'website'});
 const result=await pendingWindowCollections(ctx.db,'feed',end,true,{scheduledFor:delivery,now:Date.parse(end)});
 expect(result).toMatchObject({pending:0,sources:[],deadlineReleased:1,deadlineReleasedSources:['Telegram']});
 const row=await ctx.db.prepare("SELECT state,result FROM connector_provider_poll_jobs WHERE job_id='poll'").first<{state:string;result:string}>();
 expect(row?.state).toBe('PENDING');expect(JSON.parse(row!.result)).toEqual(blocked);
});
it('never releases early, unscheduled windows, invalid timing, or retained V2 work',async()=>{
 await poll(null,{family:'website'});
 for(const [v3,context]of [[true,{scheduledFor:delivery,now:Date.parse(end)-1}],[true,{scheduledFor:'invalid',now:Date.parse(delivery)}],[true,{scheduledFor:end,now:Date.parse(delivery)}],[false,{scheduledFor:delivery,now:Date.parse(delivery)}]] as const){
  expect(await pendingWindowCollections(ctx.db,'feed',end,v3,context)).toMatchObject({pending:1});
 }
 expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1});
});
it('unresolved collection can continue after delivery without claiming complete coverage',async()=>{
 await poll(null,{family:'telegram'});
 expect(await pendingWindowCollections(ctx.db,'feed',end,true,{scheduledFor:delivery,now:Date.parse(delivery)+60000})).toMatchObject({pending:0,deadlineReleased:1,continuing:0});
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='poll'").first('state')).toBe('PENDING');
});

it('priority dispatch and transport admit the scheduled window while upstream work remains pending',async()=>{
 await poll(null,{family:'website'});
 const window=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-28T21:08:00Z'},new Date('2026-10-28T22:55:00Z'));
 expect(window.scheduledFor).toBe('2026-10-28T23:00:00.000Z');
 await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'feed',ownerId:'owner'});
 const sent:unknown[]=[],env={DB:ctx.db,BRIEFING_ENGINE:'v3',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 try{
  await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('briefing_requests','deadline-window','feed',JSON.stringify({id:'deadline-window',feedId:'feed',engine:'v3',state:'PENDING',attempts:0,window})).run();
  expect(await collectionReadyForWindow(env,'feed',window.end,'deadline-window',Date.parse(window.end),window)).toBe(true);
  expect(await dispatchReadyConnectorBriefing(env,'feed',new Date(window.end))).toBe(true);
  expect(await dispatchReadyConnectorBriefing(env,'feed',new Date(window.end))).toBe(false);expect(sent).toHaveLength(1);
  expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='poll'").first('state')).toBe('PENDING');
  expect(await ctx.db.prepare("SELECT count(*) FROM connector_publication_waits WHERE request_id='deadline-window'").first('count(*)')).toBe(0);
 }finally{await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='briefing_requests' AND id='deadline-window'").run();await ctx.db.prepare("DELETE FROM v1_queue_dispatches WHERE id='deadline-window'").run();}
});

it('transport respects a persisted V2 engine on a deployment configured for V3',async()=>{
 await poll(null,{family:'website'});await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'feed',ownerId:'owner'});
 const window=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-28T21:08:00Z'},new Date('2026-10-28T22:55:00Z')),id=await windowIdentity('feed',window);
 try{
  await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('briefing_requests',id,'feed',JSON.stringify({id,feedId:'feed',engine:'v2',state:'PENDING',window})).run();
  const env={DB:ctx.db,BRIEFING_ENGINE:'v3'} as Env;
  expect(await collectionReadyForWindow(env,'feed',window.end,id,Date.parse(window.scheduledFor!),window)).toBe(false);
  expect(await pendingWindowCollections(ctx.db,'feed',window.end,false,{scheduledFor:window.scheduledFor,now:Date.parse(window.scheduledFor!)})).toMatchObject({pending:1});
 }finally{await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='briefing_requests' AND id=?").bind(id).run();await ctx.db.prepare('DELETE FROM connector_publication_waits WHERE request_id=?').bind(id).run();}
});
