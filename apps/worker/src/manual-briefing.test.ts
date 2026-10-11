import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {driveManualBriefing,requestManualBriefing,prepareManualBriefing,relayManualBriefings,type ManualBriefingRequest} from './manual-briefing';
import {productRuntimeEnv,productPublicationState,publishedProductEditions} from './product-feeds';
import {runConnectorMaintenance} from './connector-runtime';
import {V1FeedStore} from './v1-intelligence/store';
import {V1IntakeStore} from './v1-intake/store';
import {processV1Acquisition} from './v1-downstream-runtime';
import {processV1Reassessment,processV1Briefing,dispatchV1Intelligence} from './v1-intelligence/runtime';
import type {Env,DistilledQueueMessage} from './types';
import type {BriefingConfig} from '@distilled/core';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,repo:D1Repository,feed:BriefingConfig,cookie:string;
const sent:DistilledQueueMessage[]=[];
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});repo=new D1Repository(ctx.db);sent.length=0;
 const owner=await repo.createAccount({email:'manual@example.invalid',username:'manual-owner',role:'user',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
 const objects=new Map<string,Uint8Array>();
 env={DB:ctx.db,ADMIN_SESSION_SECRET:'test-secret',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_EDITORIAL_PLAN_ENABLED:'true',V1_SEMANTIC_POLICY:'DETERMINISTIC',V1_SALIENCE_POLICY:'DETERMINISTIC',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}},RAW_ARCHIVE:{put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes)},get:async(key:string)=>{const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer}:null}}} as unknown as Env;
 cookie=`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,owner)}`;
 const response=await createApp({repository:repo}).request('/api/me/feeds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({id:'manual-feed',title:'Banking reform',interestProfile:'banking reform',publicFeedEnabled:true,sourceInputs:['https://example.com/feed.xml'],updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',language:'en'})},env);
 expect(response.status).toBe(200);feed=(await repo.getBriefingById('manual-feed'))!;env=await productRuntimeEnv(env);
});
afterEach(async()=>{vi.restoreAllMocks();await ctx?.dispose()});
const request=()=>createApp({repository:repo}).request('/api/feed/manual-owner/banking-reform/request-summary',{method:'POST',headers:{cookie}},env);
it('requires verified owner authorization and rejects cross-origin requests before creating paid work',async()=>{
 const app=createApp({repository:repo}),url='/api/feed/manual-owner/banking-reform/request-summary';
 expect((await app.request(url,{method:'POST'},env)).status).toBe(401);
 const stranger=await repo.createAccount({email:'stranger@example.invalid',username:'stranger',role:'user',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
 expect((await app.request(url,{method:'POST',headers:{cookie:`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,stranger)}`}},env)).status).toBe(403);
 expect((await app.request(url,{method:'POST',headers:{cookie,origin:'https://unrelated.invalid'}},env)).status).toBe(403);
 expect(sent).toHaveLength(0);
});
it('acknowledges durable work and coalesces repeated clicks, with no source network request at admission',async()=>{
 const network=vi.spyOn(globalThis,'fetch');
 const first=await request(),second=await request();expect(first.status).toBe(202);expect(second.status).toBe(202);
 const a=await first.json() as {requestId:string;state:string},b=await second.json() as {requestId:string};expect(a.state).toBe('PENDING');expect(a.requestId).toBe(b.requestId);
 const requests=await new V1FeedStore(ctx.db).list<ManualBriefingRequest>(feed.id,'manual_briefing_requests');expect(requests).toHaveLength(1);
 expect(await productPublicationState(env,feed.id)).toBe('checking');expect(network).not.toHaveBeenCalled();
 await prepareManualBriefing(env,feed.id,a.requestId);await prepareManualBriefing(env,feed.id,a.requestId);
 expect((await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_rss_poll_jobs').first())?.n).toBe(1);
});
it('recovers queue loss and waits for all collection work before freezing the publication window',async()=>{
 const manual=await requestManualBriefing(env,feed);sent.length=0;
 expect(await relayManualBriefings(env)).toBe(1);expect(sent[0]).toMatchObject({type:'v1_manual_briefing',requestId:manual.id});
 await prepareManualBriefing(env,feed.id,manual.id);await relayManualBriefings(env);
 const store=new V1FeedStore(ctx.db);expect(await store.list(feed.id,'briefing_requests')).toHaveLength(0);
 expect((await store.read<ManualBriefingRequest>(feed.id,'manual_briefing_requests',manual.id))?.phase).toBe('COLLECTION');
});
it('reports failed collection rather than silently publishing a quiet empty briefing',async()=>{
 const manual=await requestManualBriefing(env,feed);await prepareManualBriefing(env,feed.id,manual.id);
 await ctx.db.prepare("UPDATE connector_rss_poll_jobs SET state='BLOCKED'").run();await relayManualBriefings(env);
 expect((await new V1FeedStore(ctx.db).read<ManualBriefingRequest>(feed.id,'manual_briefing_requests',manual.id))).toMatchObject({state:'FAILED',reason:'SOURCE_COLLECTION_FAILED'});
 expect(await productPublicationState(env,feed.id)).toBe('failed');
});
it('rate-limits owner requests and refuses a paused feed',async()=>{
 for(let i=0;i<6;i++)expect((await request()).status).toBe(202);
 expect((await request()).status).toBe(429);
 await repo.upsertBriefing({...feed,paused:true});expect((await request()).status).toBe(409);
});
it('collects RSS, gates unfinished acquisition and publishes one grounded edition readable by the frontend',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('<rss><channel><item><guid>banking-1</guid><link>https://example.com/news/1</link><title>Banking reform passed</title><description>Parliament passed banking reform legislation on Tuesday.</description></item></channel></rss>'));
 const manual=await requestManualBriefing(env,feed);await prepareManualBriefing(env,feed.id,manual.id);
 await runConnectorMaintenance(env,new Date(),{skipSchedule:true});expect(network).toHaveBeenCalledTimes(1);
 const at=new Date(Date.now()+1000);await relayManualBriefings(env,at);
 const store=new V1FeedStore(ctx.db),intake=new V1IntakeStore(ctx.db),ids=(env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',');
 const pending=await store.read<ManualBriefingRequest>(feed.id,'manual_briefing_requests',manual.id);expect(pending?.phase).toBe('PROCESSING');
 expect(Date.parse(pending!.window!.end)).toBeGreaterThan(Date.parse(manual.createdAt));
 sent.length=0;await dispatchV1Intelligence(env,at);expect(sent.some(m=>m.type==='v1_briefing'&&'window' in m&&m.window.end===pending!.window!.end)).toBe(false);
 for(const id of ids){for(const job of await intake.listPendingJobs(id))if(job.kind==='ACQUIRE')await processV1Acquisition(env,job.id);for(const job of await intake.listPendingJobs(id))if(job.kind==='REASSESS')await processV1Reassessment(env,job.id,new Date(at.getTime()+60000).toISOString());}
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:feed.id,window:pending!.window!},()=>at.toISOString());expect(edition?.stories.length).toBeGreaterThan(0);
 await relayManualBriefings(env,at);expect((await store.read<ManualBriefingRequest>(feed.id,'manual_briefing_requests',manual.id))?.state).toBe('DONE');
 expect(await publishedProductEditions(env,feed)).toHaveLength(1);
 const response=await createApp({repository:repo}).request('/api/feed/manual-owner/banking-reform',{},env);expect(response.status).toBe(200);expect((await response.json() as {editions:unknown[]}).editions).toHaveLength(1);
 await processV1Briefing(env,{type:'v1_briefing',feedId:feed.id,window:pending!.window!},()=>at.toISOString());expect(await store.list(feed.id,'editions')).toHaveLength(1);
},60000);

