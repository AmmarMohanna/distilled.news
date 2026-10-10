import { buildGoogleNewsRssUrl } from '../rss';
import { parsePublicTelegramChannelPage } from '../telegram';
import { normalizeRssSnapshot,rssEvidenceText } from './rss-normalize';
import type { FeedHttpPort, FetchRun } from './ports';
import { SourceProviderError, type SourceProvider, type SourceFetchRequest, type ProviderPage, type SourceFamily, type ProviderItem } from './provider-types';
import { articleUrl, record, string, timestamp } from './provider-normalize';

/** Authorized backend execution binding. Worker code never spawns Python or stores sessions. */
export interface SourceExecutionPort {execute(kind:'feedparser'|'telethon'|'telegram_resolve'|'google_resolve'|'google_feed'|'extract'|'playwright',input:Record<string,unknown>,bounds?:{timeoutMs?:number}):Promise<unknown>}
export async function executeSource(port:SourceExecutionPort,kind:Parameters<SourceExecutionPort['execute']>[0],input:Record<string,unknown>,bounds?:{timeoutMs?:number}) {
  try {return await port.execute(kind,input,bounds);}catch{throw new SourceProviderError('TRANSIENT');}
}
const raw=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function requireFeed(status:number){if(status===451)throw new SourceProviderError('POLICY_REFUSAL');if(status===429)throw new SourceProviderError('RATE_LIMIT');if([401,403].includes(status))throw new SourceProviderError('AUTH_REQUIRED');if(status!==200)throw new SourceProviderError(status>=500||status===0?'TRANSIENT':'CHALLENGE');}
/** Inspect only Google's own article endpoint. Never follow a redirect or fetch a publisher here. */
function googleArticleLink(value?:string):boolean {
  try {const u=new URL(value??'');return u.protocol==='https:'&&u.hostname==='news.google.com'&&
    /^\/(?:rss\/)?articles\/[^/]+/.test(u.pathname)&&!u.username&&!u.password&&!u.port;}
  catch{return false;}
}
function publicPublisherLocation(value?:string):string|undefined {
  const normalized=articleUrl(value);
  if(!normalized)return undefined;
  const u=new URL(normalized),host=u.hostname.toLowerCase();
  // This URL is handed to acquisition later; do not turn a provider redirect
  // into a private-network target or a second Google News listing.
  if(u.protocol!=='https:'||u.port||host==='news.google.com'||host==='localhost'||host.endsWith('.localhost')||
    host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||host.startsWith('[')||
    /^\d+(?:\.\d+){3}$/.test(host)||/^[0-9.]+$/.test(host))return undefined;
  return normalized;
}

