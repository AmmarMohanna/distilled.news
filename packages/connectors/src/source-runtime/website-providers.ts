import type { FeedHttpPort, FetchRun } from './ports';
import type { SourceExecutionPort } from './platform-providers';
import { executeSource } from './platform-providers';
import type { SecretResolver } from './social-providers';
import { requireProviderSuccess, type ProviderHttpPort } from './provider-http';
import { SourceProviderError, type SourceProvider, type SourceFetchRequest, type SourceFamily, type ProviderPage } from './provider-types';
import { record, articleUrl, string, timestamp } from './provider-normalize';

export class WebsiteSourceProvider implements SourceProvider {
  readonly families:SourceFamily[]=['website'];
  constructor(readonly id:'website_http'|'website_playwright'|'website_zyte',private http:FeedHttpPort,
    private execution:SourceExecutionPort,private paid?:ProviderHttpPort,private secrets?:SecretResolver,private ceilingUsd=0.01){}
  async fetch(input:SourceFetchRequest,run:FetchRun):Promise<ProviderPage>{
    const url=articleUrl(input.source.locator);if(!url)throw new Error('INVALID_ARTICLE_URL');
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
    const result=record(await executeSource(this.execution,'extract',{url,html}));
    if(!string(result.body)||result.body.length<200)throw new SourceProviderError('CHALLENGE');
    return {items:[{sourceItemKey:`url:${url}`,upstreamId:url,url,publisherId:new URL(url).hostname,title:string(result.title),body:result.body,
      publishedAt:timestamp(result.publishedAt),language:string(result.language),representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN',identityValid:true,authoritativeCurrentState:false}],
      raw:new TextEncoder().encode(html),requests,latencyMs:Date.now()-start,providerCostUsd:this.id==='website_zyte'?null:0};
  }
}
