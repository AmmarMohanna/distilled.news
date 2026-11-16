import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository,FeedConfigurationConflict} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {productRuntimeEnv} from './product-feeds';
import {runConnectorMaintenance} from './connector-runtime';
import {dispatchConnectorFeeds,processConnectorMessage,type ConnectorQueueMessage} from './connector-scheduling';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,repo:D1Repository,env:Env,app:ReturnType<typeof createApp>,cookie:string;
let messages:unknown[];
const input={id:'atomic-feed',title:'Original',interestProfile:'News',sourceInputs:['https://example.com/original.xml'],publicFeedEnabled:true,updateIntervalMinutes:60,briefingTimezone:'UTC',language:'en'};
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});repo=new D1Repository(ctx.db);
 const owner=await repo.createAccount({email:'atomic@example.invalid',username:'atomic',passwordHash:'test',role:'user',emailVerifiedAt:new Date().toISOString()});
 messages=[];const queue={send:async(body:unknown)=>{messages.push(body)},sendBatch:async(batch:{body:unknown}[])=>{messages.push(...batch.map(message=>message.body))}};
 env={DB:ctx.db,ADMIN_SESSION_SECRET:'test-only',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',RAW_ARCHIVE:{},SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue,PROCESSING_QUEUE:queue} as unknown as Env;
 app=createApp({repository:repo});cookie='dn_session='+await createSession('test-only',owner);
});
afterEach(async()=>ctx?.dispose());
const save=(value:unknown)=>app.request('/api/me/feeds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(value)},env);

it.each([false,true])('rolls back configuration, sources and scheduler triggers when the second source write fails (existing=%s)',async(existing)=>{
 if(existing)expect((await save(input)).status).toBe(200);
 const before=await repo.getBriefingById(input.id),sources=await repo.listSources(input.id);
 const snapshot=async()=>({feeds:(await ctx.db.prepare('SELECT * FROM v1_feeds ORDER BY id').all()).results,scopes:(await ctx.db.prepare('SELECT * FROM v1_intake_scopes ORDER BY id').all()).results,schedule:(await ctx.db.prepare('SELECT * FROM connector_feed_schedule ORDER BY feed_id').all()).results});
 const state=await snapshot();
 await ctx.db.prepare("CREATE TRIGGER fail_second_source BEFORE INSERT ON sources WHEN NEW.source_url='https://example.com/second.xml' BEGIN SELECT RAISE(ABORT,'TEST_SECOND_SOURCE_WRITE'); END").run();
 const response=await save({...input,title:'Changed',sourceInputs:['https://example.com/first.xml','https://example.com/second.xml']});
 expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'internal server error'});
 expect(await repo.getBriefingById(input.id)).toEqual(before);expect(await repo.listSources(input.id)).toEqual(sources);expect(await snapshot()).toEqual(state);
 await ctx.db.prepare('DROP TRIGGER fail_second_source').run();
 expect((await save({...input,title:'Changed',sourceInputs:['https://example.com/first.xml','https://example.com/second.xml']})).status).toBe(200);
 expect((await repo.getBriefingById(input.id))?.title).toBe('Changed');expect(await repo.listSources(input.id)).toHaveLength(2);
});

it.each([true,false])('reports committed configuration as pending and recovers enrollment without duplicate sources (queue=%s)',async(queueMode)=>{
 env.SOURCE_QUEUE_SCHEDULING_ENABLED=queueMode?'true':'false';
 await ctx.db.prepare("CREATE TRIGGER fail_second_enrollment BEFORE INSERT ON v1_intake_scopes WHEN NEW.id IN (SELECT id FROM sources WHERE source_url='https://example.com/second.xml') BEGIN SELECT RAISE(ABORT,'TEST_SECOND_ENROLLMENT'); END").run();
 const value={...input,title:'Complete config',sourceInputs:['https://example.com/first.xml','https://example.com/second.xml']};
 const response=await save(value);expect(response.status).toBe(202);
 const body=await response.json() as {briefing:{title:string};sourceActivation:string;pendingSourceIds:string[]};
 expect(body).toMatchObject({briefing:{title:value.title},sourceActivation:'pending'});expect(body.pendingSourceIds).toHaveLength(1);
 const sources=await repo.listSources(input.id);expect(sources).toHaveLength(2);expect(sources.every(source=>source.enabled)).toBe(true);
 expect((await repo.getSource(body.pendingSourceIds[0]))?.lastError).toContain('activation is pending');
 expect((await ctx.db.prepare('SELECT collection_due_ms FROM connector_feed_schedule WHERE feed_id=?').bind(input.id).first())).toEqual({collection_due_ms:0});
 await ctx.db.prepare('DROP TRIGGER fail_second_enrollment').run();
 // The durable source rows and scheduling triggers are the recovery input; no request replay is needed.
 if(queueMode){
  expect(await dispatchConnectorFeeds(env)).toBe(1);
  const message=messages.find(message=>(message as {type?:string}).type==='connector_feed') as ConnectorQueueMessage;expect(message).toBeDefined();
  await processConnectorMessage(env,message);
 } else {
  const scoped=await productRuntimeEnv(env);expect(scoped.V1_DOWNSTREAM_FEED_SOURCE_IDS?.split(',').sort()).toEqual(sources.map(source=>source.id).sort());
  await runConnectorMaintenance(scoped,new Date(),{scheduleOnly:true});
 }
 const scopes=(await ctx.db.prepare('SELECT id,json FROM v1_intake_scopes WHERE feed_id=? ORDER BY id').bind(input.id).all<{id:string;json:string}>()).results;
 expect(scopes.map(scope=>scope.id)).toEqual(sources.map(source=>source.id).sort());expect(scopes.every(scope=>JSON.parse(scope.json).enabled)).toBe(true);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first())).toEqual({n:0});
 expect((await save(value)).status).toBe(200);expect((await repo.listSources(input.id)).map(source=>source.id).sort()).toEqual(sources.map(source=>source.id).sort());
});

it('rejects a stale configuration before modifying sources or overwriting a newer edit',async()=>{
 expect((await save(input)).status).toBe(200);const prior=(await repo.getBriefingById(input.id))!;
 await repo.upsertBriefing({...prior,title:'Newer edit'});
 await expect(repo.saveFeedConfiguration({...prior,title:'Stale edit'},[],prior)).rejects.toBeInstanceOf(FeedConfigurationConflict);
 expect((await repo.getBriefingById(input.id))?.title).toBe('Newer edit');expect(await repo.listSources(input.id)).toHaveLength(1);
});
