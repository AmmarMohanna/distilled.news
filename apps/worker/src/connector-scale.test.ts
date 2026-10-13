import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {dispatchConnectorFeeds,dispatchConnectorPolls,coalescedProcessingQueue,processConnectorMessage,connectorDownstreamEnv,completeConnectorDownstream,collectionReadyForWindow} from './connector-scheduling';
import {sharedPublicHttp} from './connector-public-cache';
import {DurableProviderHttp,sourceSqlFromD1} from '@distilled/connectors';
import type {Env} from './types';
import {processV1Acquisition} from './v1-downstream-runtime';
import {processV1Reassessment} from './v1-intelligence/runtime';
import {verifyConnectorAuthority} from './connector-authority';
import {handoffFixture} from '@distilled/contracts';

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
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',PRODUCT_FEEDS_ENABLED:'true',SOURCE_COLLECTION_QUEUE:{sendBatch:async(batch:unknown[])=>{messages.push(...batch)}},PROCESSING_QUEUE:{send:async(body:unknown)=>{messages.push(body)},sendBatch:async()=>{}}} as unknown as Env;
},60_000);
afterAll(async()=>ctx?.dispose());

it('dispatches 1,000 feeds in bounded indexed batches, with no repeated sends before lease expiry',async()=>{
 messages.length=0;const start=performance.now();
 const plans=await ctx.db.prepare('EXPLAIN QUERY PLAN SELECT feed_id FROM connector_feed_schedule WHERE due_ms<=? ORDER BY due_ms,feed_id LIMIT 100').bind(1).all<{detail:string}>();
 expect(plans.results.some(p=>p.detail.includes('connector_feed_due'))).toBe(true);
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

it('per-feed dispatch gives a quiet feed slots even when another has a large backlog',async()=>{
 const statements=[];
 for(let i=0;i<40;i++)for(const feed of ['scale-0001','scale-0002'])statements.push(ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at) VALUES(?,?,?,?,?)').bind(`${feed}-${i}`,JSON.stringify({scope:{feedId:feed}}),'hash','[]','1970-01-01T00:00:00.000Z'));
 await ctx.db.batch(statements);messages.length=0;
 expect(await dispatchConnectorPolls(env,'scale-0001',3000)).toBe(4);
 expect(await dispatchConnectorPolls(env,'scale-0002',3000)).toBe(4);
 expect(messages.map(m=>(m as {body:{feedId:string}}).body.feedId)).toEqual([...Array(4).fill('scale-0001'),...Array(4).fill('scale-0002')]);
});

it('coalesces duplicate downstream delivery without losing crash recovery',async()=>{
 messages.length=0;const body={type:'v1_reassess' as const,jobId:'review-1'};
 await Promise.all(Array.from({length:10},()=>coalescedProcessingQueue(env,1000).send(body)));
 expect(messages).toHaveLength(1);
 await coalescedProcessingQueue(env,121001).send(body);expect(messages).toHaveLength(2);
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
 const tick=async(token:string)=>{await ctx.db.prepare('UPDATE connector_feed_schedule SET token=?,processing_until=0 WHERE feed_id=?').bind(token,feedId).run();await processConnectorMessage(runtime,{type:'connector_feed',feedId,token});};
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
