import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {pendingWindowCollections} from './connector-publication-coverage';
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
