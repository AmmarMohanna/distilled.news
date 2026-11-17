import {extractPublicHtml,normalizeRssSnapshot,sameArticleUrl} from '@distilled/connectors';
import {prepareProductSourceInput} from './product-feeds';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import type {SourceSearchResult} from './source-search';
import type {Env} from './types';
import {resolveSearchGoogleArticles} from './source-search-google';
async function accessKey(source:string,article=false){
 const url=prepareProductSourceInput(source).sourceUrl!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(article?'article-access-v2-content:'+url:url));
 return new Request('https://source-search-access.invalid/'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
}
export async function rememberUnavailableSearchSource(source:string,cache?:Pick<Cache,'put'>){
 try{await cache?.put(await accessKey(source),Response.json({readable:false},{headers:{'cache-control':'public, max-age=120'}}));}catch{}
}
/** Search is temporarily free-access only. No models or paid providers are
 * invoked. Six queued checks share a 20-second batch deadline. Each started
 * check gets up to three seconds; queue wait does not consume its own budget.
 */
export async function freelyReadableResults(results:SourceSearchResult[],fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>,env?:Env){
 results=await resolveSearchGoogleArticles(results,env,cache);
 type Access='readable'|'denied'|'unknown';
 const bounded=recommendationFetch(fetcher,20_000),checks=new Map<string,Promise<Access>>();
 const deadline=Date.now()+20_000,tasks:(()=>Promise<void>)[]=[];
 const check=async(source:string,article=false)=>{
  const plan=prepareProductSourceInput(source),url=plan.sourceUrl!;
  const key=await accessKey(source,article);
  try{const saved=await cache?.match(key);if(saved)return (await saved.json() as {readable:boolean}).readable?'readable' as const:'denied' as const;}catch{}
  try{
   if(Date.now()>=deadline)return 'unknown' as const;
   const signal=AbortSignal.timeout(Math.min(3000,Math.max(1,deadline-Date.now())));
   const read:typeof fetch=(input,init)=>bounded(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])});
   let finalUrl=url;
   const articleFetch:typeof fetch=async(input,init)=>{
    let current=String(input);
    const seen=new Set<string>();
    for(let hop=0;hop<4;hop++){
     new WorkerPublicSourceFetch(current);
     if(seen.has(current)||/\/(?:login|signin|sign-in|authorize|oauth)(?:\/|$)/i.test(new URL(current).pathname))throw Error('ARTICLE_REDIRECT_DENIED');
     seen.add(current);
     const response=await read(current,{...init,redirect:'manual'});
     if(![301,302,303,307,308].includes(response.status)){finalUrl=current;return response;}
     const location=response.headers.get('location');await response.body?.cancel();
     if(!location)throw Error('ARTICLE_REDIRECT_INVALID');
     current=new URL(location,current).href;
    }
    throw Error('ARTICLE_REDIRECT_LIMIT');
   };
   const page=await new WorkerPublicSourceFetch(url,article?articleFetch:read,{followSameOriginRedirects:!article}).get(url);
   // A temporary transport/provider failure is not a confirmed access denial.
   if(page.status===429||page.status>=500)return 'unknown' as const;
   if(article&&new URL(finalUrl).hostname==='news.google.com')return 'unknown' as const;
   let readable=page.status===200&&!page.authenticationRequired&&page.body.trim().length>=80&&!/<title[^>]*>\s*(?:just a moment|access denied|captcha|verifying you are human)/i.test(page.body);
   if(readable&&article){
    const extracted=extractPublicHtml(page.body,finalUrl);
    const final=new URL(finalUrl);
    const sameIdentity=sameArticleUrl(extracted.canonicalUrl,finalUrl);
    const errorTitle=/^(?:(?:error|http|oops|sorry)[\s!,:-]*)?(?:404|410|page not found|article not found|not found|page introuvable|article introuvable|الصفحة غير موجودة|المقال غير موجود)(?:\s|$|[|:—-])/iu.test(extracted.title?.trim()??'');
    readable=final.hostname!=='news.google.com'&&!extracted.accessRestricted&&extracted.pageKind==='article'&&extracted.body.trim().length>=80&&Boolean(extracted.title?.trim())&&sameIdentity&&!errorTitle;
   }
   if(readable&&!article&&plan.detected.kind==='rss_feed')readable=normalizeRssSnapshot(page.body,url).some(item=>item.identityValid);
   try{await cache?.put(key,Response.json({readable},{headers:{'cache-control':`public, max-age=${readable?600:120}`}}));}catch{}
   return readable?'readable' as const:'denied' as const;
  }catch{return 'unknown' as const;}
 };
 const shared=(source:string,article=false)=>{
  const identity=(article?'article:':'source:')+source;
  let pending=checks.get(identity);
  if(!pending){pending=new Promise<Access>(resolve=>tasks.push(async()=>{try{resolve(await check(source,article));}catch{resolve('unknown');}}));checks.set(identity,pending);}
  return pending;
 };
 const pending=results.slice(0,60).map(async result=>{
  const [source,article]=await Promise.all([shared(result.source),result.articleUrl?shared(result.articleUrl,true):Promise.resolve<Access>('readable')]);
  return {result,readable:source==='readable'&&article==='readable',unknown:source==='unknown'||article==='unknown'};
 });
 let next=0;
 await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{while(next<tasks.length){const task=tasks[next++];await task();}}));
 const tested=await Promise.all(pending);
 return {results:tested.filter(value=>value.readable).map(value=>value.result).slice(0,30),accessIncomplete:tested.some(value=>!value.readable),verificationIncomplete:tested.some(value=>value.unknown)};
}
