import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {coalescedProcessingQueue,completeConnectorDownstream,deferConnectorDownstream,continueConnectorIntake,decodeConnectorDelivery,processConnectorMessage} from './connector-scheduling';
import {sha256} from '@distilled/contracts';
import type {DistilledQueueMessage,Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const deliveries:(DistilledQueueMessage&{_connectorDispatchToken?:string})[]=[];
beforeAll(async()=>{
 ctx=await createIntakeDatabase({product:true});
 const queue={send:async(body:DistilledQueueMessage)=>{deliveries.push(body)},sendBatch:async()=>{}};
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue,PROCESSING_QUEUE:queue} as unknown as Env;
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('delivery-owner','delivery@example.invalid','delivery@example.invalid','delivery-owner','user','hash','2026-10-13','2026-10-13','2026-10-13'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,paused,created_at,updated_at) VALUES('delivery-feed','delivery-owner','delivery','Delivery','news',1,1,'2026-10-13','2026-10-13'); INSERT INTO connector_feed_schedule(feed_id) VALUES('delivery-feed');");
});
afterAll(async()=>ctx?.dispose());
beforeEach(async()=>{await ctx.db.prepare('DELETE FROM connector_work_slots').run()});
const row=(kind:string)=>ctx.db.prepare('SELECT token,available_ms FROM connector_queue_dispatch WHERE kind=?').bind(kind).first<{token:string;available_ms:number}>();
it('an older successful delivery cannot release its replacement dispatch generation',async()=>{
 const body={type:'v1_rematch' as const,feedId:'delivery-feed',requestId:'replacement-test'};
 await coalescedProcessingQueue(env,1000).send(body);const old=deliveries.at(-1)!;
 await coalescedProcessingQueue(env,121001).send(body);const replacement=await row(body.type);
 await completeConnectorDownstream(env,body,old._connectorDispatchToken);
 expect(await row(body.type)).toEqual(replacement);
});
it('a legacy tokenless completion cannot release an active dispatch generation',async()=>{
 const body={type:'v1_reassess' as const,jobId:'legacy-completion'};
 await coalescedProcessingQueue(env,1000).send(body);const replacement=await row(body.type);
 await completeConnectorDownstream(env,body);
 expect(await row(body.type)).toEqual(replacement);
});
it('the relay internal completion cannot release a newer delivery generation',async()=>{
 const body={type:'connector_relay' as const,feedId:'delivery-feed'};
 await coalescedProcessingQueue(env,1000).send(body);const old=deliveries.at(-1)!;
 await coalescedProcessingQueue(env,121001).send(body);const replacement=await row(body.type);
 await processConnectorMessage(env,old as typeof body);
 expect(await row(body.type)).toEqual(replacement);
});

