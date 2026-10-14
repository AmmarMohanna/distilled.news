import {expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {dispatchConnectorFeeds,dispatchConnectorPolls,processConnectorMessage,type ConnectorQueueMessage} from './connector-scheduling';
import type {Env} from './types';

// Opt-in workload: real D1 claims, configuration, collection, R2 payloads,
// intake receipts and checkpoints. Upstream/model services are simulated;
// this does not prove live provider or editorial capacity.
it.skipIf(process.env.CONNECTOR_LOAD_COLLECTION!=='true')('drains actual collection for 1,000 independent feeds through bounded queue consumers',async()=>{
 const count=Number(process.env.CONNECTOR_LOAD_FEEDS??1000);
 const articles=Number(process.env.CONNECTOR_LOAD_ARTICLES??0);
 if(!Number.isSafeInteger(count)||count<1||count>1000)throw Error('INVALID_LOAD_FEEDS');
 if(![0,1].includes(articles))throw Error('INVALID_LOAD_ARTICLES');
 const ctx=await createIntakeDatabase({product:true}),at=new Date().toISOString();
 const ids=Array.from({length:count},(_,i)=>`load-${String(i+1).padStart(4,'0')}`);
 const sourceMessages:ConnectorQueueMessage[]=[],objects=new Map<string,Uint8Array>();
 const queryProfile=new Map<string,{calls:number;statements:number;elapsedMs:number}>();
 let activePhase='setup';
 const measure=async<T>(kind:string,statements:number,action:()=>Promise<T>):Promise<T>=>{
  const key=activePhase+':'+kind,entry=queryProfile.get(key)??{calls:0,statements:0,elapsedMs:0},started=performance.now();
  queryProfile.set(key,entry);entry.calls++;entry.statements+=statements;
  try{return await action()}finally{entry.elapsedMs+=performance.now()-started;}
 };
 const instrument=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,key){
  if(key==='bind')return (...values:unknown[])=>instrument(target.bind(...values));
  if(['first','all','run','raw'].includes(String(key)))return (...args:unknown[])=>measure(String(key),1,()=>Reflect.apply(Reflect.get(target,key),target,args) as Promise<unknown>);
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const measuredDb=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>instrument(target.prepare(sql));
  if(key==='batch')return (statements:D1PreparedStatement[])=>measure('batch',statements.length,()=>target.batch(statements));
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 let upstreamCalls=0,downstreamMessages=0;
 const fixture=`<rss><channel><title>Shared public news</title>${articles?`<item><guid>shared-article</guid><title>Shared source story</title><link>https://example.com/article</link><description>A concrete test article collected independently for each feed.</description><pubDate>${new Date(at).toUTCString()}</pubDate></item>`:''}</channel></rss>`;
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{upstreamCalls++;return new Response(fixture,{headers:{'content-type':'application/rss+xml','cache-control':'public,max-age=60'}});});
 const env={DB:measuredDb,PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_SHARED_PUBLIC_FETCH_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_LEGACY_POLLING_ENABLED:'false',SOURCE_PROVIDER_BUDGETS_JSON:'{}',SOURCE_OPERATION_CEILINGS_JSON:'{}',
  RAW_ARCHIVE:{put:async(k:string,b:Uint8Array)=>{if(!objects.has(k))objects.set(k,b.slice());},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer,size:b.length,json:async()=>JSON.parse(new TextDecoder().decode(b))}:null},delete:async(k:string)=>{objects.delete(k)}},
  SOURCE_COLLECTION_QUEUE:{sendBatch:async(batch:{body:ConnectorQueueMessage}[])=>{sourceMessages.push(...batch.map(m=>m.body));}},
  PROCESSING_QUEUE:{send:async()=>{downstreamMessages++;},sendBatch:async()=>{throw Error('UNCOALESCED_BATCH');}}
 } as unknown as Env;
 const start=performance.now(),deadline=start+580_000,phaseTimes:Record<string,number>={};
 async function drain(phase:string,bodies:ConnectorQueueMessage[]){
  activePhase=phase;
  const durations:number[]=[],started=performance.now();let cursor=0,completed=0,stopped=false;
  const workers=await Promise.allSettled(Array.from({length:8},async()=>{
   try{while(!stopped&&cursor<bodies.length){
    if(performance.now()>=deadline)throw Error('COLLECTION_DRAIN_DEADLINE');
    const body=bodies[cursor++],before=performance.now();await processConnectorMessage(env,body);durations.push(performance.now()-before);
    if(++completed%100===0)console.info(JSON.stringify({load:'source-collection',phase,completed,total:bodies.length,upstreamCalls,databaseRequests:[...queryProfile].filter(([key])=>key.startsWith(phase+':')).reduce((n,[,entry])=>n+entry.calls,0)}));
   }}catch(error){stopped=true;throw error;}
  }));
  phaseTimes[phase]=Math.round(performance.now()-started);durations.sort((a,b)=>a-b);
  const database=Object.fromEntries([...queryProfile].filter(([key])=>key.startsWith(phase+':')).map(([key,value])=>[key.slice(phase.length+1),{...value,elapsedMs:Math.round(value.elapsedMs)}]));
  console.info(JSON.stringify({load:'source-collection',phase,messages:bodies.length,completed,durationMs:phaseTimes[phase],p95Ms:Math.round(durations[Math.floor(durations.length*.95)]??0),database}));
  const failed=workers.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 }
 try{
  await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('load-owner','load@example.invalid','load@example.invalid','load-owner','user','unused',?,?,?)").bind(at,at,at).run();
  // Batch writes stay below D1's parameter ceiling.
  for(let i=0;i<ids.length;i+=50){
   await ctx.db.batch(ids.slice(i,i+50).map(id=>ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES(?,'load-owner',?,'Load test','News',1,?,?)").bind(id,id,at,at)));
   await ctx.db.batch(ids.slice(i,i+50).map(id=>ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES(?,?,'Public RSS','channel','rss','rss_feed','https://example.com/shared.xml',1,'connector',?,?,?)").bind(id+'-rss',id,at,at,at)));
  }
  // D1 disallows some SQLite PRAGMAs; use its own query metadata rather than
  // reaching around the D1 API to read the backing SQLite file.
  const bytesBefore=(await ctx.db.prepare('SELECT 1 AS storage_probe').run()).meta.size_after;
  for(let i=0;i<Math.ceil(count/100);i++)await dispatchConnectorFeeds(env);
  const feedMessages=sourceMessages.splice(0);expect(feedMessages).toHaveLength(count);
  await drain('feed',feedMessages);
  const polls=sourceMessages.splice(0);expect(polls).toHaveLength(count);
  await drain('poll',polls);
  // A shared cache miss may defer a concurrent consumer. Keep its durable job
  // and original backoff, then dispatch eligible retries through the same path.
  for(let round=0;round<8;round++){
   const pending=await ctx.db.prepare("SELECT json_extract(request,'$.scope.feedId') AS feedId,due_at FROM connector_rss_poll_jobs WHERE state='PENDING' ORDER BY due_at").all<{feedId:string;due_at:string}>();
   if(!pending.results.length)break;
   const wait=Math.max(0,Date.parse(pending.results[0].due_at)-Date.now());if(wait>60_000)throw Error('UNEXPECTED_LOAD_BACKOFF');
   if(performance.now()+wait>=deadline)throw Error('COLLECTION_DRAIN_DEADLINE');
   if(wait)await new Promise(resolve=>setTimeout(resolve,wait+20));
   for(const row of pending.results)await dispatchConnectorPolls(env,row.feedId);
   await drain('retry-'+round,sourceMessages.splice(0));
  }
  const jobs=await ctx.db.prepare('SELECT state,COUNT(*) AS n FROM connector_rss_poll_jobs GROUP BY state').all();
  expect(jobs.results).toEqual([{state:'DONE',n:count}]);
  const receipts=await ctx.db.prepare('SELECT COUNT(DISTINCT feed_id) AS feeds FROM connector_batches WHERE receipts IS NOT NULL').first();
  expect(receipts).toEqual({feeds:count});
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_checkpoints').first()).toEqual({n:count});
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_operations').first()).toEqual({n:0});
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_candidates').first()).toEqual({n:count*articles});
  expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_jobs WHERE json_extract(json,'$.kind')='ACQUIRE'").first()).toEqual({n:count*articles});
  // Expiry may legitimately refresh during a long load. Reuse must still avoid
  // one upstream fetch per feed; freshness is not extended to force a pass.
  expect(upstreamCalls).toBeLessThanOrEqual(Math.ceil((performance.now()-start)/60_000)+1);
  await drain('duplicate',polls);expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_batches').first()).toEqual({n:count});
  const bytesAfter=(await ctx.db.prepare('SELECT 1 AS storage_probe').run()).meta.size_after;
  expect(Number.isFinite(bytesBefore)&&Number.isFinite(bytesAfter)).toBe(true);
  const storage={d1BytesBefore:bytesBefore,d1BytesAfter:bytesAfter,d1GrowthBytes:bytesAfter-bytesBefore,coldBytesPerFeed:Math.round((bytesAfter-bytesBefore)/count),r2Objects:objects.size,r2Bytes:[...objects.values()].reduce((n,b)=>n+b.byteLength,0)};
  console.info(JSON.stringify({load:'source-collection-complete',feeds:count,articlesPerSnapshot:articles,queueConcurrency:8,upstreamCalls,independentReceipts:count,independentCheckpoints:count,independentCandidates:count*articles,paidCalls:0,downstreamMessages,durationMs:Math.round(performance.now()-start),phaseTimes,storage}));
 }catch(error){
  // Leave a usable capacity diagnostic even when the acceptance deadline fails.
  // Drain workers finish before this snapshot; cleanup does not race live RPCs.
  const [states,receipts,size]=await ctx.db.batch([
   ctx.db.prepare('SELECT state,COUNT(*) AS n FROM connector_rss_poll_jobs GROUP BY state'),
   ctx.db.prepare('SELECT COUNT(DISTINCT feed_id) AS feeds FROM connector_batches WHERE receipts IS NOT NULL'),
   ctx.db.prepare('SELECT 1 AS storage_probe')
  ]);
  console.info(JSON.stringify({load:'source-collection-incomplete',feeds:count,phase:activePhase,durationMs:Math.round(performance.now()-start),phaseTimes,jobs:states.results,receipts:receipts.results,d1Bytes:size.meta.size_after,r2Objects:objects.size,database:Object.fromEntries(queryProfile)}));
  throw error;
 }finally{fetch.mockRestore();await ctx.dispose();}
},600_000);
