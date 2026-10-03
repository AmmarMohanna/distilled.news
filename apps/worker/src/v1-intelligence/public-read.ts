import {HandoffError} from '@distilled/contracts';
import {V1FeedStore} from './store';
import {V1IntakeStore} from '../v1-intake/store';
import type {AcceptedInput} from '../v1-intake/types';
import type {BriefingEditionRecord} from './publication';
export interface PublicationStatus {id:string;feedId:string;status:'PUBLISHED'|'WITHDRAWN';publishedAt:string;withdrawnAt?:string;reason?:string}
/** Historical reads use exact edition support; current pointers and deleted product rows are irrelevant. */
export async function publicV1Edition(db:D1Database,id:string) {
 const row=await db.prepare("SELECT feed_id FROM v1_feed_documents WHERE kind='editions' AND id=?").bind(id).first<{feed_id:string}>();if(!row) return undefined;
 const store=new V1FeedStore(db),edition=await store.read<BriefingEditionRecord>(row.feed_id,'editions',id),status=await store.read<PublicationStatus>(row.feed_id,'publication_status',id),feed=await store.getFeed(row.feed_id);
 if(!edition || !feed || status?.status!=='PUBLISHED') return undefined;
 const configuration=await db.prepare('SELECT json FROM v1_feed_versions WHERE feed_id=? AND revision=?').bind(edition.feedId,edition.feedRevision).first<{json:string}>();if(!configuration) throw new HandoffError('SCOPE_DENIED');
 const publishedFeed=JSON.parse(configuration.json) as {title:string};const citations=[];
 for(const revisionId of edition.evidenceRevisionIds) {
  const revision=await store.revision(row.feed_id,revisionId);if(!revision) throw new HandoffError('SCOPE_DENIED');
  const observation=await new V1IntakeStore(db).read<AcceptedInput>('inputs',revision.sourceObservationId);
  if(!observation || observation.value.observation.feedId!==row.feed_id) throw new HandoffError('SCOPE_DENIED');
  citations.push({evidenceRevisionId:revision.id,title:revision.title,url:revision.canonicalUrl,publisherId:observation.value.observation.publisherId??observation.value.observation.sourceId,publishedAt:revision.publishedAt});
 }
 return {id:edition.id,feedId:edition.feedId,title:publishedFeed.title,language:edition.language,windowStart:edition.windowStart,windowEnd:edition.windowEnd,createdAt:edition.createdAt,stories:edition.stories,citations};
}
export async function publicV1Evidence(db:D1Database,editionId:string,revisionId:string) {
 const edition=await publicV1Edition(db,editionId);if(!edition || !edition.citations.some(c=>c.evidenceRevisionId===revisionId)) return undefined;
 const revision=await new V1FeedStore(db).revision(edition.feedId,revisionId);if(!revision) return undefined;
 return {id:revision.id,title:revision.title,text:revision.body,language:revision.language,url:revision.canonicalUrl,publishedAt:revision.publishedAt,acceptedAt:revision.acceptedAt,representation:revision.representation,contentCompleteness:revision.contentCompleteness};
}
export async function withdrawV1Edition(db:D1Database,id:string,ownerId:string,reason:'POLICY_REQUIRED'|'OWNER_REQUEST',now:string):Promise<void> {
 const row=await db.prepare("SELECT e.feed_id,f.epoch FROM v1_feed_documents e JOIN v1_feeds f ON f.id=e.feed_id WHERE e.kind='editions' AND e.id=? AND json_extract(f.json,'$.ownerId')=?").bind(id,ownerId).first<{feed_id:string;epoch:number}>();
 if(!row) throw new HandoffError('SCOPE_DENIED');
 const store=new V1FeedStore(db),status=await store.read<PublicationStatus>(row.feed_id,'publication_status',id);if(status?.status==='WITHDRAWN') return;
 if(!status || !Number.isFinite(Date.parse(now))) throw new HandoffError('INVALID_REQUEST');
 const guard=crypto.randomUUID();
 await db.batch([
  db.prepare("INSERT INTO v1_enrollment_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feeds WHERE id=? AND epoch=? AND json_extract(json,'$.ownerId')=?) THEN 1 ELSE 0 END").bind(guard,row.feed_id,row.epoch,ownerId),
  db.prepare("UPDATE v1_feed_documents SET json=? WHERE kind='publication_status' AND id=? AND feed_id=?").bind(JSON.stringify({...status,status:'WITHDRAWN',withdrawnAt:now,reason}),id,row.feed_id),
  db.prepare('UPDATE v1_feeds SET epoch=epoch+1 WHERE id=?').bind(row.feed_id),
  db.prepare('DELETE FROM v1_enrollment_guards WHERE id=?').bind(guard)
 ]);
}
