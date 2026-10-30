import {HandoffError} from '@distilled/contracts';
import {SourceProviderError,type SourceExecutionPort} from '@distilled/connectors';
import {sharedPublicHttp} from './connector-public-cache';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Reuse anonymous, attested Google listing resolutions, not article evidence,
 * paid receipts or source checkpoints. Authorization runs on every cache read.
 * The durable lease coalesces identical links across Worker isolates. */
export function sharedGoogleArticleResolver(db:D1Database,bucket:R2Bucket,execution:SourceExecutionPort,
 authorize:(url:string)=>Promise<void>,now=Date.now){
 const validateListing=async(url:string)=>{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='news.google.com'||u.port||u.username||u.password||!/^\/(?:rss\/)?articles\/[A-Za-z0-9_-]{1,2000}$/.test(u.pathname)||[...u.searchParams.keys()].some(k=>!['hl','gl','ceid','oc'].includes(k)))throw new SourceProviderError('MALFORMED');
  await authorize(url);
 };
 const decode=(value:unknown,inputUrl:string)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new SourceProviderError('TRANSIENT');
  const r=value as Record<string,unknown>;
  if(r.inputUrl!==inputUrl||typeof r.url!=='string')throw new SourceProviderError('TRANSIENT');
  // Validate the target before caching as well as after loading it. Never fetch
  // it here, or accept helper output pointing to private/credentialed origins.
  try{new WorkerPublicSourceFetch(r.url);}catch{throw new SourceProviderError('MALFORMED');}
  if(new URL(r.url).hostname==='news.google.com'||r.url.length>4096)throw new SourceProviderError('MALFORMED');
  return {inputUrl,url:r.url};
 };
 const http=sharedPublicHttp(db,bucket,{get:async(url)=>{
  const value=await execution.execute('google_resolve',{urls:[url]},{timeoutMs:60_000}) as {results?:unknown[]};
  const result=decode(value?.results?.[0],url),bytes=new TextEncoder().encode(JSON.stringify(result));
  return {status:200,headers:{'content-type':'application/json','cache-control':'public,max-age=3600'},bytes,telemetry:{requests:1,latencyMs:0,providerCostUsd:0}};
 }},validateListing,now,8192,3600_000);
 return async(url:string)=>{
  try{
   const response=await http.get(url,{accept:'application/vnd.distilled.google-resolution+json'},{attempts:1,timeoutMs:60_000});
   const result=decode(JSON.parse(new TextDecoder().decode(response.bytes)),url);
   await authorize(result.url);return result;
  }catch(error){
   if(error instanceof HandoffError&&error.code==='TEMPORARY_UNAVAILABLE')throw new SourceProviderError('BACKPRESSURE',new Date(now()+5000).toISOString(),{detail:'GOOGLE_RESOLUTION_IN_FLIGHT'});
   throw error;
  }
 };
}
