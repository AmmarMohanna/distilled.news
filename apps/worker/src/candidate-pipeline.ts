import type {AcquiredContent, AcquisitionMethod, CandidateEligibilityDecision, CandidateItem, CandidateProposal, NormalizedEvidenceItem} from "@distilled/core";
import type {SourceRecord, ProcessingJobMessage} from "./types";
import {persistAcquiredSourceItems} from "./acquisition-item-handoff";

/** Shared intake for connector discovery. It never fetches or invokes a model. */
export class CandidateIntake {
  constructor(private readonly db:D1Database){}

  async accept(tenantId:string, proposal:CandidateProposal, mode:"FOLLOWED"|"AUTOMATIC"="FOLLOWED"):Promise<{candidate:CandidateItem;decision:CandidateEligibilityDecision}> {
    const now=new Date().toISOString();
    let canonicalUrl:string|undefined,invalidUrl=false;
    if(proposal.url)try{canonicalUrl=canonicalizeCandidateUrl(proposal.url)}catch{invalidUrl=true}
    const validTime=Number.isFinite(Date.parse(proposal.discoveredAt));
    const validPublished=!proposal.publishedAtHint||Number.isFinite(Date.parse(proposal.publishedAtHint));
    const identity=Boolean(canonicalUrl||proposal.upstreamId?.trim()||proposal.payloadHash?.trim());
    const resource=await this.db.prepare("SELECT id FROM upstream_resources WHERE id=? AND tenant_id=?").bind(proposal.upstreamResourceId,tenantId).first();
    const eligible=Boolean(resource&&!invalidUrl&&proposal.accessScope.trim()&&proposal.connectorType.trim()&&proposal.sourceId.trim()&&proposal.discovery.provider.trim()&&proposal.discovery.runId.trim()&&validTime&&validPublished&&identity&&(mode==="FOLLOWED"||(Boolean(proposal.titleHint?.trim())&&Boolean(proposal.publishedAtHint))));
    const reason=invalidUrl?"UNSAFE_URL":!resource?"UNKNOWN_RESOURCE":!identity?"NO_IDENTITY":!validTime||!validPublished?"INVALID_TIMESTAMP":mode==="AUTOMATIC"&&!proposal.titleHint?.trim()?"INSUFFICIENT_METADATA":eligible?"ACCEPTED":"INVALID_PROPOSAL";
    const proposalHash=await hash("proposal",tenantId,JSON.stringify(proposal));
    if(!eligible){
      const rejectedId=await hash("eligibility_rejected",proposalHash,"RULES_V1");
      await this.db.prepare("INSERT OR IGNORE INTO candidate_eligibility_decisions(id,candidate_id,proposal_hash,eligible,reason,method,decided_at) VALUES(?,NULL,?,0,?,'RULES_V1',?)")
        .bind(rejectedId,proposalHash,reason,now).run();
      throw new Error(`candidate_ineligible:${reason}`);
    }
    const id=crypto.randomUUID();
    await this.db.prepare("INSERT OR IGNORE INTO candidate_items(id,tenant_id,resource_id,access_scope,connector_type,source_id,upstream_id,original_url,canonical_url,title_hint,published_at_hint,language_hint,payload_hash,supplied_payload_ref,discovered_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenantId,proposal.upstreamResourceId,proposal.accessScope,proposal.connectorType,proposal.sourceId,proposal.upstreamId??null,proposal.url??null,canonicalUrl??null,proposal.titleHint??null,proposal.publishedAtHint??null,proposal.languageHint??null,proposal.payloadHash??null,proposal.suppliedPayloadRef??null,proposal.discoveredAt,now).run();
    const row=await this.find(tenantId,proposal.accessScope,proposal.upstreamResourceId,canonicalUrl,proposal.upstreamId,proposal.payloadHash);
    if(!row)throw new Error("candidate_intake_persistence_failed");
    // A later connector may add a durable payload to an initially URL-only candidate.
    if(proposal.suppliedPayloadRef)await this.db.prepare("UPDATE candidate_items SET supplied_payload_ref=COALESCE(supplied_payload_ref,?) WHERE id=?").bind(proposal.suppliedPayloadRef,row.id).run();
    const discoveryId=await hash("discovery",row.id,proposal.discovery.provider,proposal.discovery.runId,proposal.discovery.queryId??"");
    const decisionId=await hash("eligibility",row.id,"RULES_V1");
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO candidate_discoveries(id,candidate_id,provider,run_id,query_id,discovered_at) VALUES(?,?,?,?,?,?)").bind(discoveryId,row.id,proposal.discovery.provider,proposal.discovery.runId,proposal.discovery.queryId??null,proposal.discoveredAt),
      this.db.prepare("INSERT OR IGNORE INTO candidate_eligibility_decisions(id,candidate_id,proposal_hash,eligible,reason,method,decided_at) VALUES(?,?,?,1,?,'RULES_V1',?)").bind(decisionId,row.id,proposalHash,reason,now)
    ]);
    const candidate=await this.get(row.id);
    return {candidate:candidate!,decision:{id:decisionId,candidateId:row.id,eligible:true,reason,method:"RULES_V1",decidedAt:now}};
  }

  async get(id:string):Promise<CandidateItem|undefined>{
    const r=await this.db.prepare("SELECT * FROM candidate_items WHERE id=?").bind(id).first<Record<string,unknown>>();
    if(!r)return undefined;
    const discovery=await this.db.prepare("SELECT provider,run_id,query_id FROM candidate_discoveries WHERE candidate_id=? ORDER BY discovered_at,id LIMIT 1").bind(id).first<{provider:string;run_id:string;query_id:string|null}>();
    return {id:String(r.id),tenantId:String(r.tenant_id),upstreamResourceId:String(r.resource_id),accessScope:String(r.access_scope),connectorType:String(r.connector_type),sourceId:String(r.source_id),upstreamId:opt(r.upstream_id),url:opt(r.original_url),canonicalUrl:opt(r.canonical_url),titleHint:opt(r.title_hint),publishedAtHint:opt(r.published_at_hint),languageHint:opt(r.language_hint),payloadHash:opt(r.payload_hash),suppliedPayloadRef:opt(r.supplied_payload_ref),discoveredAt:String(r.discovered_at),discovery:{provider:discovery?.provider??"unknown",runId:discovery?.run_id??"unknown",queryId:opt(discovery?.query_id)},status:String(r.status) as CandidateItem["status"]};
  }
  private async find(tenant:string,scope:string,resource:string,url?:string,upstream?:string,payload?:string){
    return this.db.prepare("SELECT id FROM candidate_items WHERE tenant_id=? AND access_scope=? AND ((canonical_url IS NOT NULL AND canonical_url=?) OR (resource_id=? AND upstream_id IS NOT NULL AND upstream_id=?) OR (resource_id=? AND payload_hash IS NOT NULL AND payload_hash=?)) LIMIT 1")
      .bind(tenant,scope,url??null,resource,upstream??null,resource,payload??null).first<{id:string}>();
  }
}

