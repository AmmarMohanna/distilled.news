import type { FetchRun } from './ports';
import type { SourceProvider, SourceFetchRequest, ProviderPage, SourceFamily } from './provider-types';
import { SourceProviderError } from './provider-types';
import { requireProviderSuccess, type ProviderHttpPort } from './provider-http';
import { normalizeProviderRecords, record, string } from './provider-normalize';

export type SecretResolver=(providerId:string)=>Promise<string|undefined>;
const validateAccount=(value:string)=>{const v=value.replace(/^@/,'');if(!/^[A-Za-z0-9_]{1,32}$/.test(v))throw new Error('INVALID_ACCOUNT');return v;};

export class TwitterApiIoProvider implements SourceProvider {
  readonly id='x_twitterapi_io';readonly families:SourceFamily[]=['x_profile','x_search'];
  constructor(private readonly http:ProviderHttpPort,private readonly secrets:SecretResolver,private readonly ceilingUsd:number){}
  async fetch(input:SourceFetchRequest,run:FetchRun):Promise<ProviderPage>{
    const key=await this.secrets(this.id);if(!key)throw new SourceProviderError('UNAVAILABLE');
    const start=Date.now(),recheck=input.recheckItemKeys;
    if(recheck&&(recheck.length>input.limit||recheck.some(id=>!/^x:\d+$/.test(id))))throw new Error('INVALID_RECHECK_ID');
    const profile=input.source.family==='x_profile'&&!input.requestedBounds.startTime&&!input.requestedBounds.endTime;
    const url=new URL(recheck?'https://api.twitterapi.io/twitter/tweets':profile?'https://api.twitterapi.io/twitter/user/last_tweets':'https://api.twitterapi.io/twitter/tweet/advanced_search');
    let query=input.source.family==='x_profile'?`from:${validateAccount(input.source.locator)}`:input.source.locator;
    if(input.requestedBounds.startTime)query+=` since_time:${Math.floor(Date.parse(input.requestedBounds.startTime)/1000)}`;
    if(input.requestedBounds.endTime)query+=` until_time:${Math.ceil(Date.parse(input.requestedBounds.endTime)/1000)}`;
    if(recheck)url.searchParams.set('tweet_ids',recheck.map(id=>id.slice(2)).join(','));
    else if(profile){url.searchParams.set('userName',validateAccount(input.source.locator));url.searchParams.set('includeReplies','true');}
    else{url.searchParams.set('query',query);url.searchParams.set('queryType','Latest');}
    if(input.continuation)url.searchParams.set('cursor',input.continuation.token);
    const response=await this.http.request(input.scope,run.id,this.id,this.ceilingUsd,url.href,{headers:{'X-API-Key':key}});
    requireProviderSuccess(response);const json=record(response.json);
    const tweets=Array.isArray(json.tweets)?json.tweets:record(json.data).tweets;
    if(!Array.isArray(tweets)||(!recheck&&(typeof json.has_next_page!=='boolean'||(json.has_next_page&&!string(json.next_cursor)))))throw new SourceProviderError('MALFORMED');
    const items=normalizeProviderRecords(tweets,input.source.family);
    if(recheck&&items.some(item=>!recheck.includes(item.sourceItemKey)))throw new SourceProviderError('MALFORMED');
    return {items,raw:response.bytes,
      continuationToken:json.has_next_page?json.next_cursor:undefined,requests:1,latencyMs:Date.now()-start,providerCostUsd:null};
  }
}

export const TESTED_ACTORS={google_news:'groupoject/google-news-scraper',x:'kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest',
  linkedin_company:'harvestapi/linkedin-company-posts',linkedin_profile:'harvestapi/linkedin-profile-posts'} as const;

