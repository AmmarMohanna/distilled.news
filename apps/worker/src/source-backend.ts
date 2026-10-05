import {BoundedFeedHttp,createSourceCollector,D1ProviderSourceRepository,D1ProviderPollScheduler,
  DurableProviderHttp,HttpSourceExecution,R2SourcePayloadStore,sourceSqlFromD1,
  D1RssPollScheduler,RssSourceCollector,D1SourceRepository,type RssRequest,
  type SourceFetchRequest} from '@distilled/connectors';
import type {CandidateIntakePort} from '@distilled/contracts';

export interface SourceBackendEnv {
  DB:D1Database;
  RAW_ARCHIVE:R2Bucket;
  TWITTERAPI_IO_API_KEY?:string;
  APIFY_API_TOKEN?:string;
  ZYTE_API_KEY?:string;
  SOURCE_EXECUTION_URL?:string;
  SOURCE_EXECUTION_TOKEN?:string;
  SOURCE_EXECUTION_SERVICE?:Fetcher;
  SOURCE_OPERATION_CEILINGS_JSON?:string;
}

/** Composition shared by the connector staging backend and downstream integration.
 * The caller supplies real intake and current persisted source approval checks. */
export function createSourceBackend(env:SourceBackendEnv,options:{
  intake:CandidateIntakePort;
  intakeForRequest?:(request:SourceFetchRequest)=>CandidateIntakePort;
  authorize:(request:SourceFetchRequest)=>Promise<boolean>;
  fetcher?:typeof fetch;
}) {
  const sql=sourceSqlFromD1(env.DB),payloads=new R2SourcePayloadStore(env.RAW_ARCHIVE);
  const dispatch=options.fetcher??fetch;
  const secrets=async(id:string)=>id==='x_twitterapi_io'?env.TWITTERAPI_IO_API_KEY:id==='apify'?env.APIFY_API_TOKEN:id==='zyte'?env.ZYTE_API_KEY:undefined;
  const ceilings={twitterApiIo:0,apify:0,zyte:0};
  if(env.SOURCE_OPERATION_CEILINGS_JSON){
    const parsed=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!Object.hasOwn(ceilings,k)))throw new Error('INVALID_SOURCE_CEILINGS');
    for(const key of Object.keys(ceilings) as (keyof typeof ceilings)[]){
      const value=parsed[key]??0;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('INVALID_SOURCE_CEILINGS');ceilings[key]=value;
    }
  }
  const paidHttp=new DurableProviderHttp(sql,payloads,dispatch);
  const makeCollector=(request:SourceFetchRequest)=>{
    const guardedDispatch:typeof fetch=async(value,init)=>{
      if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
      return dispatch(value,init);
    };
    const executionDispatch:typeof fetch=async(value,init)=>{
      if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
      // Private execution has no public-fetch fallback when a VPC binding is configured.
      return env.SOURCE_EXECUTION_SERVICE?env.SOURCE_EXECUTION_SERVICE.fetch(value,init):guardedDispatch(value,init);
    };
    const execution=env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN?
      new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,executionDispatch,!!env.SOURCE_EXECUTION_SERVICE):
      {execute:async()=>({error:'UNAVAILABLE'})};
    const intake:CandidateIntakePort={acceptBatch:async batch=>{
      if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
      return (options.intakeForRequest?.(request)??options.intake).acceptBatch(batch);
    }};
    // Only the exact approved source URL or its deterministic provider endpoint is admitted.
    const approved=request.source.family==='google_news'?'https://news.google.com':request.source.family==='telegram'?'https://t.me':new URL(request.source.family==='rss'||request.source.family==='website'?request.source.locator:'https://unused.example').origin;
    const http=new BoundedFeedHttp(async(value,init)=>{
      if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
      const url=new URL(value),host=url.hostname;
      if(url.protocol!=='https:'||url.port||url.username||url.password||url.origin!==approved||
        !host.includes('.')||/\.(?:localhost|local|internal|test|invalid)$/.test(host)||/^\d+(?:\.\d+){0,3}$/.test(host)||host.startsWith('['))throw new Error('SOURCE_URL_DENIED');
      // Deployment must retain global_fetch_strictly_public to enforce public DNS at dispatch.
      return dispatch(url.href,{...init,redirect:'manual'});
    });
    return {provider:createSourceCollector({repository:new D1ProviderSourceRepository(sql),payloads,intake,http,paidHttp:new DurableProviderHttp(sql,payloads,guardedDispatch),execution,secrets,ceilings}),
      rss:new RssSourceCollector(new D1SourceRepository(sql),payloads,http,intake)};
  };
  const collector={collect:async(request:SourceFetchRequest,order?:readonly string[],offset?:number)=>{
    if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
    return makeCollector(request).provider.collect(request,order,offset);
  }};
  const rssRequest=(r:RssRequest):SourceFetchRequest=>({scope:r.scope,runId:r.runId,configurationRevision:r.configurationRevision,source:{family:'rss',locator:r.url},requestedBounds:r.requestedBounds??{},limit:r.maxItems??100});
  const rssCollector={collect:async(r:RssRequest,offset=0)=>{
    const request=rssRequest(r);
    if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
    return makeCollector(request).rss.collect(r,offset);
  }};
  return {collect:collector.collect,collectRss:rssCollector.collect,payloads,paidHttp,
    scheduler:new D1ProviderPollScheduler(sql,collector,options.authorize),
    rssScheduler:new D1RssPollScheduler(sql,rssCollector,r=>options.authorize(rssRequest(r)))};
}
