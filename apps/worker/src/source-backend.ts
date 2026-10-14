import {BoundedFeedHttp,createSourceCollector,D1ProviderSourceRepository,D1ProviderPollScheduler,
  DurableProviderHttp,HttpSourceExecution,R2SourcePayloadStore,sourceSqlFromD1,
  D1RssPollScheduler,RssSourceCollector,D1SourceRepository,type RssRequest,
  type SourceFetchRequest} from '@distilled/connectors';
import type {CandidateIntakePort} from '@distilled/contracts';
import {sharedPublicHttp} from './connector-public-cache';

export interface SourceBackendEnv {
  DB:D1Database;
  RAW_ARCHIVE:R2Bucket;
  TWITTERAPI_IO_API_KEY?:string;
  APIFY_API_TOKEN?:string;
  ZYTE_API_KEY?:string;
  SOURCE_EXECUTION_URL?:string;
  SOURCE_EXECUTION_TOKEN?:string;
  SOURCE_EXECUTION_SERVICE?:Fetcher;
  SOURCE_GOOGLE_RESOLUTION_ENABLED?:string;
  SOURCE_OPERATION_CEILINGS_JSON?:string;
  SOURCE_PER_PROVIDER_BUDGET_USD?:string;
  SOURCE_SHARED_PUBLIC_FETCH_ENABLED?:string;
  SOURCE_QUEUE_SCHEDULING_ENABLED?:string;
  SOURCE_PROVIDER_BUDGETS_JSON?:string;
}

/** Composition shared by the connector staging backend and downstream integration.
 * The caller supplies real intake and current persisted source approval checks. */
export function createSourceBackend(env:SourceBackendEnv,options:{
  intake:CandidateIntakePort;
  intakeForRequest?:(request:SourceFetchRequest)=>CandidateIntakePort;
  authorize:(request:SourceFetchRequest)=>Promise<boolean>;
  fetcher?:typeof fetch;
  providerPageLimit?:number;
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
  const sourceProviderLimit=env.SOURCE_PER_PROVIDER_BUDGET_USD===undefined?undefined:Number(env.SOURCE_PER_PROVIDER_BUDGET_USD);
  if(sourceProviderLimit!==undefined&&(!env.SOURCE_PER_PROVIDER_BUDGET_USD?.trim()||!Number.isFinite(sourceProviderLimit)||sourceProviderLimit<0))throw new Error('INVALID_SOURCE_PROVIDER_BUDGET');
  const deploymentLimits=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'):undefined;
  if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&(!deploymentLimits||typeof deploymentLimits!=='object'||Array.isArray(deploymentLimits)||Object.keys(deploymentLimits).some(k=>!['x_twitterapi_io','x_apify','google_apify','linkedin_apify','zyte'].includes(k))))throw new Error('INVALID_SOURCE_BUDGETS');
  const paidHttp=new DurableProviderHttp(sql,payloads,dispatch,4_000_000,20_000,sourceProviderLimit,deploymentLimits);
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
    const authorizeUrl=async(value:string)=>{
      if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
      const url=new URL(value),host=url.hostname;
      if(url.protocol!=='https:'||url.port||url.username||url.password||url.origin!==approved||
        !host.includes('.')||/\.(?:localhost|local|internal|test|invalid)$/.test(host)||/^\d+(?:\.\d+){0,3}$/.test(host)||host.startsWith('['))throw new Error('SOURCE_URL_DENIED');
      // Deployment must retain global_fetch_strictly_public to enforce public DNS at dispatch.
    };
    const baseHttp=new BoundedFeedHttp(async(value,init)=>{await authorizeUrl(value);return dispatch(value,{...init,redirect:'manual'})});
    const http=env.SOURCE_SHARED_PUBLIC_FETCH_ENABLED==='true'?sharedPublicHttp(env.DB,env.RAW_ARCHIVE,baseHttp,authorizeUrl):baseHttp;
    return {provider:createSourceCollector({repository:new D1ProviderSourceRepository(sql),payloads,intake,http,paidHttp:new DurableProviderHttp(sql,payloads,guardedDispatch,4_000_000,20_000,sourceProviderLimit,deploymentLimits),execution,secrets,ceilings,
      enrichRssArticles:!!(env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN),resolveGoogleArticles:env.SOURCE_GOOGLE_RESOLUTION_ENABLED==='true'}),
      rss:new RssSourceCollector(new D1SourceRepository(sql),payloads,http,intake)};
  };
  const scheduledCollector={collect:async(request:SourceFetchRequest,order?:readonly string[],offset?:number)=>makeCollector(request).provider.collect(request,order,offset)};
  const collector={collect:async(request:SourceFetchRequest,order?:readonly string[],offset?:number)=>{
    if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
    return scheduledCollector.collect(request,order,offset);
  }};
  const rssRequest=(r:RssRequest):SourceFetchRequest=>({scope:r.scope,runId:r.runId,configurationRevision:r.configurationRevision,source:{family:'rss',locator:r.url},requestedBounds:r.requestedBounds??{},limit:r.maxItems??100});
  const scheduledRssCollector={collect:async(r:RssRequest,offset=0)=>makeCollector(rssRequest(r)).rss.collect(r,offset)};
  const rssCollector={collect:async(r:RssRequest,offset=0)=>{
    const request=rssRequest(r);
    if(!await options.authorize(request))throw new Error('SOURCE_NOT_APPROVED');
    return scheduledRssCollector.collect(r,offset);
  }};
  return {collect:collector.collect,collectRss:rssCollector.collect,payloads,paidHttp,
    // Scheduler admission already performed the initial approval read. Public
    // direct calls retain their own admission; every transport/cache/handoff
    // boundary still revalidates current persisted approval independently.
    scheduler:new D1ProviderPollScheduler(sql,scheduledCollector,options.authorize,Date.now,options.providerPageLimit??100,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'),
    rssScheduler:new D1RssPollScheduler(sql,scheduledRssCollector,r=>options.authorize(rssRequest(r)),Date.now,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true')};
}
