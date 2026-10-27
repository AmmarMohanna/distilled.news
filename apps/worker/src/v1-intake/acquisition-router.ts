import { hashContent, HandoffError } from '@distilled/contracts';
import { SourceAcquisitionOrchestrator, type SourceAcquisitionOrchestratorOptions, type AcquisitionStageOutcome } from '@distilled/agent-runtime/source-acquisition-orchestrator';
import { parseStructuredHtmlArticle, PublicSourcePolicyError, PublicSourceFetchFailure } from '@distilled/agent-runtime/public-source-stages';
import type { SourceAcquisitionRequest } from '@distilled/agent-runtime/temporal-acquisition';
import { WorkerPublicSourceFetch } from '../public-source-fetch';
import { AcquisitionFailure, type AcquisitionClaim } from './acquisition';
import { acquiredSchema } from './evidence';
import type { AcceptedAcquiredContent } from './types';
import type {LanguageResolution} from '../v1-intelligence/language';
import {resolvePublicationDate,helperArticleDates,type PublicationDate} from './publication-date';
import {discoverWebsiteArticles,extractWordpressArticle,extractPublicHtml,PUBLIC_ARTICLE_HTML_MAX_BYTES,SourceProviderError,readArticleDateMetadata,unreadableArticleReason} from '@distilled/connectors';

export interface SuppliedPayload {title?:string;body:string;language?:string;languageResolution?:LanguageResolution;publishedAt?:string}
export interface CandidateAcquisitionOptions {
 now():string;
 readPayload?(claim:AcquisitionClaim):Promise<SuppliedPayload|undefined>;
 fetcher?:typeof fetch;
 preferFullArticle?:boolean;
 /** Trusted decoder attests a collected Google listing -> public publisher. */
 resolveGoogleArticle?(url:string):Promise<unknown>;
 extractHtml?(url:string,html:string):Promise<unknown>;
 publicGet?(url:string):Promise<{url:string;body:string;contentType:string;status:number;authenticationRequired?:boolean;retryAfter?:string}>;
 /** Anonymous exact-URL private HTTP, never a login or challenge-solving path. */
 publicArticle?(url:string):Promise<unknown>;
 /** Authorized Playwright -> durable Zyte exact-article chain. */
 articleFallback?(claim:AcquisitionClaim):Promise<unknown>;
 /** Trusted runtime adapters; the caller cannot supply browser/model authority. */
 stages?:Omit<SourceAcquisitionOrchestratorOptions,'http'>;
 stagesForClaim?(claim:AcquisitionClaim):Omit<SourceAcquisitionOrchestratorOptions,'http'>;
}
/** Uses the existing ordered acquisition mechanism selector, without its collection/high-water service.
 * Exact-candidate binding is verified after every route; no discovered sibling can become evidence. */
