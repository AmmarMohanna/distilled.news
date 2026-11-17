import {DurableProviderHttp,R2SourcePayloadStore,sourceSqlFromD1,type ProviderHttpPort} from '@distilled/connectors';

// One approved experiment, not a configurable production paid-search endpoint.
export const GENERAL_WEB_PROBE_ID='general-web-search-2026-11-13-v1';
export const GENERAL_WEB_PROBE_PROVIDER='web_search_trial_20261113';
export const GENERAL_WEB_RETRY_ID='general-web-search-2026-11-13-retry1';
const GENERAL_WEB_RETRY_PROVIDER='web_search_trial_20261113_retry1';
export const GENERAL_WEB_MINIMUM_BUDGET_ID='general-web-search-2026-11-13-retry2';
type ProbeRetry=boolean|'minimum-budget';
function probeConfig(retry:ProbeRetry){
 return retry==='minimum-budget'?{id:GENERAL_WEB_MINIMUM_BUDGET_ID,provider:'web_search_trial_20261113_retry2',ceiling:0.50}:
  retry?{id:GENERAL_WEB_RETRY_ID,provider:GENERAL_WEB_RETRY_PROVIDER,ceiling:0.05}:{id:GENERAL_WEB_PROBE_ID,provider:GENERAL_WEB_PROBE_PROVIDER,ceiling:0.10};
}
export const GENERAL_WEB_PROBE_QUERIES=['ammar mohanna','georges khabbaz theater','solar panel efficiency news'] as const;

export async function generalWebSearchProbe(http:ProviderHttpPort,token:string,retry:ProbeRetry=false){
 const {id,provider,ceiling}=probeConfig(retry);
 const url=new URL('https://api.apify.com/v2/actors/apify~google-search-scraper/run-sync-get-dataset-items');
 for(const [key,value] of Object.entries({build:'0.0.489',maxTotalChargeUsd:ceiling.toFixed(2),timeout:'50',restartOnError:'false',format:'json',limit:'3'}))url.searchParams.set(key,value);
 const response=await http.request({feedId:'verification:'+id,feedSourceId:'verification:'+id,sourceId:id},id,provider,ceiling,url.href,{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({queries:GENERAL_WEB_PROBE_QUERIES.join('\n'),maxPagesPerQuery:1,
   aiOverview:{scrapeFullAiOverview:false},aiModeSearch:{enableAiMode:false},geminiSearch:{enableGemini:false},
   perplexitySearch:{enablePerplexity:false,returnImages:false,returnRelatedQuestions:false},chatGptSearch:{enableChatGpt:false},copilotSearch:{enableCopilot:false},
   maximumLeadsEnrichmentRecords:0,verifyLeadsEnrichmentEmails:false,websiteContentScraper:{enable:false},
   focusOnPaidAds:false,saveHtml:false,saveHtmlToKeyValueStore:false,includeIcons:false})
 });
 // Raw receipt remains immutable in R2; expose only bounded organic discovery data.
 const pages=Array.isArray(response.json)?response.json:[];
 return {probeId:id,providerHttpStatus:response.status,reservedCeilingUsd:ceiling,
  pages:pages.slice(0,3).map(page=>({query:page.searchQuery?.term??page.searchQuery?.query??null,
   results:(Array.isArray(page.organicResults)?page.organicResults:[]).slice(0,20).flatMap((item:Record<string,unknown>)=>{
    try{const target=new URL(String(item.url));if(target.protocol!=='https:'&&target.protocol!=='http:')return [];
     return [{url:target.href,title:String(item.title??'').slice(0,500),description:String(item.description??'').slice(0,1500)}];}catch{return [];}
   })}))};
}

export async function runGeneralWebSearchProbe(env:{DB:D1Database;RAW_ARCHIVE:R2Bucket;APIFY_API_TOKEN?:string},dispatch:typeof fetch,retry:ProbeRetry=false){
 if(!env.APIFY_API_TOKEN)throw Error('APIFY_NOT_CONFIGURED');
 if(retry){
  const prior=await env.DB.prepare('SELECT status,payload_ref FROM connector_provider_operations WHERE provider_id=? LIMIT 2').bind(GENERAL_WEB_PROBE_PROVIDER).all<{status:number;payload_ref:string|null}>();
  if(prior.results.length!==1||prior.results[0].status!==403||!prior.results[0].payload_ref)throw Error('PRIOR_REJECTION_NOT_CONFIRMED');
  const receipt=await env.RAW_ARCHIVE.get(prior.results[0].payload_ref);const body=await receipt?.json<{error?:{type?:string;message?:string}}>();
  if(body?.error?.type!=='platform-feature-disabled'||!body.error.message?.includes('monthly usage limit'))throw Error('PRIOR_REJECTION_NOT_CONFIRMED');
 }
 if(retry==='minimum-budget'){
  const prior=await env.DB.prepare('SELECT status,payload_ref FROM connector_provider_operations WHERE provider_id=? LIMIT 2').bind(GENERAL_WEB_RETRY_PROVIDER).all<{status:number;payload_ref:string|null}>();
  if(prior.results.length!==1||prior.results[0].status!==402||!prior.results[0].payload_ref)throw Error('PRIOR_REJECTION_NOT_CONFIRMED');
  const receipt=await env.RAW_ARCHIVE.get(prior.results[0].payload_ref);const body=await receipt?.json<{error?:{type?:string}}>();
  if(body?.error?.type!=='not-enough-usage-to-run-paid-actor')throw Error('PRIOR_REJECTION_NOT_CONFIRMED');
 }
 const {provider,ceiling}=probeConfig(retry);
 const http=new DurableProviderHttp(sourceSqlFromD1(env.DB),new R2SourcePayloadStore(env.RAW_ARCHIVE),dispatch,4_000_000,60_000,ceiling,{[provider]:ceiling},undefined,{},true);
 await http.configureLimit(provider,ceiling);
 return generalWebSearchProbe(http,env.APIFY_API_TOKEN,retry);
}
