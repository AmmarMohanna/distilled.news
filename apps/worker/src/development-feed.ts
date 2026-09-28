import {areSameEventDeterministic,stableHash,type BriefingItem,type GroundedClaim} from '@distilled/core';
import type {Repository} from './types';

export function publicDevelopment(item:BriefingItem) {
  const claims=(item.development?.claims??[]).map(claim=>({...claim,support:claim.support.filter(ref=>item.evidence.some(entry=>entry.messageId===ref.messageId&&entry.sourceUrl&&entry.text.normalize('NFKC').replace(/\s+/g,' ').includes(ref.quote.normalize('NFKC').replace(/\s+/g,' '))))})).filter(claim=>claim.support.length);
  const references=new Set(claims.flatMap(claim=>claim.support.map(ref=>ref.messageId)));
  const sources=item.evidence.filter(entry=>references.has(entry.messageId)&&entry.sourceUrl).map(entry=>({
    id:entry.messageId,documentId:entry.documentId,url:entry.sourceUrl!,publisher:entry.sourceTitle,
    headline:entry.headline,publishedAt:entry.postedAt
  }));
  return {id:item.id,headline:item.evidence[0]?.headline??claims[0]?.text??item.summary,
    summary:claims.slice(-4).map(claim=>claim.text).join(' '),publishedAt:item.itemAt,updatedAt:item.updatedAt,
    version:item.development?.version??1,claims:claims.map(claim=>({id:claim.id,text:claim.text,
      sourceIds:claim.support.filter(ref=>sources.some(source=>source.id===ref.messageId)).map(ref=>ref.messageId)})),
    sources,supportingArticles:item.evidence.filter(entry=>entry.sourceUrl).map(entry=>({id:entry.messageId,url:entry.sourceUrl!,publisher:entry.sourceTitle,headline:entry.headline,publishedAt:entry.postedAt})),sourceCount:new Set(item.evidence.map(entry=>entry.sourceId)).size,
    ranking:item.development?.ranking,changes:item.development?.changes.map(change=>({id:change.id,at:change.at,kind:change.kind,claimIds:change.claimIds}))??[]};
}

export interface DevelopmentRead {itemId:string;version:number;through:string}
type Card=ReturnType<typeof publicDevelopment>&{feedIds:string[]};
export interface CatchUpSnapshot {
  id:string;accountId:string;since:string;through:string;createdAt:string;expiresAt:string;
  fingerprint:string;cards:Card[];truncated:boolean;captured:DevelopmentRead[];
}
export interface CatchUpStore {
  read(accountId:string,now:Date):Promise<{boundary?:string;items:DevelopmentRead[]}>;
  save(snapshot:CatchUpSnapshot):Promise<CatchUpSnapshot>;
  acknowledge(accountId:string,id:string,now:Date):Promise<boolean>;
}

export async function generateCatchUp(repo:Repository,store:CatchUpStore,accountId:string,now=new Date(),limit=8):Promise<CatchUpSnapshot> {
  const read=await store.read(accountId,now),feeds=await repo.listBriefings(accountId);
  const since=read.boundary??new Date(now.getTime()-15*86400000).toISOString();
  const groups:{item:BriefingItem;feedIds:string[];captured:DevelopmentRead[];claims:GroundedClaim[]}[]=[];
  for(const feed of feeds){
    const items=await repo.getExistingItems(feed.id,now);
    for(const item of items){
      if(!item.development||!item.development.claims.length||Date.parse(item.updatedAt)>now.getTime())continue;
      const prior=read.items.find(entry=>entry.itemId===item.id);
      if(prior&&prior.version>=item.development.version)continue;
      const meaningful=item.development.changes.filter(change=>change.kind!=='CORROBORATION'&&(!prior||change.at>prior.through));
      if(prior&&!meaningful.length)continue;
      const claimIds=new Set(meaningful.flatMap(change=>change.claimIds));
      const claims=prior?item.development.claims.filter(claim=>claimIds.has(claim.id)):item.development.claims;
      if(!claims.length)continue;
      const captured={itemId:item.id,version:item.development.version,through:now.toISOString()};
      const group=groups.find(group=>areSameEventDeterministic(group.item.evidence,item.evidence));
      if(group){
        group.feedIds.push(feed.id);group.captured.push(captured);
        for(const evidence of item.evidence)if(!group.item.evidence.some(entry=>entry.messageId===evidence.messageId))group.item.evidence.push(evidence);
        for(const claim of claims)if(!group.claims.some(entry=>entry.id===claim.id))group.claims.push(claim);
        if((item.development.ranking.score??0)>(group.item.development?.ranking.score??0))group.item.development!.ranking=item.development.ranking;
      }else groups.push({item:structuredClone(item),feedIds:[feed.id],captured:[captured],claims});
    }
  }
  groups.sort((a,b)=>(b.item.development?.ranking.score??0)-(a.item.development?.ranking.score??0)||b.item.updatedAt.localeCompare(a.item.updatedAt)||a.item.id.localeCompare(b.item.id));
  const selected=groups.slice(0,Math.max(1,Math.min(limit,20)));
  const cards=selected.map(group=>{group.item.development!.claims=group.claims;group.item.summary=group.claims.map(claim=>claim.text).join(' ');return{...publicDevelopment(group.item),feedIds:[...new Set(group.feedIds)]}});
  const captured=selected.flatMap(group=>group.captured);
  const fingerprint=stableHash(JSON.stringify(captured.map(ref=>({id:ref.itemId,version:ref.version})))+since);
  const snapshot:CatchUpSnapshot={id:`catchup_${stableHash(accountId+fingerprint)}`,accountId,since,through:now.toISOString(),createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+15*86400000).toISOString(),fingerprint,cards,truncated:groups.length>selected.length,captured};
  return store.save(snapshot);
}

