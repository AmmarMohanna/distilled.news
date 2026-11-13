import type {Env} from './types';
import {sourceCatalog} from './source-catalog';
import {readTopicPublishers} from './source-topic-publishers';
import {prepareProductSourceInput} from './product-feeds';
import {recommendationFetch} from './source-recommendation-fetch';
import {freelyReadableResults} from './source-search-free';

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
export async function searchSourceCandidates(env:Env,query:string,fetcher:typeof fetch=fetch,accessCache?:Pick<Cache,'match'|'put'>):Promise<{results:SourceSearchResult[];unavailable:boolean;accessIncomplete?:boolean}> {
  const term=normalize(query);
  if(term.length<2)return {results:[],unavailable:false};
  const matches=publishers.filter(row=>row.aliases.some(alias=>normalize(alias).includes(term))).slice(0,8);
  const results:SourceSearchResult[]=matches.map(row=>({source:row.source,title:row.title,publisher:new URL(prepareProductSourceInput(row.source).sourceUrl!).hostname}));
  if(matches.some(row=>row.aliases.some(alias=>normalize(alias)===term)))return {...await freelyReadableResults(results,fetcher,accessCache),unavailable:false};
  if(env.SOURCE_RECOMMENDATIONS_WEB_SEARCH!=='true')return {...await freelyReadableResults(results,fetcher,accessCache),unavailable:true};
  const plan=prepareProductSourceInput('news: '+query);
  let available=false;
  const evidence=await readTopicPublishers(env,plan.sourceUrl!,recommendationFetch(fetcher,15_000),result=>{available=result.status===200;},undefined,{preferRuntime:env.SOURCE_GOOGLE_RESOLUTION_ENABLED==='true'});
  for(const item of evidence){
    if(!matchesArticleQuery(query,item.title,item.excerpt))continue;
    if(results.length>=24)break;
    if(results.some(result=>result.articleUrl===item.url))continue;
    try{prepareProductSourceInput(item.publisherOrigin+'/');}catch{continue;}
    results.push({source:item.publisherOrigin+'/',title:item.title,publisher:new URL(item.publisherOrigin).hostname,articleUrl:item.url,excerpt:item.excerpt});
  }
  return {...await freelyReadableResults(results,fetcher,accessCache),unavailable:!available};
}