export function canonicalizeCandidateUrl(input:string):string {
  const url=new URL(input);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||!url.hostname||/^(localhost|.*\.localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname))throw new Error("candidate_url_unsafe");
  url.hash="";
  for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key))url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}

export interface AcquisitionPayload {text:string;title?:string;publishedAt?:string;author?:string;resolvedUrl?:string;rawPayloadRef?:string;quality?:AcquiredContent["quality"];provider?:string}
export interface AcquisitionStrategies {
  suppliedPayload?(ref:string,candidate:CandidateItem):Promise<AcquisitionPayload>;
  directHttp?(candidate:CandidateItem):Promise<AcquisitionPayload>;
  browser?(candidate:CandidateItem):Promise<AcquisitionPayload>;
}

/** Router accepts deterministic payloads and browser results through the same durable boundary. */
export async function acquireCandidate(db:D1Database,candidate:CandidateItem,strategies:AcquisitionStrategies,method?:AcquisitionMethod,input?:{source?:SourceRecord;retentionDays?:number;queue?:{send(message:ProcessingJobMessage):Promise<unknown>}}){
  let selected=method??(candidate.suppliedPayloadRef?"supplied_payload":"direct_http");
  const acquire=selected==="supplied_payload"?strategies.suppliedPayload:selected==="browser"?strategies.browser:strategies.directHttp;
  const previous=await db.prepare("SELECT * FROM canonical_acquired_content WHERE candidate_id=?").bind(candidate.id).first<Record<string,unknown>>();
  if(previous)selected=String(previous.acquisition_method) as AcquisitionMethod;
  const previousNormalized=previous?await db.prepare("SELECT * FROM normalized_evidence_items WHERE candidate_id=?").bind(candidate.id).first<Record<string,unknown>>():undefined;
  if(previous&&previousNormalized&&!input?.source)return {content:readContent(previous),normalized:readNormalized(previousNormalized)};
  if(!previous&&!acquire)throw new Error("acquisition_strategy_unavailable");
  if(!previous&&selected==="supplied_payload"&&!candidate.suppliedPayloadRef)throw new Error("supplied_payload_ref_missing");
  const payload=previous?{text:String(previous.body),title:opt(previous.title),publishedAt:opt(previous.published_at),author:opt(previous.author),resolvedUrl:opt(previous.resolved_url),rawPayloadRef:opt(previous.raw_payload_ref),quality:JSON.parse(String(previous.quality_json)) as AcquiredContent["quality"],provider:opt(previous.acquisition_provider)}:selected==="supplied_payload"?await (acquire as NonNullable<AcquisitionStrategies["suppliedPayload"]>)(candidate.suppliedPayloadRef!,candidate):await (acquire as NonNullable<AcquisitionStrategies["directHttp"]>)(candidate);
  if(!payload.text?.trim())throw new Error("acquired_content_empty");
  const now=new Date().toISOString(),id=await hash("acquired",candidate.id),normalizedId=await hash("evidence",candidate.id);
  const quality=payload.quality??{transportSuccess:true,extractionSuccess:true,extractionComplete:true};
  const content:AcquiredContent={id,candidateId:candidate.id,sourceId:candidate.sourceId,accessScope:candidate.accessScope,resolvedUrl:payload.resolvedUrl??candidate.canonicalUrl,title:payload.title??candidate.titleHint,text:payload.text,publishedAt:payload.publishedAt??candidate.publishedAtHint,author:payload.author,acquisitionMethod:selected,acquisitionProvider:payload.provider,rawPayloadRef:payload.rawPayloadRef??candidate.suppliedPayloadRef,acquiredAt:now,quality};
  const contentHash=await hash("content",payload.text.normalize("NFKC").replace(/\s+/g," ").trim());
  const normalized:NormalizedEvidenceItem={id:normalizedId,sourceId:candidate.sourceId,canonicalUrl:content.resolvedUrl,title:content.title??"",body:content.text,language:candidate.languageHint??(/[\u0600-\u06ff]/u.test(content.text)?"ar":"und"),publishedAt:content.publishedAt,firstSeenAt:now,contentHash,accessScope:candidate.accessScope,provenance:{candidateId:candidate.id,acquiredContentId:id,originalUrl:candidate.url,acquisitionMethod:selected,acquisitionProvider:payload.provider}};
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO canonical_acquired_content(id,candidate_id,source_id,access_scope,resolved_url,title,body,published_at,author,acquisition_method,acquisition_provider,raw_payload_ref,acquired_at,quality_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,candidate.id,candidate.sourceId,candidate.accessScope,content.resolvedUrl??null,content.title??null,content.text,content.publishedAt??null,content.author??null,selected,payload.provider??null,content.rawPayloadRef??null,now,JSON.stringify(quality)),
    db.prepare("INSERT OR IGNORE INTO normalized_evidence_items(id,candidate_id,acquired_content_id,source_id,access_scope,canonical_url,title,body,language,published_at,first_seen_at,content_hash,provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(normalizedId,candidate.id,id,candidate.sourceId,candidate.accessScope,normalized.canonicalUrl??null,normalized.title,normalized.body,normalized.language,normalized.publishedAt??null,now,contentHash,JSON.stringify(normalized.provenance)),
    db.prepare("UPDATE candidate_items SET status='ACQUIRED' WHERE id=?").bind(candidate.id)
  ]);
  if(input?.source&&content.publishedAt&&quality.extractionSuccess){
    await persistAcquiredSourceItems(db,{tenantId:candidate.tenantId,resourceId:candidate.upstreamResourceId,now:new Date(now),retentionDays:input.retentionDays,source:input.source,queue:input.queue,result:{items:[{sourceResource:candidate.canonicalUrl??candidate.upstreamResourceId,canonicalItemUrl:content.resolvedUrl,sourceItemId:candidate.upstreamId,title:content.title,text:content.text,publishedAt:content.publishedAt,author:content.author,acquisitionEvidence:{kind:selected,timestampSource:"connector"}}],requestedWindow:{startTime:content.publishedAt,endTime:now},effectiveWindow:{startTime:content.publishedAt,endTime:now},acquisitionAsOf:now,coverage:{rangeCovered:false,truncated:true,stopReason:"SOURCE_TIMESTAMP_UNAVAILABLE"}}});
  }
  return {content,normalized};
}
function opt(value:unknown){return value==null?undefined:String(value)}
function readContent(r:Record<string,unknown>):AcquiredContent{return {id:String(r.id),candidateId:String(r.candidate_id),sourceId:String(r.source_id),accessScope:String(r.access_scope),resolvedUrl:opt(r.resolved_url),title:opt(r.title),text:String(r.body),publishedAt:opt(r.published_at),author:opt(r.author),acquisitionMethod:String(r.acquisition_method) as AcquisitionMethod,acquisitionProvider:opt(r.acquisition_provider),rawPayloadRef:opt(r.raw_payload_ref),acquiredAt:String(r.acquired_at),quality:JSON.parse(String(r.quality_json))}}
function readNormalized(r:Record<string,unknown>):NormalizedEvidenceItem{return {id:String(r.id),sourceId:String(r.source_id),accessScope:String(r.access_scope),canonicalUrl:opt(r.canonical_url),title:String(r.title),body:String(r.body),language:String(r.language),publishedAt:opt(r.published_at),firstSeenAt:String(r.first_seen_at),contentHash:String(r.content_hash),provenance:JSON.parse(String(r.provenance_json))}}
async function hash(...parts:string[]){const bytes=new TextEncoder().encode(parts.join("\u0000"));return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(v=>v.toString(16).padStart(2,"0")).join("").slice(0,40)}