it('matching completion releases only once and transport metadata leaves canonical identity unchanged',async()=>{
 const body={type:'v1_rematch' as const,feedId:'delivery-feed',requestId:'matching-token'};
 await coalescedProcessingQueue(env,1000).send(body);const wire=deliveries.at(-1)!,delivery=decodeConnectorDelivery(wire);
 expect(delivery.body).toEqual(body);expect(delivery.token).toEqual(expect.any(String));
 const id=await sha256(JSON.stringify(body));
 expect(await ctx.db.prepare('SELECT token,available_ms FROM connector_queue_dispatch WHERE kind=? AND id=?').bind(body.type,id).first()).toEqual({token:delivery.token,available_ms:121000});
 await completeConnectorDownstream(env,delivery.body,delivery.token);
 expect(await ctx.db.prepare('SELECT available_ms FROM connector_queue_dispatch WHERE kind=? AND id=?').bind(body.type,id).first()).toEqual({available_ms:0});
 await coalescedProcessingQueue(env,2000).send(body);const replacement=deliveries.at(-1)!;
 expect(replacement._connectorDispatchToken).not.toBe(delivery.token);
 await completeConnectorDownstream(env,delivery.body,delivery.token);
 expect(await ctx.db.prepare('SELECT token,available_ms FROM connector_queue_dispatch WHERE kind=? AND id=?').bind(body.type,id).first()).toEqual({token:replacement._connectorDispatchToken,available_ms:122000});
});
it('collection feed and poll tokens remain independent of downstream transport metadata',()=>{
 const feed={type:'connector_feed' as const,feedId:'delivery-feed',token:'feed-claim'};
 const poll={type:'connector_poll' as const,feedId:'delivery-feed',jobId:'poll',table:'rss' as const,token:'poll-claim'};
 expect(decodeConnectorDelivery(feed)).toEqual({body:feed});expect(decodeConnectorDelivery(poll)).toEqual({body:poll});
});
it('capacity waits immediately requeue the same work without releasing a replacement generation',async()=>{
 const body={type:'v1_reassess' as const,jobId:'capacity-test'};
 await coalescedProcessingQueue(env).send(body);const old=deliveries.at(-1)!;
 const count=deliveries.length;
 expect(await deferConnectorDownstream(env,body,old._connectorDispatchToken)).toBe(true);
 expect(deliveries).toHaveLength(count+1);
 const next=deliveries.at(-1)!;expect(decodeConnectorDelivery(next).body).toEqual(body);
 expect(next._connectorDispatchToken).not.toBe(old._connectorDispatchToken);
 await deferConnectorDownstream(env,body,old._connectorDispatchToken);
 expect(deliveries).toHaveLength(count+1);
 expect(await deferConnectorDownstream(env,body)).toBe(false);
});
it('saved collection intake waits wake at their due time without changing attempts or refetch identity',async()=>{
 const now=Date.now(),options:QueueSendOptions[]=[];
 const queue={send:async(_body:unknown,option:QueueSendOptions)=>{options.push(option)}} as unknown as Queue<DistilledQueueMessage>;
 await ctx.db.prepare("INSERT INTO connector_rss_poll_jobs(job_id,request,request_hash,due_at,last_error,attempts,offset) VALUES(?,?,?,?,?,?,?)").bind('intake-wakeup',JSON.stringify({scope:{feedId:'delivery-feed'}}),'original-fetch',new Date(now+5000).toISOString(),'INTAKE_BUSY',2,10).run();
 expect(await continueConnectorIntake({...env,SOURCE_COLLECTION_QUEUE:queue},'delivery-feed','intake-wakeup','rss',now)).toBe(true);
 expect(options).toEqual([{delaySeconds:5}]);
 expect(await continueConnectorIntake({...env,SOURCE_COLLECTION_QUEUE:queue},'delivery-feed','intake-wakeup','rss',now)).toBe(false);
 expect(await ctx.db.prepare("SELECT attempts,offset,request_hash FROM connector_rss_poll_jobs WHERE job_id='intake-wakeup'").first()).toEqual({attempts:2,offset:10,request_hash:'original-fetch'});
 await ctx.db.prepare("UPDATE connector_rss_poll_jobs SET dispatch_until=0,last_error='RATE_LIMIT' WHERE job_id='intake-wakeup'").run();
 expect(await continueConnectorIntake({...env,SOURCE_COLLECTION_QUEUE:queue},'delivery-feed','intake-wakeup','rss',now)).toBe(false);
});

