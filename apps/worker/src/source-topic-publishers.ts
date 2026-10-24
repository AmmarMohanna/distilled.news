import {collectVerificationEvidence,type SourceVerificationScope} from './source-verification-collector';
import { normalizeRssSnapshot,HttpSourceExecution } from '@distilled/connectors';
import type {Env} from './types';
import {WorkerPublicSourceFetch} from './public-source-fetch';

export interface TopicPublisherEvidence { publisherOrigin: string; title: string; url: string; excerpt: string; publishedAt?: string }
/** Use publisher identities from actual search items, never guessed publisher URLs. */
export function topicPublishers(xml: string, searchUrl: string): TopicPublisherEvidence[] {
  const result: TopicPublisherEvidence[] = [], counts = new Map<string, number>();
  for (const block of xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []) {
    const publisher = block.match(/<source\b[^>]*\burl=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
    if (!publisher) continue;
    try {
      const parsed = new URL(publisher); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
      parsed.protocol = 'https:'; const origin = parsed.origin;
      if ((counts.get(origin) ?? 0) >= 2 || (!counts.has(origin) && counts.size >= 24)) continue;
      const item = normalizeRssSnapshot(`<rss><channel>${block}</channel></rss>`, searchUrl)[0];
      if (!item?.identityValid || !item.title || !item.url) continue;
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
      result.push({ publisherOrigin: origin, title: item.title, url: item.url, excerpt: (item.body || item.excerpt || '').replace(/<[^>]*>/g, ' ').slice(0, 600), publishedAt: item.publishedAt });
    } catch { /* The normal public URL policy still admits every publisher fetch separately. */ }
  }
  return result;
}

/** Reuse configured transports and the existing owner-scoped paid collector as fallback. */
export async function readTopicPublishers(env:Env,searchUrl:string,fetcher:typeof fetch,onTransport?:(result:{route:'worker'|'runtime';status:number})=>void,scope?:SourceVerificationScope):Promise<TopicPublisherEvidence[]> {
 const target=new URL(searchUrl);
 if(target.hostname!=='news.google.com'||target.pathname!=='/rss/search'||target.protocol!=='https:')return [];
 const paidFallback=async()=>{
  if(!scope||env.SOURCE_PAID_VERIFICATION_ENABLED!=='true')return [];
  const items=await collectVerificationEvidence(env,'news: '+target.searchParams.get('q'),scope,{purpose:'topic_publishers'});
  const result:TopicPublisherEvidence[]=[],counts=new Map<string,number>();
  for(const item of items){
   if(!item.identityValid||!item.title||!item.url)continue;
   try{
    let publisher=new URL(item.url);
    if(publisher.hostname==='news.google.com'){
     if(!item.publisherId||!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(item.publisherId))continue;
     publisher=new URL('https://'+item.publisherId);
    }
    if(!['https:','http:'].includes(publisher.protocol)||publisher.hostname==='news.google.com')continue;
    publisher.protocol='https:';const origin=publisher.origin;
    if((counts.get(origin)??0)>=2||(!counts.has(origin)&&counts.size>=24))continue;
    counts.set(origin,(counts.get(origin)??0)+1);
    result.push({publisherOrigin:origin,title:item.title,url:item.url,excerpt:(item.body||item.excerpt||'').slice(0,600),publishedAt:item.publishedAt});
   }catch{}
  }
  return result;
 };
 let response;
 try{response=await new WorkerPublicSourceFetch(searchUrl,fetcher).get(searchUrl);}catch{response={status:0,body:''};}
 onTransport?.({route:'worker',status:response.status});
 if(response.status===200)return topicPublishers(response.body,searchUrl);
 if((response.status===0||response.status>=500)&&env.SOURCE_EXECUTION_SERVICE&&env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN){
  try{
   const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(url,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(url,init),true);
   const result=await execution.execute('google_feed',{url:searchUrl},{timeoutMs:25000});
   onTransport?.({route:'runtime',status:result&&typeof result==='object'&&'status' in result?Number(result.status)||0:0});
   if(result&&typeof result==='object'&&'status' in result&&result.status===200&&'xml' in result&&typeof result.xml==='string'&&new TextEncoder().encode(result.xml).length<=2_000_000)return topicPublishers(result.xml,searchUrl);
  }catch{/* The configured paid route retains its own durable budget and retry fences. */}
 }
 return paidFallback();
}