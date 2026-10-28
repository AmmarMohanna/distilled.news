import type {BriefingResult} from '@distilled/briefing';
import {validateV3Edition} from './v3-window';
import {assertIntelligenceTurn,intelligenceTurnGuard,withCanonicalCommitTurn} from '../connector-intelligence-turn';
import {countLatency,measureLatency} from './latency';
import {modelSpendingStatements,ModelSpendingWait,type ModelSpendingReservation} from './model-spending';
import {SemanticLeaseError,type SemanticWorkLease} from './semantic-work-lease';
import {HandoffError,eventMembershipSchema,eventVersionSchema,eventSalienceAssessmentSchema,userRelevanceSchema,windowScoreSchema,briefingCandidateSchema,type BriefingCandidate,type EventMembership,type EventVersion,type EvidenceRevision,type NormalizedEvidenceItem} from '@distilled/contracts';
import {z} from 'zod';
import {liveScheduleSchema} from './schedule';
import {canonicalJson} from '../v1-intake/canonical';
import type {DownstreamJob} from '../v1-intake/types';
import type {FeedRecord,EventRecord,StorylineRecord,StorylineVersion,DuplicateDecision,RoleDecision} from './types';
import type {SelectionRecord} from './scoring';
import type {BriefingEditionRecord} from './publication';
import {claimMentionSchema,assertClaimSpan,type SourceDocument} from './claims';
export type DocumentKind='v3_window_inputs'|'v3_window_results'|'review_admissions'|'publication_response_recoveries'|'editorial_response_recoveries'|'development_relationships'|'manual_briefing_requests'|'browser_push_receipts'|'roles'|'duplicates'|'events'|'event_versions'|'memberships'|'storylines'|'storyline_versions'|'intelligence_receipts'|'salience'|'relevance'|'window_scores'|'candidates'|'selections'|'editions'|'publication_status'|'delivery_jobs'|'synthesis_jobs'|'briefing_requests'|'publication_work'|'drafts'|'grounding_results'|'verification_results'|'verification_manifests'|'publication_validation_results'|'model_intents'|'model_executions'|'salience_intents'|'salience_results'|'salience_provenance'|'source_documents'|'source_region_eligibility'|'claim_mentions'|'ledger_entries'|'ledger_projections'|'ledger_states'|'correction_obligations'|'correction_resolutions'|'semantic_intents'|'semantic_results'|'rematch_requests'|'rematch_attempts'|'entities'|'propositions'|'state_slots'|'event_semantic_states'|'storyline_memories'|'source_origins'|'shortlists'|'editorial_processing_work'|'editorial_processing_progress'|'editorial_proposals'|'editorial_processing_waits'|'editorial_plans'|'editorial_deferred_work'|'editorial_work_resolutions'|'ledger_fact_bindings'|'fidelity_results'|'verification_feedback'|'publication_reconciliations'|'schedule_observations'|'semantic_resource_waits'|'semantic_settlements'|'semantic_work_leases'|'semantic_work_releases'|'semantic_construction_work'|'semantic_construction_progress'|'model_spending_reconciliations';
interface DocumentWrite {kind:DocumentKind;id:string;value:unknown}
interface Snapshot {feed:FeedRecord;epoch:number;scopes:{id:string;epoch:number}[]}
type TransientSemanticKind='semantic_results'|'semantic_settlements';
const mutable=new Set<DocumentKind>(['manual_briefing_requests','events','storylines','publication_status','delivery_jobs','synthesis_jobs','briefing_requests']);
const feedSchema=z.object({id:z.string().min(1),ownerId:z.string().min(1),title:z.string(),interests:z.array(z.string()),geography:z.array(z.string()),outputLanguage:z.string().min(1),briefingFrequency:z.enum(['30M','HOURLY','DAILY','WEEKLY']),briefingSchedule:liveScheduleSchema.optional(),paused:z.boolean(),revision:z.number().int().positive(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),deletedAt:z.string().datetime().optional()}).strict();
export class V1FeedStore {
 /** Optional local coordination for parallel inference bookkeeping only. */
 transactionQueue?:{tail:Promise<void>};
 constructor(readonly db:D1Database,readonly semanticLease?:SemanticWorkLease,readonly spendingAccountId?:string){}
 async registerFeed(raw:FeedRecord) {
  const feed=feedSchema.parse(raw);
  await this.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,epoch=v1_feeds.epoch+1').bind(feed.id,JSON.stringify(feed)).run();
 }
 async getFeed(id:string):Promise<FeedRecord|undefined> {const row=await this.db.prepare('SELECT json FROM v1_feeds WHERE id=?').bind(id).first<{json:string}>();return row?JSON.parse(row.json):undefined}
 async read<T>(feedId:string,kind:DocumentKind,id:string):Promise<T|undefined> {
  const row=await this.db.prepare('SELECT feed_id,json FROM v1_feed_documents WHERE kind=? AND id=?').bind(kind,id).first<{feed_id:string;json:string}>();
  if(row && row.feed_id!==feedId) throw new HandoffError('SCOPE_DENIED');return row?JSON.parse(row.json):undefined;
 }
 async readMany<T>(feedId:string,kind:DocumentKind,ids:string[]):Promise<Map<string,T>> {
  const unique=[...new Set(ids)],values=new Map<string,T>();
  for(let offset=0;offset<unique.length;offset+=90){
   const chunk=unique.slice(offset,offset+90),rows=await this.db.prepare(`SELECT id,feed_id,json FROM v1_feed_documents WHERE kind=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind(kind,...chunk).all<{id:string;feed_id:string;json:string}>();
   if(rows.results.some(row=>row.feed_id!==feedId))throw new HandoffError('SCOPE_DENIED');
   for(const row of rows.results)values.set(row.id,JSON.parse(row.json));
  }
  return values;
 }
 /** Follow the feed's explicit intent references; never scan retained revision bodies globally. */
 async hasSemanticIntentForObservation(feedId:string,observationId:string):Promise<boolean> {
  const row=await this.db.prepare("SELECT 1 FROM v1_feed_documents d CROSS JOIN json_each(d.json,'$.input.evidenceRevisionIds') ref CROSS JOIN v1_revisions r ON r.id=ref.value WHERE d.feed_id=? AND d.kind='semantic_intents' AND json_extract(r.json,'$.sourceObservationId')=? LIMIT 1").bind(feedId,observationId).first();return Boolean(row);
 }
 async list<T>(feedId:string,kind:DocumentKind):Promise<T[]> {const rows=await this.db.prepare('SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind=? ORDER BY id').bind(feedId,kind).all<{json:string}>();return rows.results.map(r=>JSON.parse(r.json))}
 /** Candidate-targeted carry replay. Each page reads its version and decisions in one SQL snapshot. */
 async carryEvidenceIds(feedId:string,ids:string[]):Promise<Set<string>> {
  const wanted=[...new Set(ids)];if(!wanted.length)return new Set();let indexed=true,generation:number|undefined;
  const retry=new Set<string>(),decisions:{revision_id:string;window_end:string;carry:number}[]=[];
  for(let offset=0;offset<wanted.length;offset+=90){
   let rows:D1Result<{marker:number;revision_id:string|null;window_end:string|null;carry:number|null;ready:number|null;version:number|null}>;
   try{rows=await this.db.prepare(`WITH carry_state AS MATERIALIZED (
    SELECT COALESCE(s.ready,0) ready,COALESCE(s.version,0) version FROM (SELECT ? feed_id) f LEFT JOIN v3_carry_index_state s ON s.feed_id=f.feed_id
   ), candidates AS MATERIALIZED (
    SELECT requested.value revision_id FROM json_each(?) requested WHERE (SELECT ready FROM carry_state)=1 AND EXISTS(
     SELECT 1 FROM v3_carry_decisions p WHERE p.feed_id=? AND p.revision_id=requested.value AND p.carry=1)
   ) SELECT 1 marker,NULL revision_id,NULL window_end,NULL carry,NULL result_id,ready,version FROM carry_state
   UNION ALL SELECT 0,d.revision_id,d.window_end,d.carry,d.result_id,NULL,NULL FROM candidates c CROSS JOIN v3_carry_decisions d ON d.feed_id=? AND d.revision_id=c.revision_id
   ORDER BY marker DESC,result_id`).bind(feedId,JSON.stringify(wanted.slice(offset,offset+90)),feedId,feedId).all();}
   catch(error){if(!/no such table.*v3_carry_(index_state|decisions)/.test(String(error)))throw error;indexed=false;break;}
   const state=rows.results[0];if(!state||state.marker!==1)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   if(state.ready!==1){indexed=false;break;}if(generation!==undefined&&state.version!==generation)throw new HandoffError('TEMPORARY_UNAVAILABLE');generation=state.version!;
   for(const row of rows.results.slice(1))decisions.push({revision_id:row.revision_id!,window_end:row.window_end!,carry:row.carry!});
  }
  if(!indexed){const results=await this.list<{windowEnd:string;result:Pick<BriefingResult,'items'|'skipped'|'omitted'|'dropped'>}>(feedId,'v3_window_results');for(const p of results.sort((a,b)=>a.windowEnd.localeCompare(b.windowEnd))){for(const id of [...p.result.items.flatMap(i=>i.sourceIds),...p.result.skipped.map(s=>s.id),...p.result.omitted.flatMap(o=>o.sourceIds),...p.result.dropped.flatMap(d=>d.sourceIds)])retry.delete(id);for(const d of p.result.dropped.filter(d=>d.carry))for(const id of d.sourceIds)retry.add(id)}return new Set(wanted.filter(id=>retry.has(id)));}
  // One revision belongs to one page; stable sorting retains original binary result-ID tie order.
  for(const d of decisions.sort((a,b)=>a.window_end.localeCompare(b.window_end))){if(d.carry)retry.add(d.revision_id);else retry.delete(d.revision_id);}return retry;
 }
 /** Metadata-only eligibility pass; immutable article bodies are loaded only after selection. */
 async currentEvidenceHeaders(feedId:string):Promise<{revision:Pick<EvidenceRevision,'id'|'evidenceId'|'publishedAt'|'acceptedAt'>;observedAt:string|null}[]> {
  let rows:D1Result<{id:string;evidence_id:string;published_at:string|null;accepted_at:string;observed_at:string|null}>;
  try{
  rows=await this.db.prepare(`SELECT r.id,CASE WHEN m.id IS NULL THEN json_extract(r.json,'$.evidenceId') ELSE m.evidence_id END AS evidence_id,CASE WHEN m.id IS NULL THEN json_extract(r.json,'$.publishedAt') ELSE m.published_at END AS published_at,CASE WHEN m.id IS NULL THEN json_extract(r.json,'$.acceptedAt') ELSE m.accepted_at END AS accepted_at,CASE WHEN t.id IS NULL THEN json_extract(i.json,'$.observation.observedAt') ELSE t.observed_at END AS observed_at FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') LEFT JOIN v1_revision_selection_index m ON m.id=r.id AND m.feed_source_id=r.feed_source_id LEFT JOIN v1_inputs i ON i.id=CASE WHEN m.id IS NULL THEN json_extract(r.json,'$.sourceObservationId') ELSE m.source_observation_id END AND i.feed_source_id=r.feed_source_id LEFT JOIN v1_observation_time_index t ON t.id=i.id AND t.feed_source_id=i.feed_source_id WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL ORDER BY accepted_at,r.id`).bind(feedId).all<{id:string;evidence_id:string;published_at:string|null;accepted_at:string;observed_at:string|null}>();
  }catch(error){if(!/no such table.*v1_(revision_selection|observation_time)_index/.test(String(error)))throw error;
  rows=await this.db.prepare(`SELECT r.id,json_extract(r.json,'$.evidenceId') AS evidence_id,json_extract(r.json,'$.publishedAt') AS published_at,json_extract(r.json,'$.acceptedAt') AS accepted_at,json_extract(i.json,'$.observation.observedAt') AS observed_at FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') LEFT JOIN v1_inputs i ON i.id=json_extract(r.json,'$.sourceObservationId') AND i.feed_source_id=r.feed_source_id WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL ORDER BY json_extract(r.json,'$.acceptedAt'),r.id`).bind(feedId).all<{id:string;evidence_id:string;published_at:string|null;accepted_at:string;observed_at:string|null}>();
  }
  return rows.results.map(r=>({revision:{id:r.id,evidenceId:r.evidence_id,publishedAt:r.published_at??undefined,acceptedAt:r.accepted_at},observedAt:r.observed_at}));
 }
 async currentEvidenceByIds(feedId:string,ids:string[]):Promise<{item:NormalizedEvidenceItem;revision:EvidenceRevision}[]> {
  const unique=[...new Set(ids)],result:{item:NormalizedEvidenceItem;revision:EvidenceRevision}[]=[];
  for(let offset=0;offset<unique.length;offset+=90){const page=unique.slice(offset,offset+90);
   const rows=await this.db.prepare(`SELECT e.json AS item,r.json AS revision FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL AND r.id IN (${page.map(()=>'?').join(',')})`).bind(feedId,...page).all<{item:string;revision:string}>();
   result.push(...rows.results.map(r=>({item:JSON.parse(r.item),revision:JSON.parse(r.revision)})));
  }
  if(result.length!==unique.length)throw new HandoffError('TEMPORARY_UNAVAILABLE');return result;
 }
 async currentEvidence(feedId:string):Promise<{item:NormalizedEvidenceItem;revision:EvidenceRevision}[]> {
  const rows=await this.db.prepare(`SELECT e.json AS item,r.json AS revision FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL ORDER BY json_extract(r.json,'$.acceptedAt'),r.id`).bind(feedId).all<{item:string;revision:string}>();
  return rows.results.map(r=>({item:JSON.parse(r.item),revision:JSON.parse(r.revision)}));
 }
 /** Authorization needs exact active identities, not retained article bodies.
  * Keep the same scope/state/revision joins as currentEvidence; Feed/scope CAS
  * still fences a source change between this read and canonical consumption. */
 async activeEvidenceRevisionIds(feedId:string):Promise<Set<string>> {
  const rows=await this.db.prepare(`SELECT r.id FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL`).bind(feedId).all<{id:string}>();
  return new Set(rows.results.map(row=>row.id));
 }
 async revision(feedId:string,id:string):Promise<EvidenceRevision|undefined> {
  const row=await this.db.prepare('SELECT r.json FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE r.id=? AND s.feed_id=?').bind(id,feedId).first<{json:string}>();return row?JSON.parse(row.json):undefined;
 }
 /** Publication history matching needs article identity, not historical bodies.
  * Same immutable revision/scope join as revision(); no cross-request cache. */
 async revisionEvidenceIds(feedId:string,ids:string[]):Promise<Map<string,string>> {
  const unique=[...new Set(ids)],values=new Map<string,string>();
  for(let offset=0;offset<unique.length;offset+=90){
   const chunk=unique.slice(offset,offset+90);countLatency('publicationHistoryIdentityQueries');
   const rows=await this.db.prepare(`SELECT r.id,json_extract(r.json,'$.evidenceId') AS evidence_id FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE s.feed_id=? AND r.id IN (${chunk.map(()=>'?').join(',')})`).bind(feedId,...chunk).all<{id:string;evidence_id:string}>();
   countLatency('publicationHistoryIdentityRows',rows.results.length);
   for(const row of rows.results)values.set(row.id,row.evidence_id);
  }
  return values;
 }
 /** Only unresolved reporting windows are needed for carry eligibility, not terminal request payloads. */
 async unresolvedPublicationWindows(feedId:string):Promise<{window:import('./scoring').PublicationWindow}[]> {
  const rows=await this.db.prepare("SELECT json_extract(json,'$.window') AS window_json FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED') ORDER BY id").bind(feedId).all<{window_json:string}>();
  return rows.results.map(r=>({window:JSON.parse(r.window_json)}));
 }
 /** Filter mutable publication visibility before returning immutable edition bodies. */
 async publishedEditionHistory(feedId:string):Promise<BriefingEditionRecord[]> {
  const rows=await this.db.prepare("SELECT e.json FROM v1_feed_documents e CROSS JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id WHERE e.feed_id=? AND e.kind='editions' AND json_extract(p.json,'$.status')='PUBLISHED' ORDER BY e.id").bind(feedId).all<{json:string}>();
  return rows.results.map(r=>JSON.parse(r.json));
 }
 /** Preserve all-time membership metadata, transferring reader prose only if memory-eligible. */
 async publicationPreparationHistory(feedId:string,cutoff:number):Promise<Pick<BriefingEditionRecord,'id'|'createdAt'|'windowEnd'|'evidenceRevisionIds'|'stories'>[]> {
  const rows=await this.db.prepare("SELECT e.id,json_extract(e.json,'$.createdAt') AS created_at,json_extract(e.json,'$.windowEnd') AS window_end,json_extract(e.json,'$.evidenceRevisionIds') AS evidence_ids FROM v1_feed_documents e CROSS JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id WHERE e.feed_id=? AND e.kind='editions' AND json_extract(p.json,'$.status')='PUBLISHED' ORDER BY e.id").bind(feedId).all<{id:string;created_at:string;window_end:string;evidence_ids:string}>();
  const result=rows.results.map(r=>({id:r.id,createdAt:r.created_at,windowEnd:r.window_end,evidenceRevisionIds:JSON.parse(r.evidence_ids) as string[],stories:[] as BriefingEditionRecord['stories']}));
  const eligible=result.filter(r=>{const at=Date.parse(r.createdAt);return !Number.isFinite(at)||!Number.isFinite(cutoff)||at>=cutoff});
  for(let offset=0;offset<eligible.length;offset+=90){
   const page=eligible.slice(offset,offset+90),prose=await this.db.prepare(`SELECT id,json_extract(json,'$.stories') AS stories FROM v1_feed_documents WHERE feed_id=? AND kind='editions' AND id IN (${page.map(()=>'?').join(',')})`).bind(feedId,...page.map(r=>r.id)).all<{id:string;stories:string}>();
   const byId=new Map(prose.results.map(r=>[r.id,JSON.parse(r.stories)]));for(const row of page){if(!byId.has(row.id)||!Array.isArray(byId.get(row.id)))throw new HandoffError('TEMPORARY_UNAVAILABLE');row.stories=byId.get(row.id);}
  }
  return result;
 }
 async snapshot(id:string):Promise<Snapshot> {
  const guard=intelligenceTurnGuard(this.db,id),lease=this.semanticLease;
  if(lease&&lease.feedId!==id)throw new SemanticLeaseError();
  const semantic=lease?`EXISTS(SELECT 1 FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.id=? AND l.feed_id=? AND json_extract(l.json,'$.token')=? AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')))`:'1';
  // One atomic read validates both leases and captures the Feed/scope epochs.
  // The commit still rechecks every guard against current database state.
  const row=await this.db.prepare(`SELECT json,epoch,(SELECT json_group_array(json_object('id',id,'epoch',epoch)) FROM (SELECT id,epoch FROM v1_intake_scopes WHERE feed_id=? ORDER BY id)) AS scopes,
   (1${guard.sql}) AS turn_valid,${semantic} AS semantic_valid FROM v1_feeds WHERE id=?`).bind(id,...guard.args,...(lease?[lease.id,id,lease.token,Date.now()]:[]),id).first<{json:string;epoch:number;scopes:string;turn_valid:number;semantic_valid:number}>();
  if(!row||!row.turn_valid)await assertIntelligenceTurn(this.db,id);
  if(!row) throw new HandoffError('SCOPE_DENIED');
  if(!row.semantic_valid)throw new SemanticLeaseError();
  const feed=JSON.parse(row.json) as FeedRecord;
  if(feed.deletedAt || feed.paused) throw new HandoffError('SCOPE_DENIED');
  return {feed,epoch:row.epoch,scopes:JSON.parse(row.scopes)};
 }
 /** One read-only atomic probe, sampled after first/final CAS rejection.
  * Epochs are monotonic; this describes observed guards, not a guessed DB outage. */
 async casDiagnostic(snapshot:Snapshot) {
  const row=await this.db.prepare(`SELECT epoch,json_extract(json,'$.paused') AS paused,json_extract(json,'$.deletedAt') AS deletedAt,(SELECT json_group_array(json_object('id',id,'epoch',epoch)) FROM v1_intake_scopes WHERE feed_id=?) AS scopes FROM v1_feeds WHERE id=?`).bind(snapshot.feed.id,snapshot.feed.id).first<{epoch:number;paused:number;deletedAt:string|null;scopes:string}>();
  const scopes:Snapshot['scopes']=row?JSON.parse(row.scopes):[],old=new Map(snapshot.scopes.map(s=>[s.id,s.epoch])),current=new Map(scopes.map(s=>[s.id,s.epoch]));
  return {observedAfterRejection:true,feedEpochChanged:!row||row.epoch!==snapshot.epoch,feedUnavailable:!row||Boolean(row.paused||row.deletedAt),scopeSetChanged:old.size!==current.size||[...old.keys()].some(id=>!current.has(id)),scopeChanges:[...new Set([...old.keys(),...current.keys()])].filter(id=>old.get(id)!==current.get(id)).map(id=>({id,before:old.get(id)??null,after:current.get(id)??null}))};
 }
 async commit(tx:FeedTransaction):Promise<boolean> {
  const validationStarted=Date.now();await measureLatency('GRAPH_VALIDATION',()=>tx.validateGraph());tx.metrics.validationMs+=Date.now()-validationStarted;
  const {snapshot:s}=tx,nonce=crypto.randomUUID(),turnGuard=intelligenceTurnGuard(this.db,s.feed.id);
  const scopeChecks=s.scopes.map(()=>`EXISTS(SELECT 1 FROM v1_intake_scopes WHERE id=? AND epoch=?)`).join(' AND ');
  const leaseCheck=this.semanticLease?` AND EXISTS(SELECT 1 FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.id=? AND l.feed_id=? AND json_extract(l.json,'$.token')=? AND json_extract(l.json,'$.leaseUntil')>((julianday('now')-2440587.5)*86400000) AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')))`:'';
  const args:unknown[]=[nonce,s.feed.id,s.epoch,s.feed.id,s.scopes.length,...s.scopes.flatMap(x=>[x.id,x.epoch]),...(this.semanticLease?[this.semanticLease.id,s.feed.id,this.semanticLease.token]:[]),...turnGuard.args];
  const statements:D1PreparedStatement[]=[this.db.prepare(`INSERT INTO v1_feed_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feeds WHERE id=? AND epoch=? AND json_extract(json,'$.deletedAt') IS NULL AND json_extract(json,'$.paused')=0) AND (SELECT COUNT(*) FROM v1_intake_scopes WHERE feed_id=?)=? ${scopeChecks?'AND '+scopeChecks:''}${leaseCheck}${turnGuard.sql} THEN 1 ELSE 0 END`).bind(...args)];
  for(const reservation of tx.modelReservations)statements.push(...await modelSpendingStatements(this.db,reservation));
  for(const w of tx.writes.values()) statements.push(this.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?) ${mutable.has(w.kind)?'ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json':'ON CONFLICT(kind,id) DO NOTHING'}`).bind(w.kind,w.id,s.feed.id,JSON.stringify(w.value)));
  for(const job of tx.jobs.values()) {
   statements.push(this.db.prepare('UPDATE v1_jobs SET json=? WHERE id=? AND feed_source_id=?').bind(JSON.stringify(job),job.id,job.feedSourceId));
   statements.push(this.db.prepare('UPDATE v1_intake_scopes SET epoch=epoch+1 WHERE id=?').bind(job.feedSourceId));
  }
  // Read-only relays still validate their snapshot atomically, but must not
  // invalidate concurrent writers merely by checking an existing request.
  if(tx.writes.size || tx.jobs.size) statements.push(this.db.prepare('UPDATE v1_feeds SET epoch=epoch+1 WHERE id=?').bind(s.feed.id));
  statements.push(this.db.prepare('DELETE FROM v1_feed_guards WHERE id=?').bind(nonce));
  try {await this.db.batch(statements);return true} catch(error) {if(String(error).includes('v1_model_provider_admission'))throw new ModelSpendingWait('PROVIDER_RESOURCE_WAIT');if(String(error).includes('v1_model_spending_admission'))throw new ModelSpendingWait('ACCOUNT_RESOURCE_WAIT');if(String(error).includes('CHECK constraint failed: v1_feed_cas')){await assertIntelligenceTurn(this.db,s.feed.id);return false;}const text=String(error),cause=/too many subrequests|query limit/i.test(text)?'QUERY_LIMIT':/overloaded/i.test(text)?'OVERLOADED':/timeout|timed out/i.test(text)?'DATABASE_TIMEOUT':/constraint/i.test(text)?'DATABASE_CONSTRAINT':'DATABASE_BATCH_FAILED';console.error(JSON.stringify({type:'V1_FEED_BATCH_FAILED',feedId:s.feed.id,epoch:s.epoch,statements:statements.length,writes:tx.writes.size,jobs:tx.jobs.size,cause}));throw new HandoffError('TEMPORARY_UNAVAILABLE')}
 }
}
export class FeedTransaction {
 readonly metrics={documentReads:0,listReads:0,revisionReads:0,preloadQueries:0,validationMs:0};
 readonly modelReservations:ModelSpendingReservation[]=[];
 readonly writes=new Map<string,DocumentWrite>();readonly jobs=new Map<string,DownstreamJob>();
 private readonly reads=new Map<string,Promise<unknown>>();
 private readonly lists=new Map<DocumentKind,Promise<{id:string}[]>>();
 private readonly revisions=new Map<string,Promise<EvidenceRevision|undefined>>();
 private membershipIndex?:Promise<Map<string,EventMembership[]>>;
 constructor(readonly store:V1FeedStore,readonly snapshot:Snapshot){}
 async read<T>(kind:DocumentKind,id:string):Promise<T|undefined> {
  const key=JSON.stringify([kind,id]),staged=this.writes.get(key);if(staged) return staged.value as T;
  if(!this.reads.has(key)){this.metrics.documentReads++;this.reads.set(key,this.store.read(this.snapshot.feed.id,kind,id))}return this.reads.get(key) as Promise<T|undefined>;
 }
 /** Inspect all uncached receipt owners before an early reuse return, just as
  * eager preload did. Only metadata is retained; cached absence/staged values
  * keep their existing precedence. Sizes plan incremental payload pages. */
 async transientReadSizes(kind:TransientSemanticKind,ids:string[]):Promise<Map<string,number>> {
  if(kind!=='semantic_results'&&kind!=='semantic_settlements')throw new HandoffError('SCOPE_DENIED');
  const missing=[...new Set(ids)].filter(id=>!this.reads.has(JSON.stringify([kind,id]))&&!this.writes.has(JSON.stringify([kind,id]))),sizes=new Map<string,number>();
  for(let offset=0;offset<missing.length;offset+=90){
   const chunk=missing.slice(offset,offset+90);this.metrics.preloadQueries++;
   const rows=await this.store.db.prepare(`SELECT id,feed_id,length(CAST(json AS BLOB)) AS bytes FROM v1_feed_documents WHERE kind=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind(kind,...chunk).all<{id:string;feed_id:string;bytes:number}>();
   if(rows.results.some(row=>row.feed_id!==this.snapshot.feed.id))throw new HandoffError('SCOPE_DENIED');
   for(const row of rows.results)sizes.set(row.id,row.bytes);
   // Preserve eager preload's negative snapshot without retaining graph bodies.
   const found=new Set(rows.results.map(row=>row.id));
   for(const id of chunk)if(!found.has(id))this.reads.set(JSON.stringify([kind,id]),Promise.resolve(undefined));
  }
  return sizes;
 }
 /** Historical semantic receipts are immutable but can contain complete graph
  * snapshots. Read at most four at a time without retaining them in `reads`.
  * Clone cached/staged values too, so transient callers cannot poison either. */
 async readTransientMany<T>(kind:TransientSemanticKind,ids:string[]):Promise<Map<string,T|undefined>> {
  if(kind!=='semantic_results'&&kind!=='semantic_settlements')throw new HandoffError('SCOPE_DENIED');
  const values=new Map<string,T|undefined>(),missing:string[]=[];
  for(const id of new Set(ids)){
   const key=JSON.stringify([kind,id]),staged=this.writes.get(key);
   if(staged)values.set(id,structuredClone(staged.value as T));
   else if(this.reads.has(key))values.set(id,structuredClone(await this.reads.get(key) as T|undefined));
   else missing.push(id);
  }
  for(let offset=0;offset<missing.length;offset+=4){
   const chunk=missing.slice(offset,offset+4);this.metrics.preloadQueries++;
   const rows=await this.store.readMany<T>(this.snapshot.feed.id,kind,chunk);
   for(const id of chunk)values.set(id,structuredClone(rows.get(id)));
  }
  return values;
 }
 /** Populate immutable lookup cache in bounded batches while checking global ID scope. */
 async preload(kind:DocumentKind,ids:string[]):Promise<void> {
  return this.preloadMany([{kind,ids}]);
 }
 /** Independent immutable lookups share one D1 round trip per bounded batch. */
 async preloadMany(groups:{kind:DocumentKind;ids:string[]}[]):Promise<void>{
  const queries:{kind:DocumentKind;ids:string[];statement:D1PreparedStatement}[]=[];
  for(const {kind,ids} of groups){
   const missing=[...new Set(ids)].filter(id=>!this.reads.has(JSON.stringify([kind,id]))&&!this.writes.has(JSON.stringify([kind,id])));
   for(let offset=0;offset<missing.length;offset+=90){const chunk=missing.slice(offset,offset+90);queries.push({kind,ids:chunk,statement:this.store.db.prepare(`SELECT id,feed_id,json FROM v1_feed_documents WHERE kind=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind(kind,...chunk)});}
  }
  for(let offset=0;offset<queries.length;offset+=20){
   const page=queries.slice(offset,offset+20);this.metrics.preloadQueries+=page.length;
   const results=await this.store.db.batch(page.map(q=>q.statement));
   for(const [index,result] of results.entries()){
   const {kind,ids}=page[index],rows=result as D1Result<{id:string;feed_id:string;json:string}>;
   if(rows.results.some(row=>row.feed_id!==this.snapshot.feed.id))throw new HandoffError('SCOPE_DENIED');
   const values=new Map(rows.results.map(row=>[row.id,JSON.parse(row.json)]));
   for(const id of ids)this.reads.set(JSON.stringify([kind,id]),Promise.resolve(values.get(id)));
   }
  }
 }
 /** Omission reuse needs only the immutable policy, not historical candidate
  * payloads. Do not populate the full-document cache with a projection. Global
  * identity/Feed ownership and staged writes match preload/read semantics. */
 async shortlistPolicyVersions(ids:string[]):Promise<Map<string,string|undefined>> {
  const unique=[...new Set(ids)],policies=new Map<string,string|undefined>();
  const missing:string[]=[];
  for(const id of unique){const staged=this.writes.get(JSON.stringify(['shortlists',id]));policies.set(id,(staged?.value as {policyVersion?:string}|undefined)?.policyVersion);if(!staged)missing.push(id)}
  for(let offset=0;offset<missing.length;offset+=90){
   const chunk=missing.slice(offset,offset+90);this.metrics.preloadQueries++;
   const rows=await this.store.db.prepare(`SELECT id,feed_id,json_extract(json,'$.policyVersion') AS policy_version FROM v1_feed_documents WHERE kind='shortlists' AND id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all<{id:string;feed_id:string;policy_version:string|null}>();
   if(rows.results.some(row=>row.feed_id!==this.snapshot.feed.id))throw new HandoffError('SCOPE_DENIED');
   for(const row of rows.results)policies.set(row.id,row.policy_version??undefined);
  }
  return policies;
 }
 /** Cache only immutable semantic references owned by the offered Event versions. */
 async preloadSemanticReferences(versionIds:string[]):Promise<void>{
  const ids=[...new Set(versionIds)];await this.preload('event_semantic_states',ids);
  const states=(await Promise.all(ids.map(id=>this.read<import('./semantic-state').EventSemanticState>('event_semantic_states',id)))).filter((s):s is import('./semantic-state').EventSemanticState=>Boolean(s));
  await this.preload('propositions',states.flatMap(s=>s.propositionIds));
  const slotIds=[...new Set(states.flatMap(s=>s.stateSlotIds))];await this.preload('state_slots',slotIds);
  const slots=await Promise.all(slotIds.map(id=>this.read<import('./semantic-state').StateSlot>('state_slots',id)));
  await this.preload('entities',slots.flatMap(slot=>slot?.entityId?[slot.entityId]:[]));
 }
 /** Independent Feed-owned graph roots share one bounded D1 round trip.
  * Keep the same per-transaction list cache and staged-write overlay as list(). */
 async preloadLists(kinds:DocumentKind[]):Promise<void>{
  const missing=[...new Set(kinds)].filter(kind=>!this.lists.has(kind));
  for(let offset=0;offset<missing.length;offset+=20){
   const page=missing.slice(offset,offset+20);this.metrics.listReads+=page.length;
   const results=this.store.db.batch(page.map(kind=>this.store.db.prepare('SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind=? ORDER BY id').bind(this.snapshot.feed.id,kind)));
   // Publish pending reads before awaiting so another lookup joins this read.
   const reads=page.map((kind,index)=>{const read=results.then(rows=>(rows[index] as D1Result<{json:string}>).results.map(row=>JSON.parse(row.json)));this.lists.set(kind,read);return read;});
   await Promise.all(reads);
  }
 }
 async list<T extends {id:string}>(kind:DocumentKind):Promise<T[]> {
  if(!this.lists.has(kind)){this.metrics.listReads++;this.lists.set(kind,this.store.list(this.snapshot.feed.id,kind))}
  const listed=(await this.lists.get(kind)) as T[];for(const row of listed){const key=JSON.stringify([kind,row.id]);if(!this.reads.has(key))this.reads.set(key,Promise.resolve(structuredClone(row)))}
  const rows=new Map(listed.map(r=>[r.id,r]));for(const w of this.writes.values()) if(w.kind===kind) rows.set(w.id,w.value as T);const values=[...rows.values()];
  // Warm only immutable records already referenced by the retained graph. Scope
  // and epoch validation still occurs at atomic commit; no meaning is inferred.
  if(kind==='events')await this.preload('event_versions',values.map(row=>(row as T&{currentVersionId:string}).currentVersionId));
  if(kind==='storylines'){await this.preload('storyline_versions',values.map(row=>(row as T&{currentVersionId:string}).currentVersionId));const versions=await Promise.all(values.map(row=>this.read<StorylineVersion>('storyline_versions',(row as T&{currentVersionId:string}).currentVersionId)));await this.preload('event_versions',versions.flatMap(version=>version?.eventVersionIds??[]))}
  // Membership history is metadata, not a request to download every historical
  // article body. Callers prefetch the exact current/selected support they use;
  // historical references remain available through revision() when needed.
  return values;
 }
 /** Index all retained membership metadata once per transaction, without
  * expanding historical article bodies or pruning older Event support. New
  * staged memberships invalidate the index; a CAS retry owns a fresh cache. */
 async membershipsForVersions(versionIds:string[]):Promise<EventMembership[]> {
  if(!versionIds.length)return [];
  if(!this.membershipIndex)this.membershipIndex=(async()=>{
   const index=new Map<string,EventMembership[]>();
   for(const member of await this.list<EventMembership>('memberships')){
    const rows=index.get(member.eventVersionId)??[];rows.push(member);index.set(member.eventVersionId,rows);
   }
   return index;
  })();
  const index=await this.membershipIndex;
  // Callers can sort/filter/mutate their result without changing another
  // lookup or disguising an immutable document conflict in this transaction.
  return structuredClone([...new Set(versionIds)].flatMap(id=>index.get(id)??[]));
 }
 revision(id:string):Promise<EvidenceRevision|undefined> {
  if(!this.revisions.has(id)){this.metrics.revisionReads++;this.revisions.set(id,this.store.revision(this.snapshot.feed.id,id))}return this.revisions.get(id)!;
 }
 /** Immutable revisions are read together, but cached only for this CAS attempt.
  * A foreign/missing revision stays absent just as with store.revision(). */
 async preloadRevisions(ids:string[]):Promise<void> {
  const missing=[...new Set(ids)].filter(id=>!this.revisions.has(id));
  for(let offset=0;offset<missing.length;offset+=90){
   this.metrics.preloadQueries++;
   const chunk=missing.slice(offset,offset+90),rows=await this.store.db.prepare(`SELECT r.id,r.json FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE s.feed_id=? AND r.id IN (${chunk.map(()=>'?').join(',')})`).bind(this.snapshot.feed.id,...chunk).all<{id:string;json:string}>();
   const values=new Map(rows.results.map(row=>[row.id,JSON.parse(row.json) as EvidenceRevision]));
   for(const id of chunk)this.revisions.set(id,Promise.resolve(values.get(id)));
  }
 }
 async write(kind:DocumentKind,id:string,value:unknown) {
  if(!value || typeof value!=='object' || !('id' in value) || value.id!==id) throw new HandoffError('SCOPE_DENIED');
  if(kind==='memberships') {
   const member=eventMembershipSchema.safeParse(value);
   if(!member.success || !await this.read<EventVersion>('event_versions',member.data.eventVersionId) || !await this.revision(member.data.evidenceRevisionId)) throw new HandoffError('SCOPE_DENIED');
  } else if(!('feedId' in value) || value.feedId!==this.snapshot.feed.id) throw new HandoffError('SCOPE_DENIED');
  const previous=await this.read(kind,id);if(previous && !mutable.has(kind) && canonicalJson(previous)!==canonicalJson(value)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  if(!previous || mutable.has(kind)) {
   this.writes.set(JSON.stringify([kind,id]),{kind,id,value});
   if(kind==='memberships')this.membershipIndex=undefined;
  }
 }
 completeJob(job:DownstreamJob) {
  if(job.feedId!==this.snapshot.feed.id || !this.snapshot.scopes.some(s=>s.id===job.feedSourceId)) throw new HandoffError('SCOPE_DENIED');
  this.jobs.set(job.id,{...job,state:'DONE'});
 }
 async validateGraph():Promise<void> {
  for(const w of this.writes.values()) {
   if(w.kind==='propositions') {
    const p=w.value as import('./semantic-state').Proposition;
    if(p.kind!=='TEXT'||!p.claimMentionIds.length||!p.evidenceRevisionIds.length)throw new HandoffError('SCOPE_DENIED');
    for(const id of p.claimMentionIds){const mention=await this.read<import('./claims').ClaimMention>('claim_mentions',id);if(!mention||!p.evidenceRevisionIds.includes(mention.evidenceRevisionId)||p.text!==mention.sourceText)throw new HandoffError('SCOPE_DENIED')}
   }else if(w.kind==='state_slots'){
    const s=w.value as import('./semantic-state').StateSlot,p=await this.read<import('./semantic-state').Proposition>('propositions',s.propositionId),m=await this.read<import('./claims').ClaimMention>('claim_mentions',s.claimMentionId);
    if(!p||!m||!p.claimMentionIds.includes(m.id)||!m.sourceText.includes(s.value)||s.asOf && !m.sourceText.includes(s.asOf)||s.entityId && !await this.read('entities',s.entityId))throw new HandoffError('SCOPE_DENIED');
   }else if(w.kind==='event_semantic_states'){
    const s=w.value as import('./semantic-state').EventSemanticState;if(!await this.read('event_versions',s.eventVersionId))throw new HandoffError('SCOPE_DENIED');
    for(const id of s.propositionIds){const p=await this.read<import('./semantic-state').Proposition>('propositions',id);if(!p)throw new HandoffError('SCOPE_DENIED');for(const evidenceId of p.evidenceRevisionIds)if(!await this.read('memberships',JSON.stringify([s.eventVersionId,evidenceId])))throw new HandoffError('SCOPE_DENIED')}
   }else if(w.kind==='storyline_memories'){
    const m=w.value as import('./semantic-state').StorylineMemory,v=await this.read<StorylineVersion>('storyline_versions',m.storylineVersionId);if(!v||m.storylineId!==v.storylineId||canonicalJson(m.eventVersionIds)!==canonicalJson(v.eventVersionIds))throw new HandoffError('SCOPE_DENIED');for(const id of m.propositionIds)if(!await this.read('propositions',id))throw new HandoffError('SCOPE_DENIED');
   }else if(w.kind==='claim_mentions') {
    const mention=claimMentionSchema.safeParse(w.value);if(!mention.success)throw new HandoffError('SCOPE_DENIED');
    const revision=await this.revision(mention.data.evidenceRevisionId),document=await this.read<SourceDocument>('source_documents',mention.data.sourceDocumentId);
    if(!revision || !document?.claimMentionIds.includes(mention.data.id) || document.evidenceRevisionId!==revision.id)throw new HandoffError('SCOPE_DENIED');assertClaimSpan(mention.data,revision);
   } else if(w.kind==='source_documents') {
    const document=w.value as SourceDocument,revision=await this.revision(document.evidenceRevisionId);
    if(!revision || revision.contentHash!==document.contentHash)throw new HandoffError('SCOPE_DENIED');
    for(const id of document.claimMentionIds)if(!await this.read('claim_mentions',id))throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='events') {
    const root=w.value as EventRecord,version=await this.read<EventVersion>('event_versions',root.currentVersionId);
    if(!version || version.eventId!==root.id) throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='event_versions') {
    const parsed=eventVersionSchema.safeParse(w.value);
    if(!parsed.success || !await this.read<EventRecord>('events',parsed.data.eventId)) throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='storylines') {
    const root=w.value as StorylineRecord,version=await this.read<StorylineVersion>('storyline_versions',root.currentVersionId);
    if(!version || version.storylineId!==root.id) throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='storyline_versions') {
    const version=w.value as StorylineVersion;
    if(!await this.read<StorylineRecord>('storylines',version.storylineId)) throw new HandoffError('SCOPE_DENIED');
    for(const id of version.eventVersionIds) if(!await this.read<EventVersion>('event_versions',id)) throw new HandoffError('SCOPE_DENIED');
    for(const fact of version.supportedFacts) {
     if(!version.eventVersionIds.includes(fact.eventVersionId)) throw new HandoffError('SCOPE_DENIED');
     for(const id of fact.evidenceRevisionIds) if(!await this.read('memberships',JSON.stringify([fact.eventVersionId,id]))) throw new HandoffError('SCOPE_DENIED');
    }
   } else if(w.kind==='roles') {
    const role=w.value as RoleDecision,revision=await this.revision(role.evidenceRevisionId);
    if(!revision || role.evidenceId!==revision.evidenceId) throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='duplicates') {
    const duplicate=w.value as DuplicateDecision;
    if(!await this.revision(duplicate.evidenceRevisionId) || duplicate.duplicateOfRevisionId && !await this.revision(duplicate.duplicateOfRevisionId)) throw new HandoffError('SCOPE_DENIED');
   } else if(['salience','relevance','window_scores'].includes(w.kind)) {
    const schema=w.kind==='salience'?eventSalienceAssessmentSchema:w.kind==='relevance'?userRelevanceSchema:windowScoreSchema;
    const parsed=schema.safeParse(w.value);
    if(!parsed.success || !await this.read(parsed.data.targetType==='EVENT'?'event_versions':'storyline_versions',parsed.data.targetVersionId)) throw new HandoffError('SCOPE_DENIED');
   } else if(w.kind==='candidates') {
    const parsed=briefingCandidateSchema.safeParse(w.value);if(!parsed.success) throw new HandoffError('SCOPE_DENIED');
    const c=parsed.data;
    for(const [kind,id] of [['salience',c.salienceAssessmentId],['relevance',c.relevanceAssessmentId],['window_scores',c.windowScoreId]] as const) {
     const assessment=await this.read<{feedRevision:number;targetType:string;targetVersionId:string}>(kind,id);
     if(!assessment || assessment.feedRevision!==c.feedRevision || assessment.targetType!==c.targetType || assessment.targetVersionId!==c.targetVersionId) throw new HandoffError('SCOPE_DENIED');
    }
   } else if(w.kind==='selections') {
    const s=w.value as SelectionRecord;
    if(s.selectedCandidateIds.some(id=>!s.candidateIds.includes(id))) throw new HandoffError('SCOPE_DENIED');
    for(const id of s.candidateIds) {
     const c=await this.read<BriefingCandidate>('candidates',id),score=c?await this.read<{windowStart:string;windowEnd:string}>('window_scores',c.windowScoreId):undefined;
     if(!c || c.feedRevision!==s.feedRevision || !score || score.windowStart!==s.window.start || score.windowEnd!==s.window.end || (c.selectionState==='SELECTED')!==s.selectedCandidateIds.includes(id)) throw new HandoffError('SCOPE_DENIED');
    }
   } else if(w.kind==='editions') {
    const e=w.value as BriefingEditionRecord;if(e.engine==='v3'){await validateV3Edition(this,e);continue;}
    const s=await this.read<SelectionRecord>('selections',e.selectionId);
    if(!s || s.feedRevision!==e.feedRevision || s.window.start!==e.windowStart || s.window.end!==e.windowEnd || e.selectedCandidateIds.some(id=>!s.selectedCandidateIds.includes(id))) throw new HandoffError('SCOPE_DENIED');
    const eventIds=new Set<string>(),storylineIds=new Set<string>();
    for(const id of e.selectedCandidateIds) {
     const c=await this.read<BriefingCandidate>('candidates',id);if(!c) throw new HandoffError('SCOPE_DENIED');
     if(c.targetType==='EVENT') eventIds.add(c.targetVersionId);
     else {const v=await this.read<StorylineVersion>('storyline_versions',c.targetVersionId);if(!v) throw new HandoffError('SCOPE_DENIED');storylineIds.add(v.id);for(const id of v.eventVersionIds) eventIds.add(id)}
    }
    const same=(a:Set<string>,b:string[])=>a.size===b.length && b.every(id=>a.has(id));
    const support=new Set((await this.membershipsForVersions([...eventIds])).map(m=>m.evidenceRevisionId));
    if(!same(eventIds,e.eventVersionIds) || !same(storylineIds,e.storylineVersionIds) || !same(support,e.evidenceRevisionIds)) throw new HandoffError('SCOPE_DENIED');
    for(const id of e.evidenceRevisionIds) if(!await this.revision(id)) throw new HandoffError('SCOPE_DENIED');
    if(e.stories.some(story=>!e.selectedCandidateIds.includes(story.candidateId) || story.claims.some(claim=>claim.support.some(ref=>!support.has(ref.evidenceRevisionId))))) throw new HandoffError('SCOPE_DENIED');
   }
  }
 }
}
export async function feedTransact<T>(store:V1FeedStore,id:string,run:(tx:FeedTransaction)=>Promise<T>):Promise<T> {
 return serializeFeedBookkeeping(store,()=>feedTransactNow(store,id,run));
}
export async function serializeFeedBookkeeping<T>(store:V1FeedStore,run:()=>Promise<T>):Promise<T>{
 const queue=store.transactionQueue;if(!queue)return run();
 const previous=queue.tail;let release!:()=>void;queue.tail=new Promise<void>(resolve=>{release=resolve});
 await previous;try{return await run()}finally{release()}
}
async function feedTransactNow<T>(store:V1FeedStore,id:string,run:(tx:FeedTransaction)=>Promise<T>):Promise<T> {
 const started=Date.now();let firstEpoch:number|undefined,lastEpoch:number|undefined,lastWrites=0;
 for(let attempt=0;attempt<12;attempt++) {
  const tx=new FeedTransaction(store,await measureLatency('DB_SNAPSHOT',()=>store.snapshot(id))),computationStarted=Date.now();firstEpoch??=tx.snapshot.epoch;lastEpoch=tx.snapshot.epoch;
  const result=await measureLatency('TRANSACTION_COMPUTATION',()=>run(tx)),computationMs=Date.now()-computationStarted;lastWrites=tx.writes.size;countLatency('casAttempts');const committed=await measureLatency('CAS_COMMIT',()=>withCanonicalCommitTurn(store.db,id,()=>store.commit(tx)));
  for(const [name,amount] of Object.entries(tx.metrics))countLatency(name,amount);
  countLatency('documentWrites',tx.writes.size);countLatency('jobWrites',tx.jobs.size);
  if(committed){
   if(Date.now()-started>=2000)console.info(JSON.stringify({type:'V1_FEED_TRANSACTION_TIMING',feedId:id,attempts:attempt+1,durationMs:Date.now()-started,computationMs,writes:tx.writes.size,jobs:tx.jobs.size,queries:tx.metrics}));
   return result;
  }
  countLatency('casConflicts');
  if(attempt===0||attempt===11)try{console.warn(JSON.stringify({type:'V1_FEED_CAS_REJECTED',feedId:id,attempt:attempt+1,epoch:tx.snapshot.epoch,writes:tx.writes.size,jobs:tx.jobs.size,computationMs,queries:tx.metrics,...await store.casDiagnostic(tx.snapshot)}))}catch{console.warn(JSON.stringify({type:'V1_FEED_CAS_DIAGNOSTIC_UNAVAILABLE',feedId:id,attempt:attempt+1}))}
 }
 console.error(JSON.stringify({type:'V1_FEED_CAS_EXHAUSTED',feedId:id,firstEpoch,lastEpoch,writes:lastWrites,attempts:12,durationMs:Date.now()-started}));
 throw new HandoffError('TEMPORARY_UNAVAILABLE');
}
