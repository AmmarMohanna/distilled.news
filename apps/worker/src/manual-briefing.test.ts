import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {retireManualBriefing,retireManualBriefingRequests,type ManualBriefingRequest} from './manual-briefing';
import {productRuntimeEnv} from './product-feeds';
import {V1FeedStore} from './v1-intelligence/store';
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
it('retired endpoint cannot start manual or legacy publication',async()=>{
 const response=await request();expect(response.status).toBe(410);expect(sent).toHaveLength(0);
 expect(await new V1FeedStore(ctx.db).list(feed.id,'manual_briefing_requests')).toHaveLength(0);
});
it('historical pending manual requests retire without deleting accepted work or starting collection',async()=>{
 const store=new V1FeedStore(ctx.db),value:ManualBriefingRequest={id:'old',feedId:feed.id,sourceIds:[],createdAt:new Date().toISOString(),state:'PENDING',phase:'COLLECTION',briefingRequestId:'normal'};
 const normal={id:'normal',feedId:feed.id,state:'PENDING',attempts:0,window:{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'}};
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','normal',?,?)").bind(feed.id,JSON.stringify(normal)).run();
 const sourceId=env.V1_DOWNSTREAM_FEED_SOURCE_IDS!.split(',')[0],accepted={id:'accepted-job',kind:'ACQUIRE',feedSourceId:sourceId,state:'PENDING',attempts:0};
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(accepted.id,sourceId,JSON.stringify(accepted)).run();
 await store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('manual_briefing_requests',?,?,?)").bind(value.id,feed.id,JSON.stringify(value)).run();
 await retireManualBriefing(env,feed.id,value.id);await retireManualBriefingRequests(env);
 expect(await store.read(feed.id,'manual_briefing_requests',value.id)).toMatchObject({state:'FAILED',reason:'MANUAL_GENERATION_RETIRED'});
 expect(await store.read(feed.id,'briefing_requests','normal')).toEqual(normal);
 expect(JSON.parse((await ctx.db.prepare('SELECT json FROM v1_jobs WHERE id=?').bind(accepted.id).first<{json:string}>())!.json)).toEqual(accepted);expect(sent).toHaveLength(0);
});
