import {recoverExpiredTwitterReads} from './source-fresh-poll-recovery';
import {HandoffError,sha256,type CandidateIntakePort} from '@distilled/contracts';
import {DEFAULT_SOURCE_ORDER,type SourceFetchRequest} from '@distilled/connectors';
import {createSourceBackend} from './source-backend';
import {acceptV1Handoff,v1SourceEnabled} from './v1-downstream-runtime';
import {enrollV1Source} from './v1-intelligence/product';
import type {IntakeScope} from './v1-intake/types';
import type {Env} from './types';
import {productConnectorSource} from './connector-source';
import {canonicalJson} from './v1-intake/canonical';
import {hasUncertainSourcePayment} from './connector-paid-fence';
import {sourceAvailability} from './connector-availability';
import {approvedCollectionBounds,freezeCollectionWindow,initialCollectionStart} from './connector-collection-window';

/** Reads current approved product state; never enrolls or repairs stale queued work. */
export async function authorizeConnectorSource(env:Env,r:SourceFetchRequest):Promise<boolean> {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||!v1SourceEnabled(env,r.scope.feedSourceId)&&!(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&env.PRODUCT_FEEDS_ENABLED==='true'&&env.V1_DOWNSTREAM_ENABLED==='true'))return false;
 // Observe product authorization and its intake fence in one query, rather
 // than making two database round trips at every transport/cache boundary.
 const p=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input,s.actor_id,v.json AS scope_json FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id JOIN v1_intake_scopes v ON v.id=s.id JOIN v1_feeds f ON f.id=b.id AND json_extract(f.json,'$.ownerId')=b.owner_account_id WHERE s.id=? AND s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`).bind(r.scope.feedSourceId,r.scope.feedId).first<{source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null;scope_json:string}>();
 const scope=p?JSON.parse(p.scope_json) as IntakeScope:undefined;
 const approved=p?productConnectorSource(p):undefined;
 const admitted=!!approved && canonicalJson(approved.source)===canonicalJson(r.source) && !!scope?.enabled && !scope.deletedAt && scope.sourceId===r.scope.sourceId && scope.feedId===r.scope.feedId && scope.feedRevision===r.configurationRevision && (r.limit===approved.limit||(['rss','google_news'].includes(r.source.family)&&r.limit===30)||(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&r.source.family==='website'&&r.limit===30)) && (!['telegram','website'].includes(r.source.family)||sourceAvailability(env,r.source.family).state==='AVAILABLE');
 if(!admitted)return false;
 return env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&['x_profile','x_search'].includes(r.source.family)?approvedCollectionBounds(env.DB,r):Object.keys(r.requestedBounds).length===0;
}
export function createConnectorRuntime(env:Env,fetcher?:typeof fetch,unpaidOnly?:true) {
 const authorize=(r:SourceFetchRequest)=>authorizeConnectorSource(env,r);
 const intake:CandidateIntakePort={acceptBatch:request=>acceptV1Handoff(env,request,undefined,unpaidOnly)};
 return createSourceBackend(env,{authorize,intake,fetcher,providerPageLimit:100,intakeForRequest:r=>({acceptBatch:batch=>acceptV1Handoff(env,batch,r.configurationRevision,unpaidOnly)})});
}
/** Aggregate D1 reservations are separate from per-operation ceilings. No setting means no paid dispatch. */
const budgetInitializations=new WeakMap<D1Database,{key:string;ready:Promise<void>}>();
export async function configureConnectorBudgets(env:Env,backend:ReturnType<typeof createConnectorRuntime>) {
 const allowed=['x_twitterapi_io','x_apify','google_apify','linkedin_apify','zyte'] as const;
 let limits:unknown={};
 if(env.SOURCE_PROVIDER_BUDGETS_JSON)limits=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON);
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(key=>!allowed.includes(key as typeof allowed[number])))throw new Error('INVALID_SOURCE_BUDGETS');
 const values=allowed.map(id=>({id,value:(limits as Record<string,unknown>)[id]??0}));
 if(values.some(({value})=>typeof value!=='number'||!Number.isFinite(value)||value<0))throw new Error('INVALID_SOURCE_BUDGETS');
 const budgets=Object.fromEntries(values.map(({id,value})=>[id,value as number])) as Record<typeof allowed[number],number>;
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'){
  const key=JSON.stringify(budgets),prior=budgetInitializations.get(env.DB);
  if(prior?.key===key)await prior.ready;
  else{
   const entry={key,ready:backend.paidHttp.configureLimits(budgets,true)};
   budgetInitializations.set(env.DB,entry);
   try{await entry.ready;}catch(error){if(budgetInitializations.get(env.DB)===entry)budgetInitializations.delete(env.DB);throw error;}
  }
 }else await backend.paidHttp.configureLimits(budgets);
 return budgets;
}
/** A bounded edit pass reads only accepted recent IDs. It never advances the
 * new-message cursor and never interprets a missing recheck as deletion. */
export async function scheduleRecentTelegramRecheck(db:D1Database,
 scheduler:Pick<ReturnType<typeof createConnectorRuntime>['scheduler'],'schedule'>,
 request:SourceFetchRequest,now:Date,intervalMs=86400000):Promise<boolean>{
 if(request.source.family!=='telegram'||!request.source.channelId)return false;
 if(!Number.isSafeInteger(intervalMs)||intervalMs<60000||intervalMs>86400000)throw Error('INVALID_RECHECK_INTERVAL');
 const runId=await sha256(JSON.stringify([request.scope.feedSourceId,request.configurationRevision,'telegram-recheck',Math.floor(now.getTime()/intervalMs)]));
 const expected={...request,runId};
 const alreadyScheduled=async()=>{
  const row=await db.prepare('SELECT request,initial_hash,provider_order FROM connector_provider_poll_jobs WHERE job_id=?').bind(runId).first<{request:string;initial_hash:string;provider_order:string}>();
  if(!row)return false;
  const saved=JSON.parse(row.request) as SourceFetchRequest;
  const {recheckItemKeys}=saved;
  if(row.provider_order!==JSON.stringify(['telegram_telethon'])||
    !recheckItemKeys?.length||recheckItemKeys.length>3||recheckItemKeys.some(key=>!key.startsWith(`telegram:${request.source.channelId}:`)))throw new HandoffError('IDEMPOTENCY_CONFLICT');
  if(row.initial_hash!==await sha256(JSON.stringify([JSON.stringify({...expected,recheckItemKeys}),row.provider_order])))throw new HandoffError('IDEMPOTENCY_CONFLICT');
  return true;
 };
 // Freeze the first accepted ID range for this recheck interval. Later polls
 // must not mutate this durable job; a new interval gets a new identity.
 if(await alreadyScheduled())return false;
 const prefix=`telegram:${request.source.channelId}:`;
 const conflicts=await db.prepare("SELECT DISTINCT item_key AS key FROM v1_jobs WHERE feed_source_id=? AND json_extract(json,'$.kind')='AUTHORITATIVE_RECHECK' AND json_extract(json,'$.state')='PENDING' AND item_key LIKE ? ORDER BY id LIMIT 3").bind(request.scope.feedSourceId,`${prefix}%`).all<{key:string}>();
 const recent=conflicts.results.length?conflicts:await db.prepare(`SELECT source_item_key AS key FROM connector_item_fingerprints
   WHERE feed_id=? AND feed_source_id=? AND source_item_key LIKE ?
   ORDER BY CAST(substr(source_item_key,length(?) + 1) AS INTEGER) DESC LIMIT 3`)
   .bind(request.scope.feedId,request.scope.feedSourceId,`${prefix}%`,prefix).all<{key:string}>();
 if(!recent.results.length)return false;
 const recheck={...expected,
  recheckItemKeys:recent.results.map(row=>row.key)};
 try{await scheduler.schedule(recheck.runId,recheck,now.toISOString(),['telegram_telethon']);}
 catch(error){if(error instanceof HandoffError&&error.code==='IDEMPOTENCY_CONFLICT'&&await alreadyScheduled())return false;throw error;}
 return alreadyScheduled(); // A coalesced older recheck is not a newly queued job.
}
/** Funding changes affect the next window; never rewrite an existing durable
 * poll or manufacture a second paid run inside the current window. */
export async function scheduleProviderWindow(db:D1Database,scheduler:Pick<ReturnType<typeof createConnectorRuntime>['scheduler'],'schedule'>,
 request:SourceFetchRequest,now:Date,order:readonly string[]):Promise<void>{
 const frozenOrder=async()=>{
  const row=await db.prepare('SELECT initial_hash,provider_order FROM connector_provider_poll_jobs WHERE job_id=?').bind(request.runId).first<{initial_hash:string;provider_order:string}>();
  if(!row)return undefined;
  const stored=JSON.parse(row.provider_order) as string[];
  if(!Array.isArray(stored)||stored.length<1||stored.length>3||
    new Set(stored).size!==stored.length||stored.some(id=>!DEFAULT_SOURCE_ORDER[request.source.family].includes(id)))throw new HandoffError('IDEMPOTENCY_CONFLICT');
  if(row.initial_hash!==await sha256(JSON.stringify([JSON.stringify(request),row.provider_order])))throw new HandoffError('IDEMPOTENCY_CONFLICT');
  return stored;
 };
 order=await frozenOrder()??order;
 try{await scheduler.schedule(request.runId,request,now.toISOString(),order);}
 catch(error){
  if(!(error instanceof HandoffError)||error.code!=='IDEMPOTENCY_CONFLICT')throw error;
  const stored=await frozenOrder();if(!stored)throw error;
  await scheduler.schedule(request.runId,request,now.toISOString(),stored);
 }
}
/** Durable scheduler owns continuation and retries; one bounded slice per cron tick. */
export async function runConnectorMaintenance(env:Env,now=new Date(),options:{scheduleOnly?:boolean;skipSchedule?:boolean}={}) {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return;
 const maxJobs=Number(env.SOURCE_POLL_MAX_JOBS_PER_TICK??4),budgetMs=Number(env.SOURCE_POLL_TICK_BUDGET_MS??90000);
 if(!Number.isSafeInteger(maxJobs)||maxJobs<1||maxJobs>20||!Number.isSafeInteger(budgetMs)||budgetMs<1000||budgetMs>600000)throw new Error('INVALID_POLL_RUNNER_BOUNDS');
 const backend=createConnectorRuntime(env);
 const budgets=await configureConnectorBudgets(env,backend);
 const ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}') as Record<string,number>;
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 // Synchronize the entire approved set before freezing any poll revision.
 // Enrolling a later source can advance its Feed revision; scheduling during
 // that first pass left earlier sources with stale requests at handoff.
 // A single source needs no preliminary enrollment pass.
 if(!options.skipSchedule)for(const id of ids.length>1?ids:[]){
  const row=await env.DB.prepare(`SELECT s.provider,s.kind,s.source_url,s.input,s.actor_id,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL AND (?=0 OR s.collection_owner='connector')`).bind(id,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?1:0).first<{provider:string;kind:string;source_url:string;input:string|null;actor_id:string|null;owner_account_id:string}>();
  const approved=row&&productConnectorSource(row);if(!row||!approved)continue;
  if(['telegram','website'].includes(approved.source.family)&&sourceAvailability(env,approved.source.family).state!=='AVAILABLE')continue;
  await enrollV1Source(env.DB,id,row.owner_account_id,now.toISOString());
 }
 const scheduled:{id:string;scheduler:string;sourceId:string}[]=[];
 if(!options.skipSchedule)for(const id of ids) {
  const row=await env.DB.prepare(`SELECT s.briefing_id,s.created_at,s.source_url,s.provider,s.kind,s.input,s.actor_id,s.collection_owner,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL AND (?=0 OR s.collection_owner='connector')`).bind(id,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?1:0).first<{briefing_id:string;created_at:string;source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null;collection_owner:string;owner_account_id:string}>();
  if(!row)continue;
  const approved=productConnectorSource(row);if(!approved)continue;
  // Do not transfer a source away from its working owner until the private
  // execution binding required by this connector is configured.
  if(['telegram','website'].includes(approved.source.family)&&
    sourceAvailability(env,approved.source.family).state!=='AVAILABLE')continue;
  // With no funded provider, skip new paid poll windows instead of accumulating
  // permanently blocked jobs. Existing saved jobs remain available for replay.
  const paidFamily=approved.source.family;
  if((paidFamily==='x_profile'||paidFamily==='x_search')&&
    !((budgets.x_twitterapi_io>0&&ceilings.twitterApiIo>0)||(budgets.x_apify>0&&ceilings.apify>0)))continue;
  if(paidFamily.startsWith('linkedin_')&&!(budgets.linkedin_apify>0&&ceilings.apify>0))continue;
  if(paidFamily.startsWith('x_'))await recoverExpiredTwitterReads(env,row.briefing_id,id,now);
  if((paidFamily.startsWith('x_')||paidFamily.startsWith('linkedin_'))&&await hasUncertainSourcePayment(env.DB,
   row.briefing_id,id,
   paidFamily.startsWith('x_')?['x_twitterapi_io','x_apify']:['linkedin_apify']))continue;
  // Only explicit legacy-mode admission may transfer collection ownership.
  // A queue tick's earlier source list cannot reclaim a later legacy handoff.
  if(row.collection_owner==='legacy')await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND collection_owner='legacy'").bind(id).run();
  const enrolled=await enrollV1Source(env.DB,id,row.owner_account_id,now.toISOString());
  // Every polling window has one stable identity. Repeated cron ticks replay that run;
  // a later window may collect new source observations without reusing an old snapshot.
  const intervalMs=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?Number(env.SOURCE_COLLECTION_INTERVAL_MS??300000):
    ['x_profile','x_search','website'].includes(approved.source.family)?3600000:approved.source.family.startsWith('linkedin_')?21600000:300000;
  if(!Number.isSafeInteger(intervalMs)||intervalMs<60000||intervalMs>86400000)throw new Error('INVALID_COLLECTION_INTERVAL');
  const request:SourceFetchRequest={scope:{feedId:enrolled.scope.feedId,feedSourceId:id,sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:await sha256(JSON.stringify([id,enrolled.scope.feedRevision,Math.floor(now.getTime()/intervalMs)])),source:approved.source,requestedBounds:{},limit:env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&approved.source.family==='website'?30:approved.limit};
  // Resume the frozen identity before deriving any new bounds or policy. The
  // scheduler revalidates its saved request at every execution boundary.
  const table=request.source.family==='rss'?'connector_rss_poll_jobs':'connector_provider_poll_jobs';
  const existing=await env.DB.prepare(`SELECT job_id FROM ${table} WHERE job_id=?`).bind(request.runId).first();
  if(existing){scheduled.push({id:request.runId,scheduler:request.source.family==='rss'?'rss':'provider',sourceId:id});if(request.source.family==='telegram')await scheduleRecentTelegramRecheck(env.DB,backend.scheduler,request,now);continue;}
  if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&['x_profile','x_search'].includes(request.source.family)){
   // Coalescing must happen before freezing a later window: the first scan
   // still owns the source and its captured pages until it settles.
   if(await env.DB.prepare("SELECT 1 FROM connector_provider_poll_jobs WHERE state='PENDING' AND json_extract(request,'$.scope.feedSourceId')=? AND json_extract(request,'$.configurationRevision')=? AND json_type(request,'$.recheckItemKeys') IS NULL").bind(id,request.configurationRevision!).first())continue;
   if(Date.parse(initialCollectionStart(enrolled.feed,row.created_at))>=now.getTime())continue;
   request.requestedBounds=await freezeCollectionWindow(env.DB,enrolled.feed,id,row.created_at,enrolled.scope.feedRevision,request.runId,now);
  }
  if(await authorizeConnectorSource(env,request)) {
   scheduled.push({id:request.runId,scheduler:request.source.family==='rss'?'rss':'provider',sourceId:id});
   // A deployment can change slice sizes within an already scheduled window.
   // Its frozen job owns that identity; resume it rather than replace it or
   // allocate a second provider run for the same collection window.
   if(request.source.family==='rss')await backend.rssScheduler.schedule(request.runId,{scope:request.scope,runId:request.runId,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:request.requestedBounds,maxItems:request.limit,initialLookbackHours:48},now.toISOString());
   else {
    const family=request.source.family;
    const order=family==='telegram'?['telegram_telethon','telegram_public']:
      family==='google_news'?['google_rss',...(budgets.google_apify>0&&ceilings.apify>0?['google_apify']:[])]:
      family==='website'?['website_http','website_playwright',...(budgets.zyte>0&&ceilings.zyte>0?['website_zyte']:[])]:
      family.startsWith('linkedin_')?['linkedin_apify']:
      ['x_twitterapi_io','x_apify'].filter(provider=>provider==='x_twitterapi_io'?budgets.x_twitterapi_io>0&&ceilings.twitterApiIo>0:budgets.x_apify>0&&ceilings.apify>0);
    await scheduleProviderWindow(env.DB,backend.scheduler,request,now,order);
    if(family==='telegram')await scheduleRecentTelegramRecheck(env.DB,backend.scheduler,request,now,env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?intervalMs:86400000);
   }
  }
 }
 if(options.scheduleOnly)return {scheduled,outcomes:[],durationMs:0};
 const started=Date.now();let rssIdle=false,providerIdle=false;
 // Funded current windows must not wait behind years of unstarted polling
 // jobs with an obsolete provider order. One minute in four keeps oldest-first
 // service; continuation and paid identities remain owned by their frozen job.
 const preferCurrent=env.SOURCE_DAILY_BUDGET_USD!==undefined&&now.getUTCMinutes()%4!==0;
 const preferredRss=preferCurrent?scheduled.filter(job=>job.scheduler==='rss').map(job=>job.id):undefined;
 const preferredProviders=preferCurrent?scheduled.filter(job=>job.scheduler==='provider').map(job=>job.id):undefined;
 const outcomes:{scheduler:string;state:string}[]=[];
 for(let index=0;index<maxJobs&&(index===0||Date.now()-started<budgetMs);index++){
  if(!rssIdle){const state=await backend.rssScheduler.runOne(120000,preferredRss);rssIdle=state==='IDLE';outcomes.push({scheduler:'rss',state});}
  if(!providerIdle&&(index===0||Date.now()-started<budgetMs)){const state=await backend.scheduler.runOne(300000,preferredProviders);providerIdle=state==='IDLE';outcomes.push({scheduler:'provider',state});}
  if(rssIdle&&providerIdle)break;
 }
 return {scheduled,outcomes,durationMs:Date.now()-started};
}
