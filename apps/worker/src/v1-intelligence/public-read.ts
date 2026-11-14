import {genericSourceName,sourceIdentityName} from '../source-display';
import {HandoffError} from '@distilled/contracts';
import {V1FeedStore} from './store';
import type {BriefingEditionRecord} from './publication';
import {projectEditionLedger} from './ledger';
import {readVerifiedArchive} from '../verified-archives';
export interface PublicationStatus {id:string;feedId:string;status:'PUBLISHED'|'WITHDRAWN';publishedAt:string;withdrawnAt?:string;reason?:string}
interface EditionRow {id:string;feed_id:string;edition:string;feed:string|null;status:string|null;status_feed_id:string|null;configuration:string|null}
interface CitationRow {publisher_url:string|null;publisher_name:string|null;id:string;revision_id:string;revision_feed_id:string;observation_id:string|null;observation_feed_id:string|null;title:string|null;url:string|null;publisher_id:string|null;source_id:string|null;published_at:string|null}
interface Citation {publisherName?:string;evidenceRevisionId:string;title:string|undefined;url:string|undefined;publisherId:string;publishedAt:string|undefined}
interface EditionProjection {edition:BriefingEditionRecord;publishedAt:string;title:string}
const READ_BATCH_IDS=80; // Below D1's 100 bound-parameter limit, including Feed identity.
const READ_BATCH_STATEMENTS=8;
const ARCHIVE_LIST_READS=12;
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
 const records:EditionProjection[]=[];
 for(const row of rows) {
  if(row.status_feed_id && row.status_feed_id!==row.feed_id)throw new HandoffError('SCOPE_DENIED');
  const status=row.status?JSON.parse(row.status) as PublicationStatus:undefined;
  if(!row.feed || status?.status!=='PUBLISHED')continue;
  const edition=JSON.parse(row.edition) as BriefingEditionRecord;
  if(edition.id!==row.id || edition.feedId!==row.feed_id || !row.configuration)throw new HandoffError('SCOPE_DENIED');
  records.push({edition,publishedAt:status.publishedAt,title:(JSON.parse(row.configuration) as {title:string}).title});
 }
 if(!records.length)return [];
 const feedId=records[0].edition.feedId,projected=await projectEditionPayloads(db,records);
 // Withdrawals can occur while immutable metadata is being read. Recheck the
 // mutable visibility records before returning, without caching publication state.
 const statuses=await batches<{id:string;feed_id:string;json:string}>(db,chunks(records.map(record=>record.edition.id)).map(part=>db.prepare(`SELECT id,feed_id,json FROM v1_feed_documents WHERE kind='publication_status' AND id IN (${part.map(()=>'?').join(',')})`).bind(...part)));
 const visible=new Set<string>();
 for(const row of statuses){if(row.feed_id!==feedId)throw new HandoffError('SCOPE_DENIED');if((JSON.parse(row.json) as PublicationStatus).status==='PUBLISHED')visible.add(row.id)}
 return projected.filter(edition=>visible.has(edition.id));
}

async function projectEditionPayloads(db:D1Database,records:EditionProjection[]) {
 const feedId=records[0].edition.feedId;
 if(records.some(record=>record.edition.feedId!==feedId))throw new HandoffError('SCOPE_DENIED');
 const ids=[...new Set(records.flatMap(record=>record.edition.evidenceRevisionIds))];
 // Public edition reads need citation metadata, not entire article bodies or
 // connector payloads. Original evidence access remains separately scoped below.
 const evidence=await batches<CitationRow>(db,chunks(ids).map(part=>db.prepare(`SELECT r.id,
  json_extract(r.json,'$.id') AS revision_id,json_extract(r.json,'$.feedId') AS revision_feed_id,
  i.id AS observation_id,json_extract(i.json,'$.observation.feedId') AS observation_feed_id,
  json_extract(r.json,'$.title') AS title,json_extract(r.json,'$.canonicalUrl') AS url,
  json_extract(i.json,'$.observation.publisherId') AS publisher_id,json_extract(i.json,'$.observation.sourceId') AS source_id,
  json_extract(r.json,'$.publishedAt') AS published_at,json_extract(c.json,'$.displayName') AS publisher_name,json_extract(c.json,'$.canonicalUrl') AS publisher_url
  FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id
  LEFT JOIN v1_inputs i ON i.id=json_extract(r.json,'$.sourceObservationId')
  LEFT JOIN v1_source_catalog c ON c.id=s.source_id
  WHERE s.feed_id=? AND r.id IN (${part.map(()=>'?').join(',')})`).bind(feedId,...part)));
 const byRevision=new Map(evidence.map(row=>[row.id,row]));
 return records.map(({edition,publishedAt,title})=>{
  const citations:Citation[]=edition.evidenceRevisionIds.map(id=>{
   const ref=byRevision.get(id);
   if(!ref || ref.revision_id!==id || ref.revision_feed_id!==feedId || !ref.observation_id || ref.observation_feed_id!==feedId)throw new HandoffError('SCOPE_DENIED');
   const publisherId=ref.publisher_id??ref.source_id;
   if(typeof publisherId!=='string')throw new HandoffError('SCOPE_DENIED');
   return {...((sourceIdentityName(ref.publisher_name,ref.publisher_url)??ref.publisher_name)?{publisherName:sourceIdentityName(ref.publisher_name,ref.publisher_url)??ref.publisher_name!}:{}),evidenceRevisionId:id,title:ref.title??undefined,url:ref.url??undefined,publisherId,publishedAt:ref.published_at??undefined};
  });
  // A persisted claim cannot gain support outside its edition's permitted set.
  if(edition.stories.some(story=>story.claims.some(claim=>claim.support.some(ref=>!byRevision.has(ref.evidenceRevisionId) || !edition.evidenceRevisionIds.includes(ref.evidenceRevisionId)))))throw new HandoffError('SCOPE_DENIED');
  return {id:edition.id,feedId,title,language:edition.language,windowStart:edition.windowStart,windowEnd:edition.windowEnd,...(edition.scheduledFor?{scheduledFor:edition.scheduledFor}:{}),createdAt:edition.createdAt,publishedAt,stories:edition.stories,citations};
 });
}
type PublishedEdition=Awaited<ReturnType<typeof projectEditionPayloads>>[number];
interface DeliveryRow {id:string;feed_id:string;published_at:string;object_key:string;sha256:string;byte_count:number;schema_version:1}

