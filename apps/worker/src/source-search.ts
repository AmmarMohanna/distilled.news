import type {Env} from './types';
import {sourceCatalog} from './source-catalog';
import {readTopicPublishers} from './source-topic-publishers';
import {prepareProductSourceInput} from './product-feeds';
import {recommendationFetch} from './source-recommendation-fetch';
import {freelyReadableResults} from './source-search-free';
import {cachedSourceSearch} from './source-search-cache';
import {sourceSearchCacheQuery,type SearchTopic} from './source-search-topic';
import {alignedSearchResults} from './source-search-relevance';
import {readWebSearch} from './source-web-search';
import {normalizeRssSnapshot} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

export interface SourceSearchResult { source: string; title: string; publisher: string; articleUrl?: string; excerpt?: string; blocked?:boolean; httpStatus?:number }
const publishers = [
  {source:'https://www.aljadeed.tv/',title:'Al Jadeed · الجديد',aliases:['aljadeed','al jadeed','aljadded','al jadded','الجديد']},
  ...sourceCatalog.map(([url,description])=>({source:`rss: ${url}`,title:description.split(':')[0],aliases:[description.split(':')[0],description,new URL(url).hostname]})),
];
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{M}\p{P}\p{Z}\p{S}]/gu,'');
const searchWords=(value:string):string[]=>value.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];

// An upstream engine may relax a rare name into unrelated popular articles.
function matchesArticleQuery(query:string,title:string,excerpt?:string){
  const words=new Set(searchWords(title+' '+(excerpt??'')));
  return searchWords(query).every(word=>words.has(word));
}

/** Public discovery only. Selection still goes through the normal source assessment.
 * No scope is passed to readTopicPublishers: typing must never start paid collectors.
 */
export async function searchSourceCandidates(env:Env,query:string,fetcher:typeof fetch=fetch,accessCache?:Pick<Cache,'match'|'put'>,discovery?:{owner:string;origin:string;cache?:Pick<Cache,'match'|'put'>},context?:SearchTopic):Promise<{results:SourceSearchResult[];unavailable:boolean;accessIncomplete?:boolean;topicMismatch?:boolean}> {
 if(normalize(query).length<2)return {results:[],unavailable:false};
 const load=()=>discoverSourceCandidates(env,query,fetcher,context,discovery?.cache);
 const found=discovery?await cachedSourceSearch(discovery.owner,sourceSearchCacheQuery(query,context),discovery.origin,load,discovery.cache,undefined,'discovery'):await load();
 const aligned=context?await alignedSearchResults(env,query,context,found.results,fetcher,discovery?.owner):{results:found.results,unavailable:false};
 const accessible=await freelyReadableResults(aligned.results,fetcher,accessCache,env);
 return {...found,...accessible,unavailable:found.unavailable||aligned.unavailable,accessIncomplete:found.accessIncomplete===true||accessible.accessIncomplete,...(context&&found.results.length>0&&!aligned.results.length&&!aligned.unavailable?{topicMismatch:true}:{})};
}

