import { buildGoogleNewsRssUrl } from '../rss';
import { parsePublicTelegramChannelPage } from '../telegram';
import { normalizeRssSnapshot } from './rss-normalize';
import type { FeedHttpPort, FetchRun } from './ports';
import { SourceProviderError, type SourceProvider, type SourceFetchRequest, type ProviderPage, type SourceFamily, type ProviderItem } from './provider-types';
import { record, string, timestamp } from './provider-normalize';

/** Authorized backend execution binding. Worker code never spawns Python or stores sessions. */
export interface SourceExecutionPort {execute(kind:'feedparser'|'telethon'|'extract'|'playwright',input:Record<string,unknown>):Promise<unknown>}
export async function executeSource(port:SourceExecutionPort,kind:Parameters<SourceExecutionPort['execute']>[0],input:Record<string,unknown>) {
  try {return await port.execute(kind,input);}catch{throw new SourceProviderError('TRANSIENT');}
}
const raw=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function requireFeed(status:number){if(status===451)throw new SourceProviderError('POLICY_REFUSAL');if(status===429)throw new SourceProviderError('RATE_LIMIT');if([401,403].includes(status))throw new SourceProviderError('AUTH_REQUIRED');if(status!==200)throw new SourceProviderError(status>=500||status===0?'TRANSIENT':'CHALLENGE');}

export class FeedSourceProvider implements SourceProvider {
  readonly families:SourceFamily[];
  constructor(readonly id:'rss_native'|'rss_feedparser'|'google_rss',private http:FeedHttpPort,private execution?:SourceExecutionPort){this.families=id==='google_rss'?['google_news']:['rss'];}
  async fetch(input:SourceFetchRequest):Promise<ProviderPage>{
    const url=this.id==='google_rss'?buildGoogleNewsRssUrl(input.source.locator,{geo:input.source.region,language:input.source.language}):input.source.locator;
    const r=await this.http.get(url,{accept:'application/rss+xml,application/atom+xml,application/xml'});requireFeed(r.status);
    let xml:string;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(r.bytes);}catch{throw new SourceProviderError('MALFORMED');}
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new SourceProviderError('POLICY_REFUSAL');
    let entries:any[];
    if(this.id==='rss_feedparser'){
      if(!this.execution)throw new SourceProviderError('UNAVAILABLE');
      const parsed=record(await executeSource(this.execution,'feedparser',{xml,url}));if(!Array.isArray(parsed.items))throw new SourceProviderError('MALFORMED');entries=parsed.items;
    }else {try{entries=normalizeRssSnapshot(xml,url);}catch{throw new SourceProviderError('MALFORMED');}}
    // Preserve capped snapshot entries through a scoped continuation saved by the collector.
    const offset=input.continuation?Number(input.continuation.token):0;
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('INVALID_CONTINUATION');
    // Native snapshot pagination is done by the collector; providers do not refetch offsets.
    if(offset!==0)throw new Error('USE_SAVED_SNAPSHOT_CONTINUATION');
    const items:ProviderItem[]=entries.map((e,index)=>({sourceItemKey:string(e.key)??`invalid-row:${index}`,upstreamId:string(e.upstreamId),
      url:string(e.url),publisherId:string(e.publisherId),title:string(e.title),body:string(e.body),publishedAt:timestamp(e.publishedAt),language:string(e.language),
      representation:this.id==='google_rss'?'LISTING_RESULT':'ARTICLE_EXCERPT',contentCompleteness:'UNKNOWN',identityValid:e.identityValid===true,
      sourceRevision:e.sourceRevision,authoritativeCurrentState:false}));
    return {items:input.recheckItemKeys?items.filter(i=>input.recheckItemKeys!.includes(i.sourceItemKey)):items,
      raw:r.bytes,requests:r.telemetry.requests,latencyMs:r.telemetry.latencyMs,providerCostUsd:0};
  }
}

