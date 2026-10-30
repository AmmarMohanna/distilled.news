import type {SourceFamily} from '@distilled/connectors';
import {productConnectorSource} from './connector-source';
import type {Env} from './types';
import {hasUncertainSourcePayment} from './connector-paid-fence';
import {collectorBudgetStatus} from './collector-budget';

export interface SourceAvailability {state:'AVAILABLE'|'UNAVAILABLE';providers:string[];reason?:'UNSUPPORTED_SOURCE'|'PRIVATE_SERVICE_UNAVAILABLE'|'PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'|'CONNECTORS_DISABLED'|'COLLECTION_BLOCKED'|'BUDGET_EXHAUSTED'|'PAID_OPERATION_UNCERTAIN'}
/** Availability is configuration admission, never proof of successful collection. */
export function sourceAvailability(env:Env,family:SourceFamily):SourceAvailability{
 if(env.SOURCE_CONNECTORS_ENABLED!=='true')return {state:'UNAVAILABLE',providers:[],reason:'CONNECTORS_DISABLED'};
 const budgets=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const funded=(id:string,cost:string,key?:string)=>!!key&&typeof budgets[id]==='number'&&Number.isFinite(budgets[id])&&budgets[id]>0&&typeof ceilings[cost]==='number'&&Number.isFinite(ceilings[cost])&&ceilings[cost]>0&&(env.SOURCE_COLLECTION_BUDGET_MODE==='unlimited'||env.SOURCE_PER_PROVIDER_BUDGET_USD!=='0');
 let providers:string[]=[];
 if(family==='rss')providers=['rss_native'];
 if(family==='google_news')providers=['google_rss',...(funded('google_apify','apify',env.APIFY_API_TOKEN)?['google_apify']:[])];
 if(family.startsWith('x_'))providers=[...(funded('x_twitterapi_io','twitterApiIo',env.TWITTERAPI_IO_API_KEY)?['x_twitterapi_io']:[]),...(funded('x_apify','apify',env.APIFY_API_TOKEN)?['x_apify']:[])];
 if(family.startsWith('linkedin_'))providers=funded('linkedin_apify','apify',env.APIFY_API_TOKEN)?['linkedin_apify']:[];
 if(family==='telegram'||family==='website'){
  if(family==='website'&&env.SOURCE_NATIVE_EXECUTION_ENABLED==='true')return {state:'AVAILABLE',providers:['website_http']};
  if(!(env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN&&env.SOURCE_EXECUTION_SERVICE))return {state:'UNAVAILABLE',providers:[],reason:'PRIVATE_SERVICE_UNAVAILABLE'};
  providers=family==='telegram'?['telegram_telethon','telegram_public']:['website_http','website_playwright',...(funded('zyte','zyte',env.ZYTE_API_KEY)?['website_zyte']:[])];
 }
 return providers.length?{state:'AVAILABLE',providers}:{state:'UNAVAILABLE',providers,reason:'PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'};
}

