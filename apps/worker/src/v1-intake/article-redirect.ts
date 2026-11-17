import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {sameArticleUrl} from './article-url-identity';

export interface ArticleRedirectEvidence {requestedUrl:string;resolvedUrl:string;hops:{from:string;to:string;status:number}[]}
export function validArticleRedirect(proof:ArticleRedirectEvidence|undefined,requested:string,resolved:string):boolean {
 try{
  if(!proof||proof.requestedUrl!==requested||!sameArticleUrl(proof.resolvedUrl,resolved)||!proof.hops.length||proof.hops.length>5)return false;
  let current=requested;const seen=new Set([current]);
  for(const hop of proof.hops){
   new WorkerPublicSourceFetch(hop.from);new WorkerPublicSourceFetch(hop.to);
   const target=new URL(hop.to);
   if(hop.from!==current||![301,302,303,307,308].includes(hop.status)||seen.has(hop.to)||/\/(?:login|signin|sign-in|authorize|oauth)(?:\/|$)/i.test(target.pathname))return false;
   seen.add(hop.to);current=hop.to;
  }
  return sameArticleUrl(current,resolved);
 }catch{return false}
}
/** Independently observe public publisher redirects; provider final URLs alone
 * never authorize attaching another page. No cookies or credentials forwarded. */
export async function verifyArticleRedirect(requested:string,resolved:string,fetcher:typeof fetch,authorize:(url:string)=>Promise<void>):Promise<ArticleRedirectEvidence|undefined>{
 const proof:ArticleRedirectEvidence={requestedUrl:requested,resolvedUrl:resolved,hops:[]};let current=requested;
 const signal=AbortSignal.timeout(60000);
 try{for(let n=0;n<5;n++){
  new WorkerPublicSourceFetch(current);await authorize(current);
  const response=await fetcher(current,{redirect:'manual',signal,headers:{accept:'text/html'}});
  const location=response.headers.get('location');await response.body?.cancel();
  if(![301,302,303,307,308].includes(response.status)||!location)return;
  const next=new URL(location,current);next.hash='';new WorkerPublicSourceFetch(next.href);
  proof.hops.push({from:current,to:next.href,status:response.status});current=next.href;
  if(sameArticleUrl(current,resolved))return validArticleRedirect(proof,requested,resolved)?proof:undefined;
  if(proof.hops.slice(0,-1).some(h=>h.from===current))return;
 }}catch{/* Failure to verify preserves the original identity rejection. */}
 return;
}
