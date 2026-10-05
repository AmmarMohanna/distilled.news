import {HandoffError,sha256,type CandidateIntakePort} from '@distilled/contracts';
import type {SourceFetchRequest} from '@distilled/connectors';
import {createSourceBackend} from './source-backend';
import {acceptV1Handoff,v1SourceEnabled} from './v1-downstream-runtime';
import {enrollV1Source} from './v1-intelligence/product';
import {V1IntakeStore} from './v1-intake/store';
import type {Env} from './types';

/** Reads current approved product state; never enrolls or repairs stale queued work. */
export async function authorizeConnectorSource(env:Env,r:SourceFetchRequest):Promise<boolean> {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||!v1SourceEnabled(env,r.scope.feedSourceId))return false;
 const p=await env.DB.prepare(`SELECT s.source_url,s.provider,s.kind FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`).bind(r.scope.feedSourceId,r.scope.feedId).first<{source_url:string;provider:string;kind:string}>();
 const scope=await new V1IntakeStore(env.DB).getScope(r.scope.feedSourceId);
 // Phase 1 is deliberately RSS-only. Other families remain closed until their enrollment contract is reviewed.
 return !!p && p.provider==='rss' && p.kind==='rss_feed' && r.source.family==='rss' && p.source_url===r.source.locator && !!scope?.enabled && !scope.deletedAt && scope.sourceId===r.scope.sourceId && scope.feedId===r.scope.feedId && scope.feedRevision===r.configurationRevision && r.limit===30 && Object.keys(r.requestedBounds).length===0;
}
export function createConnectorRuntime(env:Env,fetcher?:typeof fetch) {
 const authorize=(r:SourceFetchRequest)=>authorizeConnectorSource(env,r);
 const intake:CandidateIntakePort={acceptBatch:request=>acceptV1Handoff(env,request)};
 return createSourceBackend(env,{authorize,intake,fetcher,intakeForRequest:r=>({acceptBatch:batch=>acceptV1Handoff(env,batch,r.configurationRevision)})});
}
/** Durable scheduler owns continuation and retries; one bounded slice per cron tick. */
export async function runConnectorMaintenance(env:Env,now=new Date()) {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return;
 const backend=createConnectorRuntime(env);
 const ids=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(ids.length>10)throw new HandoffError('SCOPE_DENIED');
 for(const id of ids) {
  const row=await env.DB.prepare(`SELECT s.source_url,b.owner_account_id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.id=? AND s.provider='rss' AND s.kind='rss_feed' AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL`).bind(id).first<{source_url:string;owner_account_id:string}>();
  if(!row)continue;
  // Explicit allowlist admission persists exclusive ownership before connector execution.
  await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND collection_owner='legacy'").bind(id).run();
  const enrolled=await enrollV1Source(env.DB,id,row.owner_account_id,now.toISOString());
  const request:SourceFetchRequest={scope:{feedId:enrolled.scope.feedId,feedSourceId:id,sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:await sha256(JSON.stringify([id,enrolled.scope.feedRevision,Math.floor(now.getTime()/300000)])),source:{family:'rss',locator:row.source_url},requestedBounds:{},limit:30};
  if(await authorizeConnectorSource(env,request))await backend.rssScheduler.schedule(request.runId,{scope:request.scope,runId:request.runId,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:request.requestedBounds,maxItems:request.limit},now.toISOString());
 }
 await backend.rssScheduler.runOne();
}
