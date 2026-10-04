import { describe,it,expect,vi,afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { receiptFixture, type CandidateIntakePort } from '@distilled/contracts';
import { SOURCE_STORAGE_SCHEMA,R2SourcePayloadStore,type SqlDatabase,type SqlStatement,type ObjectBucket } from '../src/source-runtime/storage';
import { PROVIDER_SOURCE_SCHEMA,D1ProviderSourceRepository } from '../src/source-runtime/provider-storage';
import { FallbackSourceCollector } from '../src/source-runtime/provider-collector';
import { DurableProviderHttp,PROVIDER_BUDGET_SCHEMA } from '../src/source-runtime/provider-http';
import { DEFAULT_SOURCE_ORDER,SourceProviderError,type SourceProvider,type SourceFetchRequest,type ProviderPage } from '../src/source-runtime/provider-types';
import { FeedSourceProvider,TelegramSourceProvider } from '../src/source-runtime/platform-providers';
import { TwitterApiIoProvider,ApifySourceProvider } from '../src/source-runtime/social-providers';
import { WebsiteSourceProvider } from '../src/source-runtime/website-providers';
import { D1ProviderPollScheduler,PROVIDER_POLL_SCHEMA } from '../src/source-runtime/provider-scheduler';
import { normalizeProviderRecords } from '../src/source-runtime/provider-normalize';
import type { FeedHttpPort } from '../src/source-runtime/ports';

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
  it.each(['POLICY_REFUSAL','UNCERTAIN_PAID_SUBMISSION','BUDGET_EXCEEDED'] as const)('does not fallback around %s',async code=>{
    const a=provider('primary',vi.fn(async()=>{throw new SourceProviderError(code);})),b=provider('secondary'),s=setup([a,b]);
    await expect(s.collector.collect(request,['primary','secondary'])).rejects.toThrow(code);expect(b.fetch).not.toHaveBeenCalled();
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
    expect(result.items[0]).toMatchObject({sourceItemKey:'id:abc',body:'Text',representation:'ARTICLE_EXCERPT'});expect(result.complete).toBeUndefined();
  });
  it('Google News uses a query RSS URL and labels results as listings',async()=>{
    const http=feed('<rss><channel><item><guid>google-id</guid><title>Result</title></item></channel></rss>');
    const result=await new FeedSourceProvider('google_rss',http).fetch({...request,source:{family:'google_news',locator:'AI',language:'en',region:'US'}});
    expect(String(vi.mocked(http.get).mock.calls[0][0])).toContain('news.google.com/rss/search');expect(result.items[0].representation).toBe('LISTING_RESULT');
  });
  it('Telethon preserves numeric peer identity and proves oldest-first progress',async()=>{
    const execute=vi.fn(async()=>({channelId:'-100123',records:[{id:2,text:'Text',publishedAt:time}],orderedFromCheckpoint:true,exhausted:false}));
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'NASAchannel',channelId:'-100123',public:true},requestedBounds:{startCursor:'1'}});
    expect(result.items[0]).toMatchObject({sourceItemKey:'telegram:-100123:2',authoritativeCurrentState:true});expect(result.provenSafeCursor).toBe('2');expect(result.continuationToken).toBe('2');
  });
  it('private Telegram never falls through to public-page access',async()=>{
    const http=feed('');await expect(new TelegramSourceProvider('telegram_public',http).fetch({...request,source:{family:'telegram',locator:'private',channelId:'-100123',public:false}})).rejects.toThrow('UNAVAILABLE');expect(http.get).not.toHaveBeenCalled();
  });
  it('Telethon missing recheck IDs do not fabricate deletions',async()=>{
    const p=new TelegramSourceProvider('telegram_telethon',feed(''),{execute:async()=>({channelId:'-100123',records:[],exhausted:true,orderedFromCheckpoint:true})});
    const result=await p.fetch({...request,source:{family:'telegram',locator:'private',channelId:'-100123'},recheckItemKeys:['telegram:-100123:3']});expect(result.items).toEqual([]);expect(result.provenSafeCursor).toBeUndefined();
  });
  it('TwitterAPI.io sends profile+topic+time restrictions to search and keeps returned dates for intake validation',async()=>{
    const http={request:vi.fn(async(...args:any[])=>({status:200,headers:{},bytes:encoder.encode('{}'),json:{tweets:[{id:'1',text:'AI',createdAt:time}],has_next_page:false}}))};
    const p=new TwitterApiIoProvider(http,async()=> 'private-key',0.01);
    const result=await p.fetch({...request,requestedBounds:{startTime:time,endTime:'2026-10-05T10:00:00.000Z'}},run);
    const url=new URL(http.request.mock.calls[0][4]);expect(url.searchParams.get('query')).toContain('from:NASA since_time:');expect(result.items[0].sourceItemKey).toBe('x:1');
  });
  it('Apify starts once and resumes the same running actor via continuation',async()=>{
    const response=(json:unknown)=>({status:200,headers:{},bytes:encoder.encode(JSON.stringify(json)),json});
    const http={request:vi.fn(async(...args:any[])=>response(args[4].includes('/actors/')?{data:{id:'actorRun'}}:{data:{status:'RUNNING'}}))};
    const p=new ApifySourceProvider('x_apify',['x_profile'],http,async()=> 'private-token',0.1);
    const first=await p.fetch(request,run);expect(first.continuationToken).toBeDefined();
    await p.fetch({...request,continuation:{providerId:'x_apify',token:first.continuationToken!}},{...run,id:'next-run',sequence:2});
    expect(http.request.mock.calls.filter(c=>String(c[4]).includes('/actors/'))).toHaveLength(1);
  });
  it.each(['linkedin_company','linkedin_profile'] as const)('normalizes %s without inventing publication timestamps',family=>{
    const result=normalizeProviderRecords([{urn:'urn:li:activity:1',text:'Text',url:'https://www.linkedin.com/posts/example'}],family);
    expect(result[0].sourceItemKey).toBe('linkedin:urn:li:activity:1');expect(result[0].publishedAt).toBeUndefined();expect(result[0].contentCompleteness).toBe('UNKNOWN');
  });
  it('website extraction has text and no model provenance',async()=>{
    const p=new WebsiteSourceProvider('website_http',feed('<article>Text</article>'),{execute:async()=>({body:'Text '.repeat(100),title:'Title'})});
    const result=await p.fetch({...request,source:{family:'website',locator:'https://publisher.example/article'}},run);
    expect(result.items[0]).toMatchObject({representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN'});expect(result.items[0]).not.toHaveProperty('modelId');
  });
  it('website uses the third route only after direct HTTP and browser failures',async()=>{
    const http:FeedHttpPort={get:vi.fn(async()=>({status:403,headers:{},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))};
    const execution={execute:vi.fn(async(kind:string)=>kind==='playwright'?{status:403}:{body:'Article text '.repeat(50),title:'Article'})};
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
    expect(result.items).toHaveLength(1);expect(result.requests).toBe(3);expect(result.providerCostUsd).toBeNull();expect(result.complete).toBeUndefined();
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
  it('bounds a dispatcher that ignores abort signals',async()=>{
    const s=setup([]),http=new DurableProviderHttp(s.db,s.payloads,()=>new Promise(()=>{}),1000,5);await http.configureLimit('paid',1);
    await expect(http.request(scope,'op','paid',0.02,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
  });
});
