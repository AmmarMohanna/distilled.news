import {HandoffError,sha256,type CandidateIntakePort} from '@distilled/contracts';
import type {SourceFetchRequest} from '@distilled/connectors';
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
 return !!approved && canonicalJson(approved.source)===canonicalJson(r.source) && !!scope?.enabled && !scope.deletedAt && scope.sourceId===r.scope.sourceId && scope.feedId===r.scope.feedId && scope.feedRevision===r.configurationRevision && r.limit===approved.limit && Object.keys(r.requestedBounds).length===0 && (r.source.family!=='telegram'||!!env.SOURCE_EXECUTION_TOKEN&&!!env.SOURCE_EXECUTION_SERVICE);
}
export function createConnectorRuntime(env:Env,fetcher?:typeof fetch) {
 const authorize=(r:SourceFetchRequest)=>authorizeConnectorSource(env,r);
 const intake:CandidateIntakePort={acceptBatch:request=>acceptV1Handoff(env,request)};
 return createSourceBackend(env,{authorize,intake,fetcher,providerPageLimit:1,intakeForRequest:r=>({acceptBatch:batch=>acceptV1Handoff(env,batch,r.configurationRevision)})});
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
/** Durable scheduler owns continuation and retries; one bounded slice per cron tick. */
export async function runConnectorMaintenance(env:Env,now=new Date()) {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return;
 const backend=createConnectorRuntime(env);
 const budgets=await configureConnectorBudgets(env,backend);
 const ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}') as Record<string,number>;
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(ids.length>10)throw new HandoffError('SCOPE_DENIED');
 for(const id of ids) {
  const row=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input,s.actor_id,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL`).bind(id).first<{source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null;owner_account_id:string}>();
  if(!row)continue;
  const approved=productConnectorSource(row);if(!approved)continue;
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
  const intervalMs=['x_profile','x_search'].includes(approved.source.family)?3600000:
    approved.source.family.startsWith('linkedin_')?21600000:300000;
  const request:SourceFetchRequest={scope:{feedId:enrolled.scope.feedId,feedSourceId:id,sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:await sha256(JSON.stringify([id,enrolled.scope.feedRevision,Math.floor(now.getTime()/intervalMs)])),source:approved.source,requestedBounds:{},limit:approved.limit};
  if(await authorizeConnectorSource(env,request)) {
   if(request.source.family==='rss')await backend.rssScheduler.schedule(request.runId,{scope:request.scope,runId:request.runId,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:request.requestedBounds,maxItems:request.limit},now.toISOString());
   else await backend.scheduler.schedule(request.runId,request,now.toISOString(),request.source.family==='telegram'?['telegram_telethon','telegram_public']:request.source.family==='google_news'?['google_rss','google_apify']:request.source.family.startsWith('linkedin_')?['linkedin_apify']:['x_twitterapi_io','x_apify']);
  }
 }
 await backend.rssScheduler.runOne();
 await backend.scheduler.runOne();
}
