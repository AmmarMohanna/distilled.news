import { hashContent, HandoffError } from '@distilled/contracts';
import { SourceAcquisitionOrchestrator, type SourceAcquisitionOrchestratorOptions, type AcquisitionStageOutcome } from '@distilled/agent-runtime/source-acquisition-orchestrator';
import { parseStructuredHtmlArticle, PublicSourcePolicyError, PublicSourceFetchFailure } from '@distilled/agent-runtime/public-source-stages';
import type { SourceAcquisitionRequest } from '@distilled/agent-runtime/temporal-acquisition';
import { WorkerPublicSourceFetch } from '../public-source-fetch';
import { AcquisitionFailure, ACQUISITION_MAX_ATTEMPTS, type AcquisitionClaim } from './acquisition';
import { acquiredSchema } from './evidence';
import type { AcceptedAcquiredContent } from './types';
import type {LanguageResolution} from '../v1-intelligence/language';
import {resolvePublicationDate} from './publication-date';
import {discoverWebsiteArticles,isWebsiteListingUrl} from '@distilled/connectors';

function googleNewsArticleLink(value?:string):boolean{
 try{const u=new URL(value??'');return u.hostname==='news.google.com'&&/^\/(?:rss\/)?articles\//.test(u.pathname)}catch{return false}
}
export interface SuppliedPayload {title?:string;body:string;language?:string;languageResolution?:LanguageResolution;publishedAt?:string}
export interface CandidateAcquisitionOptions {
 now():string;
 readPayload?(claim:AcquisitionClaim):Promise<SuppliedPayload|undefined>;
 fetcher?:typeof fetch;
 preferFullArticle?:boolean;
 extractHtml?(url:string,html:string):Promise<unknown>;
 publicGet?(url:string):Promise<{url:string;body:string;contentType:string;status:number;authenticationRequired?:boolean}>;
 /** Anonymous exact-URL private HTTP, never a login or challenge-solving path. */
 publicArticle?(url:string):Promise<unknown>;
 /** Trusted runtime adapters; the caller cannot supply browser/model authority. */
 stages?:Omit<SourceAcquisitionOrchestratorOptions,'http'>;
 stagesForClaim?(claim:AcquisitionClaim):Omit<SourceAcquisitionOrchestratorOptions,'http'>;
}
/** Uses the existing ordered acquisition mechanism selector, without its collection/high-water service.
 * Exact-candidate binding is verified after every route; no discovered sibling can become evidence. */
export function createCandidateAcquisitionRouter(options:CandidateAcquisitionOptions) {
 return async (claim:AcquisitionClaim):Promise<AcceptedAcquiredContent>=>{
  const o=claim.input.observation,base={id:JSON.stringify(['acquired',o.id]),feedId:o.feedId,candidateId:claim.candidate.id,sourceId:o.sourceId,sourceObservationId:o.id,acquiredAt:options.now()};
  const supplied=async():Promise<AcceptedAcquiredContent|undefined>=>{
   if(!o.suppliedPayloadRef||!options.readPayload)return undefined;
   const payload=await options.readPayload(claim);
   if(!payload)return undefined;
    const {languageResolution,...content}=payload;
    if(languageResolution && languageResolution.language!==payload.language)throw new AcquisitionFailure('INVALID_RESULT',false);
    const parsed=acquiredSchema.safeParse({...base,...content,canonicalUrl:o.canonicalUrl,representation:o.representation,contentCompleteness:o.contentCompleteness,acquisitionMethod:'supplied_payload',quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:o.contentCompleteness==='COMPLETE'},provenance:{routerVersion:'v1-existing-orchestrator',stages:['SUPPLIED'],rawPayloadRef:o.suppliedPayloadRef,languageResolution}});
    if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
    const hash=await hashContent({representation:o.representation,title:payload.title,body:payload.body});
    if(o.contentHash && hash!==o.contentHash) throw new AcquisitionFailure('INVALID_RESULT',false);
    return parsed.data;
  };
  const wantsFull=options.preferFullArticle&&o.canonicalUrl&&['ARTICLE_EXCERPT','LISTING_RESULT','LINK_ONLY'].includes(o.representation);
  if(!wantsFull){const value=await supplied();if(value)return value;}
  // An unresolved Google News redirect never yields the publisher's article
  // (Google answers with its own redirect page). Keep the feed's own excerpt.
  else if(googleNewsArticleLink(o.canonicalUrl)){const value=await supplied();if(value)return value;throw new AcquisitionFailure('UNSUPPORTED',false);}
  const fullArticle=async():Promise<AcceptedAcquiredContent>=>{
  if(!o.canonicalUrl) throw new AcquisitionFailure('UNSUPPORTED',false);
   if(isWebsiteListingUrl(o.canonicalUrl))throw new AcquisitionFailure('UNSUPPORTED',false);
   let fetchPort:WorkerPublicSourceFetch;
   try {fetchPort=new WorkerPublicSourceFetch(o.canonicalUrl,options.fetcher)} catch {throw new AcquisitionFailure('POLICY_DENIED',false)}
   const request:SourceAcquisitionRequest={source:{canonicalSourceUrl:o.canonicalUrl,resourceLocator:o.canonicalUrl},window:{startTime:'1970-01-01T00:00:00Z',endTime:options.now()},authentication:'PUBLIC',limits:{maxItems:1,maxPages:1,maxScrolls:0,maxPhysicalAttempts:2,maxExecutionMs:60_000}};
   const privateArticle=async()=>{
    if(!options.publicArticle)return undefined;
    const value=await options.publicArticle(o.canonicalUrl!);
    if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
    const r=value as Record<string,unknown>;
    if(r.error==='TRANSIENT')throw new AcquisitionFailure('NETWORK',true);
    if(r.status===429)throw new AcquisitionFailure('RATE_LIMIT',true);
    if(r.status===451)throw new AcquisitionFailure('POLICY_DENIED',false);
    if(r.status===401)throw new AcquisitionFailure('AUTH_REQUIRED',false);
    if(r.status!==200||r.url!==o.canonicalUrl||r.pageKind!=='article'||typeof r.body!=='string'||r.body.length<200||new TextEncoder().encode(r.body).length>500_000)return undefined;
    // A different canonical identity needs a newly observed candidate; it cannot
    // silently replace this exact item's evidence during fallback acquisition.
    if(r.canonicalUrl&&r.canonicalUrl!==o.canonicalUrl)return undefined;
    const date=resolvePublicationDate(r.publishedAt,o.publishedAtHint);
    return {sourceResource:o.canonicalUrl!,canonicalItemUrl:o.canonicalUrl!,originalSourceReference:o.canonicalUrl!,text:r.body,title:typeof r.title==='string'?r.title:undefined,publishedAt:date.publishedAt,acquisitionEvidence:{mechanism:'private_public_http',...date}};
   };
   const http=async():Promise<AcquisitionStageOutcome>=>{
    const document=options.publicGet?await options.publicGet(o.canonicalUrl!):await fetchPort.get(o.canonicalUrl!);
    if(document.status===401 || document.authenticationRequired) return {stage:'HTTP',status:'AUTH_REQUIRED'};
    if(document.status===451)return {stage:'HTTP',status:'POLICY_DENIED'};
    if(document.status===403){
     const item=await privateArticle();
     if(!item)return {stage:'HTTP',status:'CHALLENGE_REQUIRED'};
     return {stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'},provenance:{mechanism:'private_public_http'}}};
    }
    if(document.status===429) throw new AcquisitionFailure('RATE_LIMIT',true);
    if(document.status>=500) throw new AcquisitionFailure('NETWORK',true);
    if(document.status>=400) throw new AcquisitionFailure('UNSUPPORTED',false);
    if(discoverWebsiteArticles(document.body,document.url))throw new AcquisitionFailure('UNSUPPORTED',false);
    // Existing extractor requires an article body and publication metadata, rather than treating 200 as extraction success.
    let item=parseStructuredHtmlArticle(document.body,document.url,o.canonicalUrl!);
    if(!item&&options.extractHtml){
     const extracted=await options.extractHtml(document.url,document.body);
     if(extracted&&typeof extracted==='object'&&!Array.isArray(extracted)){
      const r=extracted as Record<string,unknown>,date=resolvePublicationDate(r.publishedAt,o.publishedAtHint);
      if(typeof r.body==='string'&&r.body.length>=200&&r.body.length<=500_000&&r.pageKind!=='listing')
       item={sourceResource:o.canonicalUrl!,canonicalItemUrl:o.canonicalUrl!,originalSourceReference:document.url,text:r.body,title:typeof r.title==='string'?r.title:undefined,publishedAt:date.publishedAt,acquisitionEvidence:{mechanism:'private_html_extraction',...date}};
     }
    }
    let privateHttp=false;
    if(!item){item=await privateArticle();privateHttp=!!item;}
    if(!item) return {stage:'HTTP',status:'INSUFFICIENT'};
    return {stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'},...(privateHttp?{provenance:{mechanism:'private_public_http'}}:{})}};
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
    const publicationDate=resolvePublicationDate(item.acquisitionEvidence?.articlePublishedAt??item.publishedAt,o.publishedAtHint);
    const normalizedUrl=(value:string)=>{const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);return u.href};
    if(!item.canonicalItemUrl || normalizedUrl(item.canonicalItemUrl)!==normalizedUrl(o.canonicalUrl)) throw new AcquisitionFailure('INVALID_RESULT',false);
    const stage=outcome.stages.at(-1)?.stage;
    const browserEvidence=stage==='BROWSER_WORKFLOW' || stage==='WEB_OPERATOR'?Object.fromEntries(['acceptanceId','observationId','rawArtifactRef'].filter(key=>typeof item.acquisitionEvidence?.[key]==='string').map(key=>[key,item.acquisitionEvidence[key]])):undefined;
    const parsed=acquiredSchema.safeParse({...base,title:item.title,body:item.text,language:o.languageHint,publishedAt:publicationDate.publishedAt,canonicalUrl:item.canonicalItemUrl,resolvedUrl:item.originalSourceReference??item.canonicalItemUrl,representation:'FULL_ARTICLE',contentCompleteness:'COMPLETE',acquisitionMethod:stage==='STRUCTURED'?'platform_api':stage==='HTTP'?'direct_http':'browser',acquisitionProvider:outcome.result?.provenance?.mechanism,quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true},provenance:{routerVersion:'v1-existing-orchestrator',stages:outcome.stages.map(s=>s.stage),publicationDate,...(browserEvidence?{browserEvidence}:{})}});
    if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
    return parsed.data;
   } catch(error) {
    if(error instanceof AcquisitionFailure) throw error;
    if(error instanceof PublicSourcePolicyError) throw new AcquisitionFailure('POLICY_DENIED',false);
    if(error instanceof PublicSourceFetchFailure) throw new AcquisitionFailure(error.category==='BODY_BUDGET_EXCEEDED'?'BODY_BUDGET_EXCEEDED':'NETWORK',error.category!=='BODY_BUDGET_EXCEEDED');
    throw new HandoffError('TEMPORARY_UNAVAILABLE');
   }
  };
  try{return await fullArticle()}
  catch(error){
   // A full article is an upgrade over the supplied excerpt, not a condition
   // for keeping the item. On a terminal failure, or the last attempt, keep the
   // excerpt the source already delivered instead of losing the item.
   const terminal=error instanceof AcquisitionFailure&&!error.transient,last=claim.job.attempts>=ACQUISITION_MAX_ATTEMPTS;
   if(wantsFull&&(terminal||last)){const value=await supplied().catch(()=>undefined);if(value)return value;}
   throw error;
  }
 };
}
