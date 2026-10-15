import type { FeedHttpPort, FetchRun } from './ports';
import type { SourceExecutionPort } from './platform-providers';
import { executeSource } from './platform-providers';
import type { SecretResolver } from './social-providers';
import { requireProviderSuccess, type ProviderHttpPort } from './provider-http';
import { SourceProviderError, type SourceProvider, type SourceFetchRequest, type SourceFamily, type ProviderPage } from './provider-types';
import {discoverWebsiteArticles} from './website-discovery';
import { record, articleUrl, string, timestamp } from './provider-normalize';

export class WebsiteSourceProvider implements SourceProvider {
  readonly families:SourceFamily[]=['website'];
  constructor(readonly id:'website_http'|'website_playwright'|'website_zyte',private http:FeedHttpPort,
    private execution:SourceExecutionPort,private paid?:ProviderHttpPort,private secrets?:SecretResolver,private ceilingUsd=0.01){}
  async fetch(input:SourceFetchRequest,run:FetchRun):Promise<ProviderPage>{
    // Resume legacy inventory offsets as well as exact same-origin next pages.
    const continuation=input.continuation?.token,inventoryOffset=continuation!==undefined&&/^\d+$/.test(continuation);
    if(inventoryOffset&&!Number.isSafeInteger(Number(continuation)))throw new Error('INVALID_WEBSITE_CONTINUATION');
    const approved=articleUrl(input.source.locator),url=articleUrl(continuation&&!inventoryOffset?continuation:input.source.locator);if(!approved||!url||new URL(url).origin!==new URL(approved).origin)throw new Error('INVALID_ARTICLE_URL');
    const start=Date.now();let html:string,requests=1;
    if(this.id==='website_http'){
      const response=await this.http.get(url,{});
      if(response.status===451)throw new SourceProviderError('POLICY_REFUSAL');
      if(response.status===429)throw new SourceProviderError('RATE_LIMIT');
      if(response.status!==200)throw new SourceProviderError(response.status>=500||response.status===0?'TRANSIENT':'CHALLENGE');
      html=new TextDecoder().decode(response.bytes);requests=response.telemetry.requests;
    }else if(this.id==='website_playwright'){
      const result=record(await executeSource(this.execution,'playwright',{url}));
      if(result.status===451)throw new SourceProviderError('POLICY_REFUSAL');
      if(result.error||result.status!==200||typeof result.html!=='string')throw new SourceProviderError('CHALLENGE');html=result.html;
      requests=Number.isSafeInteger(result.requests)&&result.requests>=1?result.requests:1;
    }else{
      const key=await this.secrets?.('zyte');if(!key||!this.paid)throw new SourceProviderError('UNAVAILABLE');
      const result=await this.paid.request(input.scope,run.id,'zyte',this.ceilingUsd,'https://api.zyte.com/v1/extract',
        {method:'POST',headers:{authorization:`Basic ${btoa(key+':')}`,'content-type':'application/json'},body:JSON.stringify({url,httpResponseBody:true,httpResponseHeaders:true})});
      requireProviderSuccess(result);const data=record(result.json);
      if(data.statusCode===451)throw new SourceProviderError('POLICY_REFUSAL');
      if(data.statusCode!==200||typeof data.httpResponseBody!=='string')throw new SourceProviderError('CHALLENGE');
      try{const bytes=Uint8Array.from(atob(data.httpResponseBody),(c)=>c.charCodeAt(0));html=new TextDecoder().decode(bytes);}catch{throw new SourceProviderError('MALFORMED');}
    }
    if(/<title[^>]*>\s*(?:just a moment|access denied|client challenge|captcha)/i.test(html))throw new SourceProviderError('CHALLENGE');
    const discovery=discoverWebsiteArticles(html,url);
    if(discovery){
      // Do not report a readable but unrecognized section layout as success.
      if(!discovery.articles.length)throw new SourceProviderError('MALFORMED');
      const selected=input.recheckItemKeys?discovery.articles.filter(a=>input.recheckItemKeys!.includes(`url:${a.url}`)):discovery.articles;
      return {items:selected.map(a=>({sourceItemKey:`url:${a.url}`,upstreamId:a.url,url:a.url,publisherId:new URL(a.url).hostname,title:a.title,
        representation:'LISTING_RESULT' as const,contentCompleteness:'UNKNOWN' as const,identityValid:true,authoritativeCurrentState:false})),
        raw:new TextEncoder().encode(html),complete:!discovery.nextPage&&!discovery.paginationUnresolved,continuationToken:discovery.nextPage,
        requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
    }
    const result=record(await executeSource(this.execution,'extract',{url,html}));
    const links=Array.isArray(result.articleLinks)?[...new Set(result.articleLinks.filter((v):v is string=>typeof v==='string').map(v=>articleUrl(v)).filter((v):v is string=>!!v&&new URL(v).origin===new URL(url).origin&&v!==url))]:[];
    const landing=new URL(url).pathname==='/';
    if(links.length&&(result.pageKind==='listing'||landing)){
      const offset=input.continuation?Number(input.continuation.token):0;
      if(!Number.isSafeInteger(offset)||offset<0)throw Error('INVALID_WEBSITE_CONTINUATION');
      const selected=links.slice(offset,offset+input.limit),items:ProviderPage['items']=[];
      for(const link of selected){
        // The listing has not acquired these articles yet. Emit exact candidates;
        // the downstream router acquires each independently and retries failures.
        items.push({sourceItemKey:`url:${link}`,upstreamId:link,url:link,publisherId:new URL(link).hostname,title:link,
          representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',identityValid:true,authoritativeCurrentState:false});
      }
      return {items,raw:new TextEncoder().encode(html),complete:false,
        continuationToken:offset+input.limit<links.length?String(offset+input.limit):undefined,requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
    }
    if(!string(result.body)||result.body.length<200)throw new SourceProviderError('CHALLENGE');
    // A homepage with no article inventory/date is not a complete news article.
    if(landing||result.pageKind==='listing')throw new SourceProviderError('MALFORMED');
    const canonical=articleUrl(string(result.canonicalUrl));
    // A misconfigured publisher canonical must not collapse all stories onto
    // the homepage. Cross-origin identities remain excluded as before.
    const article=canonical&&new URL(canonical).origin===new URL(url).origin&&new URL(canonical).pathname!=='/'?canonical:url;
    return {items:[{sourceItemKey:`url:${article}`,upstreamId:article,url:article,publisherId:new URL(article).hostname,title:string(result.title),body:result.body,
      publishedAt:timestamp(result.publishedAt),language:string(result.language),representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN',identityValid:true,authoritativeCurrentState:false}],
      raw:new TextEncoder().encode(html),complete:Boolean(timestamp(result.publishedAt)),requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
  }
}
