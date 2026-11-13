import type {Env} from './types';
import {sourceCatalog} from './source-catalog';
import {readTopicPublishers} from './source-topic-publishers';
import {prepareProductSourceInput} from './product-feeds';
import {recommendationFetch} from './source-recommendation-fetch';
import {freelyReadableResults} from './source-search-free';
import {cachedSourceSearch} from './source-search-cache';
import {topicSearchGate,sourceSearchCacheQuery,type SearchTopic} from './source-search-topic';
import {readWebSearch} from './source-web-search';

export interface SourceSearchResult { source: string; title: string; publisher: string; articleUrl?: string; excerpt?: string; blocked?:boolean; httpStatus?:number }
const publishers = [
  {source:'https://www.aljadeed.tv/',title:'Al Jadeed · الجديد',aliases:['aljadeed','al jadeed','aljadded','al jadded','الجديد']},
  ...sourceCatalog.map(([url,description])=>({source:`rss: ${url}`,title:description.split(':')[0],aliases:[description.split(':')[0],description,new URL(url).hostname]})),
];
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{M}\p{P}\p{Z}\p{S}]/gu,'');
const searchWords=(value:string)=>value.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];

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
 const load=()=>discoverSourceCandidates(env,query,fetcher,context);
 const found=discovery?await cachedSourceSearch(discovery.owner,sourceSearchCacheQuery(query,context),discovery.origin,load,discovery.cache,undefined,'discovery'):await load();
 return {...found,...await freelyReadableResults(found.results,fetcher,accessCache)};
}

async function discoverSourceCandidates(env:Env,query:string,fetcher:typeof fetch,context?:SearchTopic):Promise<{results:SourceSearchResult[];unavailable:boolean;topicMismatch?:boolean}> {
  const term=normalize(query);
  if(term.length<2)return {results:[],unavailable:false};
  const matches=publishers.filter(row=>row.aliases.some(alias=>normalize(alias).includes(term))).slice(0,8);
  const topic=topicSearchGate(context);
  const results:SourceSearchResult[]=context?[]:matches.map(row=>({source:row.source,title:row.title,publisher:new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname}));
  if(!context&&matches.some(row=>row.aliases.some(alias=>normalize(alias)===term)))return {results,unavailable:false};
  if(env.SOURCE_RECOMMENDATIONS_WEB_SEARCH!=='true')return {results,unavailable:true};
  const publisherHosts=new Set(matches.filter(row=>row.aliases.some(alias=>normalize(alias)===term)).map(row=>new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname.replace(/^www\./,'')));
  const publisherQuery=matches.find(row=>row.aliases.some(alias=>normalize(alias)===term))?.title.split('·')[0].replace(/Â$/,'').trim();
  const scopedQuery=topic&&!topic.matches(query)?`${publisherQuery??query} ${topic.hint}`:query;
  const plan=prepareProductSourceInput('news: '+scopedQuery);
  let available=false;
  let offTopic=0;
  const queryMatches=(title:string,excerpt:string,publisherOrigin?:string)=>matchesArticleQuery(query,title,excerpt)||(publisherOrigin!==undefined&&publisherHosts.has(new URL(publisherOrigin).hostname.replace(/^www\./,'')));
  if(env.SOURCE_RECOMMENDATIONS_WEB_HTML==='true'){
    const web=await readWebSearch(scopedQuery,fetcher);
    available=web.available;
    for(const item of web.items){
      if(topic&&!topic.matches(item.title+' '+item.excerpt)){offTopic++;continue;}
      const url=new URL(item.url);
      if(!queryMatches(item.title,item.excerpt+' '+url.hostname.replace(/\./g,' '),url.origin))continue;
      // Keep the actual readable page: institutional homepages may fail even
      // when the indexed profile/article itself is publicly readable.
      results.push({source:item.url,title:item.title,publisher:url.hostname,articleUrl:item.url,excerpt:item.excerpt});
    }
    if(results.length)return {results,unavailable:false};
  }
  const evidence=await readTopicPublishers(env,plan.sourceUrl!,recommendationFetch(fetcher,15_000),result=>{if(result.status===200)available=true;},undefined,{preferRuntime:env.SOURCE_GOOGLE_RESOLUTION_ENABLED==='true',raceRoutes:true,maxPublishers:40,perPublisher:3,acceptArticle:(title,excerpt,origin)=>{if(topic&&!topic.matches(title+' '+excerpt)){offTopic++;return false;}return queryMatches(title,excerpt,origin);}});
  for(const item of evidence){
    if(!queryMatches(item.title,item.excerpt,item.publisherOrigin))continue;
    if(results.length>=60)break;
    if(results.some(result=>result.articleUrl===item.url))continue;
    try{prepareProductSourceInput(item.publisherOrigin+'/');}catch{continue;}
    results.push({source:item.publisherOrigin+'/',title:item.title,publisher:new URL(item.publisherOrigin).hostname,articleUrl:item.url,excerpt:item.excerpt});
  }
  return {results,unavailable:!available,...(context&&results.length===0&&available&&offTopic>0?{topicMismatch:true}:{})};
}
