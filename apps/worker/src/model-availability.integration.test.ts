import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {productRuntimeEnv,productPublicationState,publishedProductEditions} from './product-feeds';
import {V1FeedStore} from './v1-intelligence/store';
import {processV1Briefing,dispatchV1Intelligence,publicationWindow} from './v1-intelligence/runtime';
import {livePublicationWindow} from './v1-intelligence/schedule';
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

it('holds model-required requests without consuming attempts and resumes dispatch after key installation',async()=>{
 env.V1_SYNTHESIS_MODEL_ENABLED='true';env.V1_REAL_MODEL_REQUIRED='true';env.DISTILLED_LLM_API_GATEWAY='openrouter';
 const at=new Date(Date.now()+1000),store=new V1FeedStore(ctx.db);
 const configured=(await store.getFeed(feed.id))!,window=configured.briefingSchedule?livePublicationWindow(configured.briefingSchedule,at):publicationWindow(configured.briefingFrequency,at);
 await processV1Briefing(env,{type:'v1_briefing',feedId:feed.id,window},()=>at.toISOString());
 const request=(await store.list<{id:string;window:import('./v1-intelligence/scoring').PublicationWindow}>(feed.id,'briefing_requests'))[0];
 expect(sent.some(m=>m.type==='v1_briefing')).toBe(false);
 expect(await store.read(feed.id,'briefing_requests',request.id)).toMatchObject({state:'PENDING',attempts:0,reason:'MODEL_SETUP_REQUIRED'});
 expect(await productPublicationState(env,feed.id)).toBe('setup_required');
 await processV1Briefing(env,{type:'v1_briefing',feedId:feed.id,window:request.window},()=>at.toISOString());
 expect(await store.read(feed.id,'briefing_requests',request.id)).toMatchObject({state:'PENDING',attempts:0});
 env.OPENROUTER_API_KEY='synthetic-test-key';sent.length=0;await dispatchV1Intelligence(env,at);
 expect(sent.some(m=>m.type==='v1_briefing'&&'window' in m&&m.window.end===request.window.end)).toBe(true);
 expect((await store.read<{reason?:string}>(feed.id,'briefing_requests',request.id))?.reason).toBeUndefined();
});
