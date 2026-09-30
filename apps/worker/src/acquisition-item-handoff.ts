import {canonicalItemIdentity,makeId,type SourceAcquisitionResult} from "@distilled/agent-runtime";
import type {Env,SourceRecord,ProcessingJobMessage} from "./types";
import {CandidateIntake,acquireCandidate} from "./candidate-pipeline";

/** Trusted acquired content enters the existing raw-message/processing pipeline. */
export async function persistAcquiredSourceItems(db:Env["DB"],input:{tenantId:string;resourceId:string;result:SourceAcquisitionResult;now:Date;runId?:string;source?:SourceRecord;retentionDays?:number;queue?:{send(message:ProcessingJobMessage):Promise<unknown>}}){
  const acquiredAt=input.now.toISOString();
  const expiresAt=new Date(input.now.getTime()+(input.retentionDays??30)*86400000).toISOString();
  let inserted=0,queued=0,deferred=0;
  const ids:string[]=[];
  for(const item of input.result.items){
    const identity=canonicalItemIdentity(item);
    if(!identity||!item.text?.trim()||!item.publishedAt||!Number.isFinite(Date.parse(item.publishedAt)))throw new Error("acquisition_item_contract_invalid");
    const id=makeId("acquired_item",input.tenantId,input.resourceId,identity);
    ids.push(id);
    // Existing deterministic and Web Operator acquisition both project into the
    // connector-facing canonical boundary before the proven legacy handoff.
    const intake=new CandidateIntake(db);
    const {candidate}=await intake.accept(input.tenantId,{
      upstreamResourceId:input.resourceId,accessScope:"public",connectorType:input.result.provenance?.mechanism??"source_acquisition",
      sourceId:input.resourceId,upstreamId:item.sourceItemId,url:item.canonicalItemUrl,titleHint:item.title,
      publishedAtHint:item.publishedAt,discoveredAt:acquiredAt,
      discovery:{provider:input.result.provenance?.mechanism??"source_acquisition",runId:input.runId??id}
    });
    await acquireCandidate(db,candidate,{directHttp:async()=>({text:item.text!,title:item.title,publishedAt:item.publishedAt,author:item.author,resolvedUrl:item.canonicalItemUrl,provider:input.result.provenance?.mechanism,quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true}}),browser:async()=>({text:item.text!,title:item.title,publishedAt:item.publishedAt,author:item.author,resolvedUrl:item.canonicalItemUrl,provider:"web_operator",quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true}})},input.result.provenance?.mechanism?.includes("browser")||input.result.provenance?.mechanism?.includes("web_operator")?"browser":"direct_http");
    // Whitelist provenance fields; never persist browser/model envelopes or auth state.
    const evidence={kind:safe(item.acquisitionEvidence.kind),mechanism:input.result.provenance?.mechanism??safe(item.acquisitionEvidence.mechanism),timestampSource:safe(item.acquisitionEvidence.timestampSource),sourceTimestampField:safe(item.acquisitionEvidence.sourceTimestampField),pageRevision:safe(item.acquisitionEvidence.pageRevision),trustedObservationSchemaVersion:safe(item.acquisitionEvidence.trustedObservationSchemaVersion)};
    const commands=[db.prepare(`INSERT OR IGNORE INTO acquired_source_items(id,tenant_id,resource_id,identity,canonical_url,source_item_id,source_url,title,body,published_at,evidence_json,workflow_id,workflow_version,acquired_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,input.tenantId,input.resourceId,identity,item.canonicalItemUrl??null,item.sourceItemId??null,item.originalSourceReference??item.sourceResource,item.title??null,item.text,item.publishedAt,JSON.stringify(evidence),input.result.provenance?.workflowId??null,input.result.provenance?.workflowVersion??null,acquiredAt,expiresAt)];
    const source=input.source;
    const rawId=source?`${source.briefingId}::${id}`:undefined;
    const jobId=rawId?makeId("job_acquisition",rawId):undefined;
    if(source&&rawId&&jobId){
      const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(item.text.normalize("NFKC").replace(/\s+/g," ").trim())))).map(value=>value.toString(16).padStart(2,"0")).join("");
      const news={tenantId:input.tenantId,acquiredItemId:id,upstreamResourceId:input.resourceId,canonicalIdentity:identity,contentHash,headline:item.title,language:/[\u0600-\u06ff]/u.test(item.text)?"ar":"und",acquisitionRunId:input.runId};
      const text=item.title&&!item.text.startsWith(item.title)?`${item.title}\n${item.text}`:item.text;
      commands.push(db.prepare(`INSERT OR IGNORE INTO raw_messages(id,briefing_id,source_id,source_title,source_type,source_provider,source_kind,message_id,text,links_json,media_json,posted_at,received_at,source_url,expires_at,created_at,news_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(rawId,source.briefingId,source.id,source.title,source.type,source.provider,source.kind,item.sourceItemId??identity,text,JSON.stringify(item.canonicalItemUrl?[item.canonicalItemUrl]:[]),"[]",item.publishedAt,acquiredAt,item.canonicalItemUrl??item.originalSourceReference??null,expiresAt,acquiredAt,JSON.stringify(news)));
      commands.push(db.prepare("INSERT OR IGNORE INTO processing_jobs(id,briefing_id,raw_message_id,state,created_at,updated_at) VALUES(?,?,?,'queued',?,?)").bind(jobId,source.briefingId,rawId,acquiredAt,acquiredAt));
    }
    const results=await db.batch(commands);
    inserted+=Number(results[0].meta.changes);
    // A crash after this transaction is recovered by the existing stale-job relay.
    if(source&&jobId&&rawId&&Number(results[2].meta.changes)===1){
      if(input.queue)try{await input.queue.send({jobId,briefingId:source.briefingId,rawMessageId:rawId})}catch{deferred++;console.warn("PROCESSING_HANDOFF_SEND_DEFERRED")}
      queued++;
    }
  }
  return {persistedItemIds:ids,inserted,alreadyPersisted:ids.length-inserted,processingJobsCreated:queued,processingQueueDeferred:deferred};
}
function safe(value:unknown){return typeof value==="string"?value.slice(0,128):undefined}
