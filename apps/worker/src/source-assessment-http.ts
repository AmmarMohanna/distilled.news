import {HttpSourceExecution} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {admittedSourceExecution} from './source-execution-admission';
import type {Env} from './types';
export interface AssessmentArticle {url:string;title?:string;body:string;publishedAt?:string}
/** Existing anonymous HTTP egress only: no browser, paid operation or login.
 * A listing supplies bounded same-origin candidates, never article evidence.
 */
export async function readAssessmentArticles(env:Env,url:string):Promise<AssessmentArticle[]> {
 if(env.SOURCE_NATIVE_EXECUTION_ENABLED!=='true'||!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)return [];
 const deadline=Date.now()+15_000;
 const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(target,init)=>env.DB?admittedSourceExecution(env.DB,()=>env.SOURCE_EXECUTION_SERVICE!.fetch(target,init)):env.SOURCE_EXECUTION_SERVICE!.fetch(target,init),true);
 const read=async(target:string):Promise<Record<string,unknown>|undefined>=>{
  try{
   new WorkerPublicSourceFetch(target);
   const timeoutMs=Math.min(8_000,deadline-Date.now());if(timeoutMs<=0)return;
   const value=await execution.execute('public_article',{url:target},{timeoutMs});
   if(!value||typeof value!=='object')return;
   const result=value as Record<string,unknown>;
   if(result.status!==200||result.url!==target||result.authenticationRequired===true||result.accessRestricted===true)return;
   if(typeof result.canonicalUrl==='string'&&new URL(result.canonicalUrl,target).href!==target)return;
   return result;
  }catch{return;}
 };
 const article=(value:Record<string,unknown>|undefined,target:string):AssessmentArticle|undefined=>value?.pageKind==='article'&&typeof value.body==='string'&&value.body.trim().length>=80&&new TextEncoder().encode(value.body).length<=500_000?{url:target,body:value.body,...(typeof value.title==='string'?{title:value.title}:{}),...(typeof value.publishedAt==='string'?{publishedAt:value.publishedAt}:{})}:undefined;
 const page=await read(url),direct=article(page,url);
 if(direct)return [direct];
 if(page?.pageKind!=='listing'||!Array.isArray(page.articleLinks))return [];
 const candidates:string[]=[];
 for(const value of page.articleLinks){
  if(typeof value!=='string')continue;
  try{const candidate=new URL(value,url);if(candidate.origin!==new URL(url).origin||candidate.href===url)continue;new WorkerPublicSourceFetch(candidate.href);if(!candidates.includes(candidate.href))candidates.push(candidate.href);}catch{continue;}
  if(candidates.length===2)break;
 }
 const results=await Promise.all(candidates.map(async target=>article(await read(target),target)));
 return results.filter((value):value is AssessmentArticle=>!!value);
}
