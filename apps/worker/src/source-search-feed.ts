import {HttpSourceExecution} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import {searchArticleChecks} from './source-search-helper';
import type {Env} from './types';

/** Anonymous RSS transport only. Callers still parse actual items and apply
 * relevance/readability checks. No paid fallback or authenticated retrieval. */
export async function readSearchFeed(url:string,fetcher:typeof fetch,env?:Env,deadline=Date.now()+15_000,checks=env?searchArticleChecks(env,deadline):undefined){
 let page:{status:number;body:string;authenticationRequired?:boolean};
 try{page=await new WorkerPublicSourceFetch(url,recommendationFetch(fetcher,2500),{maxBytes:2_000_000}).get(url);}catch{page={status:0,body:''};}
 if(page.status===200||env?.SOURCE_NATIVE_EXECUTION_ENABLED!=='true'||!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN||!checks)return page;
 const endpoint=env.SOURCE_EXECUTION_URL,token=env.SOURCE_EXECUTION_TOKEN;
 try{return await checks(async helper=>{
  const remaining=Math.min(12_000,deadline-Date.now());if(remaining<=0)return page;
  const value=await new HttpSourceExecution(endpoint,token,helper,true).execute('public_feed',{url},{timeoutMs:remaining}) as {status?:number;xml?:string};
  return value?.status===200&&typeof value.xml==='string'&&new TextEncoder().encode(value.xml).length<=2_000_000?{status:200,body:value.xml}:page;
 });}catch{return page;}
}
