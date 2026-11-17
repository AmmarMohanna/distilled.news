import {HttpSourceExecution} from '@distilled/connectors';
import type {Env} from './types';
import type {SourceSearchResult} from './source-search';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Resolve listing identities only through the configured free helper. Its
 * output is not readable evidence: the normal public article check still runs. */
export async function resolveSearchGoogleArticles(results:SourceSearchResult[],env?:Env,cache?:Pick<Cache,'match'|'put'>):Promise<SourceSearchResult[]> {
 if(env?.SOURCE_GOOGLE_RESOLUTION_ENABLED!=='true'||!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)return results;
 const listings=[...new Set(results.flatMap(row=>{
  try{const url=new URL(row.articleUrl??'');return url.protocol==='https:'&&url.hostname==='news.google.com'&&!url.port&&!url.username&&!url.password&&/^\/(?:rss\/)?articles\/[A-Za-z0-9_-]{1,2000}$/.test(url.pathname)&&[...url.searchParams.keys()].every(key=>['hl','gl','ceid','oc'].includes(key))?[url.href]:[];}catch{return [];}
 }))].slice(0,60);
 const resolved=new Map<string,string>();
 const key=async(url:string)=>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
  return new Request('https://source-search-resolution.invalid/'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join(''));
 };
 const valid=(inputUrl:string,value:unknown):value is string=>{
  if(typeof value!=='string'||value.length>4096)return false;
  try{
   new WorkerPublicSourceFetch(value);
   const target=new URL(value),host=target.hostname.replace(/^www\./,'');
   if(/\/(?:login|signin|sign-in|authorize|oauth)(?:\/|$)/i.test(target.pathname))return false;
   return host!=='news.google.com'&&results.some(row=>row.articleUrl===inputUrl&&new URL(row.publisher.includes('://')?row.publisher:'https://'+row.publisher).hostname.replace(/^www\./,'')===host);
  }catch{return false;}
 };
 await Promise.all(listings.map(async url=>{try{const saved=await cache?.match(await key(url));if(saved){const value=await saved.json() as {url?:unknown};if(valid(url,value.url))resolved.set(url,value.url);}}catch{}}));
 const missing=listings.filter(url=>!resolved.has(url));
 if(missing.length)try{
  const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(url,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(url,init),true);
  const value=await execution.execute('google_resolve',{urls:missing,timeoutSeconds:8,maxFreshDecodes:60},{timeoutMs:10000}) as {results?:unknown[]};
  if(Array.isArray(value?.results))for(const item of value.results.slice(0,60)){
   if(!item||typeof item!=='object')continue;
   const row=item as {inputUrl?:unknown;url?:unknown};
   if(typeof row.inputUrl!=='string'||!missing.includes(row.inputUrl)||!valid(row.inputUrl,row.url)||resolved.has(row.inputUrl))continue;
   resolved.set(row.inputUrl,row.url);
   try{await cache?.put(await key(row.inputUrl),Response.json({url:row.url},{headers:{'cache-control':'public, max-age=3600'}}));}catch{}
  }
 }catch{/* Native public redirects can still resolve links; no paid fallback. */}
 return results.map(row=>row.articleUrl&&resolved.has(row.articleUrl)?{...row,articleUrl:resolved.get(row.articleUrl)}:row);
}
