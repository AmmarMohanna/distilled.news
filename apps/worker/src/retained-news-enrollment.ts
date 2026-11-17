import {makeId} from '@distilled/agent-runtime';
import type {Env,SourceRecord,ProcessingJobMessage} from './types';

/** A new subscription can use its owner's already acquired evidence. This is
 * enrollment, not a new acquisition: no coverage or high-water is changed. */
export async function enrollRetainedNewsForSource(db:Env['DB'],input:{tenantId:string;source:SourceRecord;retentionDays:number;now?:Date;queue:{send(message:ProcessingJobMessage):Promise<unknown>}}){
  const now=input.now??new Date(),source=input.source;
  if(!source.enabled||!source.sourceUrl||!['rss_feed','web_page'].includes(source.kind))return{enrolled:0,queued:0,deferred:0};
  const target=await db.prepare('SELECT b.owner_account_id,s.source_url FROM sources s JOIN briefings b ON b.id=s.briefing_id WHERE s.id=? AND s.briefing_id=? AND s.enabled=1').bind(source.id,source.briefingId).first<{owner_account_id:string;source_url:string}>();
  if(!target||target.owner_account_id!==input.tenantId||target.source_url!==source.sourceUrl)return{enrolled:0,queued:0,deferred:0};
  const floor=new Date(now.getTime()-Math.min(15,Math.max(1,input.retentionDays))*86400000).toISOString();
  const rows=await db.prepare(`SELECT a.id,a.resource_id,a.identity,a.canonical_url,a.source_item_id,a.title,a.body,a.published_at,a.acquired_at,a.expires_at,
    (SELECT json_extract(m.news_json,'$.acquisitionRunId') FROM raw_messages m WHERE json_extract(m.news_json,'$.acquiredItemId')=a.id LIMIT 1) AS run_id
    FROM acquired_source_items a JOIN upstream_resources r ON r.id=a.resource_id
    WHERE a.tenant_id=? AND r.tenant_id=? AND r.canonical_source_url=? AND a.expires_at>? AND a.published_at>=? AND a.published_at<?
    ORDER BY a.published_at DESC LIMIT 50`).bind(input.tenantId,input.tenantId,new URL(source.sourceUrl).href,now.toISOString(),floor,now.toISOString()).all<{id:string;resource_id:string;identity:string;canonical_url:string|null;source_item_id:string|null;title:string|null;body:string;published_at:string;acquired_at:string;expires_at:string;run_id:string|null}>();
  let enrolled=0,queued=0,deferred=0;
  for(const item of rows.results){
    if(!item.body?.trim()||!item.canonical_url)continue;
    const rawId=`${source.briefingId}::${item.id}`,jobId=makeId('job_acquisition',rawId);
    const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.body.normalize('NFKC').replace(/\s+/g,' ').trim())))).map(value=>value.toString(16).padStart(2,'0')).join('');
    const news={tenantId:input.tenantId,acquiredItemId:item.id,upstreamResourceId:item.resource_id,canonicalIdentity:item.identity,contentHash,headline:item.title??undefined,language:/[\u0600-\u06ff]/u.test(item.body)?'ar':'und',acquisitionRunId:item.run_id??undefined};
    const text=item.title&&!item.body.startsWith(item.title)?`${item.title}\n${item.body}`:item.body;
    const result=await db.batch([
      db.prepare('INSERT OR IGNORE INTO raw_messages(id,briefing_id,source_id,source_title,source_type,source_provider,source_kind,message_id,text,links_json,media_json,posted_at,received_at,source_url,expires_at,created_at,news_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(rawId,source.briefingId,source.id,source.title,source.type,source.provider,source.kind,item.source_item_id??item.identity,text,JSON.stringify([item.canonical_url]),'[]',item.published_at,item.acquired_at,item.canonical_url,item.expires_at,now.toISOString(),JSON.stringify(news)),
      db.prepare("INSERT OR IGNORE INTO processing_jobs(id,briefing_id,raw_message_id,state,created_at,updated_at) VALUES(?,?,?,'queued',?,?)").bind(jobId,source.briefingId,rawId,now.toISOString(),now.toISOString())
    ]);
    enrolled+=Number(result[0].meta.changes);
    if(Number(result[1].meta.changes)){queued++;try{await input.queue.send({type:'process_raw_message',jobId,briefingId:source.briefingId,rawMessageId:rawId})}catch{deferred++}}
  }
  return{enrolled,queued,deferred};
}
