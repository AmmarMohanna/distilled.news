import {z} from 'zod';
import type {BriefingConfig} from '@distilled/core';
import type {Env,Repository} from './types';
import {windowIdentity} from './v1-intelligence/runtime';
import {livePublicationWindow,nextLiveBriefingAt,DELIVERY_LEAD_MS,publicationWindowSchema,type LiveSchedule} from './v1-intelligence/schedule';
import type {PublicationWindow} from './v1-intelligence/scoring';
import {canonicalJson} from './v1-intake/canonical';
import {SQL} from '../../agentops-collector/src/snapshot.mjs';

type CampaignEnv=Env&{AGENTOPS_CAMPAIGN_ENABLED?:string;AGENTOPS_CAMPAIGN_ISOLATED?:string;AGENTOPS_CAMPAIGN_ALLOW_FAULTS?:string};
type Row=Record<string,any>;
export const campaignId=z.string().regex(/^[a-z0-9]{8,24}$/);
const feedId=z.string().max(100);
export const campaignPlanSchema=z.object({feedIds:z.array(feedId).min(1).max(40),from:z.string().datetime(),until:z.string().datetime()}).strict();
export const campaignOpportunitySchema=z.object({feedId,window:publicationWindowSchema}).strict();
export const campaignSnapshotSchema=z.object({opportunities:z.array(campaignOpportunitySchema).min(1).max(10),browserRuns:z.array(z.object({runId:z.string().regex(/^(?:public_source_run|x_source_run)_[a-f0-9]{32}_browser_use$/),ownerId:z.string()})).max(10).optional()}).strict();
export function campaignAvailable(env:CampaignEnv){return env.ENVIRONMENT==='staging'&&env.AGENTOPS_CAMPAIGN_ENABLED==='true'&&env.AGENTOPS_CAMPAIGN_ISOLATED==='true'&&!env.VAPID_PRIVATE_KEY;}
export function assertCampaignFeed(runId:string,id:string){campaignId.parse(runId);if(!new RegExp(`^qa_${runId}_u\\d+_f\\d+$`).test(id))throw Error('CAMPAIGN_SCOPE_DENIED');}
async function scope(env:Env,repo:Repository,runId:string,id:string,measured?: (sql:string,...params:any[])=>Promise<Row[]>){
 assertCampaignFeed(runId,id);
 if(measured){
  const rows=await measured("SELECT b.id,b.owner_account_id AS ownerAccountId,a.username AS ownerUsername,b.slug,b.public_feed_enabled AS publicFeedEnabled,b.language,b.v1_briefing_interval_minutes AS updateIntervalMinutes,b.briefing_timezone AS briefingTimezone,b.briefing_time_of_day AS briefingTimeOfDay,b.briefing_schedule_clock_start_at AS briefingScheduleClockStartAt,b.briefing_schedule_policy AS briefingSchedulePolicy FROM agentops_campaign_feeds c JOIN briefings b ON b.id=c.feed_id JOIN accounts a ON a.id=b.owner_account_id WHERE c.run_id=? AND c.feed_id=? AND c.owner_id=b.owner_account_id AND a.role='user'",runId,id);
  if(rows.length!==1||!rows[0].ownerUsername.startsWith('qa'+runId+'u'))throw Error('CAMPAIGN_SCOPE_DENIED');return rows[0] as BriefingConfig;
 }
 const registration=await env.DB.prepare('SELECT owner_id FROM agentops_campaign_feeds WHERE run_id=? AND feed_id=?').bind(runId,id).first<{owner_id:string}>();
 const feed=await repo.getBriefingById(id);
 if(!registration||!feed||registration.owner_id!==feed.ownerAccountId)throw Error('CAMPAIGN_SCOPE_DENIED');
 const owner=await repo.getAccountById(feed.ownerAccountId);
 if(!owner||!owner.username.startsWith('qa'+runId+'u')||owner.role!=='user')throw Error('CAMPAIGN_SCOPE_DENIED');
 return feed;
}
export async function registerCampaignFeed(env:Env,repo:Repository,runId:string,id:string,ownerId:string){
 assertCampaignFeed(runId,id);const owner=await repo.getAccountById(ownerId);
 if(!owner||owner.role!=='user'||!owner.emailVerifiedAt||!owner.username.startsWith('qa'+runId+'u'))throw Error('CAMPAIGN_SCOPE_DENIED');
 const existing=await repo.getBriefingById(id);if(existing&&existing.ownerAccountId!==ownerId)throw Error('CAMPAIGN_SCOPE_DENIED');
 await env.DB.prepare('INSERT INTO agentops_campaign_feeds(feed_id,run_id,owner_id,created_at) VALUES(?,?,?,?) ON CONFLICT(feed_id) DO NOTHING').bind(id,runId,ownerId,new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT run_id,owner_id FROM agentops_campaign_feeds WHERE feed_id=?').bind(id).first<{run_id:string;owner_id:string}>();
 if(row?.run_id!==runId||row.owner_id!==ownerId)throw Error('CAMPAIGN_SCOPE_DENIED');
}
export function scheduledOpportunities(feed:BriefingConfig,from:string,until:string){
 if(!feed.updateIntervalMinutes||!feed.briefingScheduleClockStartAt)throw Error('NEW_CAMPAIGN_SCHEDULE_REQUIRED');
 const schedule:LiveSchedule={durationMinutes:feed.updateIntervalMinutes,timezone:feed.briefingTimezone,deliveryAnchor:feed.briefingTimeOfDay,clockStartAt:feed.briefingScheduleClockStartAt,...(feed.briefingSchedulePolicy?{clockPolicy:feed.briefingSchedulePolicy}:{})};
 const out:Array<{feedId:string;window:PublicationWindow}>=[];let due=nextLiveBriefingAt(schedule,new Date(Date.parse(from)-1));
 for(let i=0;Date.parse(due)<=Date.parse(until);i++){
  if(i>=12)throw Error('OPPORTUNITY_LIMIT');
  out.push({feedId:feed.id,window:livePublicationWindow(schedule,new Date(Date.parse(due)-DELIVERY_LEAD_MS))});
  const next=nextLiveBriefingAt(schedule,new Date(due));if(Date.parse(next)<=Date.parse(due))throw Error('NONADVANCING_SCHEDULE');due=next;
 }return out;
}
export async function planCampaign(env:Env,repo:Repository,runId:string,input:z.infer<typeof campaignPlanSchema>){
 if(Date.parse(input.until)<=Date.parse(input.from)||Date.parse(input.until)-Date.parse(input.from)>4*3600000)throw Error('CAMPAIGN_TIME_LIMIT');
 const opportunities=[];
 for(const id of [...new Set(input.feedIds)]){const feed=await scope(env,repo,runId,id);for(const o of scheduledOpportunities(feed,input.from,input.until))opportunities.push({...o,id:await windowIdentity(o.feedId,o.window),ownerId:feed.ownerAccountId,username:feed.ownerUsername,slug:feed.slug,public:feed.publicFeedEnabled,language:feed.language});}
 return {schemaVersion:'distilled-real-opportunities.v1',runId,plannedAt:new Date().toISOString(),opportunities,denominator:'enumerated from persisted schedule, independent of queued/published requests'};
}
/** Point reads for explicit, newly registered campaign feeds/windows only.
 * No table inventory, broad pipeline-trace scans or retained-history COUNT. */
export async function snapshotCampaign(env:Env,repo:Repository,runId:string,input:z.infer<typeof campaignSnapshotSchema>){
 const startedAt=new Date().toISOString(),work={queries:0,rowsRead:0,sqlMs:0};
 const read=async(sql:string,...params:any[]):Promise<Row[]>=>{if(++work.queries>200)throw Error('CAMPAIGN_QUERY_LIMIT');const r=await env.DB.prepare(sql).bind(...params).all<Row>();if(!r.success||!Number.isSafeInteger(r.meta.rows_read))throw Error('CAMPAIGN_METRICS_MISSING');work.rowsRead+=r.meta.rows_read;if(!Number.isFinite(r.meta.duration)||r.meta.duration<0)throw Error('CAMPAIGN_TIMING_MISSING');work.sqlMs+=r.meta.duration;if(work.rowsRead>20000)throw Error('CAMPAIGN_ROW_LIMIT');return r.results;};
 const doc=async(feed:string,kind:string,id:string)=>{const rows=await read("SELECT length(json) AS bytes,CASE WHEN length(json)<=524288 THEN json ELSE NULL END AS value FROM v1_feed_documents WHERE kind=? AND id=? AND feed_id=?",kind,id,feed);if(rows[0]?.bytes>524288)throw Error('CAMPAIGN_RECORD_LIMIT');return rows[0]?.value?JSON.parse(rows[0].value):null;};
 const financial=[];const items=[];const scoped=new Map<string,BriefingConfig>();
 for(const offered of input.opportunities){
  if(!scoped.has(offered.feedId))scoped.set(offered.feedId,await scope(env,repo,runId,offered.feedId,read));
  const current=scoped.get(offered.feedId)!;const due=offered.window.scheduledFor??offered.window.end;
  const canonical=scheduledOpportunities(current,due,due);if(canonical.length!==1||canonicalJson(canonical[0].window)!==canonicalJson(offered.window))throw Error('CAMPAIGN_SCOPE_DENIED');
  const id=await windowIdentity(offered.feedId,offered.window),request=await doc(offered.feedId,'briefing_requests',id),edition=await doc(offered.feedId,'editions',id),publication=edition?await doc(offered.feedId,'publication_status',id):null;
  const result=await doc(offered.feedId,'v3_window_results',request?.v3InputId??id);
  const operations=await read(SQL.operations.replace('LIMIT 25','LIMIT 129'),offered.feedId,'v3:'+id);if(operations.length>128)throw Error('CAMPAIGN_OPERATION_LIMIT');
  const opRows=operations.map(o=>{const settled=typeof o.settlementUsage==='string'?JSON.parse(o.settlementUsage):o.settlementUsage;const u=settled?.reported?settled:typeof o.usage==='string'?JSON.parse(o.usage):o.usage;return {id:o.id,parent:o.parent??null,reservedUsd:o.moneyReserved??o.reserved??null,settledUsd:o.reported===1?o.cost:null,reported:o.reported===1,calls:u?.calls??null,tokensIn:u?.tokensIn??null,tokensOut:u?.tokensOut??null,latencyMs:o.latencyMs??null,uncertain:Boolean(u?.calls>0&&u?.reported===false),failure:o.failure??null};});
  const receipts=operations.length?await read(`SELECT json_extract(json,'$.reservationId') AS reservationId,json_extract(json,'$.generationId') AS generationId FROM v1_feed_documents INDEXED BY v1_provider_recovery_receipts WHERE kind='model_provider_receipts' AND feed_id=? AND json_extract(json,'$.reservationId') IN (${operations.map(()=>'?').join(',')}) LIMIT 513`,offered.feedId,...operations.map(o=>'semantic_intents:'+o.id)):[];
  if(receipts.length>512)throw Error('CAMPAIGN_RECEIPT_LIMIT');
  const paymentEvidence=opRows.map(o=>({operationId:o.id,generationIds:[...new Set(receipts.filter(r=>r.reservationId==='semantic_intents:'+o.id&&typeof r.generationId==='string').map(r=>r.generationId))]}));
  const duplicates=await read("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='editions' AND json_extract(json,'$.windowStart')=? AND json_extract(json,'$.windowEnd')=? LIMIT 2",offered.feedId,offered.window.start,offered.window.end);
  const evidenceIds=[...new Set<string>((edition?.evidenceRevisionIds??[]) as string[])];if(evidenceIds.length>500)throw Error('CAMPAIGN_CITATION_LIMIT');
  let unownedCitations=0;for(let n=0;n<evidenceIds.length;n+=50){const chunk=evidenceIds.slice(n,n+50),owned=await read(`SELECT r.id FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE r.id IN (${chunk.map(()=>'?').join(',')}) AND s.feed_id=?`,...chunk,offered.feedId);unownedCitations+=chunk.length-owned.length;}
  items.push({id,feedId:offered.feedId,window:offered.window,state:request?.state??'NOT_CREATED',result:request?.result??null,reason:request?.reason??null,publishedAt:publication?.publishedAt??null,editionCreatedAt:edition?.createdAt??null,completedAt:request?.completedAt??null,editionId:edition?.id??null,engine:edition?.engine??request?.engine??null,coverage:request?.coverage?.state??null,timings:result?.result?.timings??null,operations:opRows,paymentEvidence,citationCount:evidenceIds.length,unownedCitations,duplicateEditions:Math.max(0,duplicates.length-1),factualAccuracy:'NOT_ASSESSED'});
 }
 const feeds=[];
 for(const [id]of scoped){const sources=await read(SQL.sources.replace('LIMIT 5','LIMIT 4'),id);if(sources.length>=4)throw Error('CAMPAIGN_SOURCE_LIMIT');const jobs=[];for(const s of sources){const rows=await read(SQL.jobs,s.id);if(rows.length>100)throw Error('CAMPAIGN_BACKLOG_INCOMPLETE');jobs.push(...rows);}feeds.push({feedId:id,backlog:jobs.length,timestamped:jobs.filter(j=>j.enqueuedAt).length,oldestPendingAt:jobs.map(j=>j.enqueuedAt).filter(Boolean).sort()[0]??null});}
 for(const owner of [...new Set([...scoped.values()].map(f=>f.ownerAccountId))]){
  const rows=await read("SELECT r.id,r.model,r.reserved_cost_usd AS reservedUsd,s.cost_usd AS settledUsd,s.reported FROM v1_model_spending_reservations r INDEXED BY v1_model_spending_reservation_account LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? ORDER BY r.created_at LIMIT 501",owner);
  if(rows.length>500)throw Error('CAMPAIGN_LEDGER_LIMIT');
  financial.push({ownerId:owner,reservations:rows.map(r=>({id:r.id,model:r.model,reservedUsd:r.reservedUsd,settledUsd:r.reported===1?r.settledUsd:null,reported:r.reported===1}))});
 }
 const browser=[];
 for(const ref of input.browserRuns??[]){
  const owner=await read('SELECT feed_id FROM agentops_campaign_feeds WHERE run_id=? AND owner_id=? LIMIT 1',runId,ref.ownerId);if(!owner.length)throw Error('CAMPAIGN_SCOPE_DENIED');
  const rows=await read('SELECT run_id AS runId,state,outcome,discovery_model_calls AS modelCalls,browser_operations AS toolCalls,agent_browser_actions AS actions,started_at AS startedAt,completed_at AS completedAt,total_duration_ms AS totalMs,agent_duration_ms AS agentMs,verification_duration_ms AS verificationMs FROM browser_use_discovery_runs WHERE run_id=? AND tenant_id=?',ref.runId,ref.ownerId);
  browser.push(rows[0]??{runId:ref.runId,state:'NOT_OBSERVED'});
 }
 return {schemaVersion:'distilled-real-snapshot.v1',runId,startedAt,observedAt:new Date().toISOString(),work,items,feeds,financial,financialCoverage:'ACCOUNT_MODEL_LEDGER_ONLY_EXTERNAL_COLLECTOR_USAGE_REQUIRES_RECONCILIATION',coverageComplete:true,browserAgent:{coverage:browser.length&&browser.every(b=>b.state!=='NOT_OBSERVED')?'OBSERVED':'NOT_OBSERVED',runs:browser,reason:'Only explicit owned run IDs are read; HTTP success never establishes Browser Agent correctness.'}};
}

/** Explicit private evidence export, never telemetry. Fixed PKs, hard payload
 * refusal rather than lossy article truncation. Only campaign-owned input. */
export async function campaignEvidence(env:Env,repo:Repository,runId:string,offered:z.infer<typeof campaignOpportunitySchema>){
 const checked=await snapshotCampaign(env,repo,runId,{opportunities:[offered]});
 const id=checked.items[0].id;
 const get=async(kind:string,key:string)=>{const r=await env.DB.prepare("SELECT length(json) AS bytes,CASE WHEN length(json)<=1048576 THEN json ELSE NULL END AS value FROM v1_feed_documents WHERE kind=? AND id=? AND feed_id=?").bind(kind,key,offered.feedId).first<{bytes:number;value:string|null}>();if(r&&r.bytes>1048576)throw Error('CAMPAIGN_EVIDENCE_TOO_LARGE');return r?.value?JSON.parse(r.value):null;};
 const request=await get('briefing_requests',id),inputId=request?.v3InputId??id;
 if(checked.items[0].operations.length>16)throw Error('CAMPAIGN_EVIDENCE_OPERATION_LIMIT');
 const operations=[];for(const op of checked.items[0].operations)operations.push(await get('semantic_results',op.id));
 return {runId,id,feedId:offered.feedId,exportedAt:new Date().toISOString(),input:await get('v3_window_inputs',inputId),result:await get('v3_window_results',inputId),operations,qualityAssessment:'NOT_ASSESSED'};
}
