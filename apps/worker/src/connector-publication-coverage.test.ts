import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {pendingWindowCollections} from './connector-publication-coverage';
import {readFileSync} from 'node:fs';
import {feedSourceAvailability} from './connector-availability';
import type {Env} from './types';
import {coalescedProcessingQueue} from './connector-scheduling';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {windowIdentity} from './v1-intelligence/runtime';
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
it('yields confirmed capacity refusal exactly at delivery, retaining the original recoverable poll',async()=>{
 await poll(null,{family:'website'});
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET last_error='BACKPRESSURE',result=NULL WHERE job_id='poll'").run();
 const deadline=Date.parse(end)+300000;
 const original=await ctx.db.prepare("SELECT * FROM connector_provider_poll_jobs WHERE job_id='poll'").first();
 expect(await pendingWindowCollections(ctx.db,'feed',end,true,deadline-1)).toMatchObject({pending:1,unavailable:0});
 expect(await pendingWindowCollections(ctx.db,'feed',end,true,deadline)).toMatchObject({pending:0,unavailable:1,unavailableSources:[{id:'source',title:'Telegram',count:1}]});
 expect(await pendingWindowCollections(ctx.db,'feed',end,false,deadline)).toMatchObject({pending:1,unavailable:0});
 expect(await ctx.db.prepare("SELECT * FROM connector_provider_poll_jobs WHERE job_id='poll'").first()).toEqual(original);
});
it.each(['captured','uncertain','unknown','missing-time','live-lease'] as const)('never bypasses %s work at the capacity deadline',async mode=>{
 await poll(mode==='captured'?{state:'HANDED_OFF',request:{observations:[{id:'old',observedAt:'2026-10-28T22:00:00Z'}]}}:null,{family:'website'});
 await ctx.db.prepare('UPDATE connector_provider_poll_jobs SET last_error=?,scheduled_at=? WHERE job_id=?').bind(mode==='uncertain'?'UNCERTAIN_PAID_SUBMISSION':mode==='unknown'?null:'BACKPRESSURE',mode==='missing-time'?'':'2026-10-28T22:00:00Z','poll').run();
 if(mode==='live-lease')await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET lease_until='2026-10-28T23:00:00Z' WHERE job_id='poll'").run();
 expect(await pendingWindowCollections(ctx.db,'feed',end,true,Date.parse(end)+300000)).toMatchObject({pending:1,unavailable:0});
});
it('reports a current capacity refusal despite an earlier success and clears it only on recovery',async()=>{
 await poll(null,{family:'telegram'});
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET last_error='BACKPRESSURE',result=NULL WHERE job_id='poll'").run();
 await ctx.db.prepare("INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at,state) SELECT 'old-success',request,initial_hash,provider_order,due_at,'2026-10-28T21:00:00Z','DONE' FROM connector_provider_poll_jobs WHERE job_id='poll'").run();
 const env={DB:ctx.db,SOURCE_CONNECTORS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_BUDGET_MODE:'unlimited',SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_TOKEN:'fixture-only',SOURCE_EXECUTION_SERVICE:{}} as unknown as Env;
 expect((await feedSourceAvailability(env,'feed'))[0]).toMatchObject({collectionError:'BACKPRESSURE'});
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='DONE',last_error=NULL WHERE job_id='poll'").run();
 expect((await feedSourceAvailability(env,'feed'))[0].collectionError).toBeUndefined();
});
it.each(['v2','unmarked'] as const)('honors a retained %s window on a V3-default deployment before reserving transport',async mode=>{
 await ctx.db.exec('DELETE FROM connector_queue_dispatch; DELETE FROM connector_work_slots;');
 await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'feed',ownerId:'owner'});
 const window={start:'2026-10-28T22:00:00.000Z',end,kind:'HOURLY' as const},id=await windowIdentity('feed',window);
 await ctx.db.prepare("INSERT OR REPLACE INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests',?,'feed',?)").bind(id,JSON.stringify({...(mode==='v2'?{engine:'v2'}:{}),state:'PENDING',window})).run();
 await poll(null,{family:'website'});await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET result=NULL,last_error='BACKPRESSURE' WHERE job_id='poll'").run();
 let sent=0;const env={DB:ctx.db,BRIEFING_ENGINE:'v3',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_QUEUE:{},V1_ACQUISITION_QUEUE:{},V1_PROCESSING_QUEUE:{send:async()=>{sent++}}} as unknown as Env;
 const message={type:'v1_briefing' as const,feedId:'feed',window};
 expect(await coalescedProcessingQueue(env,Date.parse(end)+300000).send(message)).toBe(false);expect(sent).toBe(0);
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.engine','v3') WHERE kind='briefing_requests' AND id=?").bind(id).run();
 await coalescedProcessingQueue(env,Date.parse(end)+300000).send(message);expect(sent).toBe(1);
});
it('does not apply the Telegram exception to a bounded request or another provider',async()=>{
 await poll(laterPage(),{bounds:{endTime:end}});expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1});
 await ctx.db.exec('DELETE FROM connector_provider_poll_jobs');await poll(laterPage(),{family:'linkedin_profile'});expect(await pendingWindowCollections(ctx.db,'feed',end,true)).toMatchObject({pending:1});
});
