import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {IntakeScope} from '../v1-intake/types';
import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {V1FeedStore} from './store';
import type {FeedRecord} from './types';

const PRODUCT_SQL=`SELECT json_object('sourceId',s.id,'feedId',b.id,'ownerId',b.owner_account_id,'sourceTitle',s.title,'sourceKind',s.kind,'provider',s.provider,'sourceUrl',s.source_url,'input',s.input,'enabled',s.enabled,'feedTitle',b.title,'interests',b.interest_profile,'language',b.language,'paused',b.paused,'cadence',b.briefing_cadence,'createdAt',b.created_at,'accountDisabled',a.disabled_at) AS json FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=?`;
interface ProductRow {sourceId:string;feedId:string;ownerId:string;sourceTitle:string;sourceKind:string;provider:string;sourceUrl:string|null;input:string|null;enabled:number;feedTitle:string;interests:string;language:string;paused:number;cadence:string;createdAt:string;accountDisabled:string|null}
export interface CanonicalSource {id:string;type:'rss';displayName:string;canonicalUrl:string;connectorType:'rss';verificationStatus:'VERIFIED';createdAt:string}
/** Trusted bridge from an already user-approved product source. No source discovery or approval bypass. */
export async function enrollV1Source(db:D1Database,id:string,ownerId:string,now:string):Promise<{feed:FeedRecord;scope:IntakeScope;source:CanonicalSource}> {
 if(!Number.isFinite(Date.parse(now))) throw new HandoffError('INVALID_REQUEST');
 for(let attempt=0;attempt<8;attempt++) {
  const row=await db.prepare(PRODUCT_SQL).bind(id).first<{json:string}>();if(!row) throw new HandoffError('SCOPE_DENIED');
  const p=JSON.parse(row.json) as ProductRow;
  if(p.ownerId!==ownerId || !p.enabled || p.paused || p.accountDisabled) throw new HandoffError('SCOPE_DENIED');
  // Initial production seam is RSS. Other providers keep their existing path
  // until the connector owner supplies the frozen handoff and validation facts.
  if(p.provider!=='rss' || p.sourceKind!=='rss_feed' || !p.sourceUrl || !['hourly','daily','weekly'].includes(p.cadence)) throw new HandoffError('INVALID_REQUEST');
  const url=new URL(p.sourceUrl).href;new WorkerPublicSourceFetch(url); // identical public-network admission, no external call
  const sourceId=await sha256(canonicalJson({type:'rss',canonicalUrl:url}));
  const [priorFeed,priorScope,catalog,binding]=await Promise.all([
   db.prepare('SELECT json,epoch FROM v1_feeds WHERE id=?').bind(p.feedId).first<{json:string;epoch:number}>(),
   db.prepare('SELECT json,epoch FROM v1_intake_scopes WHERE id=?').bind(id).first<{json:string;epoch:number}>(),
   db.prepare('SELECT json FROM v1_source_catalog WHERE id=?').bind(sourceId).first<{json:string}>(),
   db.prepare('SELECT source_id,configuration FROM v1_product_bindings WHERE feed_source_id=?').bind(id).first<{source_id:string;configuration:string}>()
  ]);
  const existingFeed=priorFeed?JSON.parse(priorFeed.json) as FeedRecord:undefined,existingScope=priorScope?JSON.parse(priorScope.json) as IntakeScope:undefined;
  if(existingFeed?.deletedAt || existingScope?.deletedAt) throw new HandoffError('SCOPE_DENIED');
  if(existingFeed && existingFeed.ownerId!==ownerId || existingScope && (existingScope.sourceId!==sourceId || existingScope.feedId!==p.feedId) || binding && binding.source_id!==sourceId) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  const definition={title:p.feedTitle,interests:[p.interests],geography:[],outputLanguage:p.language,briefingFrequency:p.cadence.toUpperCase() as FeedRecord['briefingFrequency'],paused:false};
  const unchanged=existingFeed && canonicalJson(Object.fromEntries(Object.keys(definition).map(k=>[k,existingFeed[k as keyof FeedRecord]])))===canonicalJson(definition);
  const feed:FeedRecord=unchanged && binding?.configuration===row.json && existingScope?.enabled?existingFeed:{id:p.feedId,ownerId,...definition,revision:existingFeed?existingFeed.revision+1:1,createdAt:existingFeed?.createdAt??p.createdAt,updatedAt:now};
  const scope:IntakeScope={feedId:p.feedId,feedSourceId:id,sourceId,feedRevision:feed.revision,enabled:true,restrictions:{}};
  const source:CanonicalSource=catalog?JSON.parse(catalog.json):{id:sourceId,type:'rss',displayName:new URL(url).hostname,canonicalUrl:url,connectorType:'rss',verificationStatus:'VERIFIED',createdAt:now};
  if(feed===existingFeed && canonicalJson(existingScope)===canonicalJson(scope)) return {feed,scope,source};
  const guard=crypto.randomUUID();
  const sourceCheck=priorScope?'EXISTS(SELECT 1 FROM v1_intake_scopes WHERE id=? AND epoch=?)':'NOT EXISTS(SELECT 1 FROM v1_intake_scopes WHERE id=?)';
  const feedCheck=priorFeed?'EXISTS(SELECT 1 FROM v1_feeds WHERE id=? AND epoch=?)':'NOT EXISTS(SELECT 1 FROM v1_feeds WHERE id=?)';
  try {
   await db.batch([
    db.prepare(`INSERT INTO v1_enrollment_guards(id,valid) SELECT ?,CASE WHEN (${PRODUCT_SQL})=? AND ${sourceCheck} AND ${feedCheck} THEN 1 ELSE 0 END`).bind(guard,id,row.json,id,...(priorScope?[priorScope.epoch]:[]),p.feedId,...(priorFeed?[priorFeed.epoch]:[])),
    db.prepare('INSERT INTO v1_source_catalog(id,json) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind(sourceId,JSON.stringify(source)),
    db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,epoch=v1_feeds.epoch+1').bind(p.feedId,JSON.stringify(feed)),
    db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,epoch=v1_intake_scopes.epoch+1').bind(id,p.feedId,sourceId,JSON.stringify(scope)),
    db.prepare('INSERT INTO v1_product_bindings(feed_source_id,feed_id,source_id,configuration) VALUES(?,?,?,?) ON CONFLICT(feed_source_id) DO UPDATE SET configuration=excluded.configuration').bind(id,p.feedId,sourceId,row.json),
    db.prepare('DELETE FROM v1_enrollment_guards WHERE id=?').bind(guard)
   ]);return {feed,scope,source};
  } catch(error) {if(String(error).includes('v1_enrollment_cas')) continue;throw new HandoffError('TEMPORARY_UNAVAILABLE')}
 }
 throw new HandoffError('TEMPORARY_UNAVAILABLE');
}

/** Revalidates product-backed scopes before execution, preserving fail-closed DB fences. */
export async function synchronizeV1ProductSource(db:D1Database,id:string,now:string):Promise<void> {
 const binding=await db.prepare('SELECT feed_id FROM v1_product_bindings WHERE feed_source_id=?').bind(id).first<{feed_id:string}>();if(!binding) return;
 const feed=await new V1FeedStore(db).getFeed(binding.feed_id);if(!feed || feed.deletedAt) throw new HandoffError('SCOPE_DENIED');
 await enrollV1Source(db,id,feed.ownerId,now);
}

export async function isV1ProductSource(env:{DB?:D1Database;V1_DOWNSTREAM_ENABLED?:string;V1_DOWNSTREAM_FEED_SOURCE_IDS?:string},id:string):Promise<boolean> {
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(env.V1_DOWNSTREAM_ENABLED!=='true' || ids.length>10 || !ids.includes(id)) return false;
 if(!env.DB) throw new HandoffError('SCOPE_DENIED');
 return Boolean(await env.DB.prepare('SELECT 1 FROM v1_product_bindings WHERE feed_source_id=?').bind(id).first());
}
