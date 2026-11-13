import {normalizeRssSnapshot} from '@distilled/connectors';
import {prepareProductSourceInput} from './product-feeds';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import type {SourceSearchResult} from './source-search';
async function accessKey(source:string){
 const url=prepareProductSourceInput(source).sourceUrl!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
 return new Request('https://source-search-access.invalid/'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
}
export async function rememberUnavailableSearchSource(source:string,cache?:Pick<Cache,'put'>){
 try{await cache?.put(await accessKey(source),Response.json({readable:false},{headers:{'cache-control':'public, max-age=120'}}));}catch{}
}
/** Search is temporarily free-access only. No models, helpers or paid providers
 * are invoked. All uncached checks share one short deadline and six sockets.
 */
export async function freelyReadableResults(results:SourceSearchResult[],fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>){
 const bounded=recommendationFetch(fetcher,1500),checks=new Map<string,Promise<boolean>>();let incomplete=false;
 const check=async(source:string)=>{
  const plan=prepareProductSourceInput(source),url=plan.sourceUrl!;
  const key=await accessKey(source);
  try{const saved=await cache?.match(key);if(saved)return (await saved.json() as {readable:boolean}).readable;}catch{}
  try{
   const page=await new WorkerPublicSourceFetch(url,bounded,{followSameOriginRedirects:true}).get(url);
   let readable=page.status===200&&!page.authenticationRequired&&page.body.trim().length>=80&&!/<title[^>]*>\s*(?:just a moment|access denied|captcha|verifying you are human)/i.test(page.body);
   if(readable&&plan.detected.kind==='rss_feed')readable=normalizeRssSnapshot(page.body,url).some(item=>item.identityValid);
   try{await cache?.put(key,Response.json({readable},{headers:{'cache-control':`public, max-age=${readable?600:120}`}}));}catch{}
   return readable;
  }catch{incomplete=true;return false;}
 };
 const tested=await Promise.all(results.map(async result=>{
  let pending=checks.get(result.source);if(!pending){pending=check(result.source).catch(()=>{incomplete=true;return false;});checks.set(result.source,pending);}
  return {result,readable:await pending};
 }));
 return {results:tested.filter(value=>value.readable).map(value=>value.result).slice(0,12),accessIncomplete:incomplete};
}
