import {extractPublicHtml,PUBLIC_ARTICLE_HTML_MAX_BYTES,readArticleDateMetadata,unreadableArticleReason,requireProviderSuccess,SourceProviderError,type SourceExecutionPort,type ProviderHttpPort} from '@distilled/connectors';
import {AcquisitionFailure,type AcquisitionClaim} from './acquisition';
import type {Env} from '../types';
import {createSourceBackend} from '../source-backend';
import {sameArticleUrl,scholarlyAbstractAlias} from './article-url-identity';
import {reviewedRedirectFor,matchesReviewedRedirect} from './reviewed-redirect';

export function runtimeArticleFallback(env:Env,execution:SourceExecutionPort|undefined,authorize:(url:string)=>Promise<void>,dispatch:typeof fetch){
 const budgets=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const enabled=!!env.ZYTE_API_KEY&&typeof budgets.zyte==='number'&&budgets.zyte>0&&typeof ceilings.zyte==='number'&&ceilings.zyte>0;
 // Base64-encoded 15 MB article HTML needs 20 MB plus bounded JSON metadata.
 const backend=enabled?createSourceBackend(env,{paidResponseMaxBytes:22_000_000,authorize:async()=>false,intake:{acceptBatch:async()=>{throw Error('ARTICLE_ONLY')}},
  fetcher:async(value,init)=>{await authorize(String((JSON.parse(String(init?.body)) as {url:string}).url));return dispatch(value,init);}}):undefined;
 return createArticleFallback({execution,authorize,zyte:backend?{http:backend.paidHttp,key:env.ZYTE_API_KEY!,ceilingUsd:ceilings.zyte,
  initialize:()=>backend.paidHttp.configureLimits({zyte:budgets.zyte},env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true')}:undefined});
}

/** Anonymous exact-candidate rendering; never discovery or a new provider run per retry. */
export function createArticleFallback(options:{
 execution?:SourceExecutionPort;
 authorize(url:string):Promise<void>;
 zyte?:{http:ProviderHttpPort;key:string;ceilingUsd:number;initialize():Promise<void>};
}) {
 return async(claim:AcquisitionClaim):Promise<unknown>=>{
  const o=claim.input.observation,url=o.canonicalUrl!;
  const reviewed=reviewedRedirectFor(claim.job,url);
  // Ignore only known attribution parameters and trailing-slash aliases.
  const sameUrl=(value:unknown)=>sameArticleUrl(value,url);
  const article=(html:string,provider:string,resolved?:unknown)=>{
   const partial=scholarlyAbstractAlias(url,resolved);
   const relocated=!!reviewed&&resolved===reviewed.to;
   if(resolved!==undefined&&!sameUrl(resolved)&&!partial&&!relocated)throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_URL_MISMATCH'});
   if(new TextEncoder().encode(html).length>PUBLIC_ARTICLE_HTML_MAX_BYTES)throw new AcquisitionFailure('BODY_BUDGET_EXCEEDED',false);
   if(/<title[^>]*>\s*(?:just a moment|access denied|client challenge|captcha|verifying you are human)/i.test(html))throw new AcquisitionFailure('CHALLENGE_REQUIRED',false);
   const result=extractPublicHtml(html,partial||relocated?String(resolved):url);
   if(relocated&&(!matchesReviewedRedirect(reviewed,resolved,result.title)||!sameArticleUrl(result.canonicalUrl,resolved)||result.pageKind!=='article'))throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'REVIEWED_REDIRECT_IDENTITY_MISMATCH'});
   if(result.accessRestricted)throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_ACCESS_RESTRICTED'});
   const naturePdf=new URL(url).hostname==='www.nature.com'&&/^\/articles\/[\w-]+$/.test(new URL(url).pathname)&&result.canonicalUrl===url+'.pdf';
   if(!sameUrl(result.canonicalUrl)&&!relocated&&!(partial&&sameArticleUrl(result.canonicalUrl,resolved))&&!naturePdf)throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_CANONICAL_MISMATCH'});
   if(result.pageKind==='listing')throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'NO_PRIMARY_ARTICLE_TEXT'});
   if(!['article','catalogue'].includes(result.pageKind)||result.body.length<(result.pageKind==='catalogue'||result.contentCompleteness==='PARTIAL'?80:200)||unreadableArticleReason(result.body))return undefined;
   return {...result,canonicalUrl:url,status:200,url,...(partial?{resolvedUrl:resolved,partial:true}:{}),...(relocated?{resolvedUrl:resolved,publisherRelocation:true}:{}),dateMetadata:readArticleDateMetadata(html,partial||relocated?String(resolved):url),provider};
  };
  const status=(value:Record<string,unknown>)=>{
   if(value.status===401||value.authenticationRequired===true||value.error==='AUTH_REQUIRED')throw new AcquisitionFailure('AUTH_REQUIRED',false);
   if(value.status===451||value.error==='POLICY_REFUSAL')throw new AcquisitionFailure('POLICY_DENIED',false);
   if(value.status===429)throw new AcquisitionFailure('RATE_LIMIT',true);
   if(value.status===404||value.status===410)throw new AcquisitionFailure('UNSUPPORTED',false,{detail:'HTTP_NOT_FOUND',httpStatus:value.status});
  };
  if(options.execution){
   await options.authorize(url);
   const browserUrl=reviewed?.to??url;
   await options.authorize(browserUrl);
   let value:unknown;
   try {value=await options.execution.execute('playwright',{url:browserUrl,exactCandidateOnly:true,...(reviewed?{waitForArticleText:true}:{})},{timeoutMs:25000});}
   catch(error){
    if(error instanceof SourceProviderError&&error.code!=='TRANSIENT'&&error.code!=='UNAVAILABLE')throw error;
    if(!(error instanceof SourceProviderError)&&!(error instanceof Error&&(['SOURCE_EXECUTION_TIMEOUT','SOURCE_EXECUTION_UNAVAILABLE'].includes(error.message)||error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name))))throw error;
   }
   await options.authorize(url);
   await options.authorize(browserUrl);
   if(value&&typeof value==='object'&&!Array.isArray(value)){
    const r=value as Record<string,unknown>;status(r);
    // Older helpers cannot attest final URL; don't promote their browser output.
    if(r.status===200&&(sameUrl(r.url)||!!reviewed&&reviewed.to===r.url)&&typeof r.html==='string'){
     try{const result=article(r.html,'website_playwright',r.url);if(result)return {...result,browserRendered:true};}
     catch(error){if(!(error instanceof AcquisitionFailure)||!['CHALLENGE_REQUIRED','BODY_BUDGET_EXCEEDED'].includes(error.code))throw error;}
    }
   }
  }
  if(!options.zyte)return undefined;
  await options.authorize(url);
  await options.zyte.initialize();
  const request=async(rendered:boolean)=>{
   await options.authorize(url);
   return options.zyte!.http.request({feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId},
    JSON.stringify([rendered?'article-browser-fallback-v1':'article-fallback-v1',claim.job.id,url]),'zyte',options.zyte!.ceilingUsd,'https://api.zyte.com/v1/extract',
    {method:'POST',headers:{authorization:`Basic ${btoa(options.zyte!.key+':')}`,'content-type':'application/json'},body:JSON.stringify(rendered?{url,browserHtml:true}:{url,httpResponseBody:true,httpResponseHeaders:true})});
  };
  const decode=async(result:Awaited<ReturnType<typeof request>>,rendered:boolean)=>{
   await options.authorize(url);requireProviderSuccess(result);
   const r=result.json as Record<string,unknown>;if(!r||typeof r!=='object')throw new AcquisitionFailure('INVALID_RESULT',false);
   status({...r,status:r.statusCode});
   if(r.statusCode===402)throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_PAYMENT_REQUIRED',httpStatus:402});
   if(!sameUrl(r.url)&&!scholarlyAbstractAlias(url,r.url))throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_URL_MISMATCH'});
   if(Array.isArray(r.httpResponseHeaders)&&r.httpResponseHeaders.some(h=>h&&typeof h==='object'&&String((h as Record<string,unknown>).name).toLowerCase()==='www-authenticate'))throw new AcquisitionFailure('AUTH_REQUIRED',false);
   if(r.statusCode===403)throw new AcquisitionFailure('CHALLENGE_REQUIRED',false,{detail:'ZYTE_PUBLISHER_CHALLENGE',httpStatus:403});
   if(r.statusCode!==200)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'ZYTE_ARTICLE_UNAVAILABLE',httpStatus:typeof r.statusCode==='number'?r.statusCode:undefined});
   let html:string;
   if(rendered){if(typeof r.browserHtml!=='string')throw new AcquisitionFailure('INVALID_RESULT',false);html=r.browserHtml;}
   else{if(typeof r.httpResponseBody!=='string')throw new AcquisitionFailure('INVALID_RESULT',false);try{html=new TextDecoder().decode(Uint8Array.from(atob(r.httpResponseBody),c=>c.charCodeAt(0)));}catch{throw new AcquisitionFailure('INVALID_RESULT',false);}}
   const acquired=article(html,'website_zyte',r.url);
   if(!acquired)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:rendered?'ZYTE_RENDERED_TEXT_UNAVAILABLE':'ZYTE_ARTICLE_TEXT_UNAVAILABLE'});
   return {...acquired,browserRendered:rendered};
  };
  // A second, bounded representation has its own durable identity. Never catch
  // a missing/uncertain response or retry authentication, policy or rate limits.
  const first=await request(false);
  if(![500,520].includes(first.status)){
   try{return await decode(first,false)}catch(error){
    if(!(error instanceof AcquisitionFailure)||!['EXTRACTION_FAILED','CHALLENGE_REQUIRED','BODY_BUDGET_EXCEEDED'].includes(error.code)||error.diagnostic?.detail==='NO_PRIMARY_ARTICLE_TEXT')throw error;
   }
  }
  return decode(await request(true),true);
 };
}
