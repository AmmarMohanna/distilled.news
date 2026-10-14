import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {dispatchConnectorFeeds,dispatchConnectorPolls,coalescedProcessingQueue,processConnectorMessage,connectorDownstreamEnv,completeConnectorDownstream,collectionReadyForWindow,type ConnectorQueueMessage} from './connector-scheduling';
import {sharedPublicHttp} from './connector-public-cache';
import {DurableProviderHttp,sourceSqlFromD1} from '@distilled/connectors';
import type {Env} from './types';
import {processV1Acquisition} from './v1-downstream-runtime';
import {processV1Reassessment} from './v1-intelligence/runtime';
import {verifyConnectorAuthority} from './connector-authority';
import {handoffFixture} from '@distilled/contracts';
import {feedSourceAvailability} from './connector-availability';
import * as connectorRuntime from './connector-runtime';
import {dispatchTelegramLane} from './connector-telegram-lane';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const messages:unknown[]=[];
beforeAll(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.exec(`INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at)
 VALUES('scale-owner','scale@example.invalid','scale@example.invalid','scale-owner','user','hash','2026-10-13','2026-10-13','2026-10-13');
 WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1000)
 INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at)
 SELECT printf('scale-%04d',i),'scale-owner',printf('scale-%04d',i),'Scale','news',1,'2026-10-13','2026-10-13' FROM n;
 INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at)
 SELECT id||'-rss',id,'RSS','channel','rss','rss_feed','https://example.com/feed.xml',1,'connector','2026-10-13','2026-10-13','2026-10-13' FROM briefings;`.replace(/\r?\n/g,' '));
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',PRODUCT_FEEDS_ENABLED:'true',SOURCE_COLLECTION_QUEUE:{sendBatch:async(batch:unknown[])=>{messages.push(...batch)}},V1_PROCESSING_QUEUE:{send:async(body:unknown)=>{messages.push(body)}},V1_ACQUISITION_QUEUE:{send:async(body:unknown)=>{messages.push(body)}},PROCESSING_QUEUE:{send:async(body:unknown)=>{messages.push(body)},sendBatch:async()=>{}}} as unknown as Env;
},60_000);
afterAll(async()=>ctx?.dispose());
it('Telegram dispatch is exclusive and serves a quiet feed before repeating a busy feed',async()=>{
 const at=Date.now(),due=new Date(at-60000).toISOString();messages.length=0;
 const seed=(feedId:string,jobId:string)=>ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at) VALUES(?,?,?,?,?,?)').bind(jobId,JSON.stringify({scope:{feedId,feedSourceId:feedId+'-rss',sourceId:'telegram'},runId:jobId,source:{family:'telegram',locator:'test',channelId:'-123'},requestedBounds:{},limit:3}),jobId,'["telegram_telethon"]',due,due);
 await ctx.db.batch([...Array.from({length:25},(_,i)=>seed('scale-0001','lane-busy-'+i)),seed('scale-0002','lane-quiet')]);
 expect((await Promise.all(Array.from({length:4},()=>dispatchTelegramLane(env,at)))).reduce((a,b)=>a+b,0)).toBe(1);
 const first=(messages[0] as {body:ConnectorQueueMessage}).body;expect(first.feedId).toBe('scale-0001');
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='DONE',dispatch_until=0,dispatch_token=NULL WHERE job_id=?").bind('jobId' in first?first.jobId:'').run();
 expect(await dispatchTelegramLane(env,at+1)).toBe(1);
 expect((messages[1] as {body:ConnectorQueueMessage}).body.feedId).toBe('scale-0002');
 // An expired delivery fence cannot override an independently renewed execution lease.
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET dispatch_until=0,lease_until=? WHERE job_id='lane-quiet'").bind(new Date(at+60000).toISOString()).run();
 expect(await dispatchTelegramLane(env,at+2)).toBe(0);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='CANCELLED',lease_until=NULL,dispatch_until=0,dispatch_token=NULL WHERE job_id LIKE 'lane-%'").run();
});
it('a finished Telegram page immediately dispatches the next fair session job without waiting for Cron',async()=>{
 const at=Date.now(),due=new Date(at-1000).toISOString();messages.length=0;
 for(const [feedId,id] of [['scale-0003','lane-chain-first'],['scale-0004','lane-chain-next']])await ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at) VALUES(?,?,?,?,?,?)').bind(id,JSON.stringify({scope:{feedId,feedSourceId:feedId+'-rss',sourceId:'telegram'},runId:id,source:{family:'telegram',locator:'test',channelId:'-123'},requestedBounds:{},limit:3}),id,'["telegram_telethon"]',due,due).run();
 await dispatchTelegramLane(env,at);const first=(messages[0] as {body:ConnectorQueueMessage}).body;
 const runner=vi.spyOn(connectorRuntime,'createConnectorRuntime').mockReturnValue({scheduler:{runOne:async(_lease:number,id:string)=>{await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='DONE' WHERE job_id=?").bind(id).run();return 'DONE';}}} as any);
 try{await processConnectorMessage(env,first);expect(messages.filter((m:any)=>m.body?.type==='connector_poll')).toHaveLength(2);}
 finally{runner.mockRestore();await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='CANCELLED',dispatch_until=0,dispatch_token=NULL WHERE job_id LIKE 'lane-chain-%'").run();}
});

it('dispatches 1,000 feeds in bounded indexed batches, with no repeated sends before lease expiry',async()=>{
 messages.length=0;const start=performance.now();
 const plans=await ctx.db.prepare('EXPLAIN QUERY PLAN SELECT feed_id FROM connector_feed_schedule WHERE due_ms<=? ORDER BY due_ms,feed_id LIMIT 100').bind(1).all<{detail:string}>();
 expect(plans.results.some(p=>p.detail.includes('connector_feed_due'))).toBe(true);
 const scopePlan=await ctx.db.prepare('EXPLAIN QUERY PLAN SELECT id,epoch FROM v1_intake_scopes WHERE feed_id=? ORDER BY id').bind('scale-0001').all<{detail:string}>();
 expect(scopePlan.results.some(p=>p.detail.includes('connector_intake_feed'))).toBe(true);
 for(let i=0;i<10;i++)expect(await dispatchConnectorFeeds(env,1000)).toBe(100);
 expect(await dispatchConnectorFeeds(env,1000)).toBe(0);
 const ids=messages.map(m=>(m as {body:{feedId:string}}).body.feedId);
 expect(new Set(ids).size).toBe(1000);
 console.info(JSON.stringify({load:'connector-scheduling',feeds:1000,messages:messages.length,dispatchMs:Math.round(performance.now()-start),indexed:true}));
 expect(await dispatchConnectorFeeds(env,121001)).toBe(100); // Lost queue delivery recovery.
},60_000);

it('failed sends release the durable dispatch for bounded retry',async()=>{
 await ctx.db.prepare("UPDATE connector_feed_schedule SET due_ms=0 WHERE feed_id='scale-1000'").run();
 const broken={...env,SOURCE_COLLECTION_QUEUE:{sendBatch:async()=>{throw Error('transport')}}} as unknown as Env;
 await expect(dispatchConnectorFeeds(broken,2000,1)).rejects.toThrow('transport');
 const row=await ctx.db.prepare("SELECT due_ms,last_error FROM connector_feed_schedule WHERE feed_id='scale-1000'").first();
 expect(row).toEqual({due_ms:32000,last_error:'QUEUE_SEND_FAILED'});
});

it('an active feed claim cannot take another feed dispatch slot after a configuration wakeup',async()=>{
 await ctx.db.prepare("UPDATE connector_feed_schedule SET due_ms=-10000,processing_until=9000 WHERE feed_id='scale-0999'").run();
 await ctx.db.prepare("UPDATE connector_feed_schedule SET due_ms=-9000 WHERE feed_id='scale-0998'").run();messages.length=0;
 expect(await dispatchConnectorFeeds(env,4000,1)).toBe(1);
 expect(messages).toMatchObject([{body:{feedId:'scale-0998'}}]);
 expect(await ctx.db.prepare("SELECT due_ms FROM connector_feed_schedule WHERE feed_id='scale-0999'").first()).toEqual({due_ms:-10000});
 await ctx.db.prepare("UPDATE connector_feed_schedule SET processing_until=0,due_ms=999999 WHERE feed_id='scale-0999'").run();
});

it('retry ticks skip reenrollment until collection is due, and preserve changes during scheduling',async()=>{
 const feedId='scale-0070';messages.length=0;
 const clock=vi.spyOn(Date,'now').mockReturnValue(Math.floor(Date.now()/300000)*300000+60000);
 const tick=async(token:string)=>{await ctx.db.prepare('UPDATE connector_feed_schedule SET token=?,processing_until=0 WHERE feed_id=?').bind(token,feedId).run();await processConnectorMessage(env,{type:'connector_feed',feedId,token});};
 const maintenance=vi.spyOn(connectorRuntime,'runConnectorMaintenance').mockResolvedValue({scheduled:[],outcomes:[],durationMs:0});
 try{
  await tick('clock-first');expect(maintenance).toHaveBeenCalledTimes(1);
  await tick('clock-retry');expect(maintenance).toHaveBeenCalledTimes(1);
  await ctx.db.prepare('UPDATE sources SET title=? WHERE id=?').bind('Changed',feedId+'-rss').run();
  maintenance.mockImplementationOnce(async()=>{await ctx.db.prepare('UPDATE briefings SET interest_profile=? WHERE id=?').bind('Changed while claimed',feedId).run();return {scheduled:[],outcomes:[],durationMs:0};});
  await tick('clock-edited');expect(maintenance).toHaveBeenCalledTimes(2);
  expect(await ctx.db.prepare('SELECT due_ms,collection_due_ms FROM connector_feed_schedule WHERE feed_id=?').bind(feedId).first()).toEqual({due_ms:0,collection_due_ms:0});
  await tick('clock-recover');expect(maintenance).toHaveBeenCalledTimes(3);
 }finally{maintenance.mockRestore();clock.mockRestore()}
});

it('per-feed dispatch gives a quiet feed slots even when another has a large backlog',async()=>{
 const statements=[];
 for(let i=0;i<40;i++)for(const feed of ['scale-0001','scale-0002'])statements.push(ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at) VALUES(?,?,?,?,?)').bind(`${feed}-${i}`,JSON.stringify({scope:{feedId:feed}}),'hash','[]','1970-01-01T00:00:00.000Z'));
 await ctx.db.batch(statements);messages.length=0;
 expect(await dispatchConnectorPolls(env,'scale-0001',3000)).toBe(4);
 expect(await dispatchConnectorPolls(env,'scale-0002',3000)).toBe(4);
 expect(messages.map(m=>(m as {body:{feedId:string}}).body.feedId)).toEqual([...Array(4).fill('scale-0001'),...Array(4).fill('scale-0002')]);
});

it('a failed mixed-family send releases both atomic claims for retry',async()=>{
 const feedId='scale-0090',request=JSON.stringify({scope:{feedId}}),due='1970-01-01T00:00:00.000Z';
 await ctx.db.batch([
  ctx.db.prepare('INSERT INTO connector_rss_poll_jobs(job_id,request,request_hash,due_at) VALUES(?,?,?,?)').bind('mixed-rss',request,'hash',due),
  ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at) VALUES(?,?,?,?,?)').bind('mixed-provider',request,'hash','[]',due)
 ]);
 const broken={...env,SOURCE_COLLECTION_QUEUE:{sendBatch:async()=>{throw Error('transport')}}} as unknown as Env;
 await expect(dispatchConnectorPolls(broken,feedId,1000)).rejects.toThrow('transport');
 expect(await dispatchConnectorPolls(env,feedId,30999)).toBe(0);
 messages.length=0;expect(await dispatchConnectorPolls(env,feedId,31000)).toBe(2);
 expect(messages.map((m:any)=>m.body.table).sort()).toEqual(['provider','rss']);
});

it('coalesces duplicate downstream delivery without losing crash recovery',async()=>{
 messages.length=0;const body={type:'v1_reassess' as const,jobId:'review-1'};
 await Promise.all(Array.from({length:10},()=>coalescedProcessingQueue(env,1000).send(body)));
 expect(messages).toHaveLength(1);
 await coalescedProcessingQueue(env,121001).send(body);expect(messages).toHaveLength(2);
});

it('dedicated V1 delivery bypasses legacy backlog and retains coalescing',async()=>{
 const dedicated=vi.fn(async()=>{}),legacy=vi.fn(async()=>{});
 const runtime={...env,V1_PROCESSING_QUEUE:{send:dedicated},PROCESSING_QUEUE:{send:legacy}} as unknown as Env;
 const queue=coalescedProcessingQueue(runtime,1000),body={type:'v1_reassess' as const,jobId:'dedicated-review'};
 await queue.send(body);await queue.send(body);expect(dedicated).toHaveBeenCalledTimes(1);expect(legacy).not.toHaveBeenCalled();
 await queue.send({type:'collect_source',sourceId:'legacy-source'} as any);expect(legacy).toHaveBeenCalledTimes(1);
 await coalescedProcessingQueue(runtime,121001).send(body);expect(dedicated).toHaveBeenCalledTimes(2);
});

it('batch downstream sends retain coalescing and their per-message delay',async()=>{
 const deliveries:unknown[]=[];
 const runtime={...env,V1_PROCESSING_QUEUE:{send:async(body:unknown,options:unknown)=>{deliveries.push({body,options})},sendBatch:async()=>{throw Error('bypass')}}} as unknown as Env;
 const queue=coalescedProcessingQueue(runtime,1000);
 await queue.sendBatch([{body:{type:'v1_reassess',jobId:'batch-review'},delaySeconds:9},{body:{type:'v1_reassess',jobId:'batch-review'},delaySeconds:9}]);
 expect(deliveries).toEqual([{body:{type:'v1_reassess',jobId:'batch-review'},options:{delaySeconds:9}}]);
});

it('acquisition has independent delivery slots while reviews retain their queue and replay fence',async()=>{
 const acquire=vi.fn(async()=>{}),review=vi.fn(async()=>{}),legacy=vi.fn(async()=>{});
 const runtime={...env,V1_ACQUISITION_QUEUE:{send:acquire},V1_PROCESSING_QUEUE:{send:review},PROCESSING_QUEUE:{send:legacy}} as unknown as Env;
 const queue=coalescedProcessingQueue(runtime,1000),body={type:'v1_acquisition' as const,jobId:'isolated-acquire'};
 await Promise.all([queue.send(body),queue.send(body)]);expect(acquire).toHaveBeenCalledTimes(1);
 await queue.send({type:'v1_reassess',jobId:'isolated-review'});expect(review).toHaveBeenCalledTimes(1);expect(legacy).not.toHaveBeenCalled();
 await queue.send({type:'connector_relay',feedId:'scale-0001'});expect(acquire).toHaveBeenCalledTimes(2);expect(review).toHaveBeenCalledTimes(1);
 await coalescedProcessingQueue(runtime,121001).send(body);expect(acquire).toHaveBeenCalledTimes(3);
 const incomplete={...runtime,V1_ACQUISITION_QUEUE:undefined};expect(()=>coalescedProcessingQueue(incomplete,242002)).toThrow('V1_ACQUISITION_QUEUE_REQUIRED');expect(review).toHaveBeenCalledTimes(1);
});

it('simultaneous completions refill one per-feed relay without waiting for Cron or entering the review queue',async()=>{
 const acquire=vi.fn(async()=>{}),review=vi.fn(async()=>{}),feedId='scale-0004',sourceId='refill-source',jobId='refill-job';
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(sourceId,feedId,'refill-identity',JSON.stringify({feedId,feedSourceId:sourceId,sourceId:'refill-identity',feedRevision:1,enabled:true,restrictions:{}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(jobId,sourceId,JSON.stringify({id:jobId,state:'DONE',kind:'ACQUIRE'})).run();
 const runtime={...env,V1_ACQUISITION_QUEUE:{send:acquire},V1_PROCESSING_QUEUE:{send:review}} as unknown as Env;
 await Promise.all(Array.from({length:4},()=>completeConnectorDownstream(runtime,{type:'v1_acquisition',jobId})));
 expect(acquire.mock.calls).toEqual([[{type:'connector_relay',feedId},undefined]]);expect(review).not.toHaveBeenCalled();
});

it('persisted provider revocations and exhausted source budgets are immediately visible',async()=>{
 const feedId='scale-0060',id=feedId+'-x';
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES(?,?,'NASA','channel','twitterapi_io','x_profile','https://x.com/NASA','{\"username\":\"NASA\"}',1,'connector','2026-10-13','2026-10-13','2026-10-13')").bind(id,feedId).run();
 await ctx.db.prepare("INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES('x_twitterapi_io',0) ON CONFLICT(provider_id) DO UPDATE SET limit_usd=0").run();
 await ctx.db.prepare("INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES('x_apify',100) ON CONFLICT(provider_id) DO UPDATE SET limit_usd=100").run();
 const runtime={...env,SOURCE_PROVIDER_BUDGETS_JSON:'{"x_twitterapi_io":100,"x_apify":100}',SOURCE_OPERATION_CEILINGS_JSON:'{"twitterApiIo":1,"apify":1}',SOURCE_PER_PROVIDER_BUDGET_USD:'15',TWITTERAPI_IO_API_KEY:'test-primary',APIFY_API_TOKEN:'test-fallback'} as Env;
 expect((await feedSourceAvailability(runtime,feedId)).find(s=>s.sourceId===id)).toMatchObject({state:'AVAILABLE',providers:['x_apify']});
 await ctx.db.prepare("INSERT INTO connector_source_provider_budgets(feed_id,feed_source_id,provider_id,reserved_usd) VALUES(?,?,'x_apify',15)").bind(feedId,id).run();
 expect((await feedSourceAvailability(runtime,feedId)).find(s=>s.sourceId===id)).toMatchObject({state:'UNAVAILABLE',reason:'BUDGET_EXHAUSTED',providers:[]});
});

it('rechecks feed authorization before executing a queued tick',async()=>{
 await ctx.db.prepare("UPDATE briefings SET paused=1 WHERE id='scale-0003'").run();
 await ctx.db.prepare("UPDATE connector_feed_schedule SET token='paused-token' WHERE feed_id='scale-0003'").run();
 const fetch=vi.spyOn(globalThis,'fetch');
 await processConnectorMessage(env,{type:'connector_feed',feedId:'scale-0003',token:'paused-token'});
 expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});

it('reuses one public upstream fetch across 1,000 authorized consumers without sharing receipt state',async()=>{
 const objects=new Map<string,Uint8Array>();let calls=0,authorized=0;
 const bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b)},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.buffer}:null},delete:async(k:string)=>{objects.delete(k)}} as unknown as R2Bucket;
 const http={get:async()=>{calls++;return {status:200,headers:{'content-type':'application/xml'},bytes:new TextEncoder().encode('<rss/>'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}}};
 const cached=sharedPublicHttp(ctx.db,bucket,http,async()=>{authorized++},()=>1000);
 for(let i=0;i<1000;i++)expect((await cached.get('https://example.com/feed.xml',{accept:'application/xml'})).status).toBe(200);
 expect(calls).toBe(1);expect(authorized).toBeGreaterThanOrEqual(1000);
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_fetch_runs').first()).toEqual({n:0});
 const denied=sharedPublicHttp(ctx.db,bucket,http,async()=>{throw Error('SOURCE_NOT_APPROVED')},()=>1000);
 await expect(denied.get('https://example.com/feed.xml',{accept:'application/xml'})).rejects.toThrow('SOURCE_NOT_APPROVED');
 expect(calls).toBe(1);
},60_000);
it('concurrent public-cache waiters reuse the fetch and independently enforce revocation',async()=>{
 const objects=new Map<string,Uint8Array>();let release!:()=>void,calls=0,admitted=0,revoked=false;
 const bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b.slice())},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer}:null},delete:async(k:string)=>{objects.delete(k)}} as unknown as R2Bucket;
 const http={get:async()=>{calls++;await new Promise<void>(resolve=>{release=resolve});return {status:200,headers:{'cache-control':'public,max-age=60'},bytes:new TextEncoder().encode('<rss/>'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}}};
 const owner=sharedPublicHttp(ctx.db,bucket,http,async()=>{}).get('https://example.com/concurrent.xml',{accept:'application/xml'});
 await vi.waitFor(()=>expect(calls).toBe(1));
 const waiters=Array.from({length:8},(_,i)=>sharedPublicHttp(ctx.db,bucket,http,async()=>{admitted++;if(i===0&&revoked)throw Error('SOURCE_NOT_APPROVED')}).get('https://example.com/concurrent.xml',{accept:'application/xml'}));
 const settled=Promise.allSettled(waiters);await vi.waitFor(()=>expect(admitted).toBeGreaterThanOrEqual(8));revoked=true;release();
 expect((await owner).status).toBe(200);const results=await settled;
 expect(results[0]).toMatchObject({status:'rejected',reason:expect.objectContaining({message:'SOURCE_NOT_APPROVED'})});
 expect(results.slice(1).every(r=>r.status==='fulfilled'&&r.value.status===200)).toBe(true);expect(calls).toBe(1);
});
it('cached public bytes are not returned if approval is revoked during the body read',async()=>{
 const objects=new Map<string,Uint8Array>();let revoked=false,revokeOnRead=false;
 const bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b.slice())},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>{if(revokeOnRead)revoked=true;return b.slice().buffer}}:null},delete:async()=>{}} as unknown as R2Bucket;
 const http={get:async()=>({status:200,headers:{},bytes:new TextEncoder().encode('<rss/>'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}})};
 const cached=sharedPublicHttp(ctx.db,bucket,http,async()=>{if(revoked)throw Error('SOURCE_NOT_APPROVED')});
 await cached.get('https://example.com/body-fence.xml',{accept:'application/xml'});revokeOnRead=true;
 await expect(cached.get('https://example.com/body-fence.xml',{accept:'application/xml'})).rejects.toThrow('SOURCE_NOT_APPROVED');
});