export class FeedSourceProvider implements SourceProvider {
  readonly families:SourceFamily[];
  constructor(readonly id:'rss_native'|'rss_feedparser'|'google_rss',private http:FeedHttpPort,private execution?:SourceExecutionPort){this.families=id==='google_rss'?['google_news']:['rss'];}
  async fetch(input:SourceFetchRequest):Promise<ProviderPage>{
    const started=Date.now();
    const url=this.id==='google_rss'?buildGoogleNewsRssUrl(input.source.locator,{geo:input.source.region,language:input.source.language}):input.source.locator;
    // With an authorized private Google route, one short public attempt is
    // enough. Three long public timeouts consumed most of the QA request before
    // the working private feed/redirect path could finish.
    let r=await this.http.get(url,{accept:'application/rss+xml,application/atom+xml,application/xml'},
      this.id==='google_rss'&&this.execution?{attempts:1,timeoutMs:5_000}:undefined);
    // Only transient transport/server failures may try the authorized private
    // route. Preserve rate limits, authorization and policy refusals unchanged.
    if(this.id==='google_rss'&&this.execution&&(r.status===0||r.status>=500)){
      const feed=record(await executeSource(this.execution,'google_feed',{url},{timeoutMs:25_000}));
      if(feed.status===200&&typeof feed.xml==='string'&&new TextEncoder().encode(feed.xml).length<=2_000_000){
        r={status:200,headers:{},bytes:new TextEncoder().encode(feed.xml),telemetry:{requests:r.telemetry.requests+1,latencyMs:r.telemetry.latencyMs+Math.max(0,Number(feed.latencyMs)||0),providerCostUsd:0}};
      }else requireFeed(Number(feed.status)||0);
    }
    requireFeed(r.status);
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
    let requests=r.telemetry.requests,latencyMs=r.telemetry.latencyMs;
    const resolved=new Map<string,string>();
    if(this.id==='google_rss') {
      // One private batch gives modern redirect decodes time to finish without
      // four separate short RPC deadlines. Only collected listing URLs are sent.
      // Include later snapshot pages: cached successes leave the bounded decode
      // budget available for unresolved listings beyond the first intake slice.
      const links=[...new Set(entries.map(e=>string(e.url)).filter((v):v is string=>!!v&&googleArticleLink(v)))].slice(0,500);
      if(this.execution&&links.length){
        try{
          const result=record(await executeSource(this.execution,'google_resolve',{urls:links},{timeoutMs:65_000}));
          if(Number.isFinite(result.latencyMs)&&Number(result.latencyMs)>=0)latencyMs+=Number(result.latencyMs);
          if(Array.isArray(result.results))for(const value of result.results){
            const row=record(value),link=string(row.inputUrl),publisher=publicPublisherLocation(string(row.url));
            if(!link||!links.includes(link))continue;
            if(Number.isSafeInteger(row.requests)&&Number(row.requests)>=0&&Number(row.requests)<=3)requests+=Number(row.requests);
            if(publisher)resolved.set(link,publisher);
          }
        }catch { /* Preserve unresolved listings when the bounded helper fails. */ }
      }
      const unresolved=links.filter(link=>!resolved.has(link)).slice(0,8);
      for(let index=0;index<unresolved.length;index+=2)await Promise.all(unresolved.slice(index,index+2).map(async link=>{
        try{
          const probe=await this.http.get(link,{accept:'text/html'},{attempts:1,timeoutMs:3_000});
          requests+=probe.telemetry.requests;latencyMs+=probe.telemetry.latencyMs;
          if([301,302,303,307,308].includes(probe.status)){
            const location=Object.entries(probe.headers).find(([key])=>key.toLowerCase()==='location')?.[1];
            const publisher=publicPublisherLocation(location);if(publisher)resolved.set(link,publisher);
          }
        }catch { /* Resolution failure never invalidates the original listing. */ }
      }));
    }

    const extracted=new Map<string,string>();
    if(this.id==='rss_native'&&this.execution) {
      const origin=new URL(url).origin;
      const links=[...new Set(entries.map(e=>string(e.url)).filter((v):v is string=>{
        if(!v)return false;
        try {const article=new URL(v);return article.protocol==='https:'&&article.origin===origin&&article.href!==url;}
        catch{return false;}
      }))].slice(0,Math.min(input.limit,2));
      for(const link of links) {
        try {
          const article=await this.http.get(link,{accept:'text/html'},{attempts:1,timeoutMs:3_000});
          requests+=article.telemetry.requests;latencyMs+=article.telemetry.latencyMs;
          if(article.status!==200)continue;
          const html=new TextDecoder('utf-8',{fatal:true}).decode(article.bytes);
          if(/<title[^>]*>\s*(?:just a moment|access denied|client challenge|captcha)/i.test(html))continue;
          const result=record(await executeSource(this.execution,'extract',{url:link,html},{timeoutMs:5_000}));
          const body=string(result.body);
          if(body&&body.length>=200&&body.length<=500_000)extracted.set(link,body);
        } catch { /* Keep the feed excerpt when the optional article path fails. */ }
      }
    }
    const items:ProviderItem[]=entries.map((e,index)=>({sourceItemKey:string(e.key)??`invalid-row:${index}`,upstreamId:string(e.upstreamId),
      url:resolved.get(string(e.url)??'')??string(e.url),publisherId:resolved.has(string(e.url)??'')?
        new URL(resolved.get(string(e.url)??'')!).hostname:string(e.publisherId),title:string(e.title),
      body:rssEvidenceText(string(e.title),extracted.get(string(e.url)??'')??string(e.body)),
      sourceTitle:string(e.sourceTitle),excerpt:string(e.excerpt),author:string(e.author),updatedAt:timestamp(e.updatedAt),
      publishedAt:timestamp(e.publishedAt),language:string(e.language),
      representation:this.id==='google_rss'?'LISTING_RESULT':extracted.has(string(e.url)??'')?'FULL_ARTICLE':'ARTICLE_EXCERPT',contentCompleteness:'UNKNOWN',identityValid:e.identityValid===true,
      sourceRevision:e.sourceRevision,authoritativeCurrentState:false}));
    return {items:input.recheckItemKeys?items.filter(i=>input.recheckItemKeys!.includes(i.sourceItemKey)):items,
      raw:r.bytes,requests,latencyMs:Math.max(latencyMs,Date.now()-started),providerCostUsd:0};
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
    if(result.channelId!==channel||!Array.isArray(result.records)||result.records.length>input.limit*(ids?1:2))throw new SourceProviderError('MALFORMED');
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
    const currentRecords=result.records.filter((r:any)=>!r.deleted&&!r.rechecked);
    const ordered=currentRecords.every((r:any,i:number)=>r.id>after&&(i===0||r.id>currentRecords[i-1].id));
    const cursor=!ids&&ordered&&result.orderedFromCheckpoint===true&&currentRecords.length?String(currentRecords.at(-1).id):undefined;
    return {items,raw:raw(result),provenSafeCursor:cursor,
      continuationToken:!ids&&cursor&&result.exhausted!==true?cursor:undefined,
      complete:!ids&&result.exhausted===true&&result.bootstrapRecent!==true&&result.orderedFromCheckpoint===true&&!['GAP','PENDING'].includes(result.deletionState),requests:1,latencyMs:Date.now()-start,providerCostUsd:0};
  }
}
