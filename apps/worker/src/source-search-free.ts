import {extractPublicHtml,normalizeRssSnapshot} from '@distilled/connectors';
import {prepareProductSourceInput} from './product-feeds';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import type {SourceSearchResult} from './source-search';
import type {Env} from './types';
import {resolveSearchGoogleArticles} from './source-search-google';
async function accessKey(source:string,article=false){
 const url=prepareProductSourceInput(source).sourceUrl!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(article?'article-access-v1:'+url:url));
 return new Request('https://source-search-access.invalid/'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
}
export async function rememberUnavailableSearchSource(source:string,cache?:Pick<Cache,'put'>){
 try{await cache?.put(await accessKey(source),Response.json({readable:false},{headers:{'cache-control':'public, max-age=120'}}));}catch{}
}
/** Search is temporarily free-access only. No models or paid providers are
 * invoked. Optional free link resolution precedes the shared article deadline.
 */
export async function freelyReadableResults(results:SourceSearchResult[],fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>,env?:Env){
 results=await resolveSearchGoogleArticles(results,env,cache);
 const bounded=recommendationFetch(fetcher,1500),checks=new Map<string,Promise<boolean>>();let incomplete=false;
 const check=async(source:string,article=false)=>{
  const plan=prepareProductSourceInput(source),url=plan.sourceUrl!;
  const key=await accessKey(source,article);
  try{const saved=await cache?.match(key);if(saved){const readable=(await saved.json() as {readable:boolean}).readable;if(!readable)incomplete=true;return readable;}}catch{}
  try{
   let finalUrl=url;
   const articleFetch:typeof fetch=async(input,init)=>{
    let current=String(input);
    const seen=new Set<string>();
    for(let hop=0;hop<4;hop++){
     new WorkerPublicSourceFetch(current);
     if(seen.has(current)||/\/(?:login|signin|sign-in|authorize|oauth)(?:\/|$)/i.test(new URL(current).pathname))throw Error('ARTICLE_REDIRECT_DENIED');
     seen.add(current);
     const response=await bounded(current,{...init,redirect:'manual'});
     if(![301,302,303,307,308].includes(response.status)){finalUrl=current;return response;}
     const location=response.headers.get('location');await response.body?.cancel();
     if(!location)throw Error('ARTICLE_REDIRECT_INVALID');
     current=new URL(location,current).href;
    }
    throw Error('ARTICLE_REDIRECT_LIMIT');
   };
   const page=await new WorkerPublicSourceFetch(url,article?articleFetch:bounded,{followSameOriginRedirects:!article}).get(url);
   let readable=page.status===200&&!page.authenticationRequired&&page.body.trim().length>=80&&!/<title[^>]*>\s*(?:just a moment|access denied|captcha|verifying you are human)/i.test(page.body);
   if(readable&&article)readable=new URL(finalUrl).hostname!=='news.google.com'&&!extractPublicHtml(page.body,finalUrl).accessRestricted;
   if(readable&&!article&&plan.detected.kind==='rss_feed')readable=normalizeRssSnapshot(page.body,url).some(item=>item.identityValid);
   if(!readable)incomplete=true;
   try{await cache?.put(key,Response.json({readable},{headers:{'cache-control':`public, max-age=${readable?600:120}`}}));}catch{}
   return readable;
  }catch{incomplete=true;return false;}
 };
 const shared=(source:string,article=false)=>{
  const identity=(article?'article:':'source:')+source;
  let pending=checks.get(identity);
  if(!pending){pending=check(source,article).catch(()=>{incomplete=true;return false;});checks.set(identity,pending);}
  return pending;
 };
 const tested=await Promise.all(results.map(async result=>{
  const [sourceReadable,articleReadable]=await Promise.all([shared(result.source),result.articleUrl?shared(result.articleUrl,true):Promise.resolve(true)]);
  return {result,readable:sourceReadable&&articleReadable};
 }));
 return {results:tested.filter(value=>value.readable).map(value=>value.result).slice(0,30),accessIncomplete:incomplete};
}