export async function feedSourceAvailability(env:Env,feedId:string){
 const financial=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true',enforceBudgets=env.SOURCE_COLLECTION_BUDGET_MODE!=='unlimited';
 const dailyBudget=!enforceBudgets||env.SOURCE_DAILY_BUDGET_USD===undefined?undefined:await collectorBudgetStatus(env);
 const [globalRows,sourceRows]=financial&&enforceBudgets?await Promise.all([
  env.DB.prepare("SELECT provider_id,limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id IN ('x_twitterapi_io','x_apify','google_apify','linkedin_apify','zyte')").all<{provider_id:string;limit_usd:number;reserved_usd:number}>(),
  env.DB.prepare('SELECT feed_source_id,provider_id,reserved_usd FROM connector_source_provider_budgets WHERE feed_id=?').bind(feedId).all<{feed_source_id:string;provider_id:string;reserved_usd:number}>()
 ]):[{results:[]},{results:[]}];
 const global=new Map(globalRows.results.map(r=>[r.provider_id,r])),reservations=new Map(sourceRows.results.map(r=>[`${r.feed_source_id}:${r.provider_id}`,r.reserved_usd]));
 const limits=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const acquired=await env.DB.prepare(`SELECT j.feed_source_id,json_extract(j.json,'$.state') state,json_extract(j.json,'$.failureCode') failure,json_extract(j.json,'$.failureDetail') detail,COUNT(*) count
  FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id WHERE s.feed_id=? AND json_extract(j.json,'$.kind')='ACQUIRE'
  GROUP BY j.feed_source_id,state,failure,detail`).bind(feedId).all<{feed_source_id:string;state:string;failure:string|null;detail?:string|null;count:number}>();
 const costs:Record<string,string>={x_twitterapi_io:'twitterApiIo',x_apify:'apify',google_apify:'apify',linkedin_apify:'apify',zyte:'zyte'};
 const rows=await env.DB.prepare("SELECT id,title,provider,kind,source_url,input,actor_id FROM sources WHERE briefing_id=? AND collection_owner='connector' AND enabled=1 ORDER BY id").bind(feedId).all<{id:string;title:string;provider:string;kind:string;source_url:string|null;input:string|null;actor_id:string|null}>();
 return Promise.all(rows.results.map(async row=>{
  const source=productConnectorSource(row),availability:SourceAvailability=source?sourceAvailability(env,source.source.family):{state:'UNAVAILABLE',providers:[],reason:'UNSUPPORTED_SOURCE'};
  if(financial&&enforceBudgets&&availability.state==='AVAILABLE'){
   availability.providers=availability.providers.filter(id=>{
    const paidId=id==='website_zyte'?'zyte':id;if(!costs[paidId])return true;
    const grant=global.get(paidId),ceiling=ceilings[costs[paidId]],reserved=reservations.get(`${row.id}:${paidId}`)??0;
    return (dailyBudget?('remainingUsd' in dailyBudget&&dailyBudget.remainingUsd!==undefined&&dailyBudget.remainingUsd>=ceiling):(!grant||grant.reserved_usd+ceiling<=Math.min(grant.limit_usd,limits[paidId]??0)))&&(env.SOURCE_PER_PROVIDER_BUDGET_USD===undefined||reserved+ceiling<=Number(env.SOURCE_PER_PROVIDER_BUDGET_USD));
   });
   if(!availability.providers.length){availability.state='UNAVAILABLE';availability.reason='BUDGET_EXHAUSTED';}
  }
  const table=source?.source.family==='rss'?'connector_rss_poll_jobs':'connector_provider_poll_jobs';
  let paidUncertain=financial&&source&&(source.source.family.startsWith('x_')||source.source.family.startsWith('linkedin_'))?
   await hasUncertainSourcePayment(env.DB,feedId,row.id,source.source.family.startsWith('x_')?['x_twitterapi_io','x_apify']:['linkedin_apify'],true):undefined;
  if(paidUncertain){
   availability.state='UNAVAILABLE';availability.reason='PAID_OPERATION_UNCERTAIN';
  }
  // Scheduling another job is not recovery. Keep the most recent completed
  // outcome visible until a later poll actually finishes or reports a failure.
  const latest=await env.DB.prepare(`SELECT state,last_error,result FROM ${table} WHERE json_extract(request,'$.scope.feedSourceId')=? AND (state IN ('DONE','BLOCKED') OR last_error IS NOT NULL) ORDER BY CASE WHEN state IN ('DONE','BLOCKED') OR last_error NOT IN ('INTAKE_BUSY','BACKPRESSURE') THEN 0 ELSE 1 END,scheduled_at DESC,job_id DESC LIMIT 1`).bind(row.id).first<{state:string;last_error:string|null;result:string|null}>();
  if(financial&&latest?.last_error==='UNCERTAIN_PAID_SUBMISSION'&&paidUncertain===undefined)
   paidUncertain=await hasUncertainSourcePayment(env.DB,feedId,row.id,source?.source.family==='google_news'?['google_apify','zyte']:['zyte'],true);
  const historicalPaidBlock=latest?.last_error==='UNCERTAIN_PAID_SUBMISSION'&&paidUncertain===false;
  if(latest?.state==='BLOCKED'&&!historicalPaidBlock&&availability.state==='AVAILABLE'&&(enforceBudgets||latest.last_error!=='BUDGET_EXCEEDED')){availability.state='UNAVAILABLE';availability.reason=latest.last_error==='UNCERTAIN_PAID_SUBMISSION'?'PAID_OPERATION_UNCERTAIN':'COLLECTION_BLOCKED';}
  const jobs=acquired.results.filter(j=>j.feed_source_id===row.id),acquisition={completed:0,pending:0,failed:0,deferred:0,issues:acquisitionFailureIssues(acquired.results.filter(j=>j.feed_source_id===row.id&&j.state==='FAILED'))};
  for(const job of jobs){if(job.state==='DONE')acquisition.completed+=job.count;else if(job.state==='FAILED')acquisition.failed+=job.count;else if(job.state==='DEFERRED')acquisition.deferred+=job.count;else if(['PENDING','RUNNING'].includes(job.state))acquisition.pending+=job.count;}
  const failed=jobs.filter(j=>j.state==='FAILED');
  const warning=acquisition.failed?failed.every(j=>j.failure==='AUTH_REQUIRED')?'ARTICLE_AUTH_REQUIRED':failed.every(j=>j.failure==='CHALLENGE_REQUIRED')?'ARTICLE_CHALLENGE_REQUIRED':'ARTICLE_ACQUISITION_FAILED':undefined;
  // Only typed errors are public. Never expose URLs, provider response text or
  // claim tokens retained in diagnostic storage.
  const collectionError=historicalPaidBlock?undefined:collectionFailureReason(latest);
  return {sourceId:row.id,title:row.title,...availability,acquisition,...(warning?{warning}:{}),...(collectionError?{collectionError}:{})};
 }));
}
/** Typed cause only. Never expose arbitrary provider errors or payload text. */
export function collectionFailureReason(latest:{last_error:string|null;result:string|null}|null){
 let failure=latest?.last_error?.split(':').at(-1);
 if(latest?.result){try{const result=JSON.parse(latest.result);const saved=result?.coverage?.failureReason!=='NONE'?result?.coverage?.failureReason:undefined;const provider=result?.state==='FETCH_FAILED'?result.attempts?.at(-1)?.failure:undefined;if(!failure||['RETRY_LIMIT','BOUNDED_LIMIT','PROVIDER_REPAIR_REQUIRED'].includes(failure))failure=provider??saved??failure}catch{/* Diagnostics are not user instructions or public prose. */}}
 if(failure==='TRANSIENT_PROVIDER_FAILURE')failure='TRANSIENT';
 return failure&&['TRANSIENT','RATE_LIMIT','AUTH_REQUIRED','CHALLENGE','MALFORMED','UNCERTAIN_PAID_SUBMISSION','INTAKE_BUSY','BACKPRESSURE','RETRY_LIMIT','PAGE_LIMIT','UNBOUNDED_SCOPE_RETIRED','TEMPORARY_UNAVAILABLE','INTERNAL_FAILURE','FETCH_OUTCOME_UNKNOWN'].includes(failure)?failure:undefined;
}

/** Public categories only; stored diagnostics and publisher URLs never leave D1. */
export function acquisitionFailureIssues(rows:{failure:string|null;detail?:string|null;count:number}[]){
 const counts=new Map<string,number>();
 for(const row of rows){
  const reason=row.failure==='AUTH_REQUIRED'?'ACCESS_REQUIRED':row.failure==='CHALLENGE_REQUIRED'?'PUBLISHER_BLOCK':row.failure==='UNCERTAIN_PAID_SUBMISSION'?'PAID_OUTCOME_UNKNOWN':row.failure==='INVALID_RESULT'?'IDENTITY_MISMATCH':row.failure==='EXTRACTION_FAILED'?'NO_READABLE_TEXT':row.failure==='UNSUPPORTED'&&row.detail==='LISTING_PAGE'?'LISTING_PAGE':row.failure==='NETWORK'?'TEMPORARY_FETCH_FAILURE':row.failure==='POLICY_DENIED'?'ACCESS_RESTRICTED':'OTHER';
  counts.set(reason,(counts.get(reason)??0)+row.count);
 }
 return [...counts].map(([reason,count])=>({reason,count}));
}
