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
 const p=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`).bind(r.scope.feedSourceId,r.scope.feedId).first<{source_url:string;provider:string;kind:string;input:string|null}>();
 const scope=await new V1IntakeStore(env.DB).getScope(r.scope.feedSourceId);
 const approved=p?productConnectorSource(p):undefined;
 return !!approved && canonicalJson(approved.source)===canonicalJson(r.source) && !!scope?.enabled && !scope.deletedAt && scope.sourceId===r.scope.sourceId && scope.feedId===r.scope.feedId && scope.feedRevision===r.configurationRevision && r.limit===approved.limit && Object.keys(r.requestedBounds).length===0 && (r.source.family!=='telegram'||!!env.SOURCE_EXECUTION_TOKEN&&!!env.SOURCE_EXECUTION_SERVICE);
}
export function createConnectorRuntime(env:Env,fetcher?:typeof fetch) {
 const authorize=(r:SourceFetchRequest)=>authorizeConnectorSource(env,r);
 const intake:CandidateIntakePort={acceptBatch:request=>acceptV1Handoff(env,request)};
 return createSourceBackend(env,{authorize,intake,fetcher,providerPageLimit:1,intakeForRequest:r=>({acceptBatch:batch=>acceptV1Handoff(env,batch,r.configurationRevision)})});
}
/** Durable scheduler owns continuation and retries; one bounded slice per cron tick. */
export async function runConnectorMaintenance(env:Env,now=new Date()) {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return;
 const backend=createConnectorRuntime(env);
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(ids.length>10)throw new HandoffError('SCOPE_DENIED');
 for(const id of ids) {
  const row=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind,s.input,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL`).bind(id).first<{source_url:string;provider:string;kind:string;input:string|null;owner_account_id:string}>();
  if(!row)continue;
  const approved=productConnectorSource(row);if(!approved)continue;
  // Explicit allowlist admission persists exclusive ownership before connector execution.
  await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND collection_owner='legacy'").bind(id).run();
  const enrolled=await enrollV1Source(env.DB,id,row.owner_account_id,now.toISOString());
  // Private Telegram canary is one durable run, capped at one page of three records.
  const request:SourceFetchRequest={scope:{feedId:enrolled.scope.feedId,feedSourceId:id,sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:await sha256(JSON.stringify([id,enrolled.scope.feedRevision,['rss','google_news'].includes(approved.source.family)?Math.floor(now.getTime()/300000):'telegram-canary-v1'])),source:approved.source,requestedBounds:{},limit:approved.limit};
  if(await authorizeConnectorSource(env,request)) {
   if(request.source.family==='rss')await backend.rssScheduler.schedule(request.runId,{scope:request.scope,runId:request.runId,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:request.requestedBounds,maxItems:request.limit},now.toISOString());
   else await backend.scheduler.schedule(request.runId,request,now.toISOString(),request.source.family==='telegram'?['telegram_telethon']:request.source.family==='google_news'?['google_rss','google_apify']:['x_twitterapi_io']);
  }
 }
 await backend.rssScheduler.runOne();
 await backend.scheduler.runOne();
}
