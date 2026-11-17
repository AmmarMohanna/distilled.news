import {hashContent,type SourceObservation} from '@distilled/contracts';
import {HttpSourceExecution} from '@distilled/connectors';
import type {Env} from './types';
import {productConnectorSource} from './connector-source';

/** Independent current-origin check. Absence is not deletion. Only the trusted
 * helper's explicit MTProto deletion journal or matching current text is proof. */
export async function verifyConnectorAuthority(env:Env,o:SourceObservation):Promise<boolean>{
 if(!o.authoritativeCurrentState||o.representation!=='TELEGRAM_MESSAGE'||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN||!env.SOURCE_EXECUTION_SERVICE)return false;
 const row=await env.DB.prepare("SELECT s.provider,s.kind,s.source_url,s.input,s.actor_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND b.id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL").bind(o.feedSourceId,o.feedId).first<{provider:string;kind:string;source_url:string|null;input:string|null;actor_id:string|null}>();
 const source=row&&productConnectorSource(row),match=o.sourceItemKey.match(/^telegram:(-\d+):(\d+)$/);
 if(!source||source.source.family!=='telegram'||!match||source.source.channelId!==match[1])return false;
 const id=Number(match[2]);if(!Number.isSafeInteger(id)||id<1)return false;
 if(o.operation==='UPSERT'){
  const existing=await env.DB.prepare("SELECT json_extract(e.json,'$.state') AS state,json_extract(e.json,'$.currentSourceRevision.value') AS revision,json_extract(r.json,'$.contentHash') AS hash FROM v1_evidence e LEFT JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE e.feed_source_id=? AND e.item_key=?").bind(o.feedSourceId,o.sourceItemKey).first<{state:string;revision:string|null;hash:string|null}>();
  // New items and ordinarily ordered edits do not need a second MTProto call.
  if(!existing||existing.state!=='DELETED'&&(existing.revision!==o.sourceRevision?.value||existing.hash===o.contentHash))return false;
 }
 try{
  const port=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(url,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(url,init),true);
  const raw=await port.execute('telethon',{channelId:match[1],username:source.source.locator,afterId:0,limit:1,recheckIds:[id]});
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const r=raw as {channelId?:unknown;records?:unknown[];error?:unknown};
  if(r.error||r.channelId!==match[1]||!Array.isArray(r.records))return false;
  const current=r.records.find((value:any)=>value?.id===id) as {text?:unknown;deleted?:unknown;explicitDeletion?:unknown}|undefined;
  if(!current)return false;
  if(o.operation==='DELETE')return current.deleted===true&&current.explicitDeletion===true;
  return current.deleted!==true&&typeof current.text==='string'&&!!o.contentHash&&await hashContent({representation:o.representation,title:o.titleHint,body:current.text})===o.contentHash;
 }catch{return false;}
}
