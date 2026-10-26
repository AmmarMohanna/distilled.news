import type { FeedHttpPort, FetchRun } from './ports';
import type { SourceExecutionPort } from './platform-providers';
import { executeSource } from './platform-providers';
import type { SecretResolver } from './social-providers';
import { requireProviderSuccess, type ProviderHttpPort } from './provider-http';
import { SourceProviderError, type SourceProvider, type SourceFetchRequest, type SourceFamily, type ProviderPage } from './provider-types';
import {discoverWebsiteArticles} from './website-discovery';
import {extractPublicHtml} from './public-html';
import { record, articleUrl, string } from './provider-normalize';
import {readArticleDateMetadata,unreadableArticleReason} from './article-integrity';

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
      if(response.status===429){const h=response.headers['retry-after'],s=Number(h),at=h&&Number.isFinite(s)?Date.now()+Math.max(0,s)*1000:h?Date.parse(h):NaN;throw new SourceProviderError('RATE_LIMIT',Number.isFinite(at)?new Date(at).toISOString():undefined,{detail:'UPSTREAM_RATE_LIMIT',httpStatus:429});}
      if(response.status===401)throw new SourceProviderError('AUTH_REQUIRED',undefined,{detail:'UPSTREAM_AUTHENTICATION',httpStatus:401});
      if(response.status===404||response.status===410)throw new SourceProviderError('UNAVAILABLE',undefined,{detail:'HTTP_NOT_FOUND',httpStatus:response.status});
      if(response.status!==200)throw new SourceProviderError(response.status>=500||response.status===0?'TRANSIENT':'CHALLENGE',undefined,{detail:response.status===403?'ACCESS_BLOCKED':response.status>=500||response.status===0?'UPSTREAM_TRANSPORT_FAILURE':'UPSTREAM_HTTP_ERROR',httpStatus:response.status});
      html=new TextDecoder().decode(response.bytes);requests=response.telemetry.requests;
    }else if(this.id==='website_playwright'){
      const result=record(await executeSource(this.execution,'playwright',{url}));
      if(result.status===451)throw new SourceProviderError('POLICY_REFUSAL');
      if(result.error==='UNAVAILABLE'||result.error==='AUTH_REQUIRED')throw new SourceProviderError('UNAVAILABLE',undefined,{detail:'BROWSER_EXECUTOR_UNAVAILABLE'});
      if(result.status===404||result.status===410)throw new SourceProviderError('UNAVAILABLE',undefined,{detail:'HTTP_NOT_FOUND',httpStatus:Number(result.status)});
      if(result.error||result.status!==200||typeof result.html!=='string')throw new SourceProviderError('CHALLENGE',undefined,{detail:'BROWSER_PAGE_UNUSABLE',...(typeof result.status==='number'?{httpStatus:result.status}:{})});html=result.html;
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
    if(/<title[^>]*>\s*(?:just a moment|access denied|client challenge|captcha)/i.test(html))throw new SourceProviderError('CHALLENGE',undefined,{detail:'ACCESS_CHALLENGE_PAGE'});
    if(html.includes('isAccessibleForFree')&&/paywall/i.test(html)&&new TextEncoder().encode(html).length<=2_000_000&&extractPublicHtml(html,url).accessRestricted)
      throw new SourceProviderError('AUTH_REQUIRED',undefined,{detail:'ARTICLE_ACCESS_RESTRICTED'});
    const catalogue=/schema\.org\/Product\b|CollectionPage|["']Product["']/i.test(html)?extractPublicHtml(html,url):undefined;
    if(catalogue?.accessRestricted)throw new SourceProviderError('AUTH_REQUIRED',undefined,{detail:'ARTICLE_ACCESS_RESTRICTED'});
    const inventory=discoverWebsiteArticles(html,url),discovery=catalogue?.pageKind==='catalogue'?undefined:inventory;
    if(discovery){
      // Do not report a readable but unrecognized section layout as success.
      if(!discovery.articles.length)throw new SourceProviderError('MALFORMED');
      const selected=input.recheckItemKeys?discovery.articles.filter(a=>input.recheckItemKeys!.includes(`url:${a.url}`)):discovery.articles;
      return {items:selected.map(a=>({sourceItemKey:`url:${a.url}`,upstreamId:a.url,url:a.url,publisherId:new URL(a.url).hostname,title:a.title,
        representation:'LISTING_RESULT' as const,contentCompleteness:'UNKNOWN' as const,identityValid:true,authoritativeCurrentState:false})),
        raw:new TextEncoder().encode(html),complete:!discovery.nextPage&&!discovery.paginationUnresolved,continuationToken:discovery.nextPage,
        requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
    }
    const result=record(catalogue?.pageKind==='catalogue'?catalogue:await executeSource(this.execution,'extract',{url,html}));
    const links=Array.isArray(result.articleLinks)?[...new Set(result.articleLinks.filter((v):v is string=>typeof v==='string').map(v=>articleUrl(v)).filter((v):v is string=>!!v&&new URL(v).origin===new URL(url).origin&&v!==url))]:[];
    const landing=new URL(url).pathname==='/';
    if(links.length&&(result.pageKind==='listing'||landing&&result.pageKind!=='catalogue')){
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
    if(!string(result.body)||result.body.length<200)throw new SourceProviderError('MALFORMED',undefined,{detail:'NO_EXTRACTABLE_ARTICLE'});
    const unreadable=unreadableArticleReason(result.body);
    if(unreadable)throw new SourceProviderError('MALFORMED',undefined,{detail:unreadable});
    const dates=readArticleDateMetadata(html,url);
    // A homepage with no article inventory/date is not a complete news article.
    if(landing&&result.pageKind!=='catalogue'||result.pageKind==='listing')throw new SourceProviderError('MALFORMED');
    const canonical=articleUrl(string(result.canonicalUrl));
    // A misconfigured publisher canonical must not collapse all stories onto
    // the homepage. Cross-origin identities remain excluded as before.
    const article=canonical&&new URL(canonical).origin===new URL(url).origin&&new URL(canonical).pathname!=='/'?canonical:url;
    return {items:[{sourceItemKey:`url:${article}`,upstreamId:article,url:article,publisherId:new URL(article).hostname,title:string(result.title),body:result.body,
      publishedAt:dates.publishedAt,updatedAt:dates.updatedAt,language:string(result.language),representation:result.pageKind==='catalogue'?'LISTING_RESULT':'FULL_ARTICLE',contentCompleteness:'UNKNOWN',identityValid:true,authoritativeCurrentState:false}],
      raw:new TextEncoder().encode(html),complete:result.pageKind==='catalogue'?!inventory?.nextPage&&!inventory?.paginationUnresolved:Boolean(dates.publishedAt),...(result.pageKind==='catalogue'&&inventory?.nextPage?{continuationToken:inventory.nextPage}:{}),requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
  }
}