async function discoverSourceCandidates(env:Env,query:string,fetcher:typeof fetch,context?:SearchTopic,directoryCache?:Pick<Cache,'match'|'put'>):Promise<{results:SourceSearchResult[];unavailable:boolean;topicMismatch?:boolean;accessIncomplete?:boolean}> {
  const term=normalize(query);
  if(term.length<2)return {results:[],unavailable:false};
  const matches=publishers.filter(row=>row.aliases.some(alias=>normalize(alias).includes(term))).slice(0,8);
  const results:SourceSearchResult[]=context?[]:matches.map(row=>({source:row.source,title:row.title,publisher:new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname}));
  if(!context&&matches.some(row=>row.aliases.some(alias=>normalize(alias)===term)))return {results,unavailable:false};
  if(env.SOURCE_RECOMMENDATIONS_WEB_SEARCH!=='true')return {results,unavailable:true};
  const publisherHosts=new Set(matches.filter(row=>row.aliases.some(alias=>normalize(alias)===term)).map(row=>new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname.replace(/^www\./,'')));
  const publisherQuery=matches.find(row=>row.aliases.some(alias=>normalize(alias)===term))?.title.split('·')[0].replace(/Â$/,'').trim();
  // Keep the user's search intact; context belongs in the relevance decision.
  // Appending a category title here would reintroduce an upstream AND rule.
  const scopedQuery=publisherQuery??query;
  const plan=prepareProductSourceInput('news: '+scopedQuery);
  const queryMatches=(title:string,excerpt:string,publisherOrigin?:string)=>matchesArticleQuery(query,title,excerpt)||(publisherOrigin!==undefined&&publisherHosts.has(new URL(publisherOrigin).hostname.replace(/^www\./,'')));
  let indexAvailable=false;
  const readIndex=()=>readTopicPublishers(env,plan.sourceUrl!,recommendationFetch(fetcher,15_000),result=>{if(result.status===200)indexAvailable=true;},undefined,{preferRuntime:env.SOURCE_GOOGLE_RESOLUTION_ENABLED==='true',raceRoutes:true,maxPublishers:40,perPublisher:3,acceptArticle:(title,excerpt,origin)=>context?true:queryMatches(title,excerpt,origin)}).catch(()=>[]);
  // Independent public lookups overlap; the model sees their combined results once.
  const indexTask=context?readIndex():undefined;
  const webTask=context&&env.SOURCE_RECOMMENDATIONS_WEB_HTML==='true'?readWebSearch(scopedQuery,fetcher,directoryCache).catch(()=>({items:[],available:false,accessIncomplete:true})):undefined;
  const pools:SourceSearchResult[][]=[];
  let publisherAvailable=false;
  // A known publisher can be searched through its actual article feed even
  // when the external news index is unavailable. Catalog scope is not evidence.
  if(context){
    const words=searchWords(context.title+' '+context.description);
    const score=(text:string)=>words.filter(word=>word.length>2&&searchWords(text).includes(word)).length;
    const feeds=matches.filter(row=>{
      if(!row.source.startsWith('rss: '))return false;
      const host=new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname;
      if(term.length<3&&!searchWords(row.title+' '+host).some(word=>normalize(word)===term))return false;
      return normalize(row.title).includes(term)||normalize(host).includes(term);
    }).sort((a,b)=>score(b.aliases.join(' '))-score(a.aliases.join(' '))).slice(0,4);
    const sampled=await Promise.all(feeds.map(async row=>{
      try{
        const url=prepareProductSourceInput(row.source).sourceUrl!;
        const page=await new WorkerPublicSourceFetch(url,recommendationFetch(fetcher,2500)).get(url);
        if(page.status!==200||page.authenticationRequired)return [];
        const items=normalizeRssSnapshot(page.body,url).filter(item=>item.identityValid&&item.title&&item.url);
        if(items.length)publisherAvailable=true;
        return items.slice(0,60).map(item=>({source:row.source,title:item.title!,publisher:new URL(url).hostname,articleUrl:item.url!,excerpt:item.body}));
      }catch{return [];}
    }));
    pools.push(...sampled);
  }
  let available=publisherAvailable;
  let accessIncomplete=false;
  if(env.SOURCE_RECOMMENDATIONS_WEB_HTML==='true'){
    const web=await (webTask??readWebSearch(scopedQuery,fetcher,directoryCache));
    available=available||web.available;
    accessIncomplete=web.accessIncomplete;
    const webResults:SourceSearchResult[]=[];
    for(const item of web.items){
      const url=new URL(item.url);
      if(!context&&!queryMatches(item.title,item.excerpt+' '+url.hostname.replace(/\./g,' '),url.origin))continue;
      // Keep the actual readable page: institutional homepages may fail even
      // when the indexed profile/article itself is publicly readable.
      webResults.push({source:item.url,title:item.title,publisher:url.hostname,articleUrl:item.url,excerpt:item.excerpt});
    }
    if(context)pools.push(webResults);else results.push(...webResults);
    if(results.length&&!context)return {results,unavailable:false,accessIncomplete};
  }
  const evidence=await (indexTask??readIndex());
  const indexed:SourceSearchResult[]=[];
  for(const item of evidence){
    if(!context&&!queryMatches(item.title,item.excerpt,item.publisherOrigin))continue;
    if(indexed.length>=60)break;
    if(indexed.some(result=>result.articleUrl===item.url))continue;
    try{prepareProductSourceInput(item.publisherOrigin+'/');}catch{continue;}
    indexed.push({source:item.publisherOrigin+'/',title:item.title,publisher:new URL(item.publisherOrigin).hostname,articleUrl:item.url,excerpt:item.excerpt});
  }
  if(context){
    pools.push(indexed);
    // Share the bounded model batch across feeds and routes. Limit displayed
    // matches after relevance rather than cutting each feed to five first.
    const seen=new Set<string>();
    for(let index=0;index<60&&results.length<60;index++)for(const pool of pools){
      const item=pool[index];if(!item)continue;
      const identity=item.articleUrl??item.source;if(seen.has(identity))continue;
      seen.add(identity);results.push(item);if(results.length===60)break;
    }
  }else results.push(...indexed);
  return {results,unavailable:!(available||indexAvailable),accessIncomplete};
}
