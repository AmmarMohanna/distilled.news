import {extractPublicHtml} from '@distilled/connectors';
import {PublicSourceFetchFailure,PublicSourcePolicyError} from '@distilled/agent-runtime/public-source-stages';
import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {AcquisitionFailure} from './acquisition';
import {sameArticleUrl} from './article-url-identity';
import {articleHeadlineKey} from './reviewed-redirect';

/** NNA's public article page loads its reporting from this same-origin JSON
 * route. Require the page and the publisher's response to identify one article. */
export async function nnaArticleBody(page:ReturnType<typeof extractPublicHtml>,url:string,fetcher:typeof fetch):Promise<string|undefined>{
 const target=new URL(url);
 const match=/^\/(en|ar|fr)\/news\/(\d{1,12})\/([^/]+)\/?$/.exec(target.pathname);
 if(target.origin!=='https://nna-leb.gov.lb'||!match||page.pageKind!=='article'||
  page.accessRestricted||page.body.length>=200||!articleHeadlineKey(page.title)||!sameArticleUrl(page.canonicalUrl,url))return;
 const [,language,id,encodedSlug]=match;
 let slug:string;
 try{slug=decodeURIComponent(encodedSlug)}catch{return;}
 const endpoint=new URL(`/api/proxy/v2/${language}/news/${id}`,target.origin).href;
 const read=new WorkerPublicSourceFetch(endpoint,(value,init)=>fetcher(value,{...init,headers:{accept:'application/json'}}),{maxBytes:1_000_000});
 let response:Awaited<ReturnType<typeof read.get>>;
 try{response=await read.get(endpoint)}catch(error){
  if(error instanceof PublicSourceFetchFailure||error instanceof PublicSourcePolicyError)return;
  throw error;
 }
 if(response.authenticationRequired||response.status===401||response.status===402)throw new AcquisitionFailure('AUTH_REQUIRED',false);
 if(response.status===451)throw new AcquisitionFailure('POLICY_DENIED',false);
 if(response.status===429)throw new AcquisitionFailure('RATE_LIMIT',true);
 if(response.status!==200||!/^application\/json\b/i.test(response.contentType))return;

 let article:{id?:unknown;slug?:unknown;title?:unknown;url?:unknown;content?:unknown}|undefined;
 try{article=JSON.parse(response.body)?.data?.data}catch{return;}
 if(!article||article.id!==Number(id)||article.slug!==slug||typeof article.content!=='string'||
  articleHeadlineKey(page.title)!==articleHeadlineKey(article.title))return;
 const shortUrl=new URL(`/${language}/news/short/${id}`,target.origin).href;
 if(!sameArticleUrl(article.url,shortUrl)&&!sameArticleUrl(article.url,url))return;
 const body=extractPublicHtml(`<article>${article.content}</article>`,url).body;
 return body.length>=80?body:undefined;
}
