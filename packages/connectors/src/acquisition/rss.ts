import { buildGoogleNewsRssUrl, parseGoogleNewsRssFeed, parseRssFeed } from "../rss";
import type { Checkpoint, ConnectorBatch, HttpPort, UpstreamObservation } from "./contracts";
import { httpOutcome } from "./http";

function value(block:string, name:string):string|undefined {
  const text=block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,"i"))?.[1];
  return text?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").trim();
}
export async function fetchRssCandidates(input:{url:string; resourceId:string; checkpoint:Checkpoint; maxItems:number; googleNews?:boolean}, http:HttpPort, clock=Date.now):Promise<ConnectorBatch> {
  if (!Number.isInteger(input.maxItems) || input.maxItems<1 || input.maxItems>1000) throw new Error("invalid_item_limit");
  const connector=input.googleNews?"google_news":"rss";
  const start=clock(); const headers:Record<string,string>={accept:"application/rss+xml, application/atom+xml, application/xml"};
  if(input.checkpoint.etag)headers["if-none-match"]=input.checkpoint.etag;
  if(input.checkpoint.lastModified)headers["if-modified-since"]=input.checkpoint.lastModified;
  let response:Awaited<ReturnType<HttpPort["get"]>>;
  try{response=await http.get(input.url,headers);}catch{return httpOutcome(connector,0,{},start,clock());}
  if(response.status===304)return {connector,observations:[],coverage:{completeness:"unknown",reason:"unchanged_feed_not_history_proof"},retry:{kind:"none"},telemetry:{requests:1,latencyMs:clock()-start,providerCostUsd:0}};
  if(response.status!==200)return httpOutcome(connector,response.status,response.headers,start,clock());
  if(!/<(?:rss|feed|rdf:RDF)\b/i.test(response.body))return {...httpOutcome(connector,422,{},start,clock()),coverage:{completeness:"unknown",reason:"invalid_feed"}};
  const parser=input.googleNews?parseGoogleNewsRssFeed:parseRssFeed;
  const options={sourceId:input.resourceId,sourceTitle:input.resourceId,sourceUrl:input.url};
  try{parser(response.body,options);}catch{return {...httpOutcome(connector,422,{},start,clock()),coverage:{completeness:"unknown",reason:"invalid_feed"}};}
  const observations:UpstreamObservation[]=[]; let rejected=0;
  const blocks=[...response.body.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  for(const block of blocks.slice(0,input.maxItems)){
    const raw=block[2]; const parsed=parser(`<rss><channel>${block[0]}</channel></rss>`,options)[0];
    const upstreamId=value(raw,"guid")??value(raw,"id")??parsed?.sourceUrl;
    if(!parsed || !upstreamId || upstreamId===input.url){rejected++;continue;}
    const explicitPublished=value(raw,"pubDate")??value(raw,"published")??value(raw,"dc:date");
    // Reuse tested field normalization but prefer provided content over a teaser.
    const content=value(raw,"content:encoded")??value(raw,"content");
    const richer=content && !input.googleNews ? parseRssFeed(`<rss><channel><item><title></title><description><![CDATA[${content.replace(/\]\]>/g,"")}]]></description><pubDate>${parsed.postedAt}</pubDate><guid>x</guid></item></channel></rss>`,options)[0]?.text : undefined;
    observations.push({upstreamId,operation:"upsert",title:value(raw,"title"),text:richer??parsed.text,url:parsed.sourceUrl,
      publishedAt:parsed.postedAt,timestampKind:explicitPublished?"published":value(raw,"updated")?"updated":"unknown",
      representation:input.googleNews?"news_listing":"feed_text",contentCompleteness:input.googleNews?"partial":"unknown"});
  }
  const truncated=blocks.length>input.maxItems;
  return {connector,observations,coverage:{completeness:"partial",reason:truncated?"item_limit":rejected?"invalid_entries":"finite_feed_not_history_proof"},
    // Do not save validators when unconsumed entries would be hidden by a later 304.
    checkpointProposal:truncated||rejected?undefined:{etag:response.headers.etag,lastModified:response.headers["last-modified"]},
    retry:{kind:"none"},telemetry:{requests:1,latencyMs:Math.max(0,clock()-start),providerCostUsd:0}};
}
export function fetchGoogleNewsCandidates(input:{query:string; language:string; region:string; resourceId:string; checkpoint:Checkpoint; maxItems:number},http:HttpPort,clock=Date.now){
  return fetchRssCandidates({...input,url:buildGoogleNewsRssUrl(input.query,{language:input.language,geo:input.region}),googleNews:true},http,clock);
}
