import {HandoffError,sha256,type CandidateIntakePort} from '@distilled/contracts';
import {DEFAULT_SOURCE_ORDER,type SourceFetchRequest} from '@distilled/connectors';
import {createSourceBackend} from './source-backend';
import {acceptV1Handoff,v1SourceEnabled} from './v1-downstream-runtime';
import {enrollV1Source} from './v1-intelligence/product';
import {V1IntakeStore} from './v1-intake/store';
import type {Env} from './types';
import {productConnectorSource} from './connector-source';
import {canonicalJson} from './v1-intake/canonical';

/** Reads current approved product state; never enrolls or repairs stale queued work. */
export async function authorizeConnectorSource(env:Env,r:SourceFetchRequest):Promise<boolean> {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||!v1SourceEnabled(env,r.scope.feedSourceId))return false;
 const p=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input,s.actor_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`).bind(r.scope.feedSourceId,r.scope.feedId).first<{source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null}>();
 const scope=await new V1IntakeStore(env.DB).getScope(r.scope.feedSourceId);
 const approved=p?productConnectorSource(p):undefined;
 return !!approved && canonicalJson(approved.source)===canonicalJson(r.source) && !!scope?.enabled && !scope.deletedAt && scope.sourceId===r.scope.sourceId && scope.feedId===r.scope.feedId && scope.feedRevision===r.configurationRevision && r.limit===approved.limit && Object.keys(r.requestedBounds).length===0 && (!['telegram','website'].includes(r.source.family)||!!env.SOURCE_EXECUTION_TOKEN&&!!env.SOURCE_EXECUTION_SERVICE);
}
export function createConnectorRuntime(env:Env,fetcher?:typeof fetch) {
 const authorize=(r:SourceFetchRequest)=>authorizeConnectorSource(env,r);
 const intake:CandidateIntakePort={acceptBatch:request=>acceptV1Handoff(env,request)};
 return createSourceBackend(env,{authorize,intake,fetcher,providerPageLimit:10,intakeForRequest:r=>({acceptBatch:batch=>acceptV1Handoff(env,batch,r.configurationRevision)})});
}
/** Aggregate D1 reservations are separate from per-operation ceilings. No setting means no paid dispatch. */
export async function configureConnectorBudgets(env:Env,backend:ReturnType<typeof createConnectorRuntime>) {
 const allowed=['x_twitterapi_io','x_apify','google_apify','linkedin_apify','zyte'] as const;
 let limits:unknown={};
 if(env.SOURCE_PROVIDER_BUDGETS_JSON)limits=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON);
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(key=>!allowed.includes(key as typeof allowed[number])))throw new Error('INVALID_SOURCE_BUDGETS');
 const values=allowed.map(id=>({id,value:(limits as Record<string,unknown>)[id]??0}));
 if(values.some(({value})=>typeof value!=='number'||!Number.isFinite(value)||value<0))throw new Error('INVALID_SOURCE_BUDGETS');
 for(const {id,value} of values)await backend.paidHttp.configureLimit(id,value as number);
 return Object.fromEntries(values.map(({id,value})=>[id,value as number])) as Record<typeof allowed[number],number>;
}
/** A bounded edit pass reads only accepted recent IDs. It never advances the
 * new-message cursor and never interprets a missing recheck as deletion. */
export async function scheduleRecentTelegramRecheck(db:D1Database,
 scheduler:Pick<ReturnType<typeof createConnectorRuntime>['scheduler'],'schedule'>,
 request:SourceFetchRequest,now:Date):Promise<boolean>{
 if(request.source.family!=='telegram'||!request.source.channelId)return false;
 const runId=await sha256(JSON.stringify([request.scope.feedSourceId,request.configurationRevision,'telegram-recheck',Math.floor(now.getTime()/86400000)]));
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
 // Freeze the first accepted ID range for the day. A later poll may discover
 // newer IDs, but must not mutate this durable job or start another daily pass.
 if(await alreadyScheduled())return false;
 const prefix=`telegram:${request.source.channelId}:`;
 const recent=await db.prepare(`SELECT source_item_key AS key FROM connector_item_fingerprints
   WHERE feed_id=? AND feed_source_id=? AND source_item_key LIKE ?
   ORDER BY CAST(substr(source_item_key,length(?) + 1) AS INTEGER) DESC LIMIT 3`)
   .bind(request.scope.feedId,request.scope.feedSourceId,`${prefix}%`,prefix).all<{key:string}>();
 if(!recent.results.length)return false;
 const recheck={...expected,
  recheckItemKeys:recent.results.map(row=>row.key)};
 try{await scheduler.schedule(recheck.runId,recheck,now.toISOString(),['telegram_telethon']);}
 catch(error){if(error instanceof HandoffError&&error.code==='IDEMPOTENCY_CONFLICT'&&await alreadyScheduled())return false;throw error;}
 return true;
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
export async function runConnectorMaintenance(env:Env,now=new Date()) {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return;
 const maxJobs=Number(env.SOURCE_POLL_MAX_JOBS_PER_TICK??4),budgetMs=Number(env.SOURCE_POLL_TICK_BUDGET_MS??90000);
 if(!Number.isSafeInteger(maxJobs)||maxJobs<1||maxJobs>20||!Number.isSafeInteger(budgetMs)||budgetMs<1000||budgetMs>600000)throw new Error('INVALID_POLL_RUNNER_BOUNDS');
 const backend=createConnectorRuntime(env);
 const budgets=await configureConnectorBudgets(env,backend);
 const ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}') as Record<string,number>;
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(ids.length>10)throw new HandoffError('SCOPE_DENIED');
 for(const id of ids) {
  const row=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input,s.actor_id,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL`).bind(id).first<{source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null;owner_account_id:string}>();
  if(!row)continue;
  const approved=productConnectorSource(row);if(!approved)continue;
  // Do not transfer a source away from its working owner until the private
  // execution binding required by this connector is configured.
  if(['telegram','website'].includes(approved.source.family)&&
    !(env.SOURCE_EXECUTION_URL&&env.SOURCE_EXECUTION_TOKEN&&env.SOURCE_EXECUTION_SERVICE))continue;
  // With no funded provider, skip new paid poll windows instead of accumulating
  // permanently blocked jobs. Existing saved jobs remain available for replay.
  const paidFamily=approved.source.family;
  if((paidFamily==='x_profile'||paidFamily==='x_search')&&
    !((budgets.x_twitterapi_io>0&&ceilings.twitterApiIo>0)||(budgets.x_apify>0&&ceilings.apify>0)))continue;
  if(paidFamily.startsWith('linkedin_')&&!(budgets.linkedin_apify>0&&ceilings.apify>0))continue;
  // Explicit allowlist admission persists exclusive ownership before connector execution.
  await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND collection_owner='legacy'").bind(id).run();
  const enrolled=await enrollV1Source(env.DB,id,row.owner_account_id,now.toISOString());
  // Every polling window has one stable identity. Repeated cron ticks replay that run;
  // a later window may collect new source observations without reusing an old snapshot.
  const intervalMs=['x_profile','x_search','website'].includes(approved.source.family)?3600000:
    approved.source.family.startsWith('linkedin_')?21600000:300000;
  const request:SourceFetchRequest={scope:{feedId:enrolled.scope.feedId,feedSourceId:id,sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:await sha256(JSON.stringify([id,enrolled.scope.feedRevision,Math.floor(now.getTime()/intervalMs)])),source:approved.source,requestedBounds:{},limit:approved.limit};
  if(await authorizeConnectorSource(env,request)) {
   if(request.source.family==='rss')await backend.rssScheduler.schedule(request.runId,{scope:request.scope,runId:request.runId,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:request.requestedBounds,maxItems:request.limit},now.toISOString());
   else {
    const family=request.source.family;
    const order=family==='telegram'?['telegram_telethon','telegram_public']:
      family==='google_news'?['google_rss',...(budgets.google_apify>0&&ceilings.apify>0?['google_apify']:[])]:
      family==='website'?['website_http','website_playwright',...(budgets.zyte>0&&ceilings.zyte>0?['website_zyte']:[])]:
      family.startsWith('linkedin_')?['linkedin_apify']:
      ['x_twitterapi_io','x_apify'].filter(provider=>provider==='x_twitterapi_io'?budgets.x_twitterapi_io>0&&ceilings.twitterApiIo>0:budgets.x_apify>0&&ceilings.apify>0);
    await scheduleProviderWindow(env.DB,backend.scheduler,request,now,order);
    if(family==='telegram')await scheduleRecentTelegramRecheck(env.DB,backend.scheduler,request,now);
   }
  }
 }
 const started=Date.now();let rssIdle=false,providerIdle=false;
 const outcomes:{scheduler:string;state:string}[]=[];
 for(let index=0;index<maxJobs&&(index===0||Date.now()-started<budgetMs);index++){
  if(!rssIdle){const state=await backend.rssScheduler.runOne();rssIdle=state==='IDLE';outcomes.push({scheduler:'rss',state});}
  if(!providerIdle&&(index===0||Date.now()-started<budgetMs)){const state=await backend.scheduler.runOne();providerIdle=state==='IDLE';outcomes.push({scheduler:'provider',state});}
  if(rssIdle&&providerIdle)break;
 }
 return {outcomes,durationMs:Date.now()-started};
}