export function publicCatchUp(snapshot:CatchUpSnapshot){return{id:snapshot.id,since:snapshot.since,through:snapshot.through,createdAt:snapshot.createdAt,cards:snapshot.cards,truncated:snapshot.truncated}}

export class D1CatchUpStore implements CatchUpStore {
  constructor(private db:D1Database){}
  async read(accountId:string,now:Date){
    const boundary=await this.db.prepare('SELECT MAX(boundary_end) AS boundary FROM account_catchups WHERE account_id=? AND acknowledged_at IS NOT NULL').bind(accountId).first<{boundary:string|null}>();
    const rows=await this.db.prepare('SELECT item_id,read_version,read_through_at FROM account_development_reads WHERE account_id=? AND expires_at>?').bind(accountId,now.toISOString()).all<{item_id:string;read_version:number;read_through_at:string}>();
    return{boundary:boundary?.boundary??undefined,items:rows.results.map(row=>({itemId:row.item_id,version:row.read_version,through:row.read_through_at}))};
  }
  async save(snapshot:CatchUpSnapshot){
    await this.db.prepare('INSERT OR IGNORE INTO account_catchups(id,account_id,boundary_start,boundary_end,fingerprint,result_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(snapshot.id,snapshot.accountId,snapshot.since,snapshot.through,snapshot.fingerprint,JSON.stringify(snapshot),snapshot.createdAt,snapshot.expiresAt).run();
    const row=await this.db.prepare('SELECT result_json FROM account_catchups WHERE id=? AND account_id=?').bind(snapshot.id,snapshot.accountId).first<{result_json:string}>();
    if(!row)throw Error('CATCHUP_PERSISTENCE_FAILED');return JSON.parse(row.result_json) as CatchUpSnapshot;
  }
  async acknowledge(accountId:string,id:string,now:Date){
    const row=await this.db.prepare('SELECT result_json FROM account_catchups WHERE id=? AND account_id=? AND expires_at>?').bind(id,accountId,now.toISOString()).first<{result_json:string}>();
    if(!row)return false;const snapshot=JSON.parse(row.result_json) as CatchUpSnapshot;
    // Only captured versions are acknowledged. New updates and omitted cards stay unread.
    await this.db.batch([...snapshot.captured.map(ref=>this.db.prepare(`INSERT INTO account_development_reads(account_id,item_id,read_version,read_through_at,expires_at)
      SELECT ?,id,?,?,? FROM briefing_items WHERE id=? AND briefing_id IN(SELECT id FROM briefings WHERE owner_account_id=?)
      ON CONFLICT(account_id,item_id) DO UPDATE SET read_version=MAX(read_version,excluded.read_version),read_through_at=MAX(read_through_at,excluded.read_through_at),expires_at=excluded.expires_at`).bind(accountId,ref.version,ref.through,snapshot.expiresAt,ref.itemId,accountId)),
      this.db.prepare('UPDATE account_catchups SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE id=? AND account_id=?').bind(now.toISOString(),id,accountId)]);
    return true;
  }
}
