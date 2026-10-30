import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {productPublicationProgress} from './product-feeds';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});await seedIntakeScope(new V1IntakeStore(ctx.db));await new V1FeedStore(ctx.db).registerFeed(feedFixture);env={DB:ctx.db} as Env;});
afterEach(async()=>ctx.dispose());
it('finished reviews do not imply publication while an older source scan is still open',async()=>{
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at) VALUES('progress-owner','progress@example.invalid','progress@example.invalid','progress-owner','user','hash','2026-10-11','2026-10-11')").run();
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at) VALUES('feed-1','progress-owner','progress','Progress','news','2026-10-11','2026-10-11')").run();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('feed-source-1','feed-1','@thsottiaux','channel','apify','x_profile','https://x.com/thsottiaux',1,'connector','2026-10-11','2026-10-11','2026-10-11')").run();
 // The product INSERT invalidates any pre-existing scope. Re-enable this test
 // fixture explicitly, as normal product enrollment does after approval.
 await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',1) WHERE id='feed-source-1'").run();
 await scheduled();await job('done-review','REASSESS','DONE');
 await ctx.db.prepare("INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at) VALUES('pending-x',?,'hash','[]','2026-10-11T16:50:00Z','2026-10-11T16:00:00Z')").bind(JSON.stringify({scope:{feedId:'feed-1',feedSourceId:'feed-source-1'}})).run();
 env.SOURCE_QUEUE_SCHEDULING_ENABLED='true';
 expect(await productPublicationProgress(env,'feed-1')).toMatchObject({stage:'COLLECTING',pending:0,review:{completed:1},collection:{pending:1,sources:['@thsottiaux']}});
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='BLOCKED' WHERE job_id='pending-x'").run();
 expect(await productPublicationProgress(env,'feed-1')).toMatchObject({stage:'PUBLISHING',pending:0});
});
async function scheduled(state='PENDING'){
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','scheduled','feed-1',?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json").bind(JSON.stringify({id:'scheduled',createdAt:'2026-10-11T16:00:00Z',state,window:{end:'2026-10-11T17:00:00Z'}})).run();
}
async function job(id:string,kind:string,state:string,observedAt='2026-10-11T16:30:00Z',scope='feed-source-1',exhausted=false){
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,scope,JSON.stringify({observation:{observedAt}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,scope,JSON.stringify({observationId:id,kind,state,exhausted})).run();
}
it('counts the closed window and excludes later arrivals, disabled sources and other feeds',async()=>{
 await scheduled();await job('acquired','ACQUIRE','DONE');await job('reviewed','REASSESS','DONE');await job('pending','REASSESS','PENDING');await job('running','REASSESS','RUNNING');await job('late','REASSESS','PENDING','2026-10-11T17:00:00Z');
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind('disabled','feed-1','s-disabled',JSON.stringify({enabled:false})).run();await job('disabled-job','REASSESS','PENDING',undefined,'disabled');
 await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'other-feed'});await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind('other-source','other-feed','s-other',JSON.stringify({enabled:true})).run();await job('other-job','REASSESS','PENDING',undefined,'other-source');
 expect(await productPublicationProgress(env,'feed-1')).toEqual({stage:'PROCESSING',acquisition:{completed:1,total:1,failed:0},review:{completed:1,total:3,failed:0},pending:2});
});
it('reports exhausted failures separately and never calls them completed reviews',async()=>{await scheduled();await job('failed','REASSESS','FAILED');await job('exhausted','REASSESS','PENDING',undefined,undefined,true);expect(await productPublicationProgress(env,'feed-1')).toMatchObject({stage:'PUBLISHING',review:{completed:0,total:2,failed:2},pending:0});});
it('completed scheduled work has no stale in-progress notice',async()=>{await scheduled('DONE');expect(await productPublicationProgress(env,'feed-1')).toBeUndefined();});
it('reports deferred initial backlog separately from fetched or pending acquisition',async()=>{
 await scheduled();await job('old','ACQUIRE','DEFERRED');await job('new','ACQUIRE','PENDING');
 expect(await productPublicationProgress(env,'feed-1')).toMatchObject({stage:'PROCESSING',acquisition:{completed:0,total:1,failed:0,deferred:1},pending:1});
});
it('scheduled acquisition reports progress without a manual request',async()=>{await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','scheduled','feed-1',?)").bind(JSON.stringify({state:'PENDING',window:{end:'2026-10-11T17:00:00Z'}})).run();await job('scheduled-pending','ACQUIRE','PENDING');expect(await productPublicationProgress(env,'feed-1')).toMatchObject({stage:'PROCESSING',acquisition:{total:1},pending:1});});
