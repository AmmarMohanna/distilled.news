import {usableShortArticle} from './short-article-text';
import {verifyArticleRedirect,validArticleRedirect,type ArticleRedirectEvidence} from './article-redirect';
import {sha256} from '@distilled/contracts';
import {extractPublicHtml,PUBLIC_ARTICLE_HTML_MAX_BYTES,readArticleDateMetadata,unreadableArticleReason,requireProviderSuccess,SourceProviderError,type SourceExecutionPort,type ProviderHttpPort} from '@distilled/connectors';
import {AcquisitionFailure,type AcquisitionClaim} from './acquisition';
import type {Env} from '../types';
import {createSourceBackend} from '../source-backend';
import {sameArticleUrl,scholarlyAbstractAlias} from './article-url-identity';

export function runtimeArticleFallback(env:Env,execution:SourceExecutionPort|undefined,authorize:(url:string)=>Promise<void>,dispatch:typeof fetch){
 const budgets=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const enabled=!!env.ZYTE_API_KEY&&typeof budgets.zyte==='number'&&budgets.zyte>0&&typeof ceilings.zyte==='number'&&ceilings.zyte>0;
 // Base64-encoded 15 MB article HTML needs 20 MB plus bounded JSON metadata.
 const backend=enabled?createSourceBackend(env,{paidResponseMaxBytes:22_000_000,authorize:async()=>false,intake:{acceptBatch:async()=>{throw Error('ARTICLE_ONLY')}},
  fetcher:async(value,init)=>{await authorize(String((JSON.parse(String(init?.body)) as {url:string}).url));return dispatch(value,init);}}):undefined;
 return createArticleFallback({execution,authorize,verifyRedirect:(from,to)=>verifyArticleRedirect(from,to,dispatch,authorize),zyte:backend?{http:backend.paidHttp,key:env.ZYTE_API_KEY!,ceilingUsd:ceilings.zyte,
  initialize:()=>backend.paidHttp.configureLimits({zyte:budgets.zyte},env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'),
  hasRetained:async claim=>{
   const o=claim.input.observation,scope={feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId};
   const id=await sha256(JSON.stringify([scope,JSON.stringify(['article-fallback-v1',claim.job.id,o.canonicalUrl])]));
   return !!await env.DB.prepare('SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND feed_id=? AND feed_source_id=? AND status=200 AND payload_ref IS NOT NULL').bind('zyte',id,o.feedId,o.feedSourceId).first();
  }}:undefined});
}

/** Anonymous exact-candidate rendering; never discovery or a new provider run per retry. */
export function createArticleFallback(options:{
 execution?:SourceExecutionPort;
 verifyRedirect?(requested:string,resolved:string):Promise<ArticleRedirectEvidence|undefined>;
 authorize(url:string):Promise<void>;
 zyte?:{http:ProviderHttpPort;key:string;ceilingUsd:number;initialize():Promise<void>;hasRetained?(claim:AcquisitionClaim):Promise<boolean>};
}) {
 return async(claim:AcquisitionClaim):Promise<unknown>=>{
  const o=claim.input.observation,url=o.canonicalUrl!;
  // Ignore only known attribution parameters and trailing-slash aliases.
  const sameUrl=(value:unknown)=>sameArticleUrl(value,url);
  const redirectProof=async(resolved:string)=>{
   const live=await options.verifyRedirect?.(url,resolved);
   if(live)return live;
   // Operator recovery may carry independently verified public HTTP evidence.
   // It is tied to this immutable job, original URL and bounded retry; never
   // infer it from provider output when the Worker cannot observe the redirect.
   const recovery=claim.job.recoveryAuthorizations?.at(-1),proof=recovery?.redirectProof;
   const age=Date.now()-Date.parse(recovery?.authorizedAt??'');
   return recovery&&claim.job.attempts<=recovery.maxAttempts&&age>=0&&age<=86400000&&validArticleRedirect(proof,url,resolved)?proof:undefined;
  };
  const article=(html:string,provider:string,resolved?:unknown,redirectEvidence?:ArticleRedirectEvidence)=>{
   const partial=scholarlyAbstractAlias(url,resolved);
   if(resolved!==undefined&&!sameUrl(resolved)&&!partial&&!redirectEvidence)throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_URL_MISMATCH'});
   if(new TextEncoder().encode(html).length>PUBLIC_ARTICLE_HTML_MAX_BYTES)throw new AcquisitionFailure('BODY_BUDGET_EXCEEDED',false);
   if(/<title[^>]*>\s*(?:just a moment|access denied|client challenge|captcha|verifying you are human)/i.test(html))throw new AcquisitionFailure('CHALLENGE_REQUIRED',false);
   const result=extractPublicHtml(html,partial||redirectEvidence?String(resolved):url);
   if(result.accessRestricted)throw new AcquisitionFailure('AUTH_REQUIRED',false,{detail:'ARTICLE_ACCESS_RESTRICTED'});
   const naturePdf=new URL(url).hostname==='www.nature.com'&&/^\/articles\/[\w-]+$/.test(new URL(url).pathname)&&result.canonicalUrl===url+'.pdf';
   if(!sameUrl(result.canonicalUrl)&&!(partial&&sameArticleUrl(result.canonicalUrl,resolved))&&!naturePdf&&!(redirectEvidence&&sameArticleUrl(result.canonicalUrl,resolved)))throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_CANONICAL_MISMATCH'});
   if(result.pageKind==='listing')throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'NO_PRIMARY_ARTICLE_TEXT'});
   const short=result.pageKind==='article'&&usableShortArticle(result.title,result.body);
   if(!['article','catalogue'].includes(result.pageKind)||result.body.length<(result.pageKind==='catalogue'||short?80:200)||unreadableArticleReason(result.body))return undefined;
   return {...result,canonicalUrl:url,status:200,url,...(partial?{resolvedUrl:resolved,partial:true}:{}),...(short?{partial:true,shortTextEvidence:true,resolvedUrl:resolved??url}:{}),...(redirectEvidence?{resolvedUrl:resolved,redirectEvidence}:{}),dateMetadata:readArticleDateMetadata(html,partial||redirectEvidence?String(resolved):url),provider};
  };
  const status=(value:Record<string,unknown>)=>{
   if(value.status===401||value.authenticationRequired===true||value.error==='AUTH_REQUIRED')throw new AcquisitionFailure('AUTH_REQUIRED',false);
   if(value.status===451||value.error==='POLICY_REFUSAL')throw new AcquisitionFailure('POLICY_DENIED',false);
   if(value.status===429)throw new AcquisitionFailure('RATE_LIMIT',true);
   if(value.status===404||value.status===410)throw new AcquisitionFailure('UNSUPPORTED',false,{detail:'HTTP_NOT_FOUND',httpStatus:value.status});
  };
  const retainedRecovery=claim.job.recoveryAuthorizations?.length&&await options.zyte?.hasRetained?.(claim);
  if(options.execution&&!retainedRecovery){
   await options.authorize(url);
   let value:unknown;
   try {value=await options.execution.execute('playwright',{url,exactCandidateOnly:true},{timeoutMs:60000});}
   catch(error){
    if(error instanceof SourceProviderError&&error.code!=='TRANSIENT'&&error.code!=='UNAVAILABLE')throw error;
    if(!(error instanceof SourceProviderError)&&!(error instanceof Error&&(['SOURCE_EXECUTION_TIMEOUT','SOURCE_EXECUTION_UNAVAILABLE'].includes(error.message)||error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name))))throw error;
   }
   await options.authorize(url);
   if(value&&typeof value==='object'&&!Array.isArray(value)){
    const r=value as Record<string,unknown>;status(r);
    // Older helpers cannot attest final URL; don't promote their browser output.
    if(r.status===200&&sameUrl(r.url)&&typeof r.html==='string'){
     try{const result=article(r.html,'website_playwright',r.url);if(result)return result;}
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
   const redirectEvidence=typeof r.url==='string'&&!sameUrl(r.url)&&!scholarlyAbstractAlias(url,r.url)?await redirectProof(r.url):undefined;
   if(redirectEvidence&&!validArticleRedirect(redirectEvidence,url,String(r.url)))throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_REDIRECT_EVIDENCE_INVALID'});
   if(!sameUrl(r.url)&&!scholarlyAbstractAlias(url,r.url)&&!redirectEvidence)throw new AcquisitionFailure('INVALID_RESULT',false,{detail:'FALLBACK_URL_MISMATCH'});
   if(Array.isArray(r.httpResponseHeaders)&&r.httpResponseHeaders.some(h=>h&&typeof h==='object'&&String((h as Record<string,unknown>).name).toLowerCase()==='www-authenticate'))throw new AcquisitionFailure('AUTH_REQUIRED',false);
   if(r.statusCode===403)throw new AcquisitionFailure('CHALLENGE_REQUIRED',false,{detail:'ZYTE_PUBLISHER_CHALLENGE',httpStatus:403});
   if(r.statusCode!==200)throw new AcquisitionFailure('EXTRACTION_FAILED',false,{detail:'ZYTE_ARTICLE_UNAVAILABLE',httpStatus:typeof r.statusCode==='number'?r.statusCode:undefined});
   let html:string;
   if(rendered){if(typeof r.browserHtml!=='string')throw new AcquisitionFailure('INVALID_RESULT',false);html=r.browserHtml;}
   else{if(typeof r.httpResponseBody!=='string')throw new AcquisitionFailure('INVALID_RESULT',false);try{html=new TextDecoder().decode(Uint8Array.from(atob(r.httpResponseBody),c=>c.charCodeAt(0)));}catch{throw new AcquisitionFailure('INVALID_RESULT',false);}}
   const acquired=article(html,'website_zyte',r.url,redirectEvidence);
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
