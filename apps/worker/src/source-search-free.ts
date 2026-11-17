import {extractPublicHtml,HttpSourceExecution,isWebsiteListingUrl,normalizeRssSnapshot,sameArticleUrl} from '@distilled/connectors';
import {prepareProductSourceInput} from './product-feeds';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import type {SourceSearchResult} from './source-search';
import type {Env} from './types';
import {resolveSearchGoogleArticles} from './source-search-google';
import {searchArticleChecks} from './source-search-helper';
async function accessKey(source:string,article=false){
 const url=prepareProductSourceInput(source).sourceUrl!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(article?'article-access-v4-free-helper:'+url:url));
 return new Request('https://source-search-access.invalid/'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
}
export async function rememberUnavailableSearchSource(source:string,cache?:Pick<Cache,'put'>){
 try{await cache?.put(await accessKey(source),Response.json({readable:false},{headers:{'cache-control':'public, max-age=120'}}));}catch{}
}
/** Reuse only an actual, independently fetched RSS response from discovery.
 * Catalog membership or a search snippet can never mark a source readable. */
export async function rememberVerifiedSearchFeed(source:string,xml:string,cache?:Pick<Cache,'put'>){
 const plan=prepareProductSourceInput(source);
 if(plan.detected.kind!=='rss_feed'||!normalizeRssSnapshot(xml,plan.sourceUrl!).some(item=>item.identityValid))return;
 try{await cache?.put(await accessKey(source),Response.json({readable:true},{headers:{'cache-control':'public, max-age=120'}}));}catch{}
}
/** Search is temporarily free-access only. No models or paid providers are
 * invoked. Six queued checks share a 20-second batch deadline. Direct HTTP
 * gets three seconds; the anonymous helper can use eight remaining seconds.
 */
export async function freelyReadableResults(results:SourceSearchResult[],fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>,env?:Env){
 results=await resolveSearchGoogleArticles(results,env,cache);
 type Access='readable'|'denied'|'unknown';
 const bounded=recommendationFetch(fetcher,20_000),checks=new Map<string,Promise<Access>>();
 const deadline=Date.now()+20_000,tasks:(()=>Promise<void>)[]=[];
 const helperChecks=env?searchArticleChecks(env,deadline):undefined;
 const privateArticle=async(url:string):Promise<Access>=>{
  if(!env||env.SOURCE_NATIVE_EXECUTION_ENABLED!=='true'||!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN||new URL(url).hostname==='news.google.com'||isWebsiteListingUrl(url))return 'unknown';
  const endpoint=env.SOURCE_EXECUTION_URL,token=env.SOURCE_EXECUTION_TOKEN;
  try{
   return await helperChecks!(async helper=>{
   const remaining=Math.min(8000,deadline-Date.now());if(remaining<=0)return 'unknown';
   const execution=new HttpSourceExecution(endpoint,token,helper,true);
   const raw=await execution.execute('public_article',{url},{timeoutMs:remaining});
   if(!raw||typeof raw!=='object')return 'unknown';
   const page=raw as Record<string,unknown>;
   if(page.status===429||typeof page.status!=='number'||page.status>=500)return 'unknown';
   return page.status===200&&page.url===url&&page.pageKind==='article'&&page.authenticationRequired!==true&&page.accessRestricted!==true&&typeof page.title==='string'&&Boolean(page.title.trim())&&!/^(?:404|410|page not found|article not found|page introuvable|article introuvable)(?:\s|$|[|:—-])/iu.test(page.title.trim())&&typeof page.body==='string'&&page.body.trim().length>=80&&new TextEncoder().encode(page.body).length<=500_000&&typeof page.canonicalUrl==='string'&&!isWebsiteListingUrl(page.canonicalUrl)&&sameArticleUrl(page.canonicalUrl,url)?'readable':'denied';
   });
  }catch{return 'unknown';}
 };
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
   if(page.status===429||page.status>=500)return article?await privateArticle(url):'unknown' as const;
   if(article&&new URL(finalUrl).hostname==='news.google.com')return 'unknown' as const;
   let readable=page.status===200&&!page.authenticationRequired&&page.body.trim().length>=80&&!/<title[^>]*>\s*(?:just a moment|access denied|captcha|verifying you are human)/i.test(page.body);
   if(readable&&article){
    const extracted=extractPublicHtml(page.body,finalUrl);
    const final=new URL(finalUrl);
    const sameIdentity=sameArticleUrl(extracted.canonicalUrl,finalUrl);
    const errorTitle=/^(?:(?:error|http|oops|sorry)[\s!,:-]*)?(?:404|410|page not found|article not found|not found|page introuvable|article introuvable|الصفحة غير موجودة|المقال غير موجود)(?:\s|$|[|:—-])/iu.test(extracted.title?.trim()??'');
    readable=final.hostname!=='news.google.com'&&!isWebsiteListingUrl(finalUrl)&&!isWebsiteListingUrl(extracted.canonicalUrl)&&!extracted.accessRestricted&&extracted.pageKind==='article'&&extracted.body.trim().length>=80&&Boolean(extracted.title?.trim())&&sameIdentity&&!errorTitle;
   }
   if(readable&&!article&&plan.detected.kind==='rss_feed')readable=normalizeRssSnapshot(page.body,url).some(item=>item.identityValid);
   if(!readable&&article&&env?.SOURCE_NATIVE_EXECUTION_ENABLED==='true'){
    const native=await privateArticle(url);if(native==='unknown')return native;readable=native==='readable';
   }
   try{await cache?.put(key,Response.json({readable},{headers:{'cache-control':`public, max-age=${readable?600:120}`}}));}catch{}
   return readable?'readable' as const:'denied' as const;
  }catch{return article?await privateArticle(url):'unknown' as const;}
 };
 const shared=(source:string,article=false)=>{
  const identity=(article?'article:':'source:')+source;
  let pending=checks.get(identity);
  if(!pending){pending=new Promise<Access>(resolve=>tasks.push(async()=>{try{resolve(await check(source,article));}catch{resolve('unknown');}}));checks.set(identity,pending);}
  return pending;
 };
 const pending=results.slice(0,60).map(async result=>{
  const [source,article]=await Promise.all([shared(result.source),result.articleUrl?shared(result.articleUrl,true):Promise.resolve<Access>('readable')]);
  const plan=prepareProductSourceInput(result.source);
  const matchingArticle=result.articleUrl&&plan.detected.kind==='web_page'&&new URL(plan.sourceUrl!).hostname.replace(/^www\./,'')===new URL(result.articleUrl).hostname.replace(/^www\./,'');
  return {result,readable:article==='readable'&&(source==='readable'||Boolean(matchingArticle)),unknown:article==='unknown'||(source==='unknown'&&!matchingArticle)};
 });
 let next=0;
 await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{while(next<tasks.length){const task=tasks[next++];await task();}}));
 const tested=await Promise.all(pending);
 return {results:tested.filter(value=>value.readable).map(value=>value.result).slice(0,30),accessIncomplete:tested.some(value=>!value.readable),verificationIncomplete:tested.some(value=>value.unknown)};
}
