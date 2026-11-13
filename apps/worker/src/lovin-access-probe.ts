import {extractPublicHtml,PUBLIC_ARTICLE_HTML_MAX_BYTES,type ProviderHttpPort} from '@distilled/connectors';
import {sha256} from '@distilled/contracts';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Operator-requested test only. One immutable homepage operation and one
 * immutable article operation per probe. Durable HTTP owns reservations,
 * receipts and unknown-outcome fences; this never alters grants or publishes.
 */
export async function lovinAccessProbe(http:ProviderHttpPort,key:string,owner:string,input:{probeId:string;phase:'homepage'|'article';url:string},ceilingUsd:number){
 const url=new URL(input.url);new WorkerPublicSourceFetch(url.href);
 if(url.origin!=='https://lovin.co'||url.hash||!/^[-a-zA-Z0-9_]{1,80}$/.test(input.probeId)||!['homepage','article'].includes(input.phase)||(input.phase==='homepage')!==(url.pathname==='/')||!Number.isFinite(ceilingUsd)||ceilingUsd<=0||ceilingUsd>0.05)throw Error('INVALID_LOVIN_PROBE');
 const ownerId=await sha256(owner),sourceId=await sha256(url.origin);
 const scope={feedId:'verification:'+ownerId,feedSourceId:'verification:'+await sha256(JSON.stringify([owner,input.probeId])),sourceId};
 const response=await http.request(scope,JSON.stringify(['lovin-access-probe-v1',input.probeId,input.phase]),'zyte',ceilingUsd,'https://api.zyte.com/v1/extract',{
  method:'POST',headers:{authorization:'Basic '+btoa(key+':'),'content-type':'application/json'},body:JSON.stringify({url:url.href,browserHtml:true})
 });
 const data=response.json as Record<string,unknown>|undefined;
 const html=data&&data.url===url.href&&typeof data.browserHtml==='string'&&new TextEncoder().encode(data.browserHtml).length<=PUBLIC_ARTICLE_HTML_MAX_BYTES?data.browserHtml:undefined;
 let extracted:ReturnType<typeof extractPublicHtml>|undefined;
 try{if(html&&data?.statusCode===200)extracted=extractPublicHtml(html,url.href);}catch{/* Retain a completed transport receipt even when extraction fails. */}
 return {providerHttpStatus:response.status,upstreamStatus:typeof data?.statusCode==='number'?data.statusCode:undefined,
  htmlBytes:html?new TextEncoder().encode(html).length:0,pageKind:extracted?.pageKind,bodyCharacters:extracted?.body.length??0,
  articleLinks:(extracted?.articleLinks??[]).filter(link=>{try{return new URL(link).origin===url.origin;}catch{return false;}}).slice(0,12)};
}
