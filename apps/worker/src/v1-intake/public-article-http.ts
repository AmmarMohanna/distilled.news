import {PUBLIC_ARTICLE_HTML_MAX_BYTES,type FeedHttpPort} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {AcquisitionFailure} from './acquisition';
// Publisher HTML includes scripts and layout beyond the retained article text.
export const PUBLIC_ARTICLE_MAX_BYTES = PUBLIC_ARTICLE_HTML_MAX_BYTES;
/** Publisher-local redirects are transport resolution, not discovery. Never
 * forward credentials, change origin, follow a loop or guess another article.
 * The candidate router retains the observed canonical identity independently. */
export async function readPublicArticle(http:FeedHttpPort,initial:string){
 const origin=new URL(initial).origin,seen=new Set<string>();let url=initial;
 for(let hop=0;hop<=3;hop++){
  new WorkerPublicSourceFetch(url);
  if(new URL(url).origin!==origin||seen.has(url))throw new AcquisitionFailure('POLICY_DENIED',false);
  seen.add(url);
  const r=await http.get(url,{accept:'text/html'}).catch(error=>{
   if(error instanceof Error&&error.message==='FEED_TOO_LARGE')throw new AcquisitionFailure('BODY_BUDGET_EXCEEDED',false,{detail:'ARTICLE_HTML_TOO_LARGE'});
   throw error;
  });
  if(r.status===0)throw new AcquisitionFailure('NETWORK',true);
  if(r.status>=300&&r.status<400){
   if(hop===3||!r.headers.location)throw new AcquisitionFailure('POLICY_DENIED',false);
   const next=new URL(r.headers.location,url);next.hash='';new WorkerPublicSourceFetch(next.href);
   // Do not follow cross-origin sessions/cookies in the Worker HTTP route.
   // A distinct diagnostic may admit an exact-article provider to resolve a
   // public publisher redirect, without weakening private-network guards.
   if(next.origin!==origin)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'ARTICLE_CROSS_ORIGIN_REDIRECT'});
   if(/^\/(?:auth\/)?(?:login|sign-?in)\/?$/i.test(next.pathname))throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_LOGIN_REDIRECT',httpStatus:r.status});
   url=next.href;continue;
  }
  return {url,body:new TextDecoder().decode(r.bytes),contentType:r.headers['content-type']??'',status:r.status,...(Object.keys(r.headers).some(k=>k.toLowerCase()==='www-authenticate')?{authenticationRequired:true}:{}),...(r.headers['retry-after']?{retryAfter:r.headers['retry-after']}:{})};
 }
 throw new AcquisitionFailure('POLICY_DENIED',false);
}
