import { hashContent, HandoffError } from '@distilled/contracts';
import { SourceAcquisitionOrchestrator, type SourceAcquisitionOrchestratorOptions, type AcquisitionStageOutcome } from '@distilled/agent-runtime/source-acquisition-orchestrator';
import { parseStructuredHtmlArticle, PublicSourcePolicyError, PublicSourceFetchFailure } from '@distilled/agent-runtime/public-source-stages';
import type { SourceAcquisitionRequest } from '@distilled/agent-runtime/temporal-acquisition';
import { WorkerPublicSourceFetch } from '../public-source-fetch';
import { AcquisitionFailure, type AcquisitionClaim } from './acquisition';
import { acquiredSchema } from './evidence';
import type { AcceptedAcquiredContent } from './types';

export interface SuppliedPayload {title?:string;body:string;language?:string;publishedAt?:string}
export interface CandidateAcquisitionOptions {
 now():string;
 readPayload?(claim:AcquisitionClaim):Promise<SuppliedPayload|undefined>;
 fetcher?:typeof fetch;
 /** Trusted runtime adapters; the caller cannot supply browser/model authority. */
 stages?:Omit<SourceAcquisitionOrchestratorOptions,'http'>;
 stagesForClaim?(claim:AcquisitionClaim):Omit<SourceAcquisitionOrchestratorOptions,'http'>;
}
/** Uses the existing ordered acquisition mechanism selector, without its collection/high-water service.
 * Exact-candidate binding is verified after every route; no discovered sibling can become evidence. */
export function createCandidateAcquisitionRouter(options:CandidateAcquisitionOptions) {
 return async (claim:AcquisitionClaim):Promise<AcceptedAcquiredContent>=>{
  const o=claim.input.observation,base={id:JSON.stringify(['acquired',o.id]),feedId:o.feedId,candidateId:claim.candidate.id,sourceId:o.sourceId,sourceObservationId:o.id,acquiredAt:options.now()};
  if(o.suppliedPayloadRef && options.readPayload) {
   const payload=await options.readPayload(claim);
   if(payload) {
    const parsed=acquiredSchema.safeParse({...base,...payload,canonicalUrl:o.canonicalUrl,representation:o.representation,contentCompleteness:o.contentCompleteness,acquisitionMethod:'supplied_payload',quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:o.contentCompleteness==='COMPLETE'},provenance:{routerVersion:'v1-existing-orchestrator',stages:['SUPPLIED'],rawPayloadRef:o.suppliedPayloadRef}});
    if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
    const hash=await hashContent({representation:o.representation,title:payload.title,body:payload.body});
    if(o.contentHash && hash!==o.contentHash) throw new AcquisitionFailure('INVALID_RESULT',false);
    return parsed.data;
   }
  }
  if(!o.canonicalUrl) throw new AcquisitionFailure('UNSUPPORTED',false);
  let fetchPort:WorkerPublicSourceFetch;
  try {fetchPort=new WorkerPublicSourceFetch(o.canonicalUrl,options.fetcher)} catch {throw new AcquisitionFailure('POLICY_DENIED',false)}
  const request:SourceAcquisitionRequest={source:{canonicalSourceUrl:o.canonicalUrl,resourceLocator:o.canonicalUrl},window:{startTime:'1970-01-01T00:00:00Z',endTime:options.now()},authentication:'PUBLIC',limits:{maxItems:1,maxPages:1,maxScrolls:0,maxPhysicalAttempts:2,maxExecutionMs:60_000}};
  const http=async():Promise<AcquisitionStageOutcome>=>{
   const document=await fetchPort.get(o.canonicalUrl!);
   if(document.status===401 || document.status===403) return {stage:'HTTP',status:'AUTH_REQUIRED'};
   if(document.status===429) throw new AcquisitionFailure('RATE_LIMIT',true);
   if(document.status>=500) throw new AcquisitionFailure('NETWORK',true);
   if(document.status>=400) throw new AcquisitionFailure('UNSUPPORTED',false);
   // Existing extractor requires an article body and publication metadata, rather than treating 200 as extraction success.
   const item=parseStructuredHtmlArticle(document.body,document.url,o.canonicalUrl!);
   if(!item) return {stage:'HTTP',status:'INSUFFICIENT'};
   return {stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'}}};
  };
  try {
   const outcome=await new SourceAcquisitionOrchestrator({...options.stages,...options.stagesForClaim?.(claim),http}).acquire(request);
   const items=outcome.result?.items;
   if(outcome.status!=='SUCCESS' || !items?.length) {
    const reason=outcome.stopReason;
    throw new AcquisitionFailure(reason==='AUTH_REQUIRED'?'AUTH_REQUIRED':reason==='CHALLENGE_REQUIRED'?'CHALLENGE_REQUIRED':reason==='POLICY_DENIED'?'POLICY_DENIED':reason==='BUDGET_EXHAUSTED'?'BUDGET_EXHAUSTED':reason==='TRANSIENT_FAILURE'?'NETWORK':'EXTRACTION_FAILED',reason==='TRANSIENT_FAILURE');
   }
   if(items.length!==1) throw new AcquisitionFailure('INVALID_RESULT',false);
   const item=items[0];
   const normalizedUrl=(value:string)=>{const u=new URL(value);u.hash='';return u.href};
   if(!item.canonicalItemUrl || normalizedUrl(item.canonicalItemUrl)!==normalizedUrl(o.canonicalUrl)) throw new AcquisitionFailure('INVALID_RESULT',false);
   const stage=outcome.stages.at(-1)?.stage;
   const browserEvidence=stage==='BROWSER_WORKFLOW' || stage==='WEB_OPERATOR'?Object.fromEntries(['acceptanceId','observationId','rawArtifactRef'].filter(key=>typeof item.acquisitionEvidence?.[key]==='string').map(key=>[key,item.acquisitionEvidence[key]])):undefined;
   const parsed=acquiredSchema.safeParse({...base,title:item.title,body:item.text,language:o.languageHint,publishedAt:item.publishedAt,canonicalUrl:item.canonicalItemUrl,resolvedUrl:item.originalSourceReference??item.canonicalItemUrl,representation:'FULL_ARTICLE',contentCompleteness:'COMPLETE',acquisitionMethod:stage==='STRUCTURED'?'platform_api':stage==='HTTP'?'direct_http':'browser',acquisitionProvider:outcome.result?.provenance?.mechanism,quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true},provenance:{routerVersion:'v1-existing-orchestrator',stages:outcome.stages.map(s=>s.stage),...(browserEvidence?{browserEvidence}:{})}});
   if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
   return parsed.data;
  } catch(error) {
   if(error instanceof AcquisitionFailure) throw error;
   if(error instanceof PublicSourcePolicyError) throw new AcquisitionFailure('POLICY_DENIED',false);
   if(error instanceof PublicSourceFetchFailure) throw new AcquisitionFailure(error.category==='BODY_BUDGET_EXCEEDED'?'BUDGET_EXHAUSTED':'NETWORK',error.category!=='BODY_BUDGET_EXCEEDED');
   throw new HandoffError('TEMPORARY_UNAVAILABLE');
  }
 };
}