/** Build the same exact reader payload before the publication CAS. The
 * canonical transaction subsequently checks evidence and source authority. */
export async function buildEditionDeliveryPayload(db:D1Database,edition:BriefingEditionRecord):Promise<PublishedEdition> {
 const version=await db.prepare("SELECT json_extract(json,'$.title') AS title FROM v1_feed_versions WHERE feed_id=? AND revision=?")
  .bind(edition.feedId,edition.feedRevision).first<{title:string|null}>();
 if(typeof version?.title!=='string')throw new HandoffError('SCOPE_DENIED');
 return (await projectEditionPayloads(db,[{edition,title:version.title,publishedAt:edition.createdAt}]))[0];
}

/** Repair generic historical presentation labels without modifying immutable artifacts. */
export async function hydrateCitationNames(db:D1Database,editions:PublishedEdition[]):Promise<PublishedEdition[]>{
 if(!editions.length)return editions;const feedId=editions[0].feedId;
 if(editions.some(e=>e.feedId!==feedId))throw new HandoffError('SCOPE_DENIED');
 const ids=[...new Set(editions.flatMap(e=>e.citations.filter(c=>genericSourceName(c.publisherName)).map(c=>c.evidenceRevisionId)))];if(!ids.length)return editions;
 try{
  const rows=await batches<{id:string;name:string|null;url:string|null}>(db,chunks(ids).map(part=>db.prepare(`SELECT r.id,json_extract(c.json,'$.displayName') AS name,json_extract(c.json,'$.canonicalUrl') AS url
   FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id JOIN v1_source_catalog c ON c.id=s.source_id
   WHERE s.feed_id=? AND json_extract(r.json,'$.feedId')=? AND r.id IN (${part.map(()=>'?').join(',')})`).bind(feedId,feedId,...part)));
  const names=new Map(rows.flatMap(row=>{const name=sourceIdentityName(row.name,row.url);return name?[[row.id,name] as const]:[]}));
  return editions.map(e=>({...e,citations:e.citations.map(c=>genericSourceName(c.publisherName)&&names.has(c.evidenceRevisionId)?{...c,publisherName:names.get(c.evidenceRevisionId)}:c)}));
 }catch{return editions} // Optional display enrichment cannot break an already verified artifact.
}

async function readDeliveryRow(bucket:R2Bucket,row:DeliveryRow):Promise<PublishedEdition> {
 const text=await readVerifiedArchive(bucket,{objectKey:row.object_key,sha256:row.sha256,bytes:row.byte_count,schemaVersion:row.schema_version});
 const edition=JSON.parse(text) as PublishedEdition;
 if(edition.id!==row.id||edition.feedId!==row.feed_id||edition.publishedAt!==row.published_at)throw Error('EDITION_ARTIFACT_IDENTITY');
 return edition;
}

async function editionDeliveryPayload(db:D1Database,bucket:R2Bucket,id:string,feedId?:string):Promise<PublishedEdition|undefined> {
 const row=await db.prepare(`SELECT d.edition_id AS id,d.feed_id,d.published_at,a.object_key,a.sha256,a.byte_count,a.schema_version
  FROM v1_visible_edition_delivery d JOIN v1_verified_archives a ON a.object_key=d.object_key AND a.state='REFERENCED'
  WHERE d.edition_id=? AND (? IS NULL OR d.feed_id=?)`).bind(id,feedId??null,feedId??null).first<DeliveryRow>();
 if(!row)return undefined;
 const [edition]=await hydrateCitationNames(db,[await readDeliveryRow(bucket,row)]);
 const stillPublished=await db.prepare('SELECT 1 FROM v1_visible_edition_delivery WHERE edition_id=? AND feed_id=? AND object_key=?')
  .bind(id,row.feed_id,row.object_key).first();
 return stillPublished?edition:undefined;
}

