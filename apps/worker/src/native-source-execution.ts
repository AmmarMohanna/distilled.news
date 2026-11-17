import {extractPublicHtml,PUBLIC_ARTICLE_HTML_MAX_BYTES,normalizeRssSnapshot,type SourceExecutionPort} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Native parsing must not disable configured browser/Google capabilities.
 * public_article is the alternate-egress fallback after the Worker fetch. */
export function composeSourceExecution(nativeEnabled:boolean,helper:SourceExecutionPort|undefined,fetcher:typeof fetch=fetch):SourceExecutionPort {
 const native=nativeEnabled?nativeSourceExecution(fetcher):undefined;
 return {execute(kind,input,bounds){
  if(native&&['extract','feedparser'].includes(kind))return native.execute(kind,input,bounds);
  if(helper)return helper.execute(kind,input,bounds);
  return native?native.execute(kind,input,bounds):Promise.resolve({error:'UNAVAILABLE'});
 }};
}

/** Public HTTP and deterministic extraction run directly on Workers. No login,
 * JavaScript challenge solving, invented dates, or private-network fallback. */
export function nativeSourceExecution(fetcher:typeof fetch=fetch):SourceExecutionPort {
 const extract=(url:string,html:string)=>{
  new WorkerPublicSourceFetch(url,fetcher);
  if(new TextEncoder().encode(html).length>PUBLIC_ARTICLE_HTML_MAX_BYTES)throw Error('SOURCE_TOO_LARGE');
  return extractPublicHtml(html,url);
 };
 return {async execute(kind,input){
  if(kind==='extract'&&typeof input.url==='string'&&typeof input.html==='string')return extract(input.url,input.html);
  if(kind==='feedparser'&&typeof input.xml==='string'&&typeof input.url==='string')return {items:normalizeRssSnapshot(input.xml,input.url)};
  if(kind==='public_article'&&typeof input.url==='string'){
   const page=await new WorkerPublicSourceFetch(input.url,fetcher,{followSameOriginRedirects:true,maxBytes:PUBLIC_ARTICLE_HTML_MAX_BYTES}).get(input.url);
   if(page.status!==200||page.authenticationRequired)return {status:page.status,error:'UNAVAILABLE',failureOrigin:'upstream_http'};
   // The acquisition router requires the fetched identity as well as the
   // publisher canonical identity. Without url every native HTTP fallback
   // was discarded even when extraction succeeded.
   return {status:200,url:page.url??input.url,...extract(page.url??input.url,page.body)};
  }
  return {error:'UNAVAILABLE'};
 }};
}
