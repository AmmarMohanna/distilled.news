import {HandoffError,eventMembershipSchema,eventVersionSchema,eventSalienceAssessmentSchema,userRelevanceSchema,windowScoreSchema,briefingCandidateSchema,type BriefingCandidate,type EventVersion,type EvidenceRevision,type NormalizedEvidenceItem} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import type {DownstreamJob} from '../v1-intake/types';
import type {FeedRecord,EventRecord,StorylineRecord,StorylineVersion,DuplicateDecision,RoleDecision} from './types';
import type {SelectionRecord} from './scoring';
import type {BriefingEditionRecord} from './publication';
export type DocumentKind='roles'|'duplicates'|'events'|'event_versions'|'memberships'|'storylines'|'storyline_versions'|'intelligence_receipts'|'salience'|'relevance'|'window_scores'|'candidates'|'selections'|'editions'|'publication_status'|'delivery_jobs'|'synthesis_jobs'|'drafts'|'grounding_results'|'verification_results'|'model_intents'|'model_executions';
interface DocumentWrite {kind:DocumentKind;id:string;value:unknown}
interface Snapshot {feed:FeedRecord;epoch:number;scopes:{id:string;epoch:number}[]}
const mutable=new Set<DocumentKind>(['events','storylines','publication_status','delivery_jobs','synthesis_jobs']);
const feedSchema=z.object({id:z.string().min(1),ownerId:z.string().min(1),title:z.string(),interests:z.array(z.string()),geography:z.array(z.string()),outputLanguage:z.string().min(1),briefingFrequency:z.enum(['30M','HOURLY','DAILY','WEEKLY']),paused:z.boolean(),revision:z.number().int().positive(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),deletedAt:z.string().datetime().optional()}).strict();
export class V1FeedStore {
 constructor(readonly db:D1Database){}
 async registerFeed(raw:FeedRecord) {
  const feed=feedSchema.parse(raw);
  await this.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,epoch=v1_feeds.epoch+1').bind(feed.id,JSON.stringify(feed)).run();
 }
 async getFeed(id:string):Promise<FeedRecord|undefined> {const row=await this.db.prepare('SELECT json FROM v1_feeds WHERE id=?').bind(id).first<{json:string}>();return row?JSON.parse(row.json):undefined}
 async read<T>(feedId:string,kind:DocumentKind,id:string):Promise<T|undefined> {
  const row=await this.db.prepare('SELECT feed_id,json FROM v1_feed_documents WHERE kind=? AND id=?').bind(kind,id).first<{feed_id:string;json:string}>();
  if(row && row.feed_id!==feedId) throw new HandoffError('SCOPE_DENIED');return row?JSON.parse(row.json):undefined;
 }
 async list<T>(feedId:string,kind:DocumentKind):Promise<T[]> {const rows=await this.db.prepare('SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind=? ORDER BY id').bind(feedId,kind).all<{json:string}>();return rows.results.map(r=>JSON.parse(r.json))}
 async currentEvidence(feedId:string):Promise<{item:NormalizedEvidenceItem;revision:EvidenceRevision}[]> {
  const rows=await this.db.prepare(`SELECT e.json AS item,r.json AS revision FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL ORDER BY json_extract(r.json,'$.acceptedAt'),r.id`).bind(feedId).all<{item:string;revision:string}>();
  return rows.results.map(r=>({item:JSON.parse(r.item),revision:JSON.parse(r.revision)}));
 }
 async revision(feedId:string,id:string):Promise<EvidenceRevision|undefined> {
  const row=await this.db.prepare('SELECT r.json FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE r.id=? AND s.feed_id=?').bind(id,feedId).first<{json:string}>();return row?JSON.parse(row.json):undefined;
 }
 async snapshot(id:string):Promise<Snapshot> {
  const row=await this.db.prepare('SELECT json,epoch FROM v1_feeds WHERE id=?').bind(id).first<{json:string;epoch:number}>();
  if(!row) throw new HandoffError('SCOPE_DENIED');const feed=JSON.parse(row.json) as FeedRecord;
  if(feed.deletedAt || feed.paused) throw new HandoffError('SCOPE_DENIED');
  const scopes=await this.db.prepare('SELECT id,epoch FROM v1_intake_scopes WHERE feed_id=? ORDER BY id').bind(id).all<{id:string;epoch:number}>();
  return {feed,epoch:row.epoch,scopes:scopes.results};
 }
 async commit(tx:FeedTransaction):Promise<boolean> {
  await tx.validateGraph();
  const {snapshot:s}=tx,nonce=crypto.randomUUID();
  const scopeChecks=s.scopes.map(()=>`EXISTS(SELECT 1 FROM v1_intake_scopes WHERE id=? AND epoch=?)`).join(' AND ');
  const args:unknown[]=[nonce,s.feed.id,s.epoch,s.feed.id,s.scopes.length,...s.scopes.flatMap(x=>[x.id,x.epoch])];
  const statements=[this.db.prepare(`INSERT INTO v1_feed_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feeds WHERE id=? AND epoch=? AND json_extract(json,'$.deletedAt') IS NULL AND json_extract(json,'$.paused')=0) AND (SELECT COUNT(*) FROM v1_intake_scopes WHERE feed_id=?)=? ${scopeChecks?'AND '+scopeChecks:''} THEN 1 ELSE 0 END`).bind(...args)];
  for(const w of tx.writes.values()) statements.push(this.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?) ${mutable.has(w.kind)?'ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json':'ON CONFLICT(kind,id) DO NOTHING'}`).bind(w.kind,w.id,s.feed.id,JSON.stringify(w.value)));
  for(const job of tx.jobs.values()) {
   statements.push(this.db.prepare('UPDATE v1_jobs SET json=? WHERE id=? AND feed_source_id=?').bind(JSON.stringify(job),job.id,job.feedSourceId));
   statements.push(this.db.prepare('UPDATE v1_intake_scopes SET epoch=epoch+1 WHERE id=?').bind(job.feedSourceId));
  }
  statements.push(this.db.prepare('UPDATE v1_feeds SET epoch=epoch+1 WHERE id=?').bind(s.feed.id),this.db.prepare('DELETE FROM v1_feed_guards WHERE id=?').bind(nonce));
  try {await this.db.batch(statements);return true} catch(error) {if(String(error).includes('CHECK constraint failed: v1_feed_cas')) return false;throw new HandoffError('TEMPORARY_UNAVAILABLE')}
 }
}
export class FeedTransaction {
 readonly writes=new Map<string,DocumentWrite>();readonly jobs=new Map<string,DownstreamJob>();
 private readonly reads=new Map<string,Promise<unknown>>();
 private readonly lists=new Map<DocumentKind,Promise<{id:string}[]>>();
 private readonly revisions=new Map<string,Promise<EvidenceRevision|undefined>>();
 constructor(readonly store:V1FeedStore,readonly snapshot:Snapshot){}
 async read<T>(kind:DocumentKind,id:string):Promise<T|undefined> {
  const key=JSON.stringify([kind,id]),staged=this.writes.get(key);if(staged) return staged.value as T;
  if(!this.reads.has(key)) this.reads.set(key,this.store.read(this.snapshot.feed.id,kind,id));return this.reads.get(key) as Promise<T|undefined>;
 }
 async list<T extends {id:string}>(kind:DocumentKind):Promise<T[]> {
  if(!this.lists.has(kind)) this.lists.set(kind,this.store.list(this.snapshot.feed.id,kind));
  const rows=new Map(((await this.lists.get(kind)) as T[]).map(r=>[r.id,r]));for(const w of this.writes.values()) if(w.kind===kind) rows.set(w.id,w.value as T);return [...rows.values()];
 }
 revision(id:string):Promise<EvidenceRevision|undefined> {
  if(!this.revisions.has(id)) this.revisions.set(id,this.store.revision(this.snapshot.feed.id,id));return this.revisions.get(id)!;
 }
 async write(kind:DocumentKind,id:string,value:unknown) {
  if(!value || typeof value!=='object' || !('id' in value) || value.id!==id) throw new HandoffError('SCOPE_DENIED');
  if(kind==='memberships') {
   const member=eventMembershipSchema.safeParse(value);
   if(!member.success || !await this.read<EventVersion>('event_versions',member.data.eventVersionId) || !await this.revision(member.data.evidenceRevisionId)) throw new HandoffError('SCOPE_DENIED');
  } else if(!('feedId' in value) || value.feedId!==this.snapshot.feed.id) throw new HandoffError('SCOPE_DENIED');
  const previous=await this.read(kind,id);if(previous && !mutable.has(kind) && canonicalJson(previous)!==canonicalJson(value)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  if(!previous || mutable.has(kind)) this.writes.set(JSON.stringify([kind,id]),{kind,id,value});
 }
 completeJob(job:DownstreamJob) {
  if(job.feedId!==this.snapshot.feed.id || !this.snapshot.scopes.some(s=>s.id===job.feedSourceId)) throw new HandoffError('SCOPE_DENIED');
  this.jobs.set(job.id,{...job,state:'DONE'});
 }
 async validateGraph():Promise<void> {
  for(const w of this.writes.values()) {
   if(w.kind==='events') {
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
    const e=w.value as BriefingEditionRecord,s=await this.read<SelectionRecord>('selections',e.selectionId);
    if(!s || s.feedRevision!==e.feedRevision || s.window.start!==e.windowStart || s.window.end!==e.windowEnd || e.selectedCandidateIds.some(id=>!s.selectedCandidateIds.includes(id))) throw new HandoffError('SCOPE_DENIED');
    const eventIds=new Set<string>(),storylineIds=new Set<string>();
    for(const id of e.selectedCandidateIds) {
     const c=await this.read<BriefingCandidate>('candidates',id);if(!c) throw new HandoffError('SCOPE_DENIED');
     if(c.targetType==='EVENT') eventIds.add(c.targetVersionId);
     else {const v=await this.read<StorylineVersion>('storyline_versions',c.targetVersionId);if(!v) throw new HandoffError('SCOPE_DENIED');storylineIds.add(v.id);for(const id of v.eventVersionIds) eventIds.add(id)}
    }
    const same=(a:Set<string>,b:string[])=>a.size===b.length && b.every(id=>a.has(id));
    const support=new Set((await this.list<{id:string;eventVersionId:string;evidenceRevisionId:string}>('memberships')).filter(m=>eventIds.has(m.eventVersionId)).map(m=>m.evidenceRevisionId));
    if(!same(eventIds,e.eventVersionIds) || !same(storylineIds,e.storylineVersionIds) || !same(support,e.evidenceRevisionIds)) throw new HandoffError('SCOPE_DENIED');
    for(const id of e.evidenceRevisionIds) if(!await this.revision(id)) throw new HandoffError('SCOPE_DENIED');
    if(e.stories.some(story=>!e.selectedCandidateIds.includes(story.candidateId) || story.claims.some(claim=>claim.support.some(ref=>!support.has(ref.evidenceRevisionId))))) throw new HandoffError('SCOPE_DENIED');
   }
  }
 }
}
export async function feedTransact<T>(store:V1FeedStore,id:string,run:(tx:FeedTransaction)=>Promise<T>):Promise<T> {
 for(let attempt=0;attempt<12;attempt++) {const tx=new FeedTransaction(store,await store.snapshot(id)),result=await run(tx);if(await store.commit(tx)) return result}
 throw new HandoffError('TEMPORARY_UNAVAILABLE');
}
