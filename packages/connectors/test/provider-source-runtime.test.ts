import { describe,it,expect,vi,afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { receiptFixture,sha256, type CandidateIntakePort } from '@distilled/contracts';
import { SOURCE_STORAGE_SCHEMA,R2SourcePayloadStore,type SqlDatabase,type SqlStatement,type ObjectBucket } from '../src/source-runtime/storage';
import { PROVIDER_SOURCE_SCHEMA,D1ProviderSourceRepository } from '../src/source-runtime/provider-storage';
import { FallbackSourceCollector } from '../src/source-runtime/provider-collector';
import { DurableProviderHttp,PROVIDER_BUDGET_SCHEMA,collectorBudgetDay } from '../src/source-runtime/provider-http';
import { DEFAULT_SOURCE_ORDER,SourceProviderError,type SourceProvider,type SourceFetchRequest,type ProviderPage } from '../src/source-runtime/provider-types';
import { FeedSourceProvider,TelegramSourceProvider } from '../src/source-runtime/platform-providers';
import { TwitterApiIoProvider,ApifySourceProvider } from '../src/source-runtime/social-providers';
import { WebsiteSourceProvider } from '../src/source-runtime/website-providers';
import { D1ProviderPollScheduler,PROVIDER_POLL_SCHEMA } from '../src/source-runtime/provider-scheduler';
import { normalizeProviderRecords } from '../src/source-runtime/provider-normalize';
import type { FeedHttpPort, FeedResponse } from '../src/source-runtime/ports';
import {SourceHandoffWait} from '../src/source-runtime/handoff-wait';

const databases:DatabaseSync[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
class Binding implements SqlDatabase {
  db=new DatabaseSync(':memory:');
  constructor(){databases.push(this.db);this.db.exec(SOURCE_STORAGE_SCHEMA+PROVIDER_SOURCE_SCHEMA+PROVIDER_BUDGET_SCHEMA+PROVIDER_POLL_SCHEMA);}
  prepare(sql:string):SqlStatement{let args:any[]=[];const statement:SqlStatement={bind:(...v)=>{args=v;return statement;},first:async<T>()=>(this.db.prepare(sql).get(...args)??null) as T|null,run:async()=>this.db.prepare(sql).run(...args)};return statement;}
  async batch(statements:SqlStatement[]){this.db.exec('BEGIN');try{for(const s of statements)await s.run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
const scope={feedId:'feed',feedSourceId:'feed-source',sourceId:'source'};
const time='2026-10-04T10:00:00.000Z';
const request:SourceFetchRequest={scope,runId:'run',source:{family:'x_profile',locator:'NASA'},requestedBounds:{},limit:2};
const run={...scope,id:'run',sequence:1,startedAt:time,configurationKey:'configuration'};
const encoder=new TextEncoder();
it('retains Google actor guid and googleNewsUrl while preserving the original publisher identity',()=>{
 const records=normalizeProviderRecords([{guid:'google-guid',googleNewsUrl:'https://news.google.com/rss/articles/article-id?oc=5',sourceUrl:'https://publisher.example',sourceDomain:'publisher.example',title:'A lunar mission launches',snippet:'A spacecraft is travelling to the Moon.',publishedAt:'2026-10-21T12:00:00Z'}],'google_news');
 expect(records).toHaveLength(1);expect(records[0]).toMatchObject({upstreamId:'google-guid',url:'https://news.google.com/rss/articles/article-id?oc=5',publisherId:'publisher.example',identityValid:true,representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN'});
});
it('calls the native fetch capability without binding it to a provider class instance',async()=>{
 const s=setup([]);let receiver:unknown='not called';
 const dispatch=function(this:unknown){receiver=this;return Promise.resolve(Response.json({ok:true}))};
 const http=new DurableProviderHttp(s.db,s.payloads,dispatch);await http.configureLimit('x_apify',1);
 await http.request(scope,'native-dispatch','x_apify',.05,'https://api.apify.com/v2/test',{});
 expect(receiver).toBeUndefined();
});
it('shares one daily allowance across providers, rolls over at Beirut midnight, and preserves old request receipts',async()=>{
 const s=setup([]),dispatch=vi.fn(async()=>Response.json({ok:true}));let now=new Date('2026-10-21T20:59:00Z');
 const http=new DurableProviderHttp(s.db,s.payloads,dispatch,4000000,20000,undefined,{x_apify:5,linkedin_apify:5},{limitUsd:5,timeZone:'Asia/Beirut',now:()=>now});
 await http.configureLimits({x_apify:5,linkedin_apify:5});
 const url='https://api.apify.com/v2/test';
 await http.request(scope,'x-1','x_apify',3,url,{});
 await expect(http.request({...scope,feedSourceId:'linkedin'},'linkedin-1','linkedin_apify',3,url,{})).rejects.toThrow('BUDGET_EXCEEDED');
 expect(dispatch).toHaveBeenCalledTimes(1);
 now=new Date('2026-10-21T21:01:00Z');
 expect(collectorBudgetDay(now,'Asia/Beirut')).toBe('2026-10-22');
 await http.request({...scope,feedSourceId:'linkedin'},'linkedin-2','linkedin_apify',3,url,{});
 await http.request(scope,'x-1','x_apify',3,url,{});
 expect(dispatch).toHaveBeenCalledTimes(2);
 expect(s.db.db.prepare('SELECT day,reserved_usd FROM connector_daily_provider_budgets ORDER BY day').all()).toEqual([{day:'2026-10-21',reserved_usd:3},{day:'2026-10-22',reserved_usd:3}]);
});
it('holds uncertain submissions against the daily limit and never rebills them after midnight',async()=>{
 const s=setup([]),dispatch=vi.fn(async()=>{throw Error('lost response')});let now=new Date('2026-10-21T12:00:00Z');
 const http=new DurableProviderHttp(s.db,s.payloads,dispatch,1000,1000,undefined,undefined,{limitUsd:5,timeZone:'Asia/Beirut',now:()=>now});
 await http.configureLimit('x_apify',5);
 await expect(http.request(scope,'unknown','x_apify',3,'https://api.apify.com/v2/test',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
 now=new Date('2026-10-22T12:00:00Z');
 await expect(http.request(scope,'unknown','x_apify',3,'https://api.apify.com/v2/test',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
 await expect(http.request(scope,'different-run','x_apify',1,'https://api.apify.com/v2/test',{})).rejects.toThrow('BACKPRESSURE');
 expect(dispatch).toHaveBeenCalledTimes(1);
});
function setup(providers:SourceProvider[]){
  const db=new Binding(),repository=new D1ProviderSourceRepository(db);
  const objects=new Map<string,Uint8Array>();
  const bucket:ObjectBucket={put:async(k,b)=>{if(!objects.has(k))objects.set(k,b);},get:async k=>{const v=objects.get(k);return v?{arrayBuffer:async()=>v.slice().buffer}:null;}};
  const payloads=new R2SourcePayloadStore(bucket);
  const intake:CandidateIntakePort={acceptBatch:vi.fn(async b=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:b.observations.map(receiptFixture)}))};
  const collector=new FallbackSourceCollector(repository,payloads,intake,providers,()=>time);
  return {db,repository,payloads,intake,collector};
}
const page=(ids=['1']):ProviderPage=>({items:ids.map(id=>({sourceItemKey:'x:'+id,upstreamId:id,body:'Post '+id,url:'https://x.com/i/status/'+id,
  representation:'SOCIAL_POST',contentCompleteness:'UNKNOWN',identityValid:true})),raw:encoder.encode('raw response'),requests:1,latencyMs:10,providerCostUsd:0});
function provider(id:string,fetch=vi.fn(async()=>page())):SourceProvider{return {id,families:['x_profile','x_search'],fetch};}
const feed=(xml:string):FeedHttpPort=>({get:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))});

describe('fallback policy and durable handoff',()=>{
  it.each(['HTTP_NOT_FOUND','UPSTREAM_AUTHENTICATION','UPSTREAM_RATE_LIMIT'])('does not spend fallback capacity around publisher refusal %s',async detail=>{
    const primary:SourceProvider={id:'website_http',families:['website'],fetch:vi.fn(async()=>{throw new SourceProviderError(detail==='UPSTREAM_RATE_LIMIT'?'RATE_LIMIT':detail==='UPSTREAM_AUTHENTICATION'?'AUTH_REQUIRED':'UNAVAILABLE',undefined,{detail})})};
    const fallback:SourceProvider={id:'website_playwright',families:['website'],fetch:vi.fn(async()=>page())};
    const s=setup([primary,fallback]);
    const result=await s.collector.collect({...request,source:{family:'website',locator:'https://publisher.example/article'}},['website_http','website_playwright']);
    expect(result.state).toBe('FETCH_FAILED');expect(fallback.fetch).not.toHaveBeenCalled();
  });
  it('retires unbounded X without fetching an uncaptured historical page',async()=>{
    const p=provider('x_twitterapi_io'),s=setup([p]);
    const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(time),100,false,true);
    await scheduler.schedule('old',request,time,['x_twitterapi_io']);
    expect(await scheduler.runOne(120000,'old')).toBe('BLOCKED');expect(p.fetch).not.toHaveBeenCalled();
    expect(s.db.db.prepare("SELECT last_error FROM connector_provider_poll_jobs WHERE job_id='old'").get()).toEqual({last_error:'UNBOUNDED_SCOPE_RETIRED'});
  });
  it('a started legacy run without a saved page stays blocked for recovery without a paid fallback',async()=>{
    const p=provider('x_twitterapi_io'),s=setup([p]);
    await s.repository.allocate(scope,await sha256(JSON.stringify([scope,request.runId,p.id])),'original-config',time);
    const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(time),100,false,true);
    await scheduler.schedule('started',request,time,[p.id]);expect(await scheduler.runOne(120000,'started')).toBe('BLOCKED');expect(p.fetch).not.toHaveBeenCalled();
    expect(s.db.db.prepare("SELECT last_error FROM connector_provider_poll_jobs WHERE job_id='started'").get()).toEqual({last_error:'UNBOUNDED_RECOVERY_REQUIRED'});
  });
  it('drains every captured slice before retiring unbounded X and preserves paid reservations',async()=>{
    const p=provider('x_twitterapi_io',vi.fn(async()=>({...page(['1','2','3']),continuationToken:'older'}))),s=setup([p]);let at=Date.parse(time),wait=true;
    const accept=s.intake.acceptBatch;s.intake.acceptBatch=async b=>{if(wait)throw new SourceHandoffWait();return accept(b)};
    const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>at,100,false,true);
    await scheduler.schedule('captured',request,time,['x_twitterapi_io']);
    // Capture using the pre-transition runner, with handoff temporarily busy.
    const old=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>at);
    expect(await old.runOne(120000,'captured')).toBe('RETRY');expect(p.fetch).toHaveBeenCalledTimes(1);
    s.db.db.prepare("INSERT INTO connector_provider_budgets VALUES('x_twitterapi_io',15,0.02)").run();
    wait=false;at+=6000;expect(await scheduler.runOne(120000,'captured')).toBe('RETRY');
    expect(await scheduler.runOne(120000,'captured')).toBe('BLOCKED');expect(p.fetch).toHaveBeenCalledTimes(1);
    const row=s.db.db.prepare("SELECT request,result,last_error FROM connector_provider_poll_jobs WHERE job_id='captured'").get() as any;
    expect(JSON.parse(row.request)).toEqual(request);expect(row.last_error).toBe('UNBOUNDED_SCOPE_RETIRED');expect(JSON.parse(row.result).request.coverage.status).toBe('PARTIAL');
    expect(s.db.db.prepare("SELECT reserved_usd FROM connector_provider_budgets").get()).toEqual({reserved_usd:0.02});
  });
  it('intake admission waits preserve the captured provider page and failure allowance',async()=>{
    const adapter=provider('x_twitterapi_io'),s=setup([adapter]);let at=Date.parse(time),wait=true;
    const accept=s.intake.acceptBatch;s.intake.acceptBatch=vi.fn(async b=>{if(wait)throw new SourceHandoffWait();return accept(b)});
    const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>at);
    await scheduler.schedule('wait',request,time,['x_twitterapi_io']);
    for(let i=0;i<12;i++){expect(await scheduler.runOne(120000,'wait')).toBe('RETRY');at+=6000;}
    expect(s.db.db.prepare("SELECT attempts,last_error,pages FROM connector_provider_poll_jobs WHERE job_id='wait'").get()).toEqual({attempts:0,last_error:'INTAKE_BUSY',pages:0});
    expect(adapter.fetch).toHaveBeenCalledTimes(1);wait=false;
    expect(await scheduler.runOne(120000,'wait')).toBe('DONE');expect(adapter.fetch).toHaveBeenCalledTimes(1);
  });
  it('separates provider retry exhaustion from page exhaustion and retains the failure cause',async()=>{
    const s=setup([]);let at=Date.parse(time);const result={state:'FETCH_FAILED',attempts:[{failure:'RATE_LIMIT'}]};
    const scheduler=new D1ProviderPollScheduler(s.db,{collect:async()=>result} as any,async()=>true,()=>at);
    await scheduler.schedule('limited',request,time,['x_twitterapi_io']);
    for(let i=0;i<8;i++){expect(await scheduler.runOne(120000,'limited')).toBe('RETRY');at+=600000;}
    expect(await scheduler.runOne(120000,'limited')).toBe('BLOCKED');
    const row=s.db.db.prepare("SELECT last_error,result FROM connector_provider_poll_jobs WHERE job_id='limited'").get() as any;
    expect(row.last_error).toBe('RETRY_LIMIT:RATE_LIMIT');expect(JSON.parse(row.result)).toEqual(result);
    await scheduler.schedule('pages',{...request,runId:'pages'},new Date(at).toISOString(),['x_twitterapi_io']);
    s.db.db.prepare("UPDATE connector_provider_poll_jobs SET pages=100 WHERE job_id='pages'").run();
    expect(await scheduler.runOne(120000,'pages')).toBe('BLOCKED');
    expect(s.db.db.prepare("SELECT last_error FROM connector_provider_poll_jobs WHERE job_id='pages'").get()).toEqual({last_error:'PAGE_LIMIT'});
  });
  it.each([false,true])('a proven Apify read recovery resumes its saved continuation with missing failure journal=%s',async(missingJournal)=>{
    let calls=0;const adapter=provider('x_apify',vi.fn(async()=>{if(++calls===1)throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');return page();}));
    const s=setup([adapter]),r={...request,continuation:{providerId:'x_apify',token:'saved-actor-continuation'}};
    await expect(s.collector.collect(r,['x_apify'])).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
    await expect(s.collector.collect(r,['x_apify'])).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');expect(calls).toBe(1);
    const runId=await sha256(JSON.stringify([scope,r.runId,'x_apify']));
    if(missingJournal){
      s.db.db.prepare('DELETE FROM connector_provider_attempts WHERE run_id=?').run(runId);
      await expect(s.collector.collect(r,['x_apify'])).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');expect(calls).toBe(1);
    }
    s.db.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,payload_ref,feed_id,feed_source_id) VALUES('x_apify','confirmed-read','hash',0.000001,200,'verified-payload',?,?)").run(scope.feedId,scope.feedSourceId);
    s.db.db.prepare("INSERT INTO connector_provider_read_recoveries(feed_id,feed_source_id,source_id,run_id,provider_id,operation_id,state,token,lease_until,payload_ref) VALUES(?,?,?,?, 'x_apify','confirmed-read','RESOLVED','proof',0,'verified-payload')").run(scope.feedId,scope.feedSourceId,scope.sourceId,runId);
    expect((await s.collector.collect(r,['x_apify'])).state).toBe('HANDED_OFF');expect(calls).toBe(2);
    await s.collector.collect(r,['x_apify']);expect(calls).toBe(2);
  });
  it('coalesces collection cadence while keeping authoritative rechecks and new revisions eligible',async()=>{
    const s=setup([]),scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(time),100,true);
    const tg={...request,source:{family:'telegram' as const,locator:'test',channelId:'-123'}};
    await scheduler.schedule('first',tg,time);
    await scheduler.schedule('next',{...tg,runId:'next'},time);
    await scheduler.schedule('recheck',{...tg,runId:'recheck',recheckItemKeys:['telegram:-123:1']},time);
    await scheduler.schedule('later-recheck',{...tg,runId:'later-recheck',recheckItemKeys:['telegram:-123:2']},time);
    expect(s.db.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_poll_jobs').get()).toEqual({n:2});
    await expect(scheduler.schedule('first',{...tg,limit:1},time)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    await scheduler.schedule('reconfigured',{...tg,configurationRevision:2,runId:'reconfigured'},time);
    expect(s.db.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_poll_jobs').get()).toEqual({n:3});
  });
  it('serializes a shared source checkpoint while unrelated sources keep running',async()=>{
    const s=setup([]);let release!:(v:any)=>void;
    const collect=vi.fn((r:SourceFetchRequest)=>r.runId==='held'?new Promise<any>(resolve=>{release=resolve}):Promise.resolve({state:'HANDED_OFF',checkpoint:'UNCHANGED'}));
    const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true,()=>Date.parse(time));
    await scheduler.schedule('a',{...request,runId:'held'},time);
    await scheduler.schedule('b',{...request,runId:'next'},time);
    await scheduler.schedule('c',{...request,runId:'other',scope:{...scope,feedSourceId:'other'}},time);
    const running=scheduler.runOne(300000,'a');await vi.waitFor(()=>expect(collect).toHaveBeenCalledTimes(1));
    expect(await scheduler.runOne(300000,'b')).toBe('IDLE');
    expect(await scheduler.runOne(300000,'c')).toBe('DONE');
    expect(s.db.db.prepare("SELECT attempts FROM connector_provider_poll_jobs WHERE job_id='b'").get()).toEqual({attempts:0});
    release({state:'HANDED_OFF',checkpoint:'UNCHANGED'});expect(await running).toBe('DONE');
    expect(await scheduler.runOne(300000,'b')).toBe('DONE');
  });
  it('protects the single Telegram session across feeds without blocking other provider families',async()=>{
    const s=setup([]);let release!:(v:any)=>void;
    const collect=vi.fn((r:SourceFetchRequest)=>r.runId==='held'?new Promise<any>(resolve=>{release=resolve}):Promise.resolve({state:'HANDED_OFF',checkpoint:'UNCHANGED'}));
    const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true,()=>Date.parse(time));
    const tg={...request,source:{family:'telegram' as const,locator:'test'},runId:'held'};
    await scheduler.schedule('a',tg,time);
    await scheduler.schedule('b',{...tg,runId:'next',scope:{feedId:'other',feedSourceId:'other',sourceId:'other'}},time);
    await scheduler.schedule('c',{...request,scope:{...scope,feedSourceId:'x'},runId:'x'},time);
    const running=scheduler.runOne(300000,'a');await vi.waitFor(()=>expect(collect).toHaveBeenCalledTimes(1));
    expect(await scheduler.runOne(300000,'b')).toBe('IDLE');expect(await scheduler.runOne(300000,'c')).toBe('DONE');
    release({state:'HANDED_OFF',checkpoint:'UNCHANGED'});expect(await running).toBe('DONE');
    expect(await scheduler.runOne(300000,'b')).toBe('DONE');
  });
  it('runtime initialization cannot replenish a revoked grant and new paid work requires both grants',async()=>{
    const s=setup([]);let calls=0;
    const make=(grant:number)=>new DurableProviderHttp(s.db,s.payloads,async()=>{calls++;return Response.json({ok:true})},4000000,20000,15,{x_twitterapi_io:grant});
    const http=make(10);await http.configureLimits({x_twitterapi_io:10},true);
    await http.request(scope,'first','x_twitterapi_io',1,'https://api.twitterapi.io/test',{});
    await http.configureLimit('x_twitterapi_io',0); // Explicit operator revocation.
    await http.configureLimits({x_twitterapi_io:10},true);
    await expect(http.request(scope,'revoked','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BUDGET_EXCEEDED');
    expect(s.db.db.prepare("SELECT limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").get()).toEqual({limit_usd:0,reserved_usd:1});
    await http.request(scope,'first','x_twitterapi_io',1,'https://api.twitterapi.io/test',{});expect(calls).toBe(1);
    await http.configureLimit('x_twitterapi_io',100);
    await expect(make(0).request(scope,'deployment-revoked','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BUDGET_EXCEEDED');
    await expect(make(1).request(scope,'deployment-exhausted','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BUDGET_EXCEEDED');
    expect(calls).toBe(1);
  });
  it('carries legacy completed reservations forward and blocks unattributed uncertain charges',async()=>{
    const s=setup([]);let calls=0;
    const old=new DurableProviderHttp(s.db,s.payloads,async()=>{calls++;return Response.json({ok:true})});
    await old.configureLimit('x_twitterapi_io',100);
    await old.request(scope,'legacy','x_twitterapi_io',14,'https://api.twitterapi.io/test',{});
    s.db.db.prepare('UPDATE connector_provider_operations SET feed_id=NULL,feed_source_id=NULL').run();
    const next=new DurableProviderHttp(s.db,s.payloads,async()=>{calls++;return Response.json({ok:true})},4000000,20000,15);
    await next.request(scope,'remaining','x_twitterapi_io',1,'https://api.twitterapi.io/test',{});
    await expect(next.request(scope,'exhausted','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BUDGET_EXCEEDED');
    expect(calls).toBe(2);
    s.db.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status) VALUES('x_twitterapi_io','legacy-uncertain','hash',1,-1)").run();
    await expect(next.request({...scope,feedSourceId:'other'},'unknown','x_twitterapi_io',1,'https://api.twitterapi.io/test',{})).rejects.toThrow('BACKPRESSURE');
    expect(calls).toBe(2);
  });
  it('helper backpressure resumes the original paid operation without charging again or invoking fallback',async()=>{
    const s=setup([]);let paidCalls=0,helperCalls=0;
    const paid=new DurableProviderHttp(s.db,s.payloads,async()=>{paidCalls++;return Response.json({ok:true})},4000000,20000,15);
    await paid.configureLimit('x_twitterapi_io',15);
    const primary=provider('x_twitterapi_io',vi.fn(async()=>{
      await paid.request(scope,'stable-paid-op','x_twitterapi_io',1,'https://api.twitterapi.io/test',{});
      if(++helperCalls===1)throw new SourceProviderError('BACKPRESSURE');
      return page();
    }));
    const fallback=provider('x_apify');
    const collector=new FallbackSourceCollector(s.repository,s.payloads,s.intake,[primary,fallback],()=>time);
    await expect(collector.collect(request,['x_twitterapi_io','x_apify'])).rejects.toThrow('BACKPRESSURE');
    expect((await collector.collect(request,['x_twitterapi_io','x_apify'])).state).toBe('HANDED_OFF');
    expect(paidCalls).toBe(1);expect(helperCalls).toBe(2);expect(fallback.fetch).not.toHaveBeenCalled();
    expect(s.db.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").get()).toEqual({reserved_usd:1});
  });
  it('renews a long collection lease so another runner cannot claim the same paid window',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(time));
    let release!:(value:any)=>void,entered!:(value?:unknown)=>void;
    const started=new Promise(resolve=>{entered=resolve;});
    const s=setup([]),collect=vi.fn(async()=>{entered();return await new Promise(resolve=>{release=resolve;});});
    const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true);
    try{
      await scheduler.schedule('slow',request,time);
      const running=scheduler.runOne(3000);await started;
      await vi.advanceTimersByTimeAsync(5000);
      expect(await scheduler.runOne(3000)).toBe('IDLE');
      release({state:'HANDED_OFF',checkpoint:'UNCHANGED'});
      expect(await running).toBe('DONE');expect(collect).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }finally{vi.useRealTimers();}
  });
  it('refuses to commit a completed collection after its lease ownership was replaced',async()=>{
    const s=setup([]);
    const collect=vi.fn(async()=>{
      s.db.db.prepare("UPDATE connector_provider_poll_jobs SET lease_version=lease_version+1 WHERE job_id='lost'").run();
      return {state:'HANDED_OFF',checkpoint:'UNCHANGED'};
    });
    const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true,()=>Date.parse(time));
    await scheduler.schedule('lost',request,time);
    expect(await scheduler.runOne()).toBe('LEASE_LOST');
    expect(s.db.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='lost'").get()).toMatchObject({state:'PENDING'});
  });
  it('prioritizes an explicitly preferred due job without bypassing due times or repeating completed jobs',async()=>{
    const s=setup([]),calls:string[]=[];let pages=0;
    const collect=vi.fn(async(r:SourceFetchRequest)=>{calls.push(r.runId);return {state:'HANDED_OFF',checkpoint:'UNCHANGED',...(r.runId==='manual'&&pages++===0?{nextOffset:20}:{})}});
    const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true,()=>Date.parse(time));
    await scheduler.schedule('old',{...request,runId:'old'},new Date(Date.parse(time)-60000).toISOString());
    await scheduler.schedule('manual',{...request,runId:'manual'},time);
    await scheduler.schedule('future',{...request,runId:'future'},new Date(Date.parse(time)+60000).toISOString());
    expect(await scheduler.runOne(undefined,['manual','future'])).toBe('RETRY');
    expect(await scheduler.runOne(undefined,['manual','future'])).toBe('DONE');
    expect(await scheduler.runOne(undefined,['manual','future'])).toBe('DONE');
    expect(await scheduler.runOne(undefined,['manual','future'])).toBe('IDLE');
    expect(calls).toEqual(['manual','manual','old']);
  });
  it('drains independently scheduled jobs without repeating completed work',async()=>{
    const s=setup([provider('primary')]),now=()=>Date.parse(time);
    const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,now);
    for(let i=0;i<6;i++)await scheduler.schedule('job'+i,{...request,runId:'run'+i},time,['primary']);
    for(let i=0;i<6;i++)expect(await scheduler.runOne()).toBe('DONE');
    expect(await scheduler.runOne()).toBe('IDLE');
    expect(s.db.db.prepare("SELECT COUNT(*) AS n FROM connector_provider_poll_jobs WHERE state='PENDING'").get()).toMatchObject({n:0});
  });
  it('hands off a newly resolved publisher link even when the listing content is unchanged',async()=>{
    let resolved=false;
    const p:SourceProvider={id:'google_rss',families:['google_news'],fetch:async()=>({...page(),items:[{...page().items[0],sourceItemKey:'id:google-guid',url:resolved?'https://publisher.example/article':'https://news.google.com/rss/articles/opaque',publisherId:resolved?'publisher.example':'news.google.com',representation:'LISTING_RESULT'}]})};
    const s=setup([p]);const input={...request,source:{family:'google_news' as const,locator:'energy'}};
    await s.collector.collect(input);resolved=true;
    const second=await s.collector.collect({...input,runId:'resolved-window'});
    expect(second.state==='HANDED_OFF'&&second.request.proposals[0].url).toBe('https://publisher.example/article');
    const third=await s.collector.collect({...input,runId:'unchanged-window'});
    expect(third.state==='HANDED_OFF'&&third.request.observations).toEqual([]);
  });
  it.each(['x_profile','x_search'] as const)('automatically falls back from a failed %s primary to one durable Apify run',async family=>{
    const s=setup([]);let starts=0;
    const dispatch=vi.fn(async(url:string)=>{
      if(url.includes('api.twitterapi.io'))return Response.json({error:'unavailable'},{status:503});
      if(url.includes('/actors/')){starts++;return Response.json({data:{id:'actorRun'}});}
      if(url.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'dataset'}});
      return Response.json([{id:'99',text:'Real-shaped fallback post',author:{id:'123'}}]);
    });
    const http=new DurableProviderHttp(s.db,s.payloads,dispatch);
    await http.configureLimit('x_twitterapi_io',1);await http.configureLimit('x_apify',1);
    const collector=new FallbackSourceCollector(s.repository,s.payloads,s.intake,[new TwitterApiIoProvider(http,async()=> 'private-key',0.05),new ApifySourceProvider('x_apify',[family],http,async()=> 'private-token',0.1)],()=>time);
    const input={...request,source:{family,locator:family==='x_profile'?'NASA':'from:NASA'}};
    const first=await collector.collect(input);
    expect(first.state).toBe('HANDED_OFF');
    if(first.state!=='HANDED_OFF')throw Error('NO_HANDOFF');
    expect(first.providerId).toBe('x_apify');expect(first.attempts[0].failure).toBe('TRANSIENT');
    const next={...input,runId:'resumed',continuation:first.continuation};
    const result=await collector.collect(next);
    expect(result.state==='HANDED_OFF'&&result.request.observations[0].sourceItemKey).toBe('x:99');
    const calls=dispatch.mock.calls.length;
    await collector.collect(next);
    expect(starts).toBe(1);expect(dispatch).toHaveBeenCalledTimes(calls);
  });

  it.each(['linkedin_company','linkedin_profile'] as const)('collects new %s posts across overlapping windows without duplicating old posts',async family=>{
    const s=setup([]);let actor=0;
    const post=(id:string)=>({urn:`urn:li:activity:${id}`,text:'Post '+id,url:`https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,postedAt:{date:time}});
    const dispatch=vi.fn(async(url:string)=>{
      if(url.includes('/actors/'))return Response.json({data:{id:'actor'+(++actor)}});
      if(url.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'dataset'+actor}});
      return Response.json(actor===1?[post('1')]:[post('2'),post('1')]);
    });
    const http=new DurableProviderHttp(s.db,s.payloads,dispatch);await http.configureLimit('linkedin_apify',1);
    const collector=new FallbackSourceCollector(s.repository,s.payloads,s.intake,[new ApifySourceProvider('linkedin_apify',[family],http,async()=> 'private-token',0.1)],()=>time);
    const collected:string[][]=[];
    for(let window=1;window<=3;window++){
      const input={...request,runId:'window'+window,source:{family,locator:'https://www.linkedin.com/company/example'},limit:3};
      const start=await collector.collect(input);
      if(start.state!=='HANDED_OFF')throw Error('NO_START');
      const result=await collector.collect({...input,runId:input.runId+':page',continuation:start.continuation});
      if(result.state!=='HANDED_OFF')throw Error('NO_RESULT');
      collected.push(result.request.observations.map(o=>o.sourceItemKey));
    }
    expect(collected).toEqual([['linkedin:urn:li:activity:1'],['linkedin:urn:li:activity:2'],[]]);
    expect(actor).toBe(3);
  });

  it('durably suppresses a replayed authoritative Telegram delete across collection windows',async()=>{
    const deletion={...page().items[0],sourceItemKey:'telegram:-100123:1',operation:'DELETE' as const,body:undefined,authoritativeCurrentState:true,representation:'TELEGRAM_MESSAGE' as const};
    const p:SourceProvider={id:'telegram_telethon',families:['telegram'],fetch:async()=>({...page(),items:[deletion]})};
    const s=setup([p]);
    s.intake.acceptBatch=vi.fn(async (b:Parameters<CandidateIntakePort['acceptBatch']>[0])=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:b.observations.map(o=>({...receiptFixture(o),candidateItemId:undefined,tombstoneId:'tombstone-'+o.id,decision:'DELETION_ACCEPTED' as const,reasonCode:'ACCEPTED_DELETION' as const}))}));
    const input={...request,source:{family:'telegram' as const,locator:'channel',channelId:'-100123'}};
    const first=await s.collector.collect(input);
    expect(first.state==='HANDED_OFF'&&first.request.observations[0].operation).toBe('DELETE');
    const second=await s.collector.collect({...input,runId:'later-window'});
    expect(second.state==='HANDED_OFF'&&second.request.observations).toEqual([]);
  });
  it('defines preferred alternatives for each source without invented LinkedIn fallback',()=>{
    expect(DEFAULT_SOURCE_ORDER.website).toEqual(['website_http','website_playwright','website_zyte']);
    expect(DEFAULT_SOURCE_ORDER.telegram).toEqual(['telegram_telethon','telegram_public']);
    expect(DEFAULT_SOURCE_ORDER.x_search).toEqual(['x_twitterapi_io','x_apify']);
    expect(DEFAULT_SOURCE_ORDER.linkedin_profile).toEqual(['linkedin_apify']);
  });
  it('tries the preferred provider first and does not call fallback after success',async()=>{
    const a=provider('primary'),b=provider('secondary'),s=setup([a,b]);
    const result=await s.collector.collect(request,['primary','secondary']);
    expect(result.state).toBe('HANDED_OFF');expect(b.fetch).not.toHaveBeenCalled();
    if(result.state==='HANDED_OFF'){expect(result.request.proposals[0].suppliedPayloadRef).toBeDefined();expect(result.request.coverage.status).toBe('PARTIAL');}
  });
  it('uses fallback after recoverable failure, allocating a newer shared sequence',async()=>{
    const a=provider('primary',vi.fn(async()=>{throw new SourceProviderError('TRANSIENT');})),b=provider('secondary'),s=setup([a,b]);
    const result=await s.collector.collect(request,['primary','secondary']);
    expect(result.state).toBe('HANDED_OFF');
    if(result.state==='HANDED_OFF'){expect(result.providerId).toBe('secondary');expect(result.request.coverage.fetchStartSequence).toBe(2);}
  });
  it.each(['POLICY_REFUSAL','UNCERTAIN_PAID_SUBMISSION'] as const)('does not fallback around %s',async code=>{
    const a=provider('primary',vi.fn(async()=>{throw new SourceProviderError(code);})),b=provider('secondary'),s=setup([a,b]);
    await expect(s.collector.collect(request,['primary','secondary'])).rejects.toThrow(code);expect(b.fetch).not.toHaveBeenCalled();
  });
  it('an exhausted primary allowance permits an independently authorized fallback and replay',async()=>{
    const a=provider('primary',vi.fn(async()=>{throw new SourceProviderError('BUDGET_EXCEEDED')})),b=provider('secondary'),s=setup([a,b]);
    const result=await s.collector.collect(request,['primary','secondary']);
    expect(result.state==='HANDED_OFF'&&result.providerId).toBe('secondary');
    await s.collector.collect(request,['primary','secondary']);expect(a.fetch).toHaveBeenCalledTimes(1);expect(b.fetch).toHaveBeenCalledTimes(1);
  });
  it('replays uncertain intake without repeating either provider',async()=>{
    const a=provider('primary'),b=provider('secondary'),s=setup([a,b]);let original='';
    s.intake.acceptBatch=async batch=>{original=JSON.stringify(batch);throw new Error('receipt lost');};
    await expect(s.collector.collect(request,['primary','secondary'])).rejects.toThrow('receipt lost');
    s.intake.acceptBatch=async batch=>{expect(JSON.stringify(batch)).toBe(original);return {contractVersion:batch.contractVersion,handoffId:batch.handoffId,durable:true,receipts:batch.observations.map(receiptFixture)};};
    await s.collector.collect(request,['primary','secondary']);expect(a.fetch).toHaveBeenCalledTimes(1);expect(b.fetch).not.toHaveBeenCalled();
  });
  it('durably splits large snapshots without refetching and gates the final checkpoint',async()=>{
    const a=provider('primary',vi.fn(async()=>({...page(['1','2','3']),provenSafeCursor:'3'}))),s=setup([a]);
    const first=await s.collector.collect(request,['primary']);
    expect(first.state==='HANDED_OFF'&&first.nextOffset).toBe(2);
    expect(first.state==='HANDED_OFF'&&first.checkpoint).toBe('UNCHANGED');
    const second=await s.collector.collect(request,['primary'],2);
    expect(second.state==='HANDED_OFF'&&second.request.observations.map(o=>o.sourceItemKey)).toEqual(['x:3']);
    expect(second.state==='HANDED_OFF'&&second.checkpoint).toBe('ADVANCED');expect(a.fetch).toHaveBeenCalledTimes(1);
  });
  it('cannot bypass unresolved snapshot work',async()=>{
    const a=provider('primary',vi.fn(async()=>({...page(['1','2','3']),provenSafeCursor:'3'}))),s=setup([a]);
    s.intake.acceptBatch=async b=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true,receipts:b.observations.map(o=>({...receiptFixture(o),decision:'QUARANTINED',reasonCode:'QUARANTINE_MISSING_VALIDATION_FIELDS',checkpointResolution:'UNRESOLVED',candidateItemId:undefined}))});
    const first=await s.collector.collect(request,['primary']);expect(first.state==='HANDED_OFF'&&first.checkpoint).toBe('BLOCKED');
    await expect(s.collector.collect(request,['primary'],2)).rejects.toThrow('UNRESOLVED_SNAPSHOT_PREFIX');
  });
  it('rejects duplicate identities across snapshot slices before saving and replays the fallback',async()=>{
    const a=provider('primary',vi.fn(async()=>page(['1','2','1']))),b=provider('secondary'),s=setup([a,b]);
    const first=await s.collector.collect(request,['primary','secondary']);
    expect(first.state==='HANDED_OFF'&&first.providerId).toBe('secondary');
    expect(first.attempts[0].failure).toBe('MALFORMED');
    await s.collector.collect(request,['primary','secondary']);
    expect(a.fetch).toHaveBeenCalledTimes(1);expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(s.intake.acceptBatch).toHaveBeenCalledTimes(2);
  });
  it('falls back before committing a deletion without authoritative evidence',async()=>{
    const a=provider('primary',vi.fn(async()=>({...page(),items:[{...page().items[0],operation:'DELETE' as const}]}))),b=provider('secondary'),s=setup([a,b]);
    const result=await s.collector.collect(request,['primary','secondary']);
    expect(result.state==='HANDED_OFF'&&result.providerId).toBe('secondary');
    expect(result.attempts[0].failure).toBe('MALFORMED');
  });
  it.each(['status','dataset'])('resumes the same paid Apify actor after a transient %s failure and scheduler restart',async failing=>{
    const s=setup([]);let fail=true,starts=0,now=Date.parse(time);
    const dispatch=vi.fn(async(url:string)=>{
      if(url.includes('/actors/')){starts++;return Response.json({data:{id:'actorRun'}});}
      const operation=url.includes('/actor-runs/')?'status':'dataset';
      if(operation===failing&&fail){fail=false;return Response.json({error:'temporary'},{status:503});}
      return Response.json(operation==='status'?{data:{status:'SUCCEEDED',defaultDatasetId:'dataset'}}:[{id:'1',text:'Text'}]);
    });
    const http=new DurableProviderHttp(s.db,s.payloads,dispatch);await http.configureLimit('x_apify',1);
    const makeCollector=()=>new FallbackSourceCollector(new D1ProviderSourceRepository(s.db),s.payloads,s.intake,
      [new ApifySourceProvider('x_apify',['x_profile'],http,async()=> 'private-token',0.1)],()=>time);
    let scheduler=new D1ProviderPollScheduler(s.db,makeCollector(),async()=>true,()=>now);
    await scheduler.schedule('apify-job',request,time,['x_apify']);
    expect(await scheduler.runOne()).toBe('RETRY'); // actor identity is now durable
    expect(dispatch).toHaveBeenCalledTimes(1);
    now+=2000;scheduler=new D1ProviderPollScheduler(s.db,makeCollector(),async()=>true,()=>now);
    expect(await scheduler.runOne()).toBe('RETRY'); // failed read retains its continuation
    now+=10000;scheduler=new D1ProviderPollScheduler(s.db,makeCollector(),async()=>true,()=>now);
    expect(await scheduler.runOne()).toBe('DONE');
    expect(starts).toBe(1);
    const batches=vi.mocked(s.intake.acceptBatch).mock.calls.map(([batch])=>batch);
    expect(batches.at(-1)?.observations[0].sourceItemKey).toBe('x:1');
  });
  it('keeps invalid observations visible without acquisition proposals',async()=>{
    const a=provider('primary',vi.fn(async()=>({...page(),items:[{...page().items[0],identityValid:false}]}))),s=setup([a]);
    const result=await s.collector.collect(request,['primary']);
    if(result.state!=='HANDED_OFF')throw new Error('expected handoff');expect(result.request.observations).toHaveLength(1);expect(result.request.proposals).toHaveLength(0);
  });
  it('does not reinterpret provider continuation through a fallback',async()=>{
    const a=provider('primary',vi.fn(async()=>{throw new SourceProviderError('TRANSIENT');})),b=provider('secondary'),s=setup([a,b]);
    await s.collector.collect({...request,continuation:{providerId:'primary',token:'cursor'}},['primary','secondary']);expect(b.fetch).not.toHaveBeenCalled();
  });
  it('scheduler cancels a source that is no longer authorized',async()=>{
    const a=provider('primary'),s=setup([a]);const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>false,()=>Date.parse(time));
    await scheduler.schedule('job',request,time,['primary']);expect(await scheduler.runOne()).toBe('CANCELLED');expect(a.fetch).not.toHaveBeenCalled();
  });
  it('scheduler resumes snapshot batches under the same fetch identity',async()=>{
    const a=provider('primary',vi.fn(async()=>page(['1','2','3']))),s=setup([a]);const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(time));
    await scheduler.schedule('job',request,time,['primary']);expect(await scheduler.runOne()).toBe('RETRY');expect(await scheduler.runOne()).toBe('DONE');expect(a.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('provider adapters (synthetic responses, no live calls)',()=>{
  it('RSS emits durable excerpt inputs and stable GUID identity',async()=>{
    const p=new FeedSourceProvider('rss_native',feed('<rss><channel><item><guid>abc</guid><title>Hello</title><description>Text</description></item></channel></rss>'));
    const result=await p.fetch({...request,source:{family:'rss',locator:'https://publisher.example/rss'}});
    expect(result.items[0]).toMatchObject({sourceItemKey:'id:abc',body:'Hello. Text',excerpt:'Text',representation:'ARTICLE_EXCERPT'});expect(result.complete).toBeUndefined();
  });
  it('enriches at most two same-origin RSS articles while retaining their original excerpts',async()=>{
    const xml=`<rss><channel>${[1,2,3].map(i=>`<item><guid>${i}</guid><link>https://publisher.example/story/${i}</link><title>Story ${i}</title><description>Short feed excerpt ${i}</description></item>`).join('')}</channel></rss>`;
    const http:FeedHttpPort={get:vi.fn(async url=>({status:200,headers:{},bytes:encoder.encode(url.endsWith('/feed')?xml:'<article>Publisher article</article>'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async()=>({body:'Detailed publisher evidence. '.repeat(12)}))};
    const result=await new FeedSourceProvider('rss_native',http,execution).fetch({...request,limit:30,source:{family:'rss',locator:'https://publisher.example/feed'}});
    expect(result.items.map(item=>item.representation)).toEqual(['FULL_ARTICLE','FULL_ARTICLE','ARTICLE_EXCERPT']);
    expect(result.items[0]).toMatchObject({excerpt:'Short feed excerpt 1',contentCompleteness:'UNKNOWN'});
    expect(result.items[0].body).toContain('Detailed publisher evidence.');
    expect(result.items[2].body).toBe('Story 3. Short feed excerpt 3');
    expect(result.requests).toBe(3);expect(execution.execute).toHaveBeenCalledTimes(2);
  });
  it('does not fetch cross-origin RSS articles or promote failed extraction to full content',async()=>{
    const xml='<rss><channel><item><guid>1</guid><link>https://elsewhere.example/story</link><title>External</title><description>Excerpt</description></item><item><guid>2</guid><link>https://publisher.example/story</link><title>Local</title><description>Excerpt</description></item></channel></rss>';
    const http:FeedHttpPort={get:vi.fn(async url=>({status:url.endsWith('/story')?403:200,headers:{},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async()=>({body:'Detailed publisher evidence. '.repeat(12)}))};
    const result=await new FeedSourceProvider('rss_native',http,execution).fetch({...request,source:{family:'rss',locator:'https://publisher.example/feed'}});
    expect(result.items.map(item=>item.representation)).toEqual(['ARTICLE_EXCERPT','ARTICLE_EXCERPT']);
    expect(vi.mocked(http.get).mock.calls.map(([url])=>url)).toEqual(['https://publisher.example/feed','https://publisher.example/story']);
    expect(execution.execute).not.toHaveBeenCalled();
  });
  it('Google News uses a query RSS URL and labels results as listings',async()=>{
    const http=feed('<rss><channel><item><guid>google-id</guid><title>Result</title></item></channel></rss>');
    const result=await new FeedSourceProvider('google_rss',http).fetch({...request,source:{family:'google_news',locator:'AI',language:'en',region:'US'}});
    expect(String(vi.mocked(http.get).mock.calls[0][0])).toContain('news.google.com/rss/search');expect(result.items[0].representation).toBe('LISTING_RESULT');
  });
  it('resolves a Google News article redirect without fetching the publisher',async()=>{
    const google='https://news.google.com/rss/articles/opaque?oc=5';
    const xml=`<rss><channel><item><guid>google-id</guid><link>${google.replace('&','&amp;')}</link><source url="https://publisher.example">Publisher</source><title>Result</title></item></channel></rss>`;
    const http:FeedHttpPort={get:vi.fn(async (url):Promise<FeedResponse>=>url.includes('/rss/search')?{
      status:200,headers:{},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:4,providerCostUsd:0}
    }:{status:302,headers:{location:'https://publisher.example/article?utm_source=google&edition=us#top'},bytes:new Uint8Array(),
      telemetry:{requests:1,latencyMs:6,providerCostUsd:0}})};
    const clock=vi.spyOn(Date,'now').mockReturnValue(0);
    try{
    const result=await new FeedSourceProvider('google_rss',http).fetch({...request,source:{family:'google_news',locator:'AI'}});
    expect(result.items[0]).toMatchObject({sourceItemKey:'id:google-id',url:'https://publisher.example/article?edition=us',publisherId:'publisher.example',representation:'LISTING_RESULT'});
    expect(result).toMatchObject({requests:2,latencyMs:10});
    expect(vi.mocked(http.get).mock.calls.map(([url])=>new URL(url).hostname)).toEqual(['news.google.com','news.google.com']);
    }finally{clock.mockRestore();}
  });
  it('keeps Google listing links when redirect destinations are unsafe or resolution fails',async()=>{
    const links=['https://news.google.com/rss/articles/one','https://news.google.com/rss/articles/two'];
    const xml=`<rss><channel>${links.map((link,index)=>`<item><guid>${index}</guid><link>${link}</link><title>Result ${index}</title></item>`).join('')}</channel></rss>`;
    const http:FeedHttpPort={get:vi.fn(async (url):Promise<FeedResponse>=>url.includes('/rss/search')?{
      status:200,headers:{},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}
    }:url.endsWith('/one')?{status:302,headers:{location:'https://127.0.0.1/private'},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}:
      {status:503,headers:{},bytes:new Uint8Array(),telemetry:{requests:3,latencyMs:5,providerCostUsd:0}})};
    const result=await new FeedSourceProvider('google_rss',http).fetch({...request,source:{family:'google_news',locator:'AI'}});
    expect(result.items.map(item=>item.url)).toEqual(links);expect(result.requests).toBe(5);
  });
  it('bounds Google redirect probes to eight links per snapshot',async()=>{
    const links=Array.from({length:12},(_,index)=>`https://news.google.com/rss/articles/${index}`);
    const xml=`<rss><channel>${links.map((link,index)=>`<item><guid>${index}</guid><link>${link}</link><title>Result</title></item>`).join('')}</channel></rss>`;
    const http:FeedHttpPort={get:vi.fn(async url=>({status:url.includes('/rss/search')?200:404,headers:{},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    await new FeedSourceProvider('google_rss',http).fetch({...request,limit:30,source:{family:'google_news',locator:'AI'}});
    expect(http.get).toHaveBeenCalledTimes(9);
  });
  it('resolves modern Google redirects across snapshot pages without fetching publisher destinations',async()=>{
    const links=Array.from({length:5},(_,i)=>`https://news.google.com/rss/articles/opaque${i}`);
    const xml=`<rss><channel>${links.map((link,i)=>`<item><guid>${i}</guid><link>${link}</link><title>Result</title></item>`).join('')}</channel></rss>`;
    const http:FeedHttpPort={get:vi.fn(async url=>({status:url.includes('/rss/search')?200:302,headers:{location:links[0]},bytes:encoder.encode(xml),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async(_kind:string,input:Record<string,unknown>)=>({results:(input.urls as string[]).map(url=>({inputUrl:url,url:url===links[1]?'https://127.0.0.1/private':'https://publisher.example/article',requests:2})),latencyMs:2}))};
    const result=await new FeedSourceProvider('google_rss',http,execution).fetch({...request,limit:2,source:{family:'google_news',locator:'AI'}});
    expect(result.items.map(i=>i.url)).toEqual(['https://publisher.example/article',links[1],'https://publisher.example/article','https://publisher.example/article','https://publisher.example/article']);
    expect(execution.execute).toHaveBeenCalledTimes(1);
    expect(execution.execute).toHaveBeenCalledWith('google_resolve',{urls:links},{timeoutMs:65000});
    expect(vi.mocked(http.get).mock.calls.every(([url])=>new URL(url).hostname==='news.google.com')).toBe(true);
    expect(result.items.every(i=>i.representation==='LISTING_RESULT'&&i.contentCompleteness==='UNKNOWN')).toBe(true);
    expect(result.requests).toBe(12);
  });
  it('uses the authorized private Google feed route after transient transport failure and preserves the exact query',async()=>{
    const http:FeedHttpPort={get:vi.fn(async()=>({status:0,headers:{},bytes:new Uint8Array(),telemetry:{requests:3,latencyMs:10,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async()=>({status:200,xml:'<rss><channel><item><guid>google-id</guid><title>Result</title></item></channel></rss>',requests:1,latencyMs:5}))};
    const result=await new FeedSourceProvider('google_rss',http,execution).fetch({...request,source:{family:'google_news',locator:'Lebanon electricity',language:'en',region:'US'}});
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('news.google.com/rss/search'),expect.anything(),{attempts:1,timeoutMs:5000});
    expect(execution.execute).toHaveBeenCalledWith('google_feed',{url:vi.mocked(http.get).mock.calls[0][0]},{timeoutMs:25000});
    expect(result.items).toMatchObject([{sourceItemKey:'id:google-id',representation:'LISTING_RESULT'}]);expect(result.requests).toBe(4);
  });
  it.each([429,451,403])('does not route around Google rate, policy or authorization refusal (%s)',async status=>{
    const http:FeedHttpPort={get:async()=>({status,headers:{},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}})};
    const execute=vi.fn();await expect(new FeedSourceProvider('google_rss',http,{execute}).fetch({...request,source:{family:'google_news',locator:'AI'}})).rejects.toThrow();expect(execute).not.toHaveBeenCalled();
  });
  it('Telethon preserves numeric peer identity and proves oldest-first progress',async()=>{
    const execute=vi.fn(async()=>({channelId:'-100123',records:[{id:2,text:'Text',publishedAt:time}],orderedFromCheckpoint:true,exhausted:false}));
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'NASAchannel',channelId:'-100123',public:true},requestedBounds:{startCursor:'1'}});
    expect(result.items[0]).toMatchObject({sourceItemKey:'telegram:-100123:2',authoritativeCurrentState:true});expect(result.provenSafeCursor).toBe('2');expect(result.continuationToken).toBe('2');
  });
  it('recent Telegram bootstrap advances accepted progress without claiming complete historical recall',async()=>{
    const execute=vi.fn(async()=>({channelId:'-100123',records:[{id:900,text:'Recent',publishedAt:time},{id:901,text:'Latest',publishedAt:time}],bootstrapRecent:true,orderedFromCheckpoint:true,exhausted:true,deletionState:'CURRENT'}));
    const result=await new TelegramSourceProvider('telegram_telethon',feed(''),{execute}).fetch({...request,source:{family:'telegram',locator:'channel',channelId:'-100123'}});
    expect(result.provenSafeCursor).toBe('901');expect(result.continuationToken).toBeUndefined();expect(result.complete).toBe(false);
  });
  it('private Telegram never falls through to public-page access',async()=>{
    const http=feed('');await expect(new TelegramSourceProvider('telegram_public',http).fetch({...request,source:{family:'telegram',locator:'private',channelId:'-100123',public:false}})).rejects.toThrow('UNAVAILABLE');expect(http.get).not.toHaveBeenCalled();
  });
  it('Telethon missing recheck IDs do not fabricate deletions',async()=>{
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute:async()=>({channelId:'-100123',records:[],exhausted:true,orderedFromCheckpoint:true})});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'private',channelId:'-100123'},recheckItemKeys:['telegram:-100123:3']});expect(result.items).toEqual([]);expect(result.provenSafeCursor).toBeUndefined();
  });
  it('Telethon recheck keeps edit provenance and cannot advance the new-message cursor',async()=>{
    const edited='2026-10-05T08:00:00.000Z';
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute:async()=>({channelId:'-100123',records:[{id:3,text:'Corrected post',publishedAt:time,editedAt:edited}],orderedFromCheckpoint:false,exhausted:false})});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'channel',channelId:'-100123'},recheckItemKeys:['telegram:-100123:3']});
    expect(result.items[0]).toMatchObject({sourceItemKey:'telegram:-100123:3',sourceRevision:{value:edited,comparability:'COMPARABLE'}});
    expect(result.provenSafeCursor).toBeUndefined();
  });
  it('keeps Telegram deletions separate from the new-message cursor and exposes difference gaps as partial',async()=>{
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute:async()=>({channelId:'-100123',records:[{id:20,text:'New',publishedAt:time},{id:3,deleted:true,explicitDeletion:true},{id:4,text:'Old edited post',publishedAt:time,editedAt:time,rechecked:true}],orderedFromCheckpoint:true,exhausted:true,deletionState:'GAP'})});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'channel',channelId:'-100123'}});
    expect(result.provenSafeCursor).toBe('20');expect(result.complete).toBe(false);
    expect(result.items[1]).toMatchObject({sourceItemKey:'telegram:-100123:3',operation:'DELETE',authoritativeCurrentState:true});
  });
  it.each(['linkedin_company','linkedin_profile'] as const)('passes a supported lower date bound to %s actor collection',async family=>{
    const http={request:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{data:{id:'run'}}}))};
    const p=new ApifySourceProvider('linkedin_apify',[family],http,async()=> 'private-token',0.1);
    await p.fetch({...request,source:{family,locator:'https://www.linkedin.com/company/example'},requestedBounds:{startTime:time}},run);
    expect(JSON.parse((http.request.mock.calls[0] as any[])[5].body)).toMatchObject({postedLimitDate:time,maxPosts:2,scrapeComments:false,scrapeReactions:false});
  });
  it('TwitterAPI.io sends profile+topic+time restrictions to search and keeps returned dates for intake validation',async()=>{
    const http={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{tweets:[{id:'1',text:'AI',createdAt:time}],has_next_page:false}}))};
    const p=new TwitterApiIoProvider(http,async()=> 'private-key',0.01);
    const result=await p.fetch({...request,requestedBounds:{startTime:time,endTime:'2026-10-05T10:00:00.000Z'}},run);
    const url=new URL(http.request.mock.calls[0][4]);expect(url.searchParams.get('query')).toContain('from:NASA since_time:');expect(result.items[0].sourceItemKey).toBe('x:1');
  });
  it('bounded X pages keep the identical time query and stop on a repeated provider cursor',async()=>{
    const http={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{tweets:[],has_next_page:true,next_cursor:'cursor'}}))};
    const p=new TwitterApiIoProvider(http,async()=> 'private-key',0.01);
    const bounded={...request,requestedBounds:{startTime:time,endTime:'2026-10-04T11:00:00.000Z'}};
    await p.fetch(bounded,run);
    await expect(p.fetch({...bounded,continuation:{providerId:p.id,token:'cursor'}},run)).rejects.toMatchObject({code:'MALFORMED'});
    const urls=http.request.mock.calls.map(c=>new URL(c[4]));expect(urls[0].pathname).toBe('/twitter/tweet/advanced_search');
    expect(urls[0].searchParams.get('query')).toBe(urls[1].searchParams.get('query'));expect(urls[1].searchParams.get('cursor')).toBe('cursor');
  });
  it.each([undefined,'2026-10-03T10:00:00Z'])('does not certify a bounded X window when returned dates are missing or outside it (%s)',async createdAt=>{
    const http={request:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{tweets:[{id:'1',text:'Post',createdAt}],has_next_page:false}}))};
    await expect(new TwitterApiIoProvider(http,async()=> 'private-key',.01).fetch({...request,requestedBounds:{startTime:time,endTime:'2026-10-04T11:00:00.000Z'}},run)).rejects.toMatchObject({code:'MALFORMED'});
  });
  it('legacy Apify actor recovery is resumed rather than stranded by X scope retirement',async()=>{
    const actor=provider('x_apify',vi.fn(async()=>({...page(['1']),continuationToken:'actor-cursor'}))),s=setup([actor]);let at=Date.parse(time),wait=true;
    const accept=s.intake.acceptBatch;s.intake.acceptBatch=async b=>{if(wait)throw new SourceHandoffWait();return accept(b)};
    const old=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>at);
    await old.schedule('actor',request,time,['x_apify']);expect(await old.runOne(120000,'actor')).toBe('RETRY');
    wait=false;at+=6000;const updated=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>at,100,false,true);
    expect(await updated.runOne(120000,'actor')).toBe('RETRY');expect(actor.fetch).toHaveBeenCalledTimes(1);
    const saved=JSON.parse((s.db.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='actor'").get() as any).request);
    expect(saved.continuation).toEqual({providerId:'x_apify',token:'actor-cursor'});
  });
  it('the X fallback receives the same profile and frozen time restrictions as the primary',async()=>{
    const http={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{data:{id:'run'}}}))};
    const p=new ApifySourceProvider('x_apify',['x_profile'],http,async()=> 'private-token',0.1);
    await p.fetch({...request,requestedBounds:{startTime:time,endTime:'2026-10-04T11:00:00.000Z'}},run);
    const body=JSON.parse(http.request.mock.calls[0][5].body);
    expect(body.twitterContent).toBe(`from:NASA since_time:${Date.parse(time)/1000} until_time:${Date.parse('2026-10-04T11:00:00.000Z')/1000}`);expect(body.from).toBeUndefined();
  });
  it('time bounds restrict the entire approved OR search on both X providers',async()=>{
    const primary={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{tweets:[],has_next_page:false}}))};
    const fallback={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{data:{id:'run'}}}))};
    const bounded={...request,source:{family:'x_search' as const,locator:'AI OR robotics'},requestedBounds:{startTime:time,endTime:'2026-10-04T11:00:00.000Z'}};
    await new TwitterApiIoProvider(primary,async()=> 'key',.01).fetch(bounded,run);
    await new ApifySourceProvider('x_apify',['x_search'],fallback,async()=> 'token',.1).fetch(bounded,run);
    const query=new URL(primary.request.mock.calls[0][4]).searchParams.get('query');
    expect(query).toMatch(/^\(AI OR robotics\) since_time:\d+ until_time:\d+$/);expect(JSON.parse(fallback.request.mock.calls[0][5].body).twitterContent).toBe(query);
  });
  it('accepts TwitterAPI.io posts inside the data envelope without losing pagination',async()=>{
    const json={status:'success',data:{tweets:[{id:'2',text:'NASA update',createdAt:time,author:{userName:'NASA'}}]},has_next_page:true,next_cursor:'next-page'};
    const http={request:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode(JSON.stringify(json)),json}))};
    const p=new TwitterApiIoProvider(http,async()=> 'private-key',0.01);
    const result=await p.fetch(request,run);
    expect(result.items).toMatchObject([{sourceItemKey:'x:2',publisherId:'NASA',body:'NASA update'}]);
    expect(result.continuationToken).toBe('next-page');
  });
  it('uses a stable X author ID when supplied and strips known tracking from article URLs',()=>{
    const x=normalizeProviderRecords([{id:'22',text:'Update',author:{id:'1234',userName:'newHandle'}}],'x_profile');
    expect(x[0]).toMatchObject({sourceItemKey:'x:22',publisherId:'x:1234'});
    const article=normalizeProviderRecords([{id:'article-1',text:'Body',url:'https://example.com/story?utm_source=feed&edition=us#section'}],'google_news');
    expect(article[0].url).toBe('https://example.com/story?edition=us');
  });
  it('Apify starts once and resumes the same running actor via continuation',async()=>{
    const response=(json:unknown)=>({status:200,headers:{},bytes:encoder.encode(JSON.stringify(json)),json});
    const http={request:vi.fn(async(...args:any[])=>response(args[4].includes('/actors/')?{data:{id:'actorRun'}}:{data:{status:'RUNNING'}}))};
    const p=new ApifySourceProvider('x_apify',['x_profile'],http,async()=> 'private-token',0.1);
    const first=await p.fetch(request,run);expect(first.continuationToken).toBeDefined();
    await p.fetch({...request,continuation:{providerId:'x_apify',token:first.continuationToken!}},{...run,id:'next-run',sequence:2});
    expect(http.request.mock.calls.filter(c=>String(c[4]).includes('/actors/'))).toHaveLength(1);
  });
  it('sends the exact approved X search in the tested actor query field with a bounded result count',async()=>{
    const http={request:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{data:{id:'actorRun'}}}))};
    const p=new ApifySourceProvider('x_apify',['x_search'],http,async()=> 'private-token',0.1);
    await p.fetch({...request,source:{family:'x_search',locator:'from:NASA lang:en'},limit:20},run);
    const call=http.request.mock.calls[0] as unknown as any[];
    expect(JSON.parse(call[5].body)).toEqual({twitterContent:'from:NASA lang:en',maxItems:20,queryType:'Latest'});
    expect(new URL(call[4]).searchParams.get('maxTotalChargeUsd')).toBe('0.1');
  });
  it.each(['linkedin_company','linkedin_profile'] as const)('normalizes %s without inventing publication timestamps',family=>{
    const result=normalizeProviderRecords([{urn:'urn:li:activity:1',text:'Text',url:'https://www.linkedin.com/posts/example'}],family);
    expect(result[0].sourceItemKey).toBe('linkedin:urn:li:activity:1');expect(result[0].publishedAt).toBeUndefined();expect(result[0].contentCompleteness).toBe('UNKNOWN');
  });
  it.each([401,404,410,429])('retains precise website HTTP failures before invoking extraction (%s)',async status=>{
    const execute=vi.fn(async()=>({body:'unused'}));
    const http:FeedHttpPort={get:async()=>({status,headers:{'retry-after':'600'},bytes:encoder.encode('Unavailable'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}})};
    const p=new WebsiteSourceProvider('website_http',http,{execute});
    await expect(p.fetch({...request,source:{family:'website',locator:'https://publisher.example/article'}},run)).rejects.toMatchObject({code:status===401?'AUTH_REQUIRED':status===429?'RATE_LIMIT':'UNAVAILABLE',diagnostic:{httpStatus:status,detail:status===401?'UPSTREAM_AUTHENTICATION':status===429?'UPSTREAM_RATE_LIMIT':'HTTP_NOT_FOUND'}});
    expect(execute).not.toHaveBeenCalled();
  });
  it('website extraction has text and no model provenance',async()=>{
    const p=new WebsiteSourceProvider('website_http',feed('<article>Text</article>'),{execute:async()=>({body:'Text '.repeat(100),title:'Title',publishedAt:time})});
    const result=await p.fetch({...request,source:{family:'website',locator:'https://publisher.example/article'}},run);
    expect(result.items[0]).toMatchObject({representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN'});expect(result.items[0]).not.toHaveProperty('modelId');
  });
  it('a paywalled teaser stops collection before extraction or paid fallback',async()=>{
    const execute=vi.fn(),html='<script type="application/ld+json">{"@type":"WebPage","isAccessibleForFree":false}</script><h1>Story</h1><main><p>Only a teaser.</p><div id="paywall-prompt"></div><h2><a href="/one">One</a></h2><h2><a href="/two">Two</a></h2></main>';
    const p=new WebsiteSourceProvider('website_http',feed(html),{execute});
    await expect(p.fetch({...request,source:{family:'website',locator:'https://publisher.example/article'}},run)).rejects.toMatchObject({code:'AUTH_REQUIRED',diagnostic:{detail:'ARTICLE_ACCESS_RESTRICTED'}});
    expect(execute).not.toHaveBeenCalled();
  });
  it('a website listing emits independent article candidates and preserves pagination instead of a homepage story',async()=>{
    const p=new WebsiteSourceProvider('website_http',feed('<article>Listing</article>'),{execute:async()=>({body:'Homepage aggregate '.repeat(40),pageKind:'listing',articleLinks:['https://publisher.example/one','https://publisher.example/two','https://other.example/three']})});
    const first=await p.fetch({...request,limit:1,source:{family:'website',locator:'https://publisher.example/'}},run);
    expect(first.items.map(i=>i.url)).toEqual(['https://publisher.example/one']);expect(first.items[0].representation).toBe('LISTING_RESULT');expect(first.complete).toBe(false);
    const second=await p.fetch({...request,limit:1,continuation:{providerId:'website_http',token:first.continuationToken!},source:{family:'website',locator:'https://publisher.example/'}},run);
    expect(second.items.map(i=>i.url)).toEqual(['https://publisher.example/two']);expect(second.continuationToken).toBeUndefined();
  });
  it('does not report an undated homepage as acquired full news coverage',async()=>{
    const p=new WebsiteSourceProvider('website_http',feed('<html>Homepage</html>'),{execute:async()=>({body:'Homepage '.repeat(100)})});
    await expect(p.fetch({...request,source:{family:'website',locator:'https://publisher.example/'}},run)).rejects.toThrow('MALFORMED');
  });
  it('an undated article retains its identity and does not crawl embedded story references',async()=>{
    const p=new WebsiteSourceProvider('website_http',feed('<article>News</article>'),{execute:async()=>({body:'Article text '.repeat(50),pageKind:'article',canonicalUrl:'https://publisher.example/',articleLinks:['https://publisher.example/other-story']})});
    const result=await p.fetch({...request,source:{family:'website',locator:'https://publisher.example/news/story'}},run);
    expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({url:'https://publisher.example/news/story',sourceItemKey:'url:https://publisher.example/news/story',representation:'FULL_ARTICLE'});
    expect(result.items[0].publishedAt).toBeUndefined();expect(result.complete).toBe(false);
  });
  it('a dated homepage is still a listing, and missing inventory is not a full article',async()=>{
    const execute=vi.fn(async()=>({body:'Homepage '.repeat(50),pageKind:'article',publishedAt:time,articleLinks:['https://publisher.example/news/story']}));
    const p=new WebsiteSourceProvider('website_http',feed('<html>Lead story</html>'),{execute});
    const result=await p.fetch({...request,source:{family:'website',locator:'https://publisher.example/'}},run);
    expect(result.items[0].representation).toBe('LISTING_RESULT');expect(result.complete).toBe(false);
    execute.mockResolvedValueOnce({body:'Homepage '.repeat(50),pageKind:'article',publishedAt:time,articleLinks:[]});
    await expect(p.fetch({...request,source:{family:'website',locator:'https://publisher.example/'}},run)).rejects.toThrow('MALFORMED');
  });
  it('website uses the third route only after direct HTTP and browser failures',async()=>{
    const http:FeedHttpPort={get:vi.fn(async()=>({status:403,headers:{},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async(kind:string)=>kind==='playwright'?{status:403}:{body:'Article text '.repeat(50),title:'Article',publishedAt:time})};
    const envelope={statusCode:200,httpResponseBody:btoa('<article>Article</article>')};
    const paid={request:vi.fn(async()=>({status:200,headers:{},bytes:encoder.encode(JSON.stringify(envelope)),json:envelope}))};
    const providers=[new WebsiteSourceProvider('website_http',http,execution),new WebsiteSourceProvider('website_playwright',http,execution),
      new WebsiteSourceProvider('website_zyte',http,execution,paid,async()=> 'private-key')];
    const s=setup(providers);const result=await s.collector.collect({...request,source:{family:'website',locator:'https://publisher.example/article'}});
    expect(result.state==='HANDED_OFF'&&result.providerId).toBe('website_zyte');expect(paid.request).toHaveBeenCalledTimes(1);
    expect(result.state==='HANDED_OFF'&&result.attempts.map(a=>a.providerId)).toEqual(['website_http','website_playwright']);
  });
  it.each(['linkedin_company','linkedin_profile','google_news','apify'] as const)('Apify %s fetches and normalizes a bounded dataset',async family=>{
    const response=(json:unknown)=>({status:200,headers:{},bytes:encoder.encode(JSON.stringify(json)),json});
    const http={request:vi.fn(async(...args:any[])=>response(String(args[4]).includes('/actors/')?{data:{id:'actorRun'}}:
      String(args[4]).includes('/actor-runs/')?{data:{status:'SUCCEEDED',defaultDatasetId:'dataset'}}:[{id:'item1',title:'Title',text:'Text',url:'https://publisher.example/post'}]))};
    const p=new ApifySourceProvider('test_actor',[family],http,async()=> 'private-token',0.1);
    const result=await p.fetch({...request,source:{family,locator:'https://publisher.example/source',actorId:'owner/custom'}},run);
    expect(result.items).toHaveLength(0);expect(result.requests).toBe(1);expect(result.continuationToken).toBeDefined();
    const resumed=await p.fetch({...request,source:{family,locator:'https://publisher.example/source',actorId:'owner/custom'},
      continuation:{providerId:'test_actor',token:result.continuationToken!}},{...run,id:'next-run',sequence:2});
    expect(resumed.items).toHaveLength(1);expect(resumed.requests).toBe(2);expect(resumed.providerCostUsd).toBeNull();expect(resumed.complete).toBeUndefined();
  });
});

describe('durable paid HTTP',()=>{
  it('caches exact paid responses and enforces the alternative budget',async()=>{
    const s=setup([]),dispatch=vi.fn(async()=>new Response('{"tweets":[]}'));
    const http=new DurableProviderHttp(s.db,s.payloads,dispatch);await http.configureLimit('paid',0.02);
    await http.request(scope,'operation','paid',0.02,'https://api.twitterapi.io/twitter/tweets',{});
    await http.request(scope,'operation','paid',0.02,'https://api.twitterapi.io/twitter/tweets',{});
    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(http.request(scope,'other','paid',0.01,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('BUDGET_EXCEEDED');
  });
  it('unknown paid outcome stays fenced rather than resubmitting',async()=>{
    const s=setup([]),dispatch=vi.fn(async()=>{throw new Error('connection lost');}),http=new DurableProviderHttp(s.db,s.payloads,dispatch);
    await http.configureLimit('paid',1);
    await expect(http.request(scope,'op','paid',0.02,'https://api.apify.com/v2/actors/a~b/runs',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
    await expect(http.request(scope,'op','paid',0.02,'https://api.apify.com/v2/actors/a~b/runs',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('a new polling window and another provider cannot bypass an unresolved paid source operation',async()=>{
    const s=setup([]),dispatch=vi.fn(async():Promise<Response>=>{throw new Error('connection lost')}),http=new DurableProviderHttp(s.db,s.payloads,dispatch,1000,1000,15);
    await http.configureLimits({primary:100,fallback:100});
    await expect(http.request(scope,'old-window','primary',1,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
    await expect(http.request(scope,'new-window','primary',1,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('BACKPRESSURE');
    await expect(http.request(scope,'new-window','fallback',1,'https://api.apify.com/v2/actors/a~b/runs',{})).rejects.toThrow('BACKPRESSURE');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await s.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='primary'").first()).toEqual({reserved_usd:1});
    expect(await s.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='fallback'").first()).toEqual({reserved_usd:0});
    // Other independently authorized FeedSources retain their own execution history.
    dispatch.mockImplementationOnce(async()=>Response.json({ok:true}));
    await http.request({...scope,feedSourceId:'other-source'},'new-window','primary',1,'https://api.twitterapi.io/twitter/tweets',{});
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
  it('bounds a dispatcher that ignores abort signals',async()=>{
    const s=setup([]),http=new DurableProviderHttp(s.db,s.payloads,()=>new Promise(()=>{}),1000,5);await http.configureLimit('paid',1);
    await expect(http.request(scope,'op','paid',0.02,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
  });
});

it('captured provider backfill slices do not exhaust the native pagination guard',async()=>{
 const s=setup([provider('x_twitterapi_io',vi.fn(async()=>page(Array.from({length:200},(_,i)=>String(i)))))]);
 const scheduler=new D1ProviderPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(time),2);
 await scheduler.schedule('captured', {...request,limit:10},time,['x_twitterapi_io']);
 for(let i=0;i<19;i++)expect(await scheduler.runOne()).toBe('RETRY');
 expect(await scheduler.runOne()).toBe('DONE');
 expect(new Set(vi.mocked(s.intake.acceptBatch).mock.calls.flatMap(([b])=>b.observations.map(o=>o.sourceItemKey))).size).toBe(200);
});

it('initial provider lookback prioritizes recent captured work and retains older history and checkpoint proof',async()=>{
 const captured=page(['old','current']);captured.items[0].publishedAt='2026-10-01T00:00:00Z';captured.items[1].publishedAt=time;captured.provenSafeCursor='safe';
 const fetch=vi.fn(async()=>captured),s=setup([provider('x_twitterapi_io',fetch)]);
 const collector=new FallbackSourceCollector(s.repository,s.payloads,s.intake,[provider('x_twitterapi_io',fetch)],()=>time,{x_profile:24});
 const input={...request,limit:1};
 const first=await collector.collect(input,['x_twitterapi_io']);
 if(first.state!=='HANDED_OFF')throw new Error('expected initial handoff');
 expect(first.request!.observations[0].sourceItemKey).toBe('x:current');expect(first.checkpoint).toBe('UNCHANGED');
 const last=await collector.collect(input,['x_twitterapi_io'],1);
 if(last.state!=='HANDED_OFF')throw new Error('expected retained history handoff');
 expect(last.request!.observations[0].sourceItemKey).toBe('x:old');expect(last.checkpoint).toBe('ADVANCED');expect(fetch).toHaveBeenCalledTimes(1);
});

it('fresh source polls progress during backfill and periodic oldest-first turns recover history',async()=>{
 let now=Date.parse('2026-10-04T10:01:00Z');const s=setup([]),seen:string[]=[];
 const collect=vi.fn(async(r:SourceFetchRequest)=>{seen.push(r.runId);return {state:'HANDED_OFF',checkpoint:'UNCHANGED',...(r.runId==='backfill'?{nextOffset:2}:{})}});
 const scheduler=new D1ProviderPollScheduler(s.db,{collect} as any,async()=>true,()=>now);
 await scheduler.schedule('backfill',{...request,runId:'backfill'},new Date(now-60000).toISOString());
 expect(await scheduler.runOne()).toBe('RETRY');
 await scheduler.schedule('fresh',{...request,runId:'fresh'},new Date(now).toISOString());
 expect(await scheduler.runOne()).toBe('DONE');expect(seen).toEqual(['backfill','fresh']);
 now=Date.parse('2026-10-04T10:04:00Z');
 await scheduler.schedule('fresh-next',{...request,runId:'fresh-next'},new Date(now).toISOString());
 expect(await scheduler.runOne()).toBe('RETRY');expect(seen.at(-1)).toBe('backfill');
});

it('hands discovered article URLs to durable acquisition instead of one mixed homepage payload',async()=>{
 const html=['A flight policy change','An electricity minister statement','A security investigation'].map((t,i)=>`<div class="story"><a class="title" href="/articles/${i}">${t}</a></div>`).join('');
 const execution={execute:vi.fn(async()=>({body:'Mixed homepage text '.repeat(30),title:'Latest news'}))};
 const http=feed(html),p=new WebsiteSourceProvider('website_http',http,execution),s=setup([p]);
 const r={...request,source:{family:'website' as const,locator:'https://publisher.example/news'},limit:2};
 const first=await s.collector.collect(r,['website_http']);
 expect(first.state).toBe('HANDED_OFF');if(first.state!=='HANDED_OFF')throw Error('HANDOFF');
 expect(first.nextOffset).toBe(2);expect(first.request.observations.map(o=>o.canonicalUrl)).toEqual(['https://publisher.example/articles/0','https://publisher.example/articles/1']);
 expect(first.request.observations.every(o=>o.representation==='LISTING_RESULT'&&!o.suppliedPayloadRef)).toBe(true);
 expect(first.request.proposals).toHaveLength(2);
 const rest=await s.collector.collect(r,['website_http'],2);expect(rest.state==='HANDED_OFF'&&rest.request.observations[0].canonicalUrl).toBe('https://publisher.example/articles/2');
 expect(http.get).toHaveBeenCalledTimes(1);expect(execution.execute).not.toHaveBeenCalled();
 const repeat=await s.collector.collect({...r,runId:'next-poll'},['website_http']);expect(repeat.state==='HANDED_OFF'&&repeat.request.observations).toEqual([]);
 const recheck=await s.collector.collect({...r,runId:'article-recheck',recheckItemKeys:['url:https://publisher.example/articles/0']},['website_http']);
 expect(recheck.state==='HANDED_OFF'&&recheck.request.observations.map(o=>o.sourceItemKey)).toEqual(['url:https://publisher.example/articles/0']);
});
it('website collection preserves original publication and update dates instead of a heuristic extractor date',async()=>{
 const html='<meta property="article:published_time" content="2026-08-31"><meta property="article:modified_time" content="2026-10-21"><article>Original article</article>';
 const execution={execute:vi.fn(async()=>({body:'Readable scientific reporting. '.repeat(30),publishedAt:'2026-10-21',pageKind:'article'}))};
 const provider=new WebsiteSourceProvider('website_http',feed(html),execution);
 const result=await provider.fetch({...request,source:{family:'website',locator:'https://publisher.example/space/story'}},run);
 expect(result.items[0]).toMatchObject({publishedAt:'2026-08-31T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z',contentCompleteness:'UNKNOWN'});
});
it('website collection refuses encoded text even when a helper labels it a full article',async()=>{
 const html='<article>Original article</article>',body='Readable opening paragraphs. '.repeat(15)+'QWxwaGEvYmV0YTEyMzQ1Njc4OTA='.repeat(80);
 const execution={execute:vi.fn(async()=>({body,publishedAt:'2026-10-21',pageKind:'article',contentCompleteness:'COMPLETE'}))};
 const provider=new WebsiteSourceProvider('website_http',feed(html),execution);
 await expect(provider.fetch({...request,source:{family:'website',locator:'https://publisher.example/space/story'}},run)).rejects.toMatchObject({code:'MALFORMED',diagnostic:{detail:'ENCODED_ARTICLE_TEXT'}});
});
