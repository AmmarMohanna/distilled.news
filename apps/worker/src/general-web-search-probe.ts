import {DurableProviderHttp,R2SourcePayloadStore,sourceSqlFromD1,type ProviderHttpPort} from '@distilled/connectors';

// One approved experiment, not a configurable production paid-search endpoint.
export const GENERAL_WEB_PROBE_ID='general-web-search-2026-11-13-v1';
export const GENERAL_WEB_PROBE_PROVIDER='web_search_trial_20261113';
export const GENERAL_WEB_PROBE_QUERIES=['ammar mohanna','georges khabbaz theater','solar panel efficiency news'] as const;

export async function generalWebSearchProbe(http:ProviderHttpPort,token:string){
 const url=new URL('https://api.apify.com/v2/actors/apify~google-search-scraper/run-sync-get-dataset-items');
 for(const [key,value] of Object.entries({build:'0.0.489',maxTotalChargeUsd:'0.10',timeout:'50',restartOnError:'false',format:'json',limit:'3'}))url.searchParams.set(key,value);
 const response=await http.request({feedId:'verification:'+GENERAL_WEB_PROBE_ID,feedSourceId:'verification:'+GENERAL_WEB_PROBE_ID,sourceId:GENERAL_WEB_PROBE_ID},GENERAL_WEB_PROBE_ID,GENERAL_WEB_PROBE_PROVIDER,0.10,url.href,{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({queries:GENERAL_WEB_PROBE_QUERIES.join('\n'),maxPagesPerQuery:1,
   aiOverview:{scrapeFullAiOverview:false},aiModeSearch:{enableAiMode:false},geminiSearch:{enableGemini:false},
   perplexitySearch:{enablePerplexity:false,returnImages:false,returnRelatedQuestions:false},chatGptSearch:{enableChatGpt:false},copilotSearch:{enableCopilot:false},
   maximumLeadsEnrichmentRecords:0,verifyLeadsEnrichmentEmails:false,websiteContentScraper:{enable:false},
   focusOnPaidAds:false,saveHtml:false,saveHtmlToKeyValueStore:false,includeIcons:false})
 });
 // Raw receipt remains immutable in R2; expose only bounded organic discovery data.
 const pages=Array.isArray(response.json)?response.json:[];
 return {probeId:GENERAL_WEB_PROBE_ID,providerHttpStatus:response.status,reservedCeilingUsd:0.10,
  pages:pages.slice(0,3).map(page=>({query:page.searchQuery?.term??page.searchQuery?.query??null,
   results:(Array.isArray(page.organicResults)?page.organicResults:[]).slice(0,20).flatMap((item:Record<string,unknown>)=>{
    try{const target=new URL(String(item.url));if(target.protocol!=='https:'&&target.protocol!=='http:')return [];
     return [{url:target.href,title:String(item.title??'').slice(0,500),description:String(item.description??'').slice(0,1500)}];}catch{return [];}
   })}))};
}

export async function runGeneralWebSearchProbe(env:{DB:D1Database;RAW_ARCHIVE:R2Bucket;APIFY_API_TOKEN?:string},dispatch:typeof fetch){
 if(!env.APIFY_API_TOKEN)throw Error('APIFY_NOT_CONFIGURED');
 const http=new DurableProviderHttp(sourceSqlFromD1(env.DB),new R2SourcePayloadStore(env.RAW_ARCHIVE),dispatch,4_000_000,60_000,0.10,{[GENERAL_WEB_PROBE_PROVIDER]:0.10},undefined,{},true);
 await http.configureLimit(GENERAL_WEB_PROBE_PROVIDER,0.10);
 return generalWebSearchProbe(http,env.APIFY_API_TOKEN);
}
