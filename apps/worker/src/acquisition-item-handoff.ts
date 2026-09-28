import {canonicalItemIdentity,makeId,type SourceAcquisitionResult} from "@distilled/agent-runtime";
import type {Env,SourceRecord,ProcessingJobMessage} from "./types";

/** Trusted acquired content enters the existing raw-message/processing pipeline. */
export async function persistAcquiredSourceItems(db:Env["DB"],input:{tenantId:string;resourceId:string;result:SourceAcquisitionResult;now:Date;source?:SourceRecord;retentionDays?:number;queue?:{send(message:ProcessingJobMessage):Promise<unknown>}}){
  const acquiredAt=input.now.toISOString();
  const expiresAt=new Date(input.now.getTime()+(input.retentionDays??30)*86400000).toISOString();
  let inserted=0,queued=0;
  const ids:string[]=[];
  for(const item of input.result.items){
    const identity=canonicalItemIdentity(item);
    if(!identity||!item.text?.trim()||!item.publishedAt||!Number.isFinite(Date.parse(item.publishedAt)))throw new Error("acquisition_item_contract_invalid");
    const id=makeId("acquired_item",input.tenantId,input.resourceId,identity);
    ids.push(id);
    // Whitelist provenance fields; never persist browser/model envelopes or auth state.
    const evidence={mechanism:input.result.provenance?.mechanism??safe(item.acquisitionEvidence.mechanism),timestampSource:safe(item.acquisitionEvidence.timestampSource),sourceTimestampField:safe(item.acquisitionEvidence.sourceTimestampField),pageRevision:safe(item.acquisitionEvidence.pageRevision),trustedObservationSchemaVersion:safe(item.acquisitionEvidence.trustedObservationSchemaVersion)};
    const commands=[db.prepare(`INSERT OR IGNORE INTO acquired_source_items(id,tenant_id,resource_id,identity,canonical_url,source_item_id,source_url,title,body,published_at,evidence_json,workflow_id,workflow_version,acquired_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,input.tenantId,input.resourceId,identity,item.canonicalItemUrl??null,item.sourceItemId??null,item.originalSourceReference??item.sourceResource,item.title??null,item.text,item.publishedAt,JSON.stringify(evidence),input.result.provenance?.workflowId??null,input.result.provenance?.workflowVersion??null,acquiredAt,expiresAt)];
    const source=input.source;
    const rawId=source?`${source.briefingId}::${id}`:undefined;
    const jobId=rawId?makeId("job_acquisition",rawId):undefined;
    if(source&&rawId&&jobId){
      commands.push(db.prepare(`INSERT OR IGNORE INTO raw_messages(id,briefing_id,source_id,source_title,source_type,source_provider,source_kind,message_id,text,links_json,media_json,posted_at,received_at,source_url,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(rawId,source.briefingId,source.id,source.title,source.type,source.provider,source.kind,item.sourceItemId??identity,item.text,JSON.stringify(item.canonicalItemUrl?[item.canonicalItemUrl]:[]),"[]",item.publishedAt,acquiredAt,item.canonicalItemUrl??item.originalSourceReference??null,expiresAt,acquiredAt));
      commands.push(db.prepare("INSERT OR IGNORE INTO processing_jobs(id,briefing_id,raw_message_id,state,created_at,updated_at) VALUES(?,?,?,'queued',?,?)").bind(jobId,source.briefingId,rawId,acquiredAt,acquiredAt));
    }
    const results=await db.batch(commands);
    inserted+=Number(results[0].meta.changes);
    // A crash after this transaction is recovered by the existing stale-job relay.
    if(source&&jobId&&rawId&&Number(results[2].meta.changes)===1){
      if(input.queue)await input.queue.send({jobId,briefingId:source.briefingId,rawMessageId:rawId});
      queued++;
    }
  }
  return {persistedItemIds:ids,inserted,alreadyPersisted:ids.length-inserted,processingJobsCreated:queued};
}
function safe(value:unknown){return typeof value==="string"?value.slice(0,128):undefined}