it('advances owner collection from the queue without scheduling another poll window and stops when settled or paused',async()=>{
 const manual=await requestManualBriefing(env,feed);
 const network=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<rss><channel><item><guid>queue-one</guid><title>Banking reform</title><description>Banking reform changes reserve policy.</description><link>https://example.com/queue-one</link></item></channel></rss>'));
 expect(await driveManualBriefing(env,feed.id,manual.id)).toBe(true);
 const store=new V1FeedStore(ctx.db),pending=await store.read<ManualBriefingRequest>(feed.id,'manual_briefing_requests',manual.id);
 expect(pending?.phase).toBe('PROCESSING');
 expect((await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_rss_poll_jobs').first())?.n).toBe(1);
 expect(sent.some(m=>m.type==='v1_acquisition')).toBe(true);
 expect(await driveManualBriefing(env,feed.id,manual.id)).toBe(true);
 expect(network).toHaveBeenCalledTimes(1);
 await ctx.db.prepare('UPDATE briefings SET paused=1 WHERE id=?').bind(feed.id).run();
 expect(await driveManualBriefing(env,feed.id,manual.id)).toBe(false);
 await ctx.db.prepare('UPDATE briefings SET paused=0 WHERE id=?').bind(feed.id).run();
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.state','DONE') WHERE kind='manual_briefing_requests' AND id=?").bind(manual.id).run();
 expect(await driveManualBriefing(env,feed.id,manual.id)).toBe(false);
 expect(network).toHaveBeenCalledTimes(1);
},60000);
