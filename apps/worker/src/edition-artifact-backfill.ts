/** Bounded, resumable backfill of verified R2 copies for V3 editions that were
 * published before EDITION_ARTIFACTS_ENABLED was on.
 *
 * Each tick takes the newest published V3 editions that have neither a
 * delivery row nor an archive attempt, builds exactly the payload a reader
 * would get from D1, stages and verifies it in R2, then attaches it. The
 * v1_edition_delivery trigger (0090) re-checks publication, engine and
 * timestamps inside the insert, so a withdrawal that races the backfill makes
 * the insert fail and the staged object becomes an orphan for the normal sweep.
 *
 * Progress is the data itself: an attached edition is skipped next time, and a
 * failed attempt leaves an archive row that keeps the edition out of the
 * candidate list until orphan cleanup removes it, about a day later. */
import type {Env} from './types';
import type {BriefingEditionRecord} from './v1-intelligence/publication';
import type {PublicationStatus} from './v1-intelligence/public-read';
import {buildEditionDeliveryPayload} from './v1-intelligence/public-read';
import {stageVerifiedArchive} from './verified-archives';

export interface EditionArtifactBackfillResult {attached:number;failed:number;candidates:number}

export function editionArtifactBackfillEnabled(env:Env):boolean {
 return env.EDITION_ARTIFACT_BACKFILL_ENABLED==='true'&&env.EDITION_ARTIFACTS_ENABLED==='true'&&Boolean(env.RAW_ARCHIVE);
}

export async function backfillEditionArtifacts(env:Env,options:{maxAttached?:number;maxCandidates?:number;budgetMs?:number}={}):Promise<EditionArtifactBackfillResult> {
 const maxAttached=options.maxAttached??5,started=Date.now(),budget=options.budgetMs??5000;
 const {results}=await env.DB.prepare(`SELECT e.id,e.feed_id,e.json AS edition,p.json AS status FROM v1_feed_documents e
  JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id AND json_extract(p.json,'$.status')='PUBLISHED'
  JOIN v1_feed_documents j ON j.kind='delivery_jobs' AND j.id=e.id AND j.feed_id=e.feed_id
  WHERE e.kind='editions' AND json_extract(e.json,'$.engine')='v3'
   AND NOT EXISTS(SELECT 1 FROM v1_edition_delivery d WHERE d.edition_id=e.id)
   AND NOT EXISTS(SELECT 1 FROM v1_verified_archives a WHERE a.record_id=e.id AND a.kind='EDITION')
  ORDER BY json_extract(e.json,'$.createdAt') DESC,e.id DESC LIMIT ?`).bind(options.maxCandidates??25)
  .all<{id:string;feed_id:string;edition:string;status:string}>();
 const result:EditionArtifactBackfillResult={attached:0,failed:0,candidates:results.length};
 for(const row of results){
  if(result.attached>=maxAttached||Date.now()-started>budget)break;
  try{
   const edition=JSON.parse(row.edition) as BriefingEditionRecord,status=JSON.parse(row.status) as PublicationStatus;
   if(edition.id!==row.id||edition.feedId!==row.feed_id||status.status!=='PUBLISHED')throw Error('EDITION_IDENTITY');
   // The reader payload uses the publication time from the status record.
   const payload={...await buildEditionDeliveryPayload(env.DB,edition),publishedAt:status.publishedAt};
   const ref=await stageVerifiedArchive(env,'EDITION',row.feed_id,row.id,JSON.stringify(payload));
   await env.DB.prepare('INSERT INTO v1_edition_delivery(edition_id,feed_id,object_key,created_at,published_at) VALUES(?,?,?,?,?)')
    .bind(row.id,row.feed_id,ref.objectKey,edition.createdAt,status.publishedAt).run();
   result.attached++;
  }catch(error){
   result.failed++;
   console.warn(JSON.stringify({event:'edition_artifact_backfill_deferred',editionId:row.id,reason:error instanceof Error?error.message.slice(0,120):'UNKNOWN'}));
  }
 }
 console.log(JSON.stringify({event:'edition_artifact_backfill',...result}));
 return result;
}