export class ApifySourceProvider implements SourceProvider {
  constructor(readonly id:string,readonly families:SourceFamily[],private readonly http:ProviderHttpPort,
    private readonly secrets:SecretResolver,private readonly ceilingUsd:number,private readonly actorOverride?:string){}
  async fetch(input:SourceFetchRequest,run:FetchRun):Promise<ProviderPage>{
    if(input.recheckItemKeys)throw new SourceProviderError('UNAVAILABLE');
    const token=await this.secrets('apify');if(!token)throw new SourceProviderError('UNAVAILABLE');
    const start=Date.now(),headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
    const actor=this.actorOverride??(input.source.family==='x_profile'||input.source.family==='x_search'?TESTED_ACTORS.x:
      input.source.family==='google_news'?TESTED_ACTORS.google_news:input.source.family==='linkedin_company'?TESTED_ACTORS.linkedin_company:
        input.source.family==='linkedin_profile'?TESTED_ACTORS.linkedin_profile:input.source.actorId);
    if(!actor||!/^[-\w]+\/[-\w]+$/.test(actor))throw new SourceProviderError('UNAVAILABLE');
    let actorRun:string|undefined,dataset:string|undefined,offset=0,requests=0;
    if(input.continuation){
      let cursor:any;try{cursor=JSON.parse(input.continuation.token);}catch{throw new Error('INVALID_CONTINUATION');}
      if(cursor.actor!==actor||!/^\w+$/.test(cursor.runId)||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)throw new Error('INVALID_CONTINUATION');
      actorRun=cursor.runId;offset=cursor.offset;
    }
    if(!actorRun){
      const url=new URL(`https://api.apify.com/v2/actors/${actor.replace('/','~')}/runs`);
      url.searchParams.set('maxTotalChargeUsd',String(this.ceilingUsd));url.searchParams.set('timeout','60');url.searchParams.set('waitForFinish','1');
      const response=await this.http.request(input.scope,run.id+':start',this.id,this.ceilingUsd,url.href,
        {method:'POST',headers,body:JSON.stringify(this.actorInput(input))});requests++;requireProviderSuccess(response);
      actorRun=string(record(record(response.json).data).id);
      if(!actorRun)throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
      // Commit the actor identity through the collector's durable snapshot/handoff
      // before any status or dataset operation can fail. Later reads always resume it.
      return {items:[],raw:response.bytes,continuationToken:JSON.stringify({actor,runId:actorRun,offset}),
        requests,latencyMs:Date.now()-start,providerCostUsd:null};
    }
    const status=await this.http.request(input.scope,run.id+':status',this.id,0.000001,`https://api.apify.com/v2/actor-runs/${actorRun}`,{headers});
    requests++;requireProviderSuccess(status);const data=record(record(status.json).data);
    const next=()=>JSON.stringify({actor,runId:actorRun,offset});
    if(['RUNNING','READY'].includes(data.status))return {items:[],raw:status.bytes,continuationToken:next(),requests,latencyMs:Date.now()-start,providerCostUsd:null};
    if(data.status!=='SUCCEEDED')throw new SourceProviderError('TRANSIENT');
    dataset=string(data.defaultDatasetId);if(!dataset||!/^\w+$/.test(dataset))throw new SourceProviderError('MALFORMED');
    const url=new URL(`https://api.apify.com/v2/datasets/${dataset}/items`);url.searchParams.set('format','json');url.searchParams.set('clean','false');
    url.searchParams.set('offset',String(offset));url.searchParams.set('limit',String(input.limit));
    const response=await this.http.request(input.scope,run.id+':dataset',this.id,0.000001,url.href,{headers});requests++;requireProviderSuccess(response);
    if(!Array.isArray(response.json))throw new SourceProviderError('MALFORMED');
    offset+=response.json.length;
    // An extra bounded empty page may be required; dataset exhaustion is not source recall proof.
    return {items:normalizeProviderRecords(response.json,input.source.family),raw:response.bytes,
      continuationToken:response.json.length===input.limit?next():undefined,requests,latencyMs:Date.now()-start,
      // Actor lifetime spend is not per-page cost; keep it in the raw status, not duplicated telemetry.
      providerCostUsd:null};
  }
  private actorInput(input:SourceFetchRequest):Record<string,unknown>{
    if(input.source.family==='google_news')return {queries:[input.source.locator],geo:input.source.region??'US',language:input.source.language??'en',maxItemsPerQuery:input.limit,maxQueries:1,dedupe:true,enableAnalysis:false,monitoringMode:false,
      publishedFrom:input.requestedBounds.startTime,publishedThrough:input.requestedBounds.endTime};
    if(input.source.family==='x_profile')return {from:validateAccount(input.source.locator),maxItems:input.limit,queryType:'Latest'};
    if(input.source.family==='x_search')return {twitterContent:input.source.locator,maxItems:input.limit,queryType:'Latest'};
    if(input.source.family.startsWith('linkedin'))return {targetUrls:[input.source.locator],maxPosts:input.limit,scrapeComments:false,scrapeReactions:false};
    return {...input.source.actorInput,maxItems:input.limit};
  }
}