it('primary and fallback budgets are independent, concurrent replay reserves and pays once',async()=>{
 const objects=new Map<string,Uint8Array>();let calls=0;
 const payloads={put:async(_s:unknown,b:Uint8Array)=>{const ref=crypto.randomUUID();objects.set(ref,b);return {ref,hash:'h'}},get:async(_s:unknown,ref:string)=>objects.get(ref)!};
 const http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),payloads,async()=>{calls++;return Response.json({ok:true})},4_000_000,20_000,15);
 await http.configureLimit('x_twitterapi_io',100);await http.configureLimit('x_apify',100);
 const scope={feedId:'scale-0004',feedSourceId:'source-x',sourceId:'x'};
 await http.request(scope,'primary','x_twitterapi_io',15,'https://api.twitterapi.io/test',{});
 await expect(http.request(scope,'exhausted','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BUDGET_EXCEEDED');
 await http.request(scope,'fallback','x_apify',15,'https://api.apify.com/test',{});
 await Promise.allSettled(Array.from({length:8},()=>http.request({...scope,feedSourceId:'concurrent'},'same','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})));
 expect(calls).toBe(3);
 const rows=await ctx.db.prepare('SELECT provider_id,reserved_usd FROM connector_source_provider_budgets WHERE feed_source_id=? ORDER BY provider_id').bind(scope.feedSourceId).all();
 expect(rows.results).toEqual([{provider_id:'x_apify',reserved_usd:15},{provider_id:'x_twitterapi_io',reserved_usd:15}]);
 expect(await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").first()).toEqual({reserved_usd:16});
});

it('the new queue path acquires a full article and reaches intelligence with a feed-scoped authorization context',async()=>{
 const objects=new Map<string,Uint8Array>(),feedId='scale-0010',published=new Date(Date.now()-120_000).toISOString();messages.length=0;
 const bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b)},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer,size:b.length,json:async()=>JSON.parse(new TextDecoder().decode(b))}:null},delete:async(k:string)=>{objects.delete(k)}} as unknown as R2Bucket;
 const fixture=vi.fn(async(url:unknown)=>String(url).endsWith('feed.xml')?new Response(`<rss><channel><item><guid>launch</guid><title>Launch update</title><link>https://example.com/news/launch</link><pubDate>${published}</pubDate><description>Short excerpt.</description></item></channel></rss>`):new Response(`<meta property="article:published_time" content="${published}"><h1>Launch update</h1><article>${'The launch completed successfully. '.repeat(20)}</article>`));
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(fixture);
 const runtime={...env,RAW_ARCHIVE:bucket,SOURCE_FULL_ARTICLES_ENABLED:'true',SOURCE_SHARED_PUBLIC_FETCH_ENABLED:'true',V1_SEMANTIC_POLICY:'DETERMINISTIC'} as Env;
 const tick=async(token:string)=>{await ctx.db.prepare('UPDATE connector_feed_schedule SET token=?,processing_until=0 WHERE feed_id=?').bind(token,feedId).run();await processConnectorMessage(runtime,{type:'connector_feed',feedId,token});const index=messages.findIndex((m:any)=>m.type==='connector_relay'&&m.feedId===feedId);if(index>=0)await processConnectorMessage(runtime,messages.splice(index,1)[0] as ConnectorQueueMessage);};
 try{
  await tick('initial');
  const poll=messages.find((m:any)=>m.body?.type==='connector_poll'&&m.body.feedId===feedId) as {body:Parameters<typeof processConnectorMessage>[1]};expect(poll).toBeDefined();
  await processConnectorMessage(runtime,poll.body);await tick('after-poll');
  const acquired=messages.find((m:any)=>m.type==='v1_acquisition') as {type:'v1_acquisition';jobId:string};expect(acquired).toBeDefined();
  const scoped=await connectorDownstreamEnv(runtime,acquired);expect(scoped.V1_DOWNSTREAM_FEED_SOURCE_IDS).toBe(`${feedId}-rss`);
  expect(await processV1Acquisition(scoped,acquired.jobId,fixture as typeof globalThis.fetch)).toBe('DONE');await completeConnectorDownstream(runtime,acquired);
  await tick('after-acquisition');
  const review=messages.find((m:any)=>m.type==='v1_reassess') as {type:'v1_reassess';jobId:string};expect(review).toBeDefined();
  expect(await processV1Reassessment(await connectorDownstreamEnv(runtime,review),review.jobId)).toBe('DONE');
  const revision=await ctx.db.prepare("SELECT json_extract(json,'$.representation') AS representation,json_extract(json,'$.canonicalUrl') AS url FROM v1_revisions WHERE feed_source_id=?").bind(`${feedId}-rss`).first();
  expect(revision).toEqual({representation:'FULL_ARTICLE',url:'https://example.com/news/launch'});
  expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_feed_documents WHERE feed_id=? AND kind='events'").bind(feedId).first()).toEqual({n:1});
 }finally{fetch.mockRestore();}
},60_000);

