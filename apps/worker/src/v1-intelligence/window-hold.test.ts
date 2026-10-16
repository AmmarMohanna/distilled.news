import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {jobsHoldingWindow} from './runtime';
import {windowIntakeCoverage} from './window-coverage';
import {windowHoldPolicy} from './window-hold';
import {pendingWindowCollections} from '../connector-publication-coverage';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const end='2026-10-16T12:00:00.000Z',at=(iso:string)=>windowHoldPolicy({V1_PUBLICATION_GRACE_MINUTES:'10'},Date.parse(iso));
async function job(id:string,observation:Record<string,unknown>,state='PENDING'){
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'source',JSON.stringify({observation})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('job-'+id,'source',JSON.stringify({id:'job-'+id,feedId:'feed',kind:'REASSESS',state,attempts:0,observationId:id})).run();
}
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','hold@example.invalid','hold@example.invalid','hold','user','hash','2026-10-16','2026-10-16','2026-10-16'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,paused,created_at,updated_at) VALUES('feed','owner','hold','Hold','news',1,0,'2026-10-16','2026-10-16'); INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES('source','feed','identity','{\"enabled\":1}');");
 await job('fresh',{observedAt:'2026-10-16T11:50:00Z',publishedAtHint:'2026-10-16T11:40:00Z'});
 await job('undated',{observedAt:'2026-10-16T11:50:00Z'});
 await job('stale',{observedAt:'2026-10-16T11:50:00Z',publishedAtHint:'2026-10-13T08:00:00Z'});
 await job('reviewed',{observedAt:'2026-10-16T11:50:00Z',publishedAtHint:'2026-10-16T11:45:00Z'},'DONE');
 await job('later',{observedAt:'2026-10-16T12:05:00Z',publishedAtHint:'2026-10-16T12:01:00Z'});
});
afterEach(async()=>{await ctx.dispose()});

it('without a configured grace every unfinished job observed before the window holds it, as before',async()=>{
 expect(windowHoldPolicy({})).toBeUndefined();
 expect(await jobsHoldingWindow(ctx.db,'feed',end)).toBe(3);
 expect(await windowIntakeCoverage(ctx.db,'feed',end)).toEqual({state:'PENDING',pendingJobs:3,failedJobs:0,failures:[]});
});

it('stale backlog stops holding the window but is reported as deferred coverage',async()=>{
 const policy=at('2026-10-16T12:05:00Z');
 expect(await jobsHoldingWindow(ctx.db,'feed',end,policy)).toBe(2);
 expect(await windowIntakeCoverage(ctx.db,'feed',end,policy)).toEqual({state:'PENDING',pendingJobs:2,failedJobs:0,deferredJobs:1,failures:[]});
 await ctx.db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','DONE') WHERE id IN ('job-fresh','job-undated')").run();
 expect(await jobsHoldingWindow(ctx.db,'feed',end,policy)).toBe(0);
 expect((await windowIntakeCoverage(ctx.db,'feed',end,policy)).state).toBe('INCOMPLETE');
});

it('after the grace deadline nothing holds the window, and unfinished work is deferred rather than complete',async()=>{
 expect(await jobsHoldingWindow(ctx.db,'feed',end,at('2026-10-16T12:09:59Z'))).toBe(2);
 const policy=at('2026-10-16T12:10:00Z');
 expect(await jobsHoldingWindow(ctx.db,'feed',end,policy)).toBe(0);
 expect(await windowIntakeCoverage(ctx.db,'feed',end,policy)).toEqual({state:'INCOMPLETE',pendingJobs:0,failedJobs:0,deferredJobs:3,failures:[]});
 expect(await pendingWindowCollections(ctx.db,'feed',end,policy)).toEqual({pending:0,sources:[]});
});

it('failed jobs keep one failure group per kind and code under the bounded hold',async()=>{
 await ctx.db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','FAILED','$.exhausted',1,'$.failureCode','TIMEOUT') WHERE id IN ('job-fresh','job-stale')").run();
 expect((await windowIntakeCoverage(ctx.db,'feed',end,at('2026-10-16T12:05:00Z'))).failures).toEqual([{kind:'REASSESS',code:'TIMEOUT',count:2}]);
});

it('rejects an invalid grace setting',()=>{
 expect(()=>windowHoldPolicy({V1_PUBLICATION_GRACE_MINUTES:'soon'})).toThrow('INVALID_PUBLICATION_GRACE');
});

it('only the newest past-deadline window stays pending; older ones are carried into it unless synthesis started',async()=>{
 const {V1FeedStore}=await import('./store');
 const {supersedeExpiredWindows,SUPERSEDED_REASON}=await import('./window-supersede');
 await ctx.db.prepare("INSERT INTO v1_feeds(id,json) VALUES('feed',?)").bind(JSON.stringify({id:'feed',ownerId:'owner',revision:1,paused:false})).run();
 const request=(id:string,windowEnd:string)=>ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests',?,'feed',?)").bind(id,JSON.stringify({id,feedId:'feed',state:'PENDING',attempts:0,createdAt:windowEnd,window:{start:new Date(Date.parse(windowEnd)-1800000).toISOString(),end:windowEnd,kind:'30M'}})).run();
 await request('w1100','2026-10-16T11:00:00.000Z');await request('w1130','2026-10-16T11:30:00.000Z');await request('w1200','2026-10-16T12:00:00.000Z');await request('w1230','2026-10-16T12:30:00.000Z');
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('synthesis_jobs','w1130','feed','{}')").run();
 const store=new V1FeedStore(ctx.db);
 expect(await supersedeExpiredWindows(store,'feed',undefined,'2026-10-16T12:35:00Z')).toEqual([]);
 expect(await supersedeExpiredWindows(store,'feed',at('2026-10-16T12:35:00Z'),'2026-10-16T12:35:00Z')).toEqual(['w1100']);
 const state=async(id:string)=>JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id=?").bind(id).first<{json:string}>())!.json);
 expect(await state('w1100')).toMatchObject({state:'DONE',result:'DEFERRED',reason:SUPERSEDED_REASON,supersededBy:'w1200'});
 expect((await state('w1130')).state).toBe('PENDING');
 expect((await state('w1200')).state).toBe('PENDING');
 expect((await state('w1230')).state).toBe('PENDING');
});
