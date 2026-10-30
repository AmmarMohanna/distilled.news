import type {SourceObservation} from '@distilled/contracts';
import {canonicalJson} from './canonical';
import {itemId,V1IntakeStore,type ReadKey} from './store';
import {transact} from './transaction';
import type {AcceptedInput,CandidateRecord,DownstreamJob} from './types';

/** Identity of the discovery content, not of a polling run. A changed date,
 * revision, publisher, URL or verified text must remain a new acquisition. */
export function acquisitionDiscoveryIdentity(o:SourceObservation):string{
 return canonicalJson({sourceItemKey:o.sourceItemKey,operation:o.operation,representation:o.representation,contentCompleteness:o.contentCompleteness,contentHash:o.contentHash??null,sourceRevision:o.sourceRevision??null,authoritativeCurrentState:o.authoritativeCurrentState,canonicalUrl:o.canonicalUrl??null,publisherId:o.publisherId??null,titleHint:o.titleHint??null,publishedAtHint:o.publishedAtHint??null,languageHint:o.languageHint??null});
}
export function initialAcquisitionBacklog(o:SourceObservation,feedCreatedAt:string):boolean{
 const published=Date.parse(o.publishedAtHint??''),created=Date.parse(feedCreatedAt);
 return o.operation==='UPSERT'&&['ARTICLE_EXCERPT','LINK_ONLY','LISTING_RESULT'].includes(o.representation)&&!o.sourceRevision&&!o.authoritativeCurrentState&&
  Number.isFinite(published)&&Number.isFinite(created)&&published<created&&
  !/\b(?:correct(?:ed|ion)?|updat(?:e|ed)|retract(?:ed|ion)?|erratum|rectificatif)\b|mise\s+à\s+jour|تصحيح|تحديث|سحب/iu.test(o.titleHint??'');
}

/** Defer only unchanged, unversioned initial discoveries that V3 already
 * excludes as pre-subscription backlog. Preserve inputs, payloads, job identity,
 * attempts and financial records. No evidence is fabricated and nothing is
 * labelled successfully fetched. Revised/unknown-date work remains runnable. */
export async function deferInitialAcquisitionBacklog(store:V1IntakeStore,sourceId:string,now:string,limit=25,jobId?:string):Promise<number>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>25||!Number.isFinite(Date.parse(now)))throw Error('INVALID_BACKLOG_BOUNDS');
 const feed=await store.db.prepare("SELECT json_extract(f.json,'$.createdAt') created_at FROM v1_intake_scopes s JOIN v1_feeds f ON f.id=s.feed_id WHERE s.id=? AND json_extract(f.json,'$.paused')=0 AND json_extract(f.json,'$.deletedAt') IS NULL").bind(sourceId).first<{created_at:string}>();
 if(!feed||!Number.isFinite(Date.parse(feed.created_at)))return 0;
 return transact(store,sourceId,async tx=>{
  const rows=await store.db.prepare(`SELECT j.id,j.item_key,i.id observation_id,
   COALESCE(json_extract(c.json,'$.firstObservationId'),(SELECT f.id FROM v1_inputs f WHERE f.feed_source_id=j.feed_source_id AND f.item_key=j.item_key ORDER BY json_extract(f.json,'$.observation.observedAt'),f.id LIMIT 1)) first_id FROM v1_jobs j
   JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id
   JOIN v1_candidates c ON c.feed_source_id=j.feed_source_id AND c.item_key=j.item_key
   WHERE j.feed_source_id=? AND json_extract(j.json,'$.kind')='ACQUIRE' AND json_extract(j.json,'$.state')='PENDING'
   AND json_extract(j.json,'$.backlogReview.policy') IS NULL
   ${jobId?'AND j.id=?':''}
   AND json_extract(i.json,'$.observation.operation')='UPSERT'
   AND json_extract(i.json,'$.observation.representation') IN ('ARTICLE_EXCERPT','LINK_ONLY','LISTING_RESULT')
   AND json_extract(i.json,'$.observation.sourceRevision') IS NULL
   AND json_extract(i.json,'$.observation.authoritativeCurrentState')=0
   AND julianday(json_extract(i.json,'$.observation.publishedAtHint'))<julianday(?)
   AND NOT EXISTS(SELECT 1 FROM v1_acquisition_results r WHERE r.id=j.id)
   AND NOT EXISTS(SELECT 1 FROM v1_evidence e WHERE e.feed_source_id=j.feed_source_id AND e.item_key=j.item_key)
   ORDER BY json_extract(i.json,'$.observation.observedAt'),j.id LIMIT ?`)
   .bind(sourceId,...(jobId?[jobId]:[]),feed.created_at,limit).all<{id:string;item_key:string;observation_id:string;first_id:string|null}>();
  const keys:ReadKey[]=rows.results.flatMap(r=>[{table:'jobs',id:r.id},{table:'inputs',id:r.observation_id},...(r.first_id?[{table:'inputs' as const,id:r.first_id}]:[]),{table:'candidates',id:itemId(sourceId,r.item_key)},{table:'evidence',id:itemId(sourceId,r.item_key)},{table:'acquisition_results',id:r.id}]);
  await tx.prefetch(keys);let deferred=0;
  for(const row of rows.results){
   const job=await tx.read<DownstreamJob>('jobs',row.id),input=await tx.read<AcceptedInput>('inputs',row.observation_id),candidate=await tx.read<CandidateRecord>('candidates',itemId(sourceId,row.item_key));
   if(!job||job.state!=='PENDING'||!input||!candidate)continue;
   const retain=()=>tx.write('jobs',job.id,{...job,backlogReview:{policy:'initial-acquisition-backlog-v1',at:now,result:'RETAINED'}},row.item_key);
   if(job.recoveryAuthorizations?.length||!initialAcquisitionBacklog(input.observation,feed.created_at)||await tx.read('evidence',candidate.id)||await tx.read('acquisition_results',job.id)){retain();continue;}
   const firstId=candidate.firstObservationId??row.first_id??undefined;
   const first=firstId?await tx.read<AcceptedInput>('inputs',firstId):undefined;
   if(!first||acquisitionDiscoveryIdentity(first.observation)!==acquisitionDiscoveryIdentity(input.observation)){retain();continue;}
   // Store the original pointer once. Later polling runs can coalesce onto this
   // deferred job; any changed discovery still creates its own runnable job.
   tx.write('candidates',candidate.id,{...candidate,firstObservationId:firstId,acquisitionObservationId:candidate.acquisitionObservationId??job.observationId},row.item_key);
   tx.write('jobs',job.id,{...job,state:'DEFERRED',deferred:{reason:'INITIAL_BACKLOG',policy:'initial-acquisition-backlog-v1',at:now,feedCreatedAt:feed.created_at,publishedAtHint:input.observation.publishedAtHint!}},row.item_key);
   deferred++;
  }
  return deferred;
 });
}