it('rematch completion durably wakes the feed relay exactly once without inference or changing the saved request',async()=>{
 await ctx.db.prepare("INSERT INTO v1_feeds(id,json) VALUES('delivery-feed',?)").bind(JSON.stringify({id:'delivery-feed',ownerId:'delivery-owner',revision:1})).run();
 const body={type:'v1_rematch' as const,feedId:'delivery-feed',requestId:'rematch-wakeup'},request={id:'rematch-wakeup',feedId:'delivery-feed',evidenceRevisionId:'revision',policyVersion:'semantic-rematch-continuation-v2'};
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('rematch_requests',?,?,?)").bind(request.id,body.feedId,JSON.stringify(request)).run();
 await ctx.db.prepare('UPDATE connector_feed_schedule SET due_ms=? WHERE feed_id=?').bind(Date.now()+3600000,body.feedId).run();
 await coalescedProcessingQueue(env).send(body);const wire=deliveries.at(-1)!,before=deliveries.length;
 await completeConnectorDownstream(env,body,wire._connectorDispatchToken);
 expect(deliveries).toHaveLength(before+1);expect(decodeConnectorDelivery(deliveries.at(-1)!).body).toEqual({type:'connector_relay',feedId:body.feedId});
 expect((await ctx.db.prepare('SELECT due_ms FROM connector_feed_schedule WHERE feed_id=?').bind(body.feedId).first<{due_ms:number}>())!.due_ms).toBeLessThanOrEqual(Date.now());
 await completeConnectorDownstream(env,body,wire._connectorDispatchToken);expect(deliveries).toHaveLength(before+1);
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='rematch_requests' AND id=?").bind(request.id).first<{json:string}>())!.json)).toEqual(request);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())!.n).toBe(0);
});
it('prepared scheduled V3 completion sends one deadline wake without occupying a feed execution slot',async()=>{
 await ctx.db.prepare("INSERT OR IGNORE INTO v1_feeds(id,json) VALUES('delivery-feed',?)" ).bind(JSON.stringify({id:'delivery-feed',ownerId:'delivery-owner',revision:1})).run();
 const now=Date.now(),scheduledFor=new Date(now+300000).toISOString();
 const body={type:'v1_briefing' as const,feedId:'delivery-feed',window:{start:new Date(now-1500000).toISOString(),end:new Date(now).toISOString(),kind:'30M' as const,scheduledFor}};
 const {windowIdentity}=await import('./v1-intelligence/runtime');const id=await windowIdentity(body.feedId,body.window);
 const request={id,feedId:body.feedId,engine:'v3',state:'PENDING',reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:scheduledFor,window:body.window};
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests',?,?,?)").bind(id,body.feedId,JSON.stringify(request)).run();
 const wakeups:{body:unknown;options:QueueSendOptions|undefined}[]=[];
 const runtime={...env,V1_PROCESSING_QUEUE:{send:async(body:unknown,options?:QueueSendOptions)=>{wakeups.push({body,options})}} as unknown as Queue<DistilledQueueMessage>};
 await coalescedProcessingQueue(env).send(body);const wire=deliveries.at(-1)!;
 await completeConnectorDownstream(runtime,body,wire._connectorDispatchToken);
 expect(wakeups).toHaveLength(1);expect(wakeups[0].body).toEqual(body);
 expect(wakeups[0].options!.delaySeconds).toBeGreaterThanOrEqual(Math.ceil((Date.parse(scheduledFor)-Date.now())/1000));expect(wakeups[0].options!.delaySeconds).toBeLessThanOrEqual(300);
 await completeConnectorDownstream(runtime,body,wire._connectorDispatchToken);expect(wakeups).toHaveLength(1);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM connector_work_slots WHERE lease_until>?').bind(Date.now()).first<{n:number}>())!.n).toBe(0);
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id=?").bind(id).first<{json:string}>())!.json)).toEqual(request);
});
it('a failed deadline wake leaves a durable Cron recovery time and no phantom execution slot',async()=>{
 await ctx.db.prepare("INSERT OR IGNORE INTO v1_feeds(id,json) VALUES('delivery-feed',?)").bind(JSON.stringify({id:'delivery-feed',ownerId:'delivery-owner',revision:1})).run();
 const now=Date.now(),scheduledFor=new Date(now+60000).toISOString(),body={type:'v1_briefing' as const,feedId:'delivery-feed',window:{start:new Date(now-1400000).toISOString(),end:new Date(now-10000).toISOString(),kind:'30M' as const,scheduledFor}};
 const {windowIdentity}=await import('./v1-intelligence/runtime'),id=await windowIdentity(body.feedId,body.window);
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests',?,?,?)").bind(id,body.feedId,JSON.stringify({id,engine:'v3',state:'PENDING',reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:scheduledFor,window:body.window})).run();
 await ctx.db.prepare('UPDATE connector_feed_schedule SET due_ms=? WHERE feed_id=?').bind(now+3600000,body.feedId).run();
 const runtime={...env,V1_PROCESSING_QUEUE:{send:async()=>{throw Error('queue unavailable')}} as unknown as Queue<DistilledQueueMessage>};
 await coalescedProcessingQueue(env).send(body);const wire=deliveries.at(-1)!;
 await expect(completeConnectorDownstream(runtime,body,wire._connectorDispatchToken)).rejects.toThrow('queue unavailable');
 expect((await ctx.db.prepare('SELECT due_ms FROM connector_feed_schedule WHERE feed_id=?').bind(body.feedId).first<{due_ms:number}>())!.due_ms).toBe(Date.parse(scheduledFor));
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM connector_work_slots WHERE lease_until>?').bind(Date.now()).first<{n:number}>())!.n).toBe(0);
 await completeConnectorDownstream(runtime,body,wire._connectorDispatchToken);
});
