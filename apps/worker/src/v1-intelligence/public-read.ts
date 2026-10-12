import {HandoffError} from '@distilled/contracts';
import {V1FeedStore} from './store';
import type {BriefingEditionRecord} from './publication';
import {projectEditionLedger} from './ledger';
export interface PublicationStatus {id:string;feedId:string;status:'PUBLISHED'|'WITHDRAWN';publishedAt:string;withdrawnAt?:string;reason?:string}
interface EditionRow {id:string;feed_id:string;edition:string;feed:string|null;status:string|null;status_feed_id:string|null;configuration:string|null}
interface CitationRow {id:string;revision_id:string;revision_feed_id:string;observation_id:string|null;observation_feed_id:string|null;title:string|null;url:string|null;publisher_id:string|null;source_id:string|null;published_at:string|null}
interface Citation {evidenceRevisionId:string;title:string|undefined;url:string|undefined;publisherId:string;publishedAt:string|undefined}
const READ_BATCH_IDS=80; // Below D1's 100 bound-parameter limit, including Feed identity.
const READ_BATCH_STATEMENTS=8;
async function batches<T>(db:D1Database,statements:D1PreparedStatement[]):Promise<T[]> {
 const rows:T[]=[];
 for(let i=0;i<statements.length;i+=READ_BATCH_STATEMENTS) {
  const results=await db.batch<T>(statements.slice(i,i+READ_BATCH_STATEMENTS));
  for(const result of results)rows.push(...result.results);
 }
 return rows;
}
function chunks<T>(values:T[]):T[][] {const parts:T[][]=[];for(let i=0;i<values.length;i+=READ_BATCH_IDS)parts.push(values.slice(i,i+READ_BATCH_IDS));return parts}
const metadataJoins=`LEFT JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id
 LEFT JOIN v1_feeds f ON f.id=e.feed_id
 LEFT JOIN v1_feed_versions c ON c.feed_id=e.feed_id AND c.revision=json_extract(e.json,'$.feedRevision')`;
const metadataFields='e.id,e.feed_id,e.json AS edition,f.json AS feed,p.json AS status,p.feed_id AS status_feed_id,c.json AS configuration';
/** Published prose remains immutable. Batched reads retain exact historical
 * configuration and provenance, independent of current source scope/enabled state. */
async function projectPublishedRows(db:D1Database,rows:EditionRow[]) {
 const records:{row:EditionRow;edition:BriefingEditionRecord;status:PublicationStatus;title:string}[]=[];
 for(const row of rows) {
  if(row.status_feed_id && row.status_feed_id!==row.feed_id)throw new HandoffError('SCOPE_DENIED');
  const status=row.status?JSON.parse(row.status) as PublicationStatus:undefined;
  if(!row.feed || status?.status!=='PUBLISHED')continue;
  const edition=JSON.parse(row.edition) as BriefingEditionRecord;
  if(edition.id!==row.id || edition.feedId!==row.feed_id || !row.configuration)throw new HandoffError('SCOPE_DENIED');
  records.push({row,edition,status,title:(JSON.parse(row.configuration) as {title:string}).title});
 }
 if(!records.length)return [];
 const feedId=records[0].row.feed_id;
 if(records.some(record=>record.row.feed_id!==feedId))throw new HandoffError('SCOPE_DENIED');
 const ids=[...new Set(records.flatMap(record=>record.edition.evidenceRevisionIds))];
 // Public edition reads need citation metadata, not entire article bodies or
 // connector payloads. Original evidence access remains separately scoped below.
 const evidence=await batches<CitationRow>(db,chunks(ids).map(part=>db.prepare(`SELECT r.id,
  json_extract(r.json,'$.id') AS revision_id,json_extract(r.json,'$.feedId') AS revision_feed_id,
  i.id AS observation_id,json_extract(i.json,'$.observation.feedId') AS observation_feed_id,
  json_extract(r.json,'$.title') AS title,json_extract(r.json,'$.canonicalUrl') AS url,
  json_extract(i.json,'$.observation.publisherId') AS publisher_id,json_extract(i.json,'$.observation.sourceId') AS source_id,
  json_extract(r.json,'$.publishedAt') AS published_at
  FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id
  LEFT JOIN v1_inputs i ON i.id=json_extract(r.json,'$.sourceObservationId')
  WHERE s.feed_id=? AND r.id IN (${part.map(()=>'?').join(',')})`).bind(feedId,...part)));
 const byRevision=new Map(evidence.map(row=>[row.id,row]));
 const projected=records.map(({row,edition,status,title})=>{
  const citations:Citation[]=edition.evidenceRevisionIds.map(id=>{
   const ref=byRevision.get(id);
   if(!ref || ref.revision_id!==id || ref.revision_feed_id!==row.feed_id || !ref.observation_id || ref.observation_feed_id!==row.feed_id)throw new HandoffError('SCOPE_DENIED');
   const publisherId=ref.publisher_id??ref.source_id;
   if(typeof publisherId!=='string')throw new HandoffError('SCOPE_DENIED');
   return {evidenceRevisionId:id,title:ref.title??undefined,url:ref.url??undefined,publisherId,publishedAt:ref.published_at??undefined};
  });
  // A persisted claim cannot gain support outside its edition's permitted set.
  if(edition.stories.some(story=>story.claims.some(claim=>claim.support.some(ref=>!byRevision.has(ref.evidenceRevisionId) || !edition.evidenceRevisionIds.includes(ref.evidenceRevisionId)))))throw new HandoffError('SCOPE_DENIED');
  return {id:edition.id,feedId:edition.feedId,title,language:edition.language,windowStart:edition.windowStart,windowEnd:edition.windowEnd,createdAt:edition.createdAt,publishedAt:status.publishedAt,stories:edition.stories,citations};
 });
 // Withdrawals can occur while immutable metadata is being read. Recheck the
 // mutable visibility records before returning, without caching publication state.
 const statuses=await batches<{id:string;feed_id:string;json:string}>(db,chunks(records.map(record=>record.row.id)).map(part=>db.prepare(`SELECT id,feed_id,json FROM v1_feed_documents WHERE kind='publication_status' AND id IN (${part.map(()=>'?').join(',')})`).bind(...part)));
 const visible=new Set<string>();
 for(const row of statuses){if(row.feed_id!==feedId)throw new HandoffError('SCOPE_DENIED');if((JSON.parse(row.json) as PublicationStatus).status==='PUBLISHED')visible.add(row.id)}
 return projected.filter(edition=>visible.has(edition.id));
}
export async function publicV1Edition(db:D1Database,id:string) {
 const {results}=await db.prepare(`SELECT ${metadataFields} FROM v1_feed_documents e ${metadataJoins} WHERE e.kind='editions' AND e.id=?`).bind(id).all<EditionRow>();
 return (await projectPublishedRows(db,results))[0];
}
/** Preserve the existing latest-100 list and its ordering, including detail
 * lookup within that list. No new pagination or public API is introduced. */
