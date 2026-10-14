import type {SourceFamily} from '@distilled/connectors';
import {productConnectorSource} from './connector-source';
import type {Env} from './types';

export interface SourceAvailability {state:'AVAILABLE'|'UNAVAILABLE';providers:string[];reason?:'UNSUPPORTED_SOURCE'|'PRIVATE_SERVICE_UNAVAILABLE'|'PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'|'CONNECTORS_DISABLED'|'COLLECTION_BLOCKED'|'BUDGET_EXHAUSTED'}
/** Availability is configuration admission, never proof of successful collection. */
export function sourceAvailability(env:Env,family:SourceFamily):SourceAvailability{
 if(env.SOURCE_CONNECTORS_ENABLED!=='true')return {state:'UNAVAILABLE',providers:[],reason:'CONNECTORS_DISABLED'};
 const budgets=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const funded=(id:string,cost:string,key?:string)=>!!key&&typeof budgets[id]==='number'&&Number.isFinite(budgets[id])&&budgets[id]>0&&typeof ceilings[cost]==='number'&&Number.isFinite(ceilings[cost])&&ceilings[cost]>0&&env.SOURCE_PER_PROVIDER_BUDGET_USD!=='0';
 let providers:string[]=[];
 if(family==='rss')providers=['rss_native'];
 if(family==='google_news')providers=['google_rss',...(funded('google_apify','apify',env.APIFY_API_TOKEN)?['google_apify']:[])];
 if(family.startsWith('x_'))providers=[...(funded('x_twitterapi_io','twitterApiIo',env.TWITTERAPI_IO_API_KEY)?['x_twitterapi_io']:[]),...(funded('x_apify','apify',env.APIFY_API_TOKEN)?['x_apify']:[])];
 if(family.startsWith('linkedin_'))providers=funded('linkedin_apify','apify',env.APIFY_API_TOKEN)?['linkedin_apify']:[];
 if(family==='telegram'||family==='website'){
  if(!(env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN&&env.SOURCE_EXECUTION_SERVICE))return {state:'UNAVAILABLE',providers:[],reason:'PRIVATE_SERVICE_UNAVAILABLE'};
  providers=family==='telegram'?['telegram_telethon','telegram_public']:['website_http','website_playwright',...(funded('zyte','zyte',env.ZYTE_API_KEY)?['website_zyte']:[])];
 }
 return providers.length?{state:'AVAILABLE',providers}:{state:'UNAVAILABLE',providers,reason:'PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'};
}

export async function feedSourceAvailability(env:Env,feedId:string){
 const financial=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true';
 const [globalRows,sourceRows]=financial?await Promise.all([
  env.DB.prepare("SELECT provider_id,limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id IN ('x_twitterapi_io','x_apify','google_apify','linkedin_apify','zyte')").all<{provider_id:string;limit_usd:number;reserved_usd:number}>(),
  env.DB.prepare('SELECT feed_source_id,provider_id,reserved_usd FROM connector_source_provider_budgets WHERE feed_id=?').bind(feedId).all<{feed_source_id:string;provider_id:string;reserved_usd:number}>()
 ]):[{results:[]},{results:[]}];
 const global=new Map(globalRows.results.map(r=>[r.provider_id,r])),reservations=new Map(sourceRows.results.map(r=>[`${r.feed_source_id}:${r.provider_id}`,r.reserved_usd]));
 const limits=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const costs:Record<string,string>={x_twitterapi_io:'twitterApiIo',x_apify:'apify',google_apify:'apify',linkedin_apify:'apify',zyte:'zyte'};
 const rows=await env.DB.prepare("SELECT id,title,provider,kind,source_url,input,actor_id FROM sources WHERE briefing_id=? AND collection_owner='connector' AND enabled=1 ORDER BY id").bind(feedId).all<{id:string;title:string;provider:string;kind:string;source_url:string|null;input:string|null;actor_id:string|null}>();
 return Promise.all(rows.results.map(async row=>{
  const source=productConnectorSource(row),availability:SourceAvailability=source?sourceAvailability(env,source.source.family):{state:'UNAVAILABLE',providers:[],reason:'UNSUPPORTED_SOURCE'};
  if(financial&&availability.state==='AVAILABLE'){
   availability.providers=availability.providers.filter(id=>{
    const paidId=id==='website_zyte'?'zyte':id;if(!costs[paidId])return true;
    const grant=global.get(paidId),ceiling=ceilings[costs[paidId]],reserved=reservations.get(`${row.id}:${paidId}`)??0;
    return (!grant||grant.reserved_usd+ceiling<=Math.min(grant.limit_usd,limits[paidId]??0))&&(env.SOURCE_PER_PROVIDER_BUDGET_USD===undefined||reserved+ceiling<=Number(env.SOURCE_PER_PROVIDER_BUDGET_USD));
   });
   if(!availability.providers.length){availability.state='UNAVAILABLE';availability.reason='BUDGET_EXHAUSTED';}
  }
  const table=source?.source.family==='rss'?'connector_rss_poll_jobs':'connector_provider_poll_jobs';
  const latest=await env.DB.prepare(`SELECT state FROM ${table} WHERE json_extract(request,'$.scope.feedSourceId')=? ORDER BY due_at DESC LIMIT 1`).bind(row.id).first<{state:string}>();
  if(latest?.state==='BLOCKED'&&availability.state==='AVAILABLE'){availability.state='UNAVAILABLE';availability.reason='COLLECTION_BLOCKED';}
  return {sourceId:row.id,title:row.title,...availability};
 }));
}
