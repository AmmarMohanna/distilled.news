import {expect,it,vi} from 'vitest';
import {PUBLIC_ARTICLE_HTML_MAX_BYTES,SourceProviderError,type ProviderHttpPort,type SourceExecutionPort} from '@distilled/connectors';
import {createArticleFallback,runtimeArticleFallback} from './article-fallback';
import type {Env} from '../types';
import type {AcquisitionClaim} from './acquisition';
const url='https://publisher.example/news/decision';
const claim={job:{id:'stable-job'},input:{observation:{canonicalUrl:url,feedId:'feed',feedSourceId:'source',sourceId:'publisher'}}} as AcquisitionClaim;
const html=`<meta property="article:published_time" content="2026-10-01T12:00:00Z"><article><h1>Decision</h1><p>${'The council approved the proposal. '.repeat(30)}</p></article>`;
it('retains readable article text in a publisher page larger than the previous six-megabyte limit',async()=>{
 const large=html+'<script>'+ 'x'.repeat(8_000_000)+'</script>';
 const f=fixture({status:200,url,html:large});
 expect(await f.fallback(claim)).toMatchObject({provider:'website_playwright',publishedAt:'2026-10-01T12:00:00.000Z'});
 expect(f.request).not.toHaveBeenCalled();
});
it.each(['<title>Just a moment</title>',html+'<script>'+'x'.repeat(PUBLIC_ARTICLE_HTML_MAX_BYTES)+'</script>'])('continues from browser challenge or oversized HTML to funded Zyte',async browserHtml=>{
 const f=fixture({status:200,url,html:browserHtml});expect(await f.fallback(claim)).toMatchObject({provider:'website_zyte'});expect(f.request).toHaveBeenCalledTimes(1);
});
it('accepts exact trailing-slash normalization without changing candidate identity',async()=>{
 const f=fixture({error:'UNAVAILABLE'});f.request.mockResolvedValue({status:200,headers:{},json:{statusCode:200,url:url+'/',httpResponseBody:btoa(html)}});
 expect(await f.fallback(claim)).toMatchObject({provider:'website_zyte',url,canonicalUrl:url});
});
it('accepts Nature HTML whose publisher canonical points to the same article PDF',async()=>{
 const nature='https://www.nature.com/articles/s41586-026-11328-3',f=fixture({error:'UNAVAILABLE'});
 f.request.mockResolvedValue({status:200,headers:{},json:{statusCode:200,url:nature,httpResponseBody:btoa('<link rel="canonical" href="'+nature+'.pdf">'+html)}});
 expect(await f.fallback({...claim,input:{observation:{...claim.input.observation,canonicalUrl:nature}}} as AcquisitionClaim)).toMatchObject({canonicalUrl:nature,provider:'website_zyte'});
});
function fixture(browser:unknown={status:200,url,html}){
 const execute=vi.fn().mockResolvedValue(browser),request=vi.fn().mockResolvedValue({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url,httpResponseBody:btoa(html)}});
 const authorize=vi.fn().mockResolvedValue(undefined),initialize=vi.fn().mockResolvedValue(undefined);
 const fallback=createArticleFallback({execution:{execute} as SourceExecutionPort,authorize,zyte:{http:{request} as ProviderHttpPort,key:'test-secret',ceilingUsd:.01,initialize}});
 return {fallback,execute,request,authorize,initialize};
}
it('uses Playwright first and avoids paid dispatch when its exact article is readable',async()=>{
 const f=fixture();expect(await f.fallback(claim)).toMatchObject({status:200,url,provider:'website_playwright',pageKind:'article'});
 expect(f.execute).toHaveBeenCalledWith('playwright',{url,exactCandidateOnly:true},{timeoutMs:25000});expect(f.request).not.toHaveBeenCalled();
});
it('falls back to Zyte after helper transport failure with stable operation identity across retries',async()=>{
 const f=fixture();f.execute.mockRejectedValue(new Error('SOURCE_EXECUTION_UNAVAILABLE'));
 for(let i=0;i<2;i++)expect(await f.fallback(claim)).toMatchObject({provider:'website_zyte',url});
 expect(f.request.mock.calls[0][1]).toBe(f.request.mock.calls[1][1]);expect(f.request.mock.calls[0][2]).toBe('zyte');expect(f.initialize).toHaveBeenCalledTimes(2);
});
it.each([401,429,451,404])('browser status %s stops before Zyte',async status=>{
 const f=fixture({status,url});await expect(f.fallback(claim)).rejects.toHaveProperty('code',({401:'AUTH_REQUIRED',429:'RATE_LIMIT',451:'POLICY_DENIED',404:'UNSUPPORTED'} as Record<number,string>)[status]);expect(f.request).not.toHaveBeenCalled();
});
it('does not promote browser output from an old helper without final URL evidence',async()=>{
 const f=fixture({status:200,html});expect(await f.fallback(claim)).toMatchObject({provider:'website_zyte'});
});
it('does not treat listing HTML as acquired article evidence',async()=>{
 const f=fixture({status:200,url,html:'<html><nav>News</nav></html>'});f.request.mockResolvedValue({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url,httpResponseBody:btoa('<html>Listing</html>')}});
 await expect(f.fallback(claim)).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'ZYTE_ARTICLE_TEXT_UNAVAILABLE'}});
});
it('reports a fetched catalogue as a listing instead of retaining the old publisher challenge',async()=>{
 const f=fixture({error:'UNAVAILABLE'}),listing='<main><h2><a href="/one">One</a></h2><h2><a href="/two">Two</a></h2></main>';
 f.request.mockResolvedValue({status:200,headers:{},json:{statusCode:200,url,httpResponseBody:btoa(listing)}});
 await expect(f.fallback(claim)).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'NO_PRIMARY_ARTICLE_TEXT'}});
});
it('does not spend on Zyte after an explicit browser paywall without article content',async()=>{
 const f=fixture({status:200,url,html:'<script type="application/ld+json">{"@type":"WebPage","isAccessibleForFree":false}</script><h1>Story</h1><main>Teaser only<div id="paywall-prompt"></div></main>'});
 await expect(f.fallback(claim)).rejects.toMatchObject({code:'AUTH_REQUIRED',diagnostic:{detail:'ARTICLE_ACCESS_RESTRICTED'}});
 expect(f.request).not.toHaveBeenCalled();
});
it('never promotes a Zyte response for another URL',async()=>{
 const f=fixture({error:'UNAVAILABLE'});f.request.mockResolvedValue({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url:url+'/other',httpResponseBody:btoa(html)}});
 await expect(f.fallback(claim)).rejects.toMatchObject({code:'INVALID_RESULT'});
});
it('stops before paid dispatch on approval revocation',async()=>{
 const f=fixture({error:'UNAVAILABLE'});f.authorize.mockRejectedValue(new Error('revoked'));
 await expect(f.fallback(claim)).rejects.toThrow('revoked');expect(f.execute).not.toHaveBeenCalled();expect(f.request).not.toHaveBeenCalled();
});
it('preserves helper backpressure instead of sending a paid fallback during capacity wait',async()=>{
 const f=fixture();f.execute.mockRejectedValue(new SourceProviderError('BACKPRESSURE'));
 await expect(f.fallback(claim)).rejects.toHaveProperty('code','BACKPRESSURE');expect(f.request).not.toHaveBeenCalled();
});
it('preserves uncertain paid outcomes rather than manufacturing a new operation',async()=>{
 const f=fixture({error:'UNAVAILABLE'});f.request.mockRejectedValue(new SourceProviderError('UNCERTAIN_PAID_SUBMISSION'));
 await expect(f.fallback(claim)).rejects.toHaveProperty('code','UNCERTAIN_PAID_SUBMISSION');expect(f.request).toHaveBeenCalledTimes(1);
});
it('does not dispatch Zyte when the deployment has no funded operation ceiling',async()=>{
 const dispatch=vi.fn(),execution={execute:vi.fn().mockResolvedValue({error:'UNAVAILABLE'})} as SourceExecutionPort;
 const fallback=runtimeArticleFallback({ZYTE_API_KEY:'configured',SOURCE_PROVIDER_BUDGETS_JSON:'{"zyte":15}',SOURCE_OPERATION_CEILINGS_JSON:'{"zyte":0}'} as Env,execution,async()=>{},dispatch);
 expect(await fallback(claim)).toBeUndefined();expect(dispatch).not.toHaveBeenCalled();
});
it('a Zyte origin authentication challenge is never promoted as public article evidence',async()=>{
 const f=fixture({error:'UNAVAILABLE'});f.request.mockResolvedValue({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url,httpResponseBody:btoa(html),httpResponseHeaders:[{name:'WWW-Authenticate',value:'Basic'}]}});
 await expect(f.fallback(claim)).rejects.toHaveProperty('code','AUTH_REQUIRED');
});
it('accepts an RSS tracking alias while preserving the original candidate and paid identity',async()=>{
 const tracked=url+'?traffic_source=rss',f=fixture({status:200,url,html:'<link rel="canonical" href="'+url+'">'+html});
 const result=await f.fallback({...claim,input:{observation:{...claim.input.observation,canonicalUrl:tracked}}} as AcquisitionClaim);
 expect(result).toMatchObject({provider:'website_playwright',canonicalUrl:tracked,url:tracked});expect(f.request).not.toHaveBeenCalled();
});
it('still rejects a meaningful canonical query change',async()=>{
 const f=fixture({status:200,url,html:'<link rel="canonical" href="'+url+'?article=other">'+html});
 await expect(f.fallback(claim)).rejects.toMatchObject({code:'INVALID_RESULT',diagnostic:{detail:'FALLBACK_CANONICAL_MISMATCH'}});expect(f.request).not.toHaveBeenCalled();
});
