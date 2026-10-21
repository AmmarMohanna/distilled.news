import {extractPublicHtml,normalizeRssSnapshot,type SourceExecutionPort} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Public HTTP and deterministic extraction run directly on Workers. No login,
 * JavaScript challenge solving, invented dates, or private-network fallback. */
export function nativeSourceExecution(fetcher:typeof fetch=fetch):SourceExecutionPort {
 const extract=(url:string,html:string)=>{
  new WorkerPublicSourceFetch(url,fetcher);
  if(new TextEncoder().encode(html).length>2_000_000)throw Error('SOURCE_TOO_LARGE');
  return extractPublicHtml(html,url);
 };
 return {async execute(kind,input){
  if(kind==='extract'&&typeof input.url==='string'&&typeof input.html==='string')return extract(input.url,input.html);
  if(kind==='feedparser'&&typeof input.xml==='string'&&typeof input.url==='string')return {items:normalizeRssSnapshot(input.xml,input.url)};
  if(kind==='public_article'&&typeof input.url==='string'){
   const page=await new WorkerPublicSourceFetch(input.url,fetcher,{followSameOriginRedirects:true}).get(input.url);
   if(page.status!==200||page.authenticationRequired)return {status:page.status,error:'UNAVAILABLE'};
   return {status:200,...extract(page.url??input.url,page.body)};
  }
  return {error:'UNAVAILABLE'};
 }};
}
