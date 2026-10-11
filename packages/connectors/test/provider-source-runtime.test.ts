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
import type { FeedHttpPort, FeedResponse } from '../src/source-runtime/ports';

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
    const result=await new FeedSourceProvider('google_rss',http).fetch({...request,source:{family:'google_news',locator:'AI'}});
    expect(result.items[0]).toMatchObject({sourceItemKey:'id:google-id',url:'https://publisher.example/article?edition=us',publisherId:'publisher.example',representation:'LISTING_RESULT'});
    expect(result).toMatchObject({requests:2,latencyMs:10});
    expect(vi.mocked(http.get).mock.calls.map(([url])=>new URL(url).hostname)).toEqual(['news.google.com','news.google.com']);
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
  it('bounds a dispatcher that ignores abort signals',async()=>{
    const s=setup([]),http=new DurableProviderHttp(s.db,s.payloads,()=>new Promise(()=>{}),1000,5);await http.configureLimit('paid',1);
    await expect(http.request(scope,'op','paid',0.02,'https://api.twitterapi.io/twitter/tweets',{})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
  });
});
