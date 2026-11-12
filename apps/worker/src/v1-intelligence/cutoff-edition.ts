import {canonicalJson} from '../v1-intake/canonical';
import {DELIVERY_LEAD_MS} from './schedule';
import type {PublicationWindow} from './scoring';
import type {SemanticOperationInput} from './semantic-operations';
import type {V1FeedStore} from './store';

export const CUTOFF_EDITION_POLICY='READY_AT_CUTOFF_V1' as const;
export function atScheduledCutoff(window:PublicationWindow,now:string):boolean{
 const end=Date.parse(window.end),delivery=Date.parse(window.scheduledFor??'');
 return window.kind!=='WEEKLY'&&Number.isFinite(end)&&delivery-end===DELIVERY_LEAD_MS&&Date.parse(now)>=end;
}
/** Existing frozen/paid inputs retain their original contract. Only unstarted
 * scheduled V3 work can adopt the cutoff policy. This is a readiness hint;
 * final source authorization and publication validation remain authoritative. */
export async function cutoffEditionReady(db:D1Database,feedId:string,request:{id:string;engine?:string;v3InputId?:string;window:PublicationWindow},now:string):Promise<boolean>{
 if(request.engine!=='v3'||!atScheduledCutoff(request.window,now))return false;
 const row=await db.prepare("SELECT json_extract(json,'$.cutoffPolicy') policy FROM v1_feed_documents WHERE kind='v3_window_inputs' AND id=? AND feed_id=?").bind(request.v3InputId??request.id,feedId).first<{policy:string|null}>();
 if(row)return row.policy===CUTOFF_EDITION_POLICY;
 const started=await db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_intents' AND feed_id=? AND json_extract(json,'$.input.budgetKey')=?)
 OR EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='v3_window_results' AND feed_id=? AND id=?)`).bind(feedId,`v3:${request.id}`,feedId,request.v3InputId??request.id).first();
 return !started;
}
/** A frozen edition can cite an immutable, formerly current revision after a
 * later update. Revocation, deletion, disabled sources and late acceptance still
 * invalidate authority; a historical revision never grants access on its own. */
export async function cutoffEvidenceAuthorized(store:V1FeedStore,snapshot:{feedId:string;cutoffPolicy?:string;evidenceRevisionIds:string[];input:{windowEnd:string}}):Promise<boolean>{
 if(snapshot.cutoffPolicy!==CUTOFF_EDITION_POLICY)return false;
 const ids=[...new Set(snapshot.evidenceRevisionIds)];
 for(let offset=0;offset<ids.length;offset+=80){
  const page=ids.slice(offset,offset+80),rows=await store.db.prepare(`SELECT r.id FROM v1_revisions r
   JOIN v1_intake_scopes s ON s.id=r.feed_source_id
   JOIN v1_evidence e ON e.id=json_extract(r.json,'$.evidenceId') AND e.feed_source_id=r.feed_source_id
   WHERE r.id IN (${page.map(()=>'?').join(',')}) AND s.feed_id=?
   AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL
   AND json_extract(e.json,'$.state')='ACTIVE' AND julianday(json_extract(r.json,'$.acceptedAt'))<julianday(?)
   AND NOT EXISTS(SELECT 1 FROM v1_tombstones t WHERE t.feed_source_id=r.feed_source_id AND json_extract(t.json,'$.evidenceId')=json_extract(r.json,'$.evidenceId') AND julianday(json_extract(t.json,'$.acceptedAt'))>=julianday(json_extract(r.json,'$.acceptedAt')))` ).bind(...page,snapshot.feedId,snapshot.input.windowEnd).all<{id:string}>();
  if(rows.results.length!==page.length)return false;
 }
 return true;
}
/** Scope the historical-revision exception to the exact immutable V3 snapshot,
 * fingerprint, revision set and model. Never relax legacy semantic operations. */
export async function cutoffSemanticAuthorized(store:V1FeedStore,input:SemanticOperationInput):Promise<boolean>{
 const state=input.state as {cutoffPolicy?:string;cutoffInputId?:string;inputId?:string};
 if(input.kind!=='V3_EDITOR_VERIFIER'||state?.cutoffPolicy!==CUTOFF_EDITION_POLICY||!state.cutoffInputId||!input.evidenceRevisionIds.length)return false;
 const row=await store.db.prepare(`SELECT json_extract(json,'$.cutoffPolicy') policy,json_extract(json,'$.fingerprint') fingerprint,
  json_extract(json,'$.feedRevision') revision,json_extract(json,'$.evidenceRevisionIds') refs,json_extract(json,'$.input.windowEnd') cutoff,
  json_extract(json,'$.models.editor') editor,json_extract(json,'$.models.verifier') verifier
  FROM v1_feed_documents WHERE kind='v3_window_inputs' AND feed_id=? AND id=?`).bind(input.feedId,state.cutoffInputId).first<{policy:string;fingerprint:string;revision:number;refs:string;cutoff:string;editor:string;verifier:string}>();
 if(!row||row.policy!==CUTOFF_EDITION_POLICY||row.fingerprint!==state.inputId||row.revision!==input.feedRevision||![row.editor,row.verifier].includes(input.model)||canonicalJson(JSON.parse(row.refs))!==canonicalJson(input.evidenceRevisionIds))return false;
 return cutoffEvidenceAuthorized(store,{feedId:input.feedId,cutoffPolicy:row.policy,evidenceRevisionIds:input.evidenceRevisionIds,input:{windowEnd:row.cutoff}});
}