export async function publicV1Editions(db:D1Database,feedId:string,editionId?:string) {
 const {results}=await db.prepare(`SELECT ${metadataFields} FROM v1_feed_documents e ${metadataJoins} WHERE e.kind='editions' AND e.feed_id=? ORDER BY json_extract(e.json,'$.createdAt') DESC,e.id DESC LIMIT 100`).bind(feedId).all<EditionRow>();
 return projectPublishedRows(db,editionId?results.filter(row=>row.id===editionId):results);
}
export async function publicV1Evidence(db:D1Database,editionId:string,revisionId:string) {
 const edition=await publicV1Edition(db,editionId);if(!edition || !edition.citations.some(c=>c.evidenceRevisionId===revisionId)) return undefined;
 const revision=await new V1FeedStore(db).revision(edition.feedId,revisionId);if(!revision) return undefined;
 return {id:revision.id,title:revision.title,text:revision.body,language:revision.language,url:revision.canonicalUrl,publishedAt:revision.publishedAt,acceptedAt:revision.acceptedAt,representation:revision.representation,contentCompleteness:revision.contentCompleteness};
}
export async function withdrawV1Edition(db:D1Database,id:string,ownerId:string,reason:'POLICY_REQUIRED'|'OWNER_REQUEST',now:string):Promise<void> {
 const row=await db.prepare("SELECT e.feed_id,f.epoch FROM v1_feed_documents e JOIN v1_feeds f ON f.id=e.feed_id WHERE e.kind='editions' AND e.id=? AND json_extract(f.json,'$.ownerId')=?").bind(id,ownerId).first<{feed_id:string;epoch:number}>();
 if(!row) throw new HandoffError('SCOPE_DENIED');
 const store=new V1FeedStore(db),status=await store.read<PublicationStatus>(row.feed_id,'publication_status',id);if(status?.status==='WITHDRAWN') {await projectEditionLedger(store,row.feed_id,id);return}
 if(!status || !Number.isFinite(Date.parse(now))) throw new HandoffError('INVALID_REQUEST');
 const guard=crypto.randomUUID();
 await db.batch([
  db.prepare("INSERT INTO v1_enrollment_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feeds WHERE id=? AND epoch=? AND json_extract(json,'$.ownerId')=?) THEN 1 ELSE 0 END").bind(guard,row.feed_id,row.epoch,ownerId),
  db.prepare("UPDATE v1_feed_documents SET json=? WHERE kind='publication_status' AND id=? AND feed_id=?").bind(JSON.stringify({...status,status:'WITHDRAWN',withdrawnAt:now,reason}),id,row.feed_id),
  db.prepare('UPDATE v1_feeds SET epoch=epoch+1 WHERE id=?').bind(row.feed_id),
  db.prepare('DELETE FROM v1_enrollment_guards WHERE id=?').bind(guard)
 ]);
 await projectEditionLedger(store,row.feed_id,id);
}
