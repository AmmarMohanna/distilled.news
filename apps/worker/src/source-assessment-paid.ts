import {extractPublicHtml,discoverWebsiteArticles} from '@distilled/connectors';
import {sha256} from '@distilled/contracts';
import {createSourceBackend} from './source-backend';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import type {AssessmentArticle} from './source-assessment-http';
import type {Env} from './types';
export function paidAssessmentAvailable(env:Env):boolean {
 try{return env.SOURCE_PAID_VERIFICATION_ENABLED==='true'&&!!env.ZYTE_API_KEY&&JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}').zyte>0&&JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}').zyte>0;}catch{return false;}
}
/** Explicit user-approved retrieval only. Two durable operations at <= $0.05
 * each; identical owner/source/URL snapshots reuse the same hourly identities.
 * Existing grants and uncertain-operation fences are never changed here.
 */
export async function paidAssessmentArticles(env:Env,owner:string,context:{title:string;description:string},url:string,budgetUsd:number,fetcher:typeof fetch):Promise<AssessmentArticle[]> {
 if(budgetUsd!==0.10||!paidAssessmentAvailable(env))return [];
 new WorkerPublicSourceFetch(url);
 const origin=new URL(url).origin,ceiling=Math.min(0.05,JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON!).zyte);
 const identity=await sha256(JSON.stringify([owner,url,Math.floor(Date.now()/3600000)]));
 const scope={feedId:'verification:'+await sha256(owner),feedSourceId:'verification:'+identity,sourceId:await sha256(url)};
 const backend=createSourceBackend(env,{paidResponseMaxBytes:22_000_000,authorize:async()=>false,intake:{acceptBatch:async()=>{throw Error('ASSESSMENT_ONLY');}},fetcher});
 const read=async(target:string,phase:'source'|'article',child=false)=>{
  new WorkerPublicSourceFetch(target);
  const response=await backend.paidHttp.request(scope,JSON.stringify(['website-assessment-v1',identity,phase,target]),'zyte',ceiling,'https://api.zyte.com/v1/extract',{
   method:'POST',headers:{authorization:'Basic '+btoa(env.ZYTE_API_KEY+':'),'content-type':'application/json'},body:JSON.stringify({url:target,browserHtml:true})
  });
  const data=response.json as Record<string,unknown>|undefined;
  if(response.status!==200||data?.statusCode!==200||typeof data.url!=='string'||typeof data.browserHtml!=='string')return;
  new WorkerPublicSourceFetch(data.url);
  // A sampled child is recorded under its newly observed canonical identity;
  // it never replaces an existing acquisition's requested URL or job identity.
  if(new URL(data.url).origin!==origin||!child&&data.url!==target)return;
  const extracted=extractPublicHtml(data.browserHtml,data.url);
  if(extracted.accessRestricted||extracted.canonicalUrl!==data.url)return;
  return {extracted,url:data.url,html:data.browserHtml};
 };
 const source=await read(url,'source');if(!source)return [];
 if(source.extracted.pageKind==='article'&&source.extracted.body.length>=80)return [{url:source.url,title:source.extracted.title,body:source.extracted.body,publishedAt:source.extracted.publishedAt}];
 if(source.extracted.pageKind!=='listing')return [];
 const terms=(context.title+' '+context.description).toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu)??[];
 const candidates=discoverWebsiteArticles(source.html,source.url)?.articles??[];
 const score=(value:{url:string;title?:string})=>terms.filter(term=>(value.title+' '+value.url).toLocaleLowerCase().includes(term)).length;
 const section=new URL(url).pathname.replace(/\/$/,'')+'/';
 const candidate=candidates.filter(value=>{const target=new URL(value.url);return target.origin===origin&&(section==='/'||target.pathname.startsWith(section));}).sort((a,b)=>score(b)-score(a))[0];
 if(!candidate)return [];
 const article=await read(candidate.url,'article',true);
 return article?.extracted.pageKind==='article'&&article.extracted.body.length>=80?[{url:article.url,title:article.extracted.title,body:article.extracted.body,publishedAt:article.extracted.publishedAt}]:[];
}