async function mixedPublishedEditions(db:D1Database,bucket:R2Bucket,feedId:string):Promise<PublishedEdition[]> {
 const recent=await db.prepare(`WITH recent AS MATERIALIZED (
   SELECT id,feed_id,json_extract(json,'$.createdAt') AS created_at FROM v1_feed_documents WHERE kind='editions' AND feed_id=?
   ORDER BY created_at DESC,id DESC LIMIT 100
  )
  SELECT e.id,e.feed_id,d.published_at,a.object_key,a.sha256,a.byte_count,a.schema_version FROM recent e
  JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id AND json_extract(p.json,'$.status')='PUBLISHED'
  LEFT JOIN v1_visible_edition_delivery d ON d.edition_id=e.id AND d.feed_id=e.feed_id
  LEFT JOIN v1_verified_archives a ON a.object_key=d.object_key AND a.state='REFERENCED'
  ORDER BY e.created_at DESC,e.id DESC`).bind(feedId).all<DeliveryRow>();
 const available=recent.results.filter(row=>row.object_key).slice(0,ARCHIVE_LIST_READS);
 const fromArchive=new Map<string,PublishedEdition>();
 for(let i=0;i<available.length;i+=4){
  await Promise.all(available.slice(i,i+4).map(async row=>{
   try{fromArchive.set(row.id,await readDeliveryRow(bucket,row));}catch{console.warn('Verified edition artifact unavailable');}
  }));
 }
 const missing=recent.results.filter(row=>!fromArchive.has(row.id)).map(row=>row.id);
 const legacy=await batches<EditionRow>(db,chunks(missing).map(part=>db.prepare(`SELECT ${metadataFields} FROM v1_feed_documents e ${metadataJoins}
  WHERE e.kind='editions' AND e.feed_id=? AND e.id IN (${part.map(()=>'?').join(',')})`).bind(feedId,...part)));
 const output=new Map((await projectPublishedRows(db,legacy)).map(edition=>[edition.id,edition]));
 if(fromArchive.size){
  for(const edition of await hydrateCitationNames(db,[...fromArchive.values()]))fromArchive.set(edition.id,edition);
  const visible=await db.prepare(`SELECT edition_id FROM v1_visible_edition_delivery WHERE feed_id=? AND edition_id IN (${[...fromArchive].map(()=>'?').join(',')})`)
   .bind(feedId,...fromArchive.keys()).all<{edition_id:string}>();
  for(const row of visible.results)output.set(row.edition_id,fromArchive.get(row.edition_id)!);
 }
 return recent.results.flatMap(row=>{const edition=output.get(row.id);return edition?[edition]:[];});
}

export async function publicV1Edition(db:D1Database,id:string,bucket?:R2Bucket,feedId?:string) {
 if(bucket){
  try{const edition=await editionDeliveryPayload(db,bucket,id,feedId);if(edition)return edition;}
  catch{console.warn('Verified edition artifact unavailable');}
 }
 const {results}=await db.prepare(`SELECT ${metadataFields} FROM v1_feed_documents e ${metadataJoins} WHERE e.kind='editions' AND e.id=?`).bind(id).all<EditionRow>();
 return (await projectPublishedRows(db,feedId===undefined?results:results.filter(row=>row.feed_id===feedId)))[0];
}
/** Preserve the existing latest-100 list and its ordering, including detail
 * lookup within that list. No new pagination or public API is introduced. */
export async function publicV1Editions(db:D1Database,feedId:string,editionId?:string,bucket?:R2Bucket) {
 if(editionId){
  const recent=await db.prepare(`SELECT 1 FROM (SELECT id FROM v1_feed_documents WHERE kind='editions' AND feed_id=?
    ORDER BY json_extract(json,'$.createdAt') DESC,id DESC LIMIT 100) WHERE id=?`).bind(feedId,editionId).first();
  if(!recent)return [];
  const edition=await publicV1Edition(db,editionId,bucket,feedId);
  return edition?[edition]:[];
 }
 if(bucket){
  try{return await mixedPublishedEditions(db,bucket,feedId);}catch(error){
   if(error instanceof HandoffError)throw error;
   console.warn('Verified edition list unavailable');
  }
 }
 const {results}=await db.prepare(`SELECT ${metadataFields} FROM v1_feed_documents e ${metadataJoins} WHERE e.kind='editions' AND e.feed_id=? ORDER BY json_extract(e.json,'$.createdAt') DESC,e.id DESC LIMIT 100`).bind(feedId).all<EditionRow>();
 return projectPublishedRows(db,results);
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
