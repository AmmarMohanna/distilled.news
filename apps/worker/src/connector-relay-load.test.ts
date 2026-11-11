import {expect,it,vi} from 'vitest';
import {relayConnectorDownstream} from './connector-scheduling';
import type {Env} from './types';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {enrollV1Source} from './v1-intelligence/product';
import {windowIdentity} from './v1-intelligence/runtime';
import {livePublicationWindow} from './v1-intelligence/schedule';

it('observes new boundaries and cheaply revisits settled windows on aged feeds',async()=>{
 const count=Number(process.env.CONNECTOR_RELAY_LOAD_FEEDS??2);
 if(!Number.isSafeInteger(count)||count<1||count>100)throw Error('INVALID_RELAY_LOAD_FEEDS');
 const {db,dispose}=await createIntakeDatabase({product:true});
 const now=new Date(),created=new Date(now.getTime()-365*86400000).toISOString();
 const deliveryAnchor=String((now.getUTCHours()+22)%24).padStart(2,'0')+':00';
 const end=livePublicationWindow({durationMinutes:1440,timezone:'UTC',deliveryAnchor},now).end;
 const ids=Array.from({length:count},(_,i)=>`relay-${i}`);
 const send=vi.fn(async()=>{});
 const upstream=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('UNEXPECTED_UPSTREAM_REQUEST');});
 const newMetrics=()=>({calls:0,rowsRead:0,rowsWritten:0,observationRows:0,recoveryScans:0});
 let metrics=newMetrics();
 function record(result:D1Result,sql=''){
  metrics.rowsRead+=result.meta.rows_read;
  metrics.rowsWritten+=result.meta.rows_written;
  if(sql.includes("kind='schedule_observations'")&&!sql.includes('UNION ALL'))metrics.observationRows+=result.meta.rows_read;
  if(sql.includes('FROM v1_model_spending_reservations r'))metrics.recoveryScans++;
 }
 function instrument(statement:D1PreparedStatement,sql:string,args:unknown[]=[]):D1PreparedStatement{
  return new Proxy(statement,{get(target,key){
   if(key==='bind')return (...values:unknown[])=>instrument(target.bind(...values),sql,values);
   if(key==='first'||key==='all'||key==='run')return async(column?:string)=>{
    metrics.calls++;
    const result=key==='run'?await target.run():await target.all<Record<string,unknown>>();
    const tagged=sql.includes('ORDER BY id')&&args.includes('schedule_observations')?"kind='schedule_observations'":sql;
    record(result,tagged);
    if(key!=='first')return result;
    const row=result.results[0] as Record<string,unknown>|undefined;
    return column?row?.[column]??null:row??null;
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
 }
 const measured=new Proxy(db,{get(target,key){
  if(key==='prepare')return (sql:string)=>instrument(target.prepare(sql),sql);
  if(key==='batch')return async (statements:D1PreparedStatement[])=>{
   metrics.calls++;
   const results=await target.batch(statements);
   for(const result of results)record(result);
   return results;
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const runWave=async (phase:string)=>{
  metrics=newMetrics();
  const started=performance.now();
  for(let start=0;start<ids.length;start+=8)await Promise.all(ids.slice(start,start+8).map(feedId=>relayConnectorDownstream({
   DB:measured,PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',
   SOURCE_QUEUE_SCHEDULING_ENABLED:'true',BRIEFING_ENGINE:'v3',V3_BACKLOG_CATCHUP_ENABLED:'true',
   V1_DOWNSTREAM_FEED_SOURCE_IDS:feedId+'-rss',PROCESSING_QUEUE:{send},
   OPENROUTER_API_KEY:'local-fixture-only'
  } as unknown as Env,feedId)));
  console.info(JSON.stringify({load:'connector-relay',phase,feeds:count,...metrics,durationMs:Math.round(performance.now()-started)}));
  return metrics;
 };
 try{
  await db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('relay-owner','relay@example.invalid','relay@example.invalid','relay-owner','user','unused',?,?,?)").bind(created,created,created).run();
  await db.prepare(`INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,briefing_cadence,briefing_timezone,briefing_time_of_day,created_at,updated_at)
   SELECT value,'relay-owner',value,'Relay load','News','daily','UTC',?,?,? FROM json_each(?)`).bind(deliveryAnchor,created,created,JSON.stringify(ids)).run();
  await db.prepare(`INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at)
   SELECT id||'-rss',id,'RSS','channel','rss','rss_feed','https://example.com/feed.xml',1,'connector',?,?,? FROM briefings`).bind(created,created,created).run();
  for(let start=0;start<ids.length;start+=8)await Promise.all(ids.slice(start,start+8).map(async id=>{
   const {feed}=await enrollV1Source(db,id+'-rss','relay-owner',created);
   const window=livePublicationWindow(feed.briefingSchedule!,now);
   const requestId=await windowIdentity(id,window);
   await db.prepare("INSERT INTO v1_feed_documents VALUES('briefing_requests',?,?,?)").bind(requestId,id,JSON.stringify({
    id:requestId,feedId:id,window,state:'DONE',result:'QUIET',attempts:0,engine:'v3',createdAt:window.end
   })).run();
  }));
  await db.prepare(`WITH RECURSIVE history(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM history WHERE n<200)
   INSERT INTO v1_feed_documents(kind,id,feed_id,json)
   SELECT 'schedule_observations',f.id||':observation:'||n,f.id,
    json_object('id',f.id||':observation:'||n,'feedId',f.id,'feedRevision',1,
     'window',json_object('end',strftime('%Y-%m-%dT%H:%M:%fZ',?,'-'||(n+2)||' days')))
   FROM v1_feeds f CROSS JOIN history`).bind(end).run();
  const observed=await runWave('new-observation');
  const settled=await runWave('settled-window');
  expect(observed.observationRows).toBeGreaterThanOrEqual(count);
  expect(observed.observationRows).toBeLessThanOrEqual(count*2);
  expect(observed.recoveryScans+settled.recoveryScans).toBe(0);
  expect(settled.rowsWritten).toBe(0);
  expect(settled.calls).toBeLessThanOrEqual(count*15);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM v1_feed_documents WHERE kind='schedule_observations'").first()).toEqual({n:count*201});
  const gaps=await db.prepare(`SELECT json_extract(json,'$.missingExpectedBoundaries') AS missing,
   json_extract(json,'$.gapScanTruncated') AS truncated FROM v1_feed_documents
   WHERE kind='schedule_observations' AND json_extract(json,'$.window.end')=?`).bind(end).all<{missing:string;truncated:number}>();
  const expectedGaps=[1,2].map(days=>new Date(Date.parse(end)-days*86400000).toISOString());
  expect(gaps.results).toHaveLength(count);
  for(const row of gaps.results){
   expect(row.truncated).toBe(0);
   expect(JSON.parse(row.missing).map((window:{end:string})=>window.end)).toEqual(expectedGaps);
  }
  expect(await db.prepare("SELECT COUNT(*) AS n FROM v1_feed_documents WHERE kind='briefing_requests' AND json_extract(json,'$.state')='DONE'").first()).toEqual({n:count});
  expect(send).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
 }finally{upstream.mockRestore();await dispose();}
},300_000);