export function createCandidateAcquisitionRouter(options:CandidateAcquisitionOptions) {
 return async (claim:AcquisitionClaim):Promise<AcceptedAcquiredContent>=>{
  const listing=claim.input.observation.canonicalUrl;
  if(listing&&new URL(listing).hostname==='news.google.com'&&options.preferFullArticle){
   let value:unknown;
   try{value=await options.resolveGoogleArticle?.(listing)}catch(error){
    if(error instanceof AcquisitionFailure)throw error;
    if(error instanceof SourceProviderError&&error.code==='BACKPRESSURE')throw new AcquisitionFailure('BACKPRESSURE',true,{detail:'GOOGLE_RESOLUTION_CAPACITY_WAIT',retryNotBefore:error.retryNotBefore});
    if(error instanceof SourceProviderError&&error.code==='RATE_LIMIT')throw new AcquisitionFailure('RATE_LIMIT',true,{detail:'GOOGLE_RESOLUTION_RATE_LIMIT',retryNotBefore:error.retryNotBefore});
    if(error instanceof SourceProviderError&&['AUTH_REQUIRED','POLICY_REFUSAL'].includes(error.code))throw new AcquisitionFailure(error.code==='AUTH_REQUIRED'?'AUTH_REQUIRED':'POLICY_DENIED',false);
    throw new AcquisitionFailure('NETWORK',true,{detail:'GOOGLE_NEWS_RESOLUTION_UNAVAILABLE'});
   }
   const result=value&&typeof value==='object'?value as Record<string,unknown>:undefined;
   if(result?.inputUrl!==listing||typeof result.url!=='string')throw new AcquisitionFailure('NETWORK',true,{detail:'GOOGLE_NEWS_UNRESOLVED'});
   try{new WorkerPublicSourceFetch(result.url,options.fetcher);if(new URL(result.url).hostname==='news.google.com')throw Error('UNRESOLVED')}catch{throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'GOOGLE_PUBLISHER_URL_INVALID'})}
   // Preserve stored observation/candidate IDs. The collected listing is still
   // retained in intake; only this exact acquisition uses the attested target.
   claim={...claim,input:{...claim.input,observation:{...claim.input.observation,canonicalUrl:result.url}}};
  }
  const o=claim.input.observation,base={id:JSON.stringify(['acquired',o.id]),feedId:o.feedId,candidateId:claim.candidate.id,sourceId:o.sourceId,sourceObservationId:o.id,acquiredAt:options.now()};
  if(o.suppliedPayloadRef && options.readPayload && !(options.preferFullArticle&&o.canonicalUrl&&['ARTICLE_EXCERPT','LISTING_RESULT','LINK_ONLY'].includes(o.representation))) {
   const payload=await options.readPayload(claim);
   if(payload) {
    if(o.representation==='FULL_ARTICLE')requireReadableArticle(payload.body);
    const {languageResolution,...content}=payload;
    if(languageResolution && languageResolution.language!==payload.language)throw new AcquisitionFailure('INVALID_RESULT',false);
    const parsed=acquiredSchema.safeParse({...base,...content,canonicalUrl:o.canonicalUrl,representation:o.representation,contentCompleteness:o.contentCompleteness,acquisitionMethod:'supplied_payload',quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:o.contentCompleteness==='COMPLETE'},provenance:{routerVersion:'v1-existing-orchestrator',stages:['SUPPLIED'],rawPayloadRef:o.suppliedPayloadRef,languageResolution}});
    if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
    const hash=await hashContent({representation:o.representation,title:payload.title,body:payload.body});
    if(o.contentHash && hash!==o.contentHash) throw new AcquisitionFailure('INVALID_RESULT',false);
    return parsed.data;
   }
  }
  if(!o.canonicalUrl) throw new AcquisitionFailure('UNSUPPORTED',false,{detail:'MISSING_CANONICAL_URL'});

  let fetchPort:WorkerPublicSourceFetch;
  try {fetchPort=new WorkerPublicSourceFetch(o.canonicalUrl,options.fetcher,{maxBytes:PUBLIC_ARTICLE_HTML_MAX_BYTES})} catch {throw new AcquisitionFailure('POLICY_DENIED',false)}
  const request:SourceAcquisitionRequest={source:{canonicalSourceUrl:o.canonicalUrl,resourceLocator:o.canonicalUrl},window:{startTime:'1970-01-01T00:00:00Z',endTime:options.now()},authentication:'PUBLIC',limits:{maxItems:1,maxPages:1,maxScrolls:0,maxPhysicalAttempts:2,maxExecutionMs:60_000}};
  const privateArticle=async()=>{
   if(!options.publicArticle)return undefined;
   let value:unknown;
   try {value=await options.publicArticle(o.canonicalUrl!);}
   catch(error){
    // This adapter performs anonymous HTTP only; no paid outcome is being retried.
    if(error instanceof Error&&(['SOURCE_EXECUTION_TIMEOUT','SOURCE_EXECUTION_UNAVAILABLE'].includes(error.message)||['AbortError','TimeoutError'].includes(error.name)||error instanceof TypeError))
     throw new AcquisitionFailure('NETWORK',true,{detail:'HELPER_TRANSPORT_FAILURE'});
    throw error;
   }
   return helperArticle(value,'private_public_http');
  };
  const helperArticle=(value:unknown,mechanism:string)=>{
   if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
   const r=value as Record<string,unknown>;
   if(r.accessRestricted===true)throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_ACCESS_RESTRICTED'});
   if(r.error==='TRANSIENT'||(typeof r.status==='number'&&(r.status>=500||r.status===408||r.status===425)))throw new AcquisitionFailure('NETWORK',true,{detail:r.failureOrigin==='upstream_http'?'UPSTREAM_SERVER_ERROR':r.failureOrigin==='upstream_transport'?'UPSTREAM_TRANSPORT_FAILURE':'HELPER_TRANSIENT_FAILURE',httpStatus:typeof r.status==='number'?r.status:undefined});
   if(r.status===429)throw new AcquisitionFailure('RATE_LIMIT',true);
   if(r.status===451)throw new AcquisitionFailure('POLICY_DENIED',false);
   if(r.status===401)throw new AcquisitionFailure('AUTH_REQUIRED',false);
   const contentKind=r.pageKind==='catalogue'&&(r.contentKind==='PRODUCT_DETAIL'||r.contentKind==='CATALOGUE')?r.contentKind:undefined;
   if(r.status!==200||r.url!==o.canonicalUrl||(r.pageKind!=='article'&&!contentKind)||typeof r.body!=='string'||r.body.length<200||new TextEncoder().encode(r.body).length>500_000)return undefined;
   // A different canonical identity needs a newly observed candidate; it cannot
   // silently replace this exact item's evidence during fallback acquisition.
   if(r.canonicalUrl&&r.canonicalUrl!==o.canonicalUrl)return undefined;
   requireReadableArticle(r.body);
   const date=resolvePublicationDate(undefined,o.publishedAtHint,helperArticleDates(r.dateMetadata),r.extractedDate??r.publishedAt);
   return {sourceResource:o.canonicalUrl!,canonicalItemUrl:o.canonicalUrl!,originalSourceReference:o.canonicalUrl!,text:r.body,title:typeof r.title==='string'?r.title:undefined,publishedAt:date.publishedAt,acquisitionEvidence:{mechanism,publicationDate:date,contentCompleteness:'UNKNOWN',...(contentKind?{contentKind}:{})}};
  };
  const fallbackSuccess=(item:NonNullable<Awaited<ReturnType<typeof privateArticle>>>):AcquisitionStageOutcome=>({stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'},provenance:{mechanism:item.acquisitionEvidence.mechanism}}});
  const http=async():Promise<AcquisitionStageOutcome>=>{
   let document;
   try {document=options.publicGet?await options.publicGet(o.canonicalUrl!):await fetchPort.get(o.canonicalUrl!);}
   catch(error){
    if(!(error instanceof PublicSourceFetchFailure)||error.category==='BODY_BUDGET_EXCEEDED')throw error;
    const item=await privateArticle();
    if(item)return fallbackSuccess(item);
    throw error;
   }
   if(document.status===401 || document.authenticationRequired) return {stage:'HTTP',status:'AUTH_REQUIRED'};
   if(document.status===451)return {stage:'HTTP',status:'POLICY_DENIED'};
   if(document.status===403||document.status===406){
    const item=await privateArticle();
    if(!item){
     // A negotiation/edge rejection does not prove this article unsupported.
     // Use only the already-authorized anonymous exact-URL fallback; otherwise
     // retain bounded job retries, without escalating to paid/browser routes.
     if(document.status===406)throw new AcquisitionFailure('NETWORK',true,{detail:'UPSTREAM_NOT_ACCEPTABLE',httpStatus:406});
     return {stage:'HTTP',status:'CHALLENGE_REQUIRED'};
    }
    return {stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'},provenance:{mechanism:'private_public_http'}}};
   }
   if(document.status===429){
    const value=document.retryAfter,seconds=value===undefined?NaN:Number(value);
    const retryAt=value===undefined?undefined:Number.isFinite(seconds)?new Date(Date.parse(options.now())+Math.max(0,seconds)*1000).toISOString():Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;
    throw new AcquisitionFailure('RATE_LIMIT',true,{detail:'UPSTREAM_RATE_LIMIT',httpStatus:429,retryNotBefore:retryAt});
   }
   if(document.status>=500||document.status===408||document.status===425){
    const item=await privateArticle();
    if(item)return fallbackSuccess(item);
    throw new AcquisitionFailure('NETWORK',true,{detail:document.status>=500?'UPSTREAM_SERVER_ERROR':'UPSTREAM_TEMPORARY_FAILURE',httpStatus:document.status});
   }
   if(document.status>=400) throw new AcquisitionFailure('UNSUPPORTED',false,{detail:document.status===404||document.status===410?'HTTP_NOT_FOUND':'UPSTREAM_HTTP_ERROR',httpStatus:document.status});
   const media=document.contentType.split(';')[0].trim().toLowerCase();
   const htmlLike=/^\s*<(?:!doctype|html|head|meta|article|main|div|p|script)\b/i.test(document.body);
   if(['text/plain','text/markdown','text/x-markdown'].includes(media)&&!htmlLike||media==='application/json'||media.endsWith('+json')){
    let body=document.body,title:string|undefined,publishedAt:unknown;
    if(media==='application/json'||media.endsWith('+json')){
     let value:unknown;try{value=JSON.parse(body)}catch{throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'INVALID_DOCUMENT_JSON'})}
     const record=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
     if(!record)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'NO_DOCUMENT_TEXT'});
     if(typeof record.url==='string'&&new URL(record.url,document.url).href!==document.url)throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'DOCUMENT_IDENTITY_MISMATCH'});
     const raw=record.articleBody??record.body??record.text??record.content;
     if(typeof raw!=='string')throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'NO_DOCUMENT_TEXT'});
     body=/<(?:p|div|article|main)\b/i.test(raw)?extractPublicHtml('<article>'+raw+'</article>',document.url).body:raw;
     title=typeof record.title==='string'?record.title:typeof record.headline==='string'?record.headline:undefined;publishedAt=record.datePublished??record.publishedAt;
    }
    if(body.trim().length<200)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'INSUFFICIENT_DOCUMENT_TEXT'});
    requireReadableArticle(body);
    const date=resolvePublicationDate(typeof publishedAt==='string'?publishedAt:undefined,o.publishedAtHint);
    return fallbackSuccess({sourceResource:o.canonicalUrl!,canonicalItemUrl:o.canonicalUrl!,originalSourceReference:document.url,text:body,title,publishedAt:date.publishedAt,acquisitionEvidence:{mechanism:'readable_document_http',publicationDate:date,contentCompleteness:'UNKNOWN'}});
   }
   if(document.body.includes('isAccessibleForFree')&&/paywall/i.test(document.body)&&new TextEncoder().encode(document.body).length<=PUBLIC_ARTICLE_HTML_MAX_BYTES&&extractPublicHtml(document.body,document.url).accessRestricted)
    throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_ACCESS_RESTRICTED'});
   if(/schema\.org\/Product\b|CollectionPage|[\"']Product[\"']/i.test(document.body)){
    const page=extractPublicHtml(document.body,document.url);
    if(page.pageKind==='catalogue'){
     const item=helperArticle({...page,status:200,url:o.canonicalUrl,dateMetadata:readArticleDateMetadata(document.body,document.url)},'catalogue_http');
     if(item)return fallbackSuccess(item);
     throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'CATALOGUE_TEXT_UNAVAILABLE'});
    }
   }
   const readablePage=extractPublicHtml(document.body,document.url);
   if(readablePage.accessRestricted)throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_ACCESS_RESTRICTED'});
   if(readablePage.pageKind==='listing')throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'NO_PRIMARY_ARTICLE_TEXT'});
   if(readablePage.pageKind==='article'&&readablePage.body.length>=200){
    const item=helperArticle({...readablePage,status:200,url:o.canonicalUrl,dateMetadata:readArticleDateMetadata(document.body,document.url)},'readable_http');
    if(item)return fallbackSuccess(item);
   }
   // Existing extractor requires an article body and publication metadata, rather than treating 200 as extraction success.
   const metadata=readArticleDateMetadata(document.body,document.url);
   // A regex ending at the first </article> can select a related-story card
   // nested inside a long primary article. Let the DOM extractor handle it.
   const multipleArticles=/<article\b[\s\S]*?<article\b/i.test(document.body);
   let item=(!multipleArticles?parseStructuredHtmlArticle(document.body,document.url,o.canonicalUrl!):undefined)??extractWordpressArticle(document.body,document.url,o.canonicalUrl!);
   if(item){
    const date=resolvePublicationDate(item.publishedAt,o.publishedAtHint,metadata);
    item={...item,publishedAt:date.publishedAt,acquisitionEvidence:{...item.acquisitionEvidence,publicationDate:date,contentCompleteness:'COMPLETE'}};
   }
   if(!item&&options.extractHtml){
    const extracted=await options.extractHtml(document.url,document.body);
    if(extracted&&typeof extracted==='object'&&!Array.isArray(extracted)){
     const r=extracted as Record<string,unknown>,date=resolvePublicationDate(undefined,o.publishedAtHint,metadata,r.extractedDate??r.publishedAt);
     if(typeof r.body==='string'&&r.body.length>=200&&r.body.length<=500_000&&r.pageKind!=='listing')
      item={sourceResource:o.canonicalUrl!,canonicalItemUrl:o.canonicalUrl!,originalSourceReference:document.url,text:r.body,title:typeof r.title==='string'?r.title:undefined,publishedAt:date.publishedAt,acquisitionEvidence:{mechanism:'private_html_extraction',publicationDate:date,contentCompleteness:'UNKNOWN'}};
    }
   }
   let privateHttp=false;
   if(!item){item=await privateArticle();privateHttp=!!item;}
   if(!item) return {stage:'HTTP',status:'INSUFFICIENT'};
   requireReadableArticle(item.text??'');
   return {stage:'HTTP',status:'SUCCESS',result:{items:[item],requestedWindow:request.window,effectiveWindow:request.window,acquisitionAsOf:options.now(),coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'},...(privateHttp?{provenance:{mechanism:'private_public_http'}}:{})}};
  };
  const httpWithFallback=async():Promise<AcquisitionStageOutcome>=>{
   let outcome:AcquisitionStageOutcome|undefined,failure:unknown;
   try {outcome=await http();}
   catch(error){
    const recoverable=error instanceof AcquisitionFailure&&['NETWORK','EXTRACTION_FAILED','BODY_BUDGET_EXCEEDED'].includes(error.code)||
     error instanceof PublicSourceFetchFailure&&error.category==='BODY_BUDGET_EXCEEDED'||
     error instanceof SourceProviderError&&['TRANSIENT','UNAVAILABLE'].includes(error.code)||
     error instanceof Error&&['SOURCE_EXECUTION_TIMEOUT','SOURCE_EXECUTION_UNAVAILABLE'].includes(error.message);
    if(!recoverable||!options.articleFallback)throw error;
    failure=error;
   }
   if(!options.articleFallback||outcome&&!['INSUFFICIENT','STRUCTURAL_FAILURE','CHALLENGE_REQUIRED'].includes(outcome.status))return outcome!;
   const value=await options.articleFallback(claim),provider=value&&typeof value==='object'?(value as Record<string,unknown>).provider:undefined;
   if(value&&provider!=='website_playwright'&&provider!=='website_zyte')throw new AcquisitionFailure('INVALID_RESULT',false);
   const item=helperArticle(value,String(provider));
   if(item)return fallbackSuccess(item);
   if(failure)throw failure;
   return outcome!;
  };
  try {
   const outcome=await new SourceAcquisitionOrchestrator({...options.stages,...options.stagesForClaim?.(claim),http:httpWithFallback}).acquire(request);
   const items=outcome.result?.items;
   if(outcome.status!=='SUCCESS' || !items?.length) {
    const reason=outcome.stopReason;
    throw new AcquisitionFailure(reason==='AUTH_REQUIRED'?'AUTH_REQUIRED':reason==='CHALLENGE_REQUIRED'?'CHALLENGE_REQUIRED':reason==='POLICY_DENIED'?'POLICY_DENIED':reason==='BUDGET_EXHAUSTED'?'BUDGET_EXHAUSTED':reason==='TRANSIENT_FAILURE'?'NETWORK':'EXTRACTION_FAILED',reason==='TRANSIENT_FAILURE');
   }
   if(items.length!==1) throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'EXPECTED_SINGLE_ARTICLE'});
   const item=items[0];
   requireReadableArticle(item.text??'');
   const publicationDate=(item.acquisitionEvidence?.publicationDate as PublicationDate|undefined)??resolvePublicationDate(item.publishedAt,o.publishedAtHint);
   const normalizedUrl=(value:string)=>{const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);return u.href};
   if(!item.canonicalItemUrl || normalizedUrl(item.canonicalItemUrl)!==normalizedUrl(o.canonicalUrl)) throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'CANONICAL_IDENTITY_MISMATCH'});
   const stage=outcome.stages.at(-1)?.stage;
   const browserEvidence=stage==='BROWSER_WORKFLOW' || stage==='WEB_OPERATOR'?Object.fromEntries(['acceptanceId','observationId','rawArtifactRef'].filter(key=>typeof item.acquisitionEvidence?.[key]==='string').map(key=>[key,item.acquisitionEvidence[key]])):undefined;
   const contentKind=item.acquisitionEvidence?.contentKind==='PRODUCT_DETAIL'||item.acquisitionEvidence?.contentKind==='CATALOGUE'?item.acquisitionEvidence.contentKind:undefined;
   const completeness=contentKind||item.acquisitionEvidence?.contentCompleteness==='UNKNOWN'?'UNKNOWN':'COMPLETE';
   const parsed=acquiredSchema.safeParse({...base,title:item.title,body:item.text,language:o.languageHint,publishedAt:publicationDate.publishedAt,canonicalUrl:item.canonicalItemUrl,resolvedUrl:item.originalSourceReference??item.canonicalItemUrl,representation:contentKind?'LISTING_RESULT':'FULL_ARTICLE',contentCompleteness:completeness,acquisitionMethod:outcome.result?.provenance?.mechanism==='website_playwright'?'browser':stage==='STRUCTURED'?'platform_api':stage==='HTTP'?'direct_http':'browser',acquisitionProvider:outcome.result?.provenance?.mechanism,quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:completeness==='COMPLETE'},provenance:{routerVersion:'v1-existing-orchestrator',stages:outcome.stages.map(s=>s.stage),publicationDate,...(contentKind?{contentKind}:{}),...(browserEvidence?{browserEvidence}:{})}});
   if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'ACQUIRED_CONTENT_SCHEMA'});
   return parsed.data;
  } catch(error) {
   if(error instanceof AcquisitionFailure) throw error;
   if(error instanceof SourceProviderError){
    if(error.code==='RESULT_LOST')throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'PAID_ARTICLE_RESPONSE_LOST'});
    if(error.code==='BACKPRESSURE')throw new AcquisitionFailure('BACKPRESSURE',true,{detail:error.diagnostic?.detail==='PROVIDER_REQUEST_IN_FLIGHT'?'ARTICLE_PROVIDER_IN_FLIGHT':'HELPER_CAPACITY_WAIT',retryNotBefore:error.retryNotBefore});
    if(error.code==='RATE_LIMIT')throw new AcquisitionFailure('RATE_LIMIT',true,{detail:'HELPER_RATE_LIMIT',retryNotBefore:error.retryNotBefore});
    if(error.code==='BUDGET_EXCEEDED')throw new AcquisitionFailure('BUDGET_EXHAUSTED',true,{detail:'ARTICLE_PROVIDER_BUDGET'});
    if(error.code==='UNCERTAIN_PAID_SUBMISSION')throw new AcquisitionFailure('UNCERTAIN_PAID_SUBMISSION',false,{detail:'ARTICLE_PROVIDER_OUTCOME_UNCERTAIN'});
    if(error.code==='AUTH_REQUIRED'||error.code==='POLICY_REFUSAL')throw new AcquisitionFailure(error.code==='AUTH_REQUIRED'?'AUTH_REQUIRED':'POLICY_DENIED',false);
    if(error.code==='TRANSIENT'||error.code==='UNAVAILABLE')throw new AcquisitionFailure('NETWORK',true,{detail:'ARTICLE_PROVIDER_UNAVAILABLE'});
   }
   if(error instanceof PublicSourcePolicyError) throw new AcquisitionFailure('POLICY_DENIED',false);
   if(error instanceof PublicSourceFetchFailure) throw new AcquisitionFailure(error.category==='BODY_BUDGET_EXCEEDED'?'BODY_BUDGET_EXCEEDED':'NETWORK',error.category!=='BODY_BUDGET_EXCEEDED');
   throw new HandoffError('TEMPORARY_UNAVAILABLE');
  }
 };
}
function requireReadableArticle(body:string):void {
 const reason=unreadableArticleReason(body);
 if(reason)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:reason});
}
