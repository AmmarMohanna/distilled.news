import { parsePublicTelegramChannelPage } from "../telegram";
import type { Checkpoint, ConnectorBatch, HttpPort, UpstreamObservation } from "./contracts";
import { httpOutcome } from "./http";

export interface TelegramPoll {
  /** Verified numeric peer identity provided by account/channel registration. */
  channelId:string;
  username?:string;
  checkpoint:Checkpoint;
  maxItems:number;
  mode:"poll"|"recheck";
  recheckIds?:number[];
}
export interface TelegramRecord { id:number; text:string; publishedAt:string; editedAt?:string; url?:string; deleted?:boolean }
export interface TelethonPort {
  /** Authenticated service must enforce channel access and oldest-first min_id polling.
   * Tombstones require explicit deletion evidence, never absence from a preview. */
  read(input:{channelId:string; afterId:number; limit:number; recheckIds?:number[]}):Promise<{
    channelId:string; records:TelegramRecord[]; exhausted:boolean; orderedFromCheckpoint:boolean;
    retry?:ConnectorBatch["retry"]; requests:number; providerCostUsd:number|null;
  }>;
}
function validate(input:TelegramPoll){
  if(!/^-?\d+$/.test(input.channelId)||!Number.isInteger(input.maxItems)||input.maxItems<1||input.maxItems>100)throw new Error("invalid_telegram_poll");
  if(input.mode==="recheck"&&(!input.recheckIds?.length||input.recheckIds.length>input.maxItems||input.recheckIds.some(x=>!Number.isSafeInteger(x)||x<1)))throw new Error("invalid_recheck_bound");
}
function observation(channelId:string,r:TelegramRecord):UpstreamObservation {
  return {upstreamId:`telegram:${channelId}:${r.id}`,operation:r.deleted?"delete":"upsert",text:r.deleted?"":r.text,
    publishedAt:r.deleted?undefined:r.publishedAt,editedAt:r.editedAt,url:r.url,timestampKind:r.deleted?"unknown":"published",representation:"telegram_message",contentCompleteness:"complete"};
}
export async function fetchTelethonCandidates(input:TelegramPoll,port:TelethonPort,clock=Date.now):Promise<ConnectorBatch>{
  validate(input);const start=clock();const after=input.checkpoint.afterMessageId??0;
  let page:Awaited<ReturnType<TelethonPort["read"]>>;
  try{page=await port.read({channelId:input.channelId,afterId:after,limit:input.maxItems,recheckIds:input.mode==="recheck"?input.recheckIds:undefined});}
  catch{return {...httpOutcome("telethon",0,{},start,clock()),telemetry:{requests:1,latencyMs:clock()-start,providerCostUsd:null}};}
  if(page.channelId!==input.channelId||page.records.length>input.maxItems)throw new Error("telegram_service_contract_violation");
  if(page.retry?.kind && page.retry.kind!=="none")return {connector:"telethon",observations:[],coverage:{completeness:"unknown",reason:"provider_retry"},retry:page.retry,telemetry:{requests:page.requests,latencyMs:clock()-start,providerCostUsd:page.providerCostUsd}};
  if(page.records.some(r=>!Number.isSafeInteger(r.id)||r.id<1||(!r.deleted&&!Number.isFinite(Date.parse(r.publishedAt)))))throw new Error("invalid_telegram_record");
  if(input.mode==="recheck"&&page.records.some(r=>!input.recheckIds!.includes(r.id)))throw new Error("unrequested_recheck_item");
  const records=page.records.filter(r=>input.mode==="recheck"||r.id>after);
  const ids=records.map(r=>r.id);const ordered=ids.every((n,i)=>i===0||n>ids[i-1]);
  // An empty/media-only message is still a source record, but not a text candidate.
  const observations=records.filter(r=>r.deleted||r.text.trim()).map(r=>observation(input.channelId,r));
  const safePoll=input.mode==="poll"&&page.orderedFromCheckpoint&&ordered;
  return {connector:"telethon",observations,coverage:{completeness:page.exhausted&&safePoll?"complete":"partial",reason:input.mode==="recheck"?"bounded_revision_recheck":page.exhausted?"poll_boundary_reached":"bounded_page"},
    checkpointProposal:safePoll&&ids.length?{afterMessageId:Math.max(after,...ids)}:undefined,retry:{kind:"none"},
    telemetry:{requests:page.requests,latencyMs:Math.max(0,clock()-start),providerCostUsd:page.providerCostUsd}};
}
export async function fetchPublicTelegramCandidates(input:TelegramPoll,http:HttpPort,clock=Date.now):Promise<ConnectorBatch>{
  validate(input);if(!input.username||! /^[a-zA-Z0-9_]{5,32}$/.test(input.username))throw new Error("telegram_username_required");
  const start=clock();let r:Awaited<ReturnType<HttpPort["get"]>>;
  try{r=await http.get(`https://t.me/s/${input.username}`,{});}catch{return httpOutcome("telegram_public",0,{},start,clock());}
  if(r.status!==200)return httpOutcome("telegram_public",r.status,r.headers,start,clock());
  let parsed:ReturnType<typeof parsePublicTelegramChannelPage>;
  try{parsed=parsePublicTelegramChannelPage(r.body,{username:input.username});}catch{return httpOutcome("telegram_public",422,{},start,clock());}
  const rows=parsed.filter(m=>input.mode==="recheck"?input.recheckIds!.includes(Number(m.messageId)):Number(m.messageId)>(input.checkpoint.afterMessageId??0)).sort((a,b)=>Number(a.messageId)-Number(b.messageId)).slice(0,input.maxItems);
  return {connector:"telegram_public",observations:rows.filter(m=>m.text.trim()).map(m=>observation(input.channelId,{id:Number(m.messageId),text:m.text,publishedAt:m.postedAt,url:m.sourceUrl})),
    coverage:{completeness:"partial",reason:parsed.length?"preview_cannot_prove_no_gap":"preview_has_no_inventory"},
    // Latest-page preview cannot prove continuity or deletion. Never advance the shared poll cursor.
    retry:{kind:"none"},telemetry:{requests:1,latencyMs:Math.max(0,clock()-start),providerCostUsd:0}};
}
