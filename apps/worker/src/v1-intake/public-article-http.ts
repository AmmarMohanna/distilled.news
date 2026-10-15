import type {FeedHttpPort} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {AcquisitionFailure} from './acquisition';
/** Publisher-local redirects are transport resolution, not discovery. Never
 * forward credentials, change origin, follow a loop or guess another article.
 * The candidate router retains the observed canonical identity independently. */
export async function readPublicArticle(http:FeedHttpPort,initial:string){
 const origin=new URL(initial).origin,seen=new Set<string>();let url=initial;
 for(let hop=0;hop<=3;hop++){
  new WorkerPublicSourceFetch(url);
  if(new URL(url).origin!==origin||seen.has(url))throw new AcquisitionFailure('POLICY_DENIED',false);
  seen.add(url);
  const r=await http.get(url,{accept:'text/html'});
  if(r.status===0)throw new AcquisitionFailure('NETWORK',true);
  if(r.status>=300&&r.status<400){
   if(hop===3||!r.headers.location)throw new AcquisitionFailure('POLICY_DENIED',false);
   const next=new URL(r.headers.location,url);next.hash='';url=next.href;continue;
  }
  return {url,body:new TextDecoder().decode(r.bytes),contentType:r.headers['content-type']??'',status:r.status,...(Object.keys(r.headers).some(k=>k.toLowerCase()==='www-authenticate')?{authenticationRequired:true}:{})};
 }
 throw new AcquisitionFailure('POLICY_DENIED',false);
}
