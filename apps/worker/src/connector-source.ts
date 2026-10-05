import {z} from 'zod';
import type {SourceDefinition} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

const telegramConfiguration=z.object({channelId:z.string().regex(/^-[1-9]\d*$/),username:z.string().regex(/^[A-Za-z0-9_]{5,32}$/),public:z.literal(true)}).strict();
/** Product approval plus the runtime allowlist admits these definitions. No discovery or channel joins. */
export function productConnectorSource(p:{provider:string;kind:string;source_url:string|null;input:string|null}):{source:SourceDefinition;canonicalUrl:string;identity:unknown;limit:number}|undefined {
 if(p.provider==='rss'&&p.kind==='rss_feed'&&p.source_url){
  const url=new URL(p.source_url).href;new WorkerPublicSourceFetch(url);
  return {source:{family:'rss',locator:url},canonicalUrl:url,identity:{type:'rss',canonicalUrl:url},limit:30};
 }
 if(p.provider==='telegram'&&p.kind==='telegram_channel'&&p.input){
  let raw:unknown;try{raw=JSON.parse(p.input)}catch{return undefined}
  const parsed=telegramConfiguration.safeParse(raw);if(!parsed.success)return undefined;
  const c=parsed.data,url=`https://t.me/${c.username}`;
  if(p.source_url!==url)return undefined;
  return {source:{family:'telegram',locator:c.username,channelId:c.channelId,public:true},canonicalUrl:url,identity:{type:'telegram',channelId:c.channelId},limit:3};
 }
 return undefined;
}