export class TelegramSourceProvider implements SourceProvider {
  readonly families:SourceFamily[]=['telegram'];
  constructor(readonly id:'telegram_telethon'|'telegram_public',private http:FeedHttpPort,private execution?:SourceExecutionPort){}
  async fetch(input:SourceFetchRequest):Promise<ProviderPage>{
    const channel=input.source.channelId;
    if(!channel||!/^-[1-9]\d*$/.test(channel))throw new Error('VERIFIED_TELEGRAM_PEER_REQUIRED');
    const username=input.source.locator.replace(/^@/,'');
    if(this.id==='telegram_public'&&!/^[A-Za-z0-9_]{5,32}$/.test(username))throw new SourceProviderError('UNAVAILABLE');
    const after=Number(input.continuation?.token??input.requestedBounds.startCursor??0);
    if(!Number.isSafeInteger(after)||after<0)throw new Error('INVALID_TELEGRAM_CURSOR');
    if(this.id==='telegram_public'){
      if(!input.source.public)throw new SourceProviderError('UNAVAILABLE');
      const response=await this.http.get(`https://t.me/s/${username}`,{});requireFeed(response.status);
      let rows:ReturnType<typeof parsePublicTelegramChannelPage>;
      try{rows=parsePublicTelegramChannelPage(new TextDecoder().decode(response.bytes),{username});}catch{throw new SourceProviderError('CHALLENGE');}
      const selected=rows.filter(r=>input.recheckItemKeys?input.recheckItemKeys.includes(`telegram:${channel}:${r.messageId}`):Number(r.messageId)>after).slice(-input.limit);
      return {items:selected.map(r=>({sourceItemKey:`telegram:${channel}:${r.messageId}`,upstreamId:`telegram:${channel}:${r.messageId}`,
        body:r.text,url:r.sourceUrl,publishedAt:r.postedAt,publisherId:`telegram:${channel}`,representation:'TELEGRAM_MESSAGE',contentCompleteness:'UNKNOWN',identityValid:true,authoritativeCurrentState:false})),
        raw:response.bytes,requests:response.telemetry.requests,latencyMs:response.telemetry.latencyMs,providerCostUsd:0};
    }
    if(!this.execution)throw new SourceProviderError('UNAVAILABLE');
    const start=Date.now();const ids=input.recheckItemKeys?.map(k=>{const match=k.match(/^telegram:(-\d+):(\d+)$/);if(!match||match[1]!==channel)throw new Error('INVALID_RECHECK_ID');return Number(match[2]);});
    const result=record(await executeSource(this.execution,'telethon',{channelId:channel,username,afterId:after,limit:input.limit,
      recheckIds:ids,startTime:input.requestedBounds.startTime,endTime:input.requestedBounds.endTime}));
    if(result.error)throw new SourceProviderError(result.error==='AUTH_REQUIRED'?'AUTH_REQUIRED':result.error==='RATE_LIMIT'?'RATE_LIMIT':'TRANSIENT',timestamp(result.retryNotBefore));
    if(result.channelId!==channel||!Array.isArray(result.records)||result.records.length>input.limit)throw new SourceProviderError('MALFORMED');
    const items:ProviderItem[]=result.records.map((v:unknown)=>{
      const r=record(v);if(!Number.isSafeInteger(r.id)||r.id<1)throw new SourceProviderError('MALFORMED');
      if(ids&&!ids.includes(r.id))throw new SourceProviderError('MALFORMED');
      const edited=timestamp(r.editedAt??r.publishedAt);
      return {sourceItemKey:`telegram:${channel}:${r.id}`,upstreamId:`telegram:${channel}:${r.id}`,operation:r.deleted?'DELETE':'UPSERT',
        body:string(r.text),url:input.source.public&&/^[A-Za-z0-9_]{5,32}$/.test(username)?`https://t.me/${username}/${r.id}`:undefined,publishedAt:timestamp(r.publishedAt),publisherId:`telegram:${channel}`,
        representation:'TELEGRAM_MESSAGE',contentCompleteness:'COMPLETE',identityValid:true,
        // Current MTProto item reads are authoritative; deletion needs a distinct explicit signal.
        authoritativeCurrentState:r.deleted?r.explicitDeletion===true:true,
        sourceRevision:edited?{scheme:'telegram_edit_timestamp',value:edited,comparability:'COMPARABLE',authority:'ORIGIN'}:undefined};
    });
    const ordered=result.records.every((r:any,i:number)=>r.id>after&&(i===0||r.id>result.records[i-1].id));
    const cursor=!ids&&ordered&&result.orderedFromCheckpoint===true&&items.length?String(result.records.at(-1).id):undefined;
    return {items,raw:raw(result),provenSafeCursor:cursor,
      continuationToken:!ids&&cursor&&result.exhausted!==true?cursor:undefined,
      complete:!ids&&result.exhausted===true&&result.orderedFromCheckpoint===true,requests:1,latencyMs:Date.now()-start,providerCostUsd:0};
  }
}