it('unfinished source collection holds its publication window but later windows do not',async()=>{
 const feedId='scale-0030',request=JSON.stringify({scope:{feedId,feedSourceId:`${feedId}-rss`}});
 await ctx.db.prepare('INSERT INTO connector_rss_poll_jobs(job_id,request,request_hash,due_at,scheduled_at) VALUES(?,?,?,?,?)').bind('window-poll',request,'hash','2026-10-13T12:05:00.000Z','2026-10-13T12:00:00.000Z').run();
 expect(await collectionReadyForWindow(env,feedId,'2026-10-13T12:01:00.000Z','window-request')).toBe(false);
 expect(await collectionReadyForWindow(env,feedId,'2026-10-13T11:59:00.000Z','earlier-request')).toBe(true);
 await ctx.db.prepare("UPDATE connector_rss_poll_jobs SET state='DONE' WHERE job_id='window-poll'").run();
 expect(await collectionReadyForWindow(env,feedId,'2026-10-13T12:01:00.000Z','window-request')).toBe(true);
});

it('Telegram authority requires an explicit current-origin signal, not a missing message',async()=>{
 const feedId='scale-0040',sourceId=`${feedId}-telegram`,input=JSON.stringify({channelId:'-100123',username:'examplechannel',public:true});
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES(?,?,'Telegram','channel','telegram','telegram_channel','https://t.me/examplechannel',?,1,'connector','2026-10-13','2026-10-13','2026-10-13')").bind(sourceId,feedId,input).run();
 const observation={...handoffFixture().observations[0],feedId,feedSourceId:sourceId,sourceItemKey:'telegram:-100123:10',operation:'DELETE' as const,representation:'TELEGRAM_MESSAGE' as const,authoritativeCurrentState:true};
 let records:unknown[]=[];
 const runtime={...env,SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-private-token-0123456789',SOURCE_EXECUTION_SERVICE:{fetch:async()=>Response.json({channelId:'-100123',records})}} as unknown as Env;
 expect(await verifyConnectorAuthority(runtime,observation)).toBe(false);
 records=[{id:10,deleted:true,explicitDeletion:true}];expect(await verifyConnectorAuthority(runtime,observation)).toBe(true);
 records=[{id:10,deleted:true}];expect(await verifyConnectorAuthority(runtime,observation)).toBe(false);
 await ctx.db.prepare('UPDATE sources SET enabled=0 WHERE id=?').bind(sourceId).run();
 records=[{id:10,deleted:true,explicitDeletion:true}];expect(await verifyConnectorAuthority(runtime,observation)).toBe(false);
});
