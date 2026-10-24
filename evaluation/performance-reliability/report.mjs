/** Offline report over an imported normalized evidence bundle. Deterministic:
 * no wall-clock reads, network, credentials, provider calls or article text.
 * Each campaign is reported on its own; there is no cross-campaign or
 * cross-mode pooled result. Every emitted metric names its catalog ID and the
 * record IDs it was computed from. Unknown values stay null with a reason. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {utcMillis,proportion,latencySummary,deadlineCohort,costSummary} from './metrics.mjs';
import {OUTCOMES,TERMINAL_OUTCOMES,SUCCESS_OUTCOMES,PROXY_BASES,EVIDENCE_SCHEMA_VERSION} from './evidence-schema.mjs';
import {parseEvidenceJsonl,importEvidence} from './import-evidence.mjs';

export const ANALYSIS_VERSION='perf-rel-offline-report/0.1.0';
export const REPORT_SCHEMA_VERSION='0.1';
const FAILURE_EXAMPLES_PER_OUTCOME=3,SLOWEST_EXAMPLES=3;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const byId=(a,b)=>a<b?-1:a>b?1:0;
// Records copied into the report are rebuilt with a fixed key order.
const stamp=t=>t&&{at:t.at,clockDomain:t.clockDomain,basis:t.basis};
const refList=refs=>refs.map(r=>({kind:r.kind,ref:r.ref,sha256:r.sha256}));

/** Duration between two timestamp objects, only inside one clock domain. */
function span(a,b) {
  if(!a||!b)return {reason:'BOUNDARY_NOT_OBSERVED'};
  if(a.clockDomain!==b.clockDomain)return {reason:'CROSS_CLOCK_DOMAIN'};
  const ms=utcMillis(b.at)-utcMillis(a.at);
  if(ms<0)return {reason:'NEGATIVE_DURATION_REQUIRES_INVESTIGATION'};
  return {ms,basis:a.basis+'->'+b.basis,proxy:PROXY_BASES.includes(a.basis)||PROXY_BASES.includes(b.basis)};
}
// Comparable only within the horizon's clock domain; other domains are not truncated here.
const notAfter=(t,end)=>t.clockDomain!==end.clockDomain||utcMillis(t.at)<=utcMillis(end.at);

function rate(metricId,numeratorIds,denominatorIds,extra={}) {
  return {metricId,unit:'proportion',...proportion(numeratorIds.length,denominatorIds.length),...extra,
    evidence:{numeratorIds:[...numeratorIds].sort(byId),denominatorIds:[...denominatorIds].sort(byId)}};
}

/** One distribution per clock-basis pair: proxies never share a distribution with observations. */
function latency(metricId,items) {
  const groups=new Map(),unavailable={};
  for(const {id,span:s} of items) {
    if(s.reason){unavailable[s.reason]=(unavailable[s.reason]??0)+1;continue;}
    const g=groups.get(s.basis)??{proxy:s.proxy,values:[],ids:[]};
    g.values.push(s.ms);g.ids.push(id);groups.set(s.basis,g);
  }
  const entries=[...groups].sort(([a],[b])=>byId(a,b)).map(([basis,g])=>({metricId,clockBasis:basis,proxy:g.proxy,
    summaryMethodMetricId:'completed_latency_p50_p95',...latencySummary(g.values),evidence:{sampleIds:g.ids.sort(byId)}}));
  if(!entries.length)entries.push({metricId,clockBasis:null,proxy:null,summaryMethodMetricId:'completed_latency_p50_p95',
    ...latencySummary([]),evidence:{sampleIds:[]}});
  const valid=items.filter(i=>!i.span.reason).map(i=>i.id),eligible=items.map(i=>i.id);
  entries.push(rate('observability_coverage',valid,eligible,{forMetric:metricId,unavailableByReason:unavailable}));
  return entries;
}

function acquisitionMetrics(jobs,attempts) {
  const accepted=jobs.filter(j=>j.outcome==='ACCEPTED_READABLE').map(j=>j.jobId);
  const outcomes={};for(const j of jobs)outcomes[j.outcome]=(outcomes[j.outcome]??0)+1;
  const jobIds=new Set(jobs.map(j=>j.jobId));
  const own=attempts.filter(a=>a.kind==='ACQUISITION'&&jobIds.has(a.parentId));
  return [rate('acquisition_acceptance',accepted,jobs.map(j=>j.jobId),{jobOutcomes:outcomes,attempts:own.length,
      note:'Offered jobs, not attempts; no source-recall claim.'}),
    ...latency('acquisition_attempt_elapsed',own.map(a=>({id:a.attemptId,span:span(a.startedAt,a.completedAt)})))];
}

function costMetrics(entries,verifiedIds,scope) {
  const rows=entries.map(({record:f,contradicted,variants})=>contradicted
    ?{provider:f.provider,operationId:f.operationId,reservedCeilingUsd:Math.max(...variants.map(v=>v.reservedCeilingUsd)),actualCostUsd:null,confirmation:'UNKNOWN'}
    :{provider:f.provider,operationId:f.operationId,reservedCeilingUsd:f.reservedCeilingUsd,actualCostUsd:f.actualCostUsd,confirmation:f.confirmation})
    .sort((a,b)=>byId(a.provider+'\0'+a.operationId,b.provider+'\0'+b.operationId));
  const s=costSummary(rows,verifiedIds.length);
  const operationIds=rows.map(r=>r.provider+'/'+r.operationId);
  const {settlementCoverage,costPerPublishedReportedUsd,costScope:_,note,...cost}=s;
  return [
    {metricId:'attributed_provider_cost',unit:'USD',costScope:scope,...cost,
      contradictedOperations:entries.filter(e=>e.contradicted).length,note,evidence:{operationIds}},
    {metricId:'settlement_coverage',unit:'proportion',...settlementCoverage,evidence:{operationIds}},
    {metricId:'provider_cost_per_verified_publication',unit:'USD per verified briefing',costScope:scope,
      value:costPerPublishedReportedUsd,numeratorUsd:s.fullyReportedCostUsd,denominator:verifiedIds.length,
      unavailableReason:s.unknownCostOperations?'UNKNOWN_COST_OPERATIONS':verifiedIds.length?null:'NO_VERIFIED_PUBLICATIONS',
      evidence:{operationIds,denominatorIds:[...verifiedIds].sort(byId)}}];
}

function effortMetric(interventions) {
  const measured=interventions.filter(i=>i.activeMinutes!==null);
  const minutes=measured.reduce((a,i)=>a+i.activeMinutes,0);
  return {metricId:'operator_active_effort',unit:'active minutes and interventions',interventions:interventions.length,
    measuredInterventions:measured.length,measuredActiveMinutes:minutes,
    // No records is not measured zero effort: observation coverage is not established.
    activeMinutes:interventions.length&&measured.length===interventions.length?minutes:null,
    unavailableReason:!interventions.length?'NO_INTERVENTION_RECORDS':measured.length===interventions.length?null:'UNMEASURED_INTERVENTIONS',
    evidence:{interventionIds:interventions.map(i=>i.interventionId).sort(byId)}};
}

function campaignContext(c) {
  const end=c.campaign.observedUntil;
  const publications=[...c.publications.values()].filter(p=>!p.contradicted).map(p=>p.record);
  const confirmedBy=new Map();
  for(const p of publications) {
    const u=p.readback.firstPositiveAt;
    if(!u||!notAfter(u,end))continue;
    const prior=confirmedBy.get(p.opportunityId);
    if(!prior||utcMillis(u.at)<utcMillis(prior.readback.firstPositiveAt.at))confirmedBy.set(p.opportunityId,p);
  }
  const opportunities=[...c.opportunities.values()].map(e=>({...e.record,effectiveOutcome:e.effectiveOutcome}))
    .sort((a,b)=>byId(a.opportunityId,b.opportunityId));
  const isDue=o=>o.windowEnd.clockDomain===end.clockDomain&&utcMillis(o.windowEnd.at)<=utcMillis(end.at);
  const live=b=>[...c[b]].sort(([a],[b])=>byId(a,b)).filter(([,e])=>!e.contradicted).map(([,e])=>e.record);
  return {c,end,publications,confirmedBy,opportunities,isDue,jobs:live('acquisitionJobs'),attempts:live('attempts'),
    receipts:live('subscriptionReceipts'),interventions:live('interventions'),
    operations:[...c.financialOperations].sort(([a],[b])=>byId(a,b)).map(([,e])=>e)};
}

function successAt(ctx,o) {
  if(o.effectiveOutcome==='PUBLISHED_READBACK')return ctx.confirmedBy.get(o.opportunityId).readback.firstPositiveAt;
  if(o.effectiveOutcome==='QUIET')return o.outcomeAt;
  return null;
}

function deadlineMetric(ctx,opps) {
  const deadlineMs=ctx.c.campaign.deadlineMs,base={metricId:'window_success_by_deadline',unit:'proportion',deadlineMs};
  if(deadlineMs===null)return {...base,status:'not_assessed',reason:'DEADLINE_NOT_FROZEN',evidence:{opportunityIds:[]}};
  const rows=[];
  for(const o of opps) {
    const s=successAt(ctx,o);
    // Windows share the horizon's domain (import rule); a success boundary may not.
    const reason=!s?null:s.clockDomain!==o.windowEnd.clockDomain?'CROSS_CLOCK_DOMAIN'
      :utcMillis(s.at)<utcMillis(o.windowEnd.at)?'SUCCESS_PRECEDES_CUTOFF':null;
    if(reason)return {...base,status:'not_assessed',reason,evidence:{opportunityIds:opps.map(x=>x.opportunityId)}};
    rows.push({opportunityId:o.opportunityId,dueAt:o.windowEnd.at,successAt:s?s.at:null});
  }
  const r=deadlineCohort(rows,{observedUntil:ctx.end.at,deadlineMs});
  return {...base,status:'assessed',...r.deadlineSuccess,due:r.due,mature:r.mature,immature:r.immature,future:r.future,
    observedSuccesses:r.observedSuccesses,dueCohortBounds:r.dueCohortBounds,inference:r.inference,
    evidence:{opportunityIds:rows.map(x=>x.opportunityId)}};
}

function sliceMetrics(ctx,opps,{campaignWide}) {
  const ids=new Set(opps.map(o=>o.opportunityId)),due=opps.filter(ctx.isDue),dueIds=due.map(o=>o.opportunityId);
  const outcomeCounts=Object.fromEntries(OUTCOMES.map(k=>[k,due.filter(o=>o.effectiveOutcome===k).length]));
  const linked=x=>x.opportunityId===null?campaignWide:ids.has(x.opportunityId);
  const verified=due.filter(o=>o.effectiveOutcome==='PUBLISHED_READBACK');
  const pubs=ctx.publications.filter(p=>ids.has(p.opportunityId));
  const pubById=new Map(pubs.map(p=>[p.editionId,p]));
  const receipts=ctx.receipts.filter(r=>pubById.has(r.editionId));
  const horizon=receipts.filter(r=>r.observedFullHorizon);
  const jobs=ctx.jobs.filter(linked);
  return [
    rate('operational_window_success',due.filter(o=>SUCCESS_OUTCOMES.includes(o.effectiveOutcome)).map(o=>o.opportunityId),dueIds,
      {outcomeCounts,quiet:outcomeCounts.QUIET,offeredNotYetDue:opps.length-due.length}),
    rate('window_resolution',due.filter(o=>TERMINAL_OUTCOMES.includes(o.effectiveOutcome)).map(o=>o.opportunityId),dueIds),
    deadlineMetric(ctx,opps),
    rate('public_readback_coverage',pubs.filter(p=>p.readback.firstPositiveAt&&notAfter(p.readback.firstPositiveAt,ctx.end)).map(p=>p.editionId),
      pubs.map(p=>p.editionId)),
    ...latency('cutoff_to_public_readback',verified.map(o=>({id:o.opportunityId,
      span:span(o.windowEnd,ctx.confirmedBy.get(o.opportunityId).readback.firstPositiveAt)}))),
    rate('notification_service_acceptance',horizon.filter(r=>r.status==='ACCEPTED_BY_PUSH_SERVICE').map(r=>r.unitId),horizon.map(r=>r.unitId),
      {unitsNotObservedForFullHorizon:receipts.length-horizon.length,deviceReceipt:'unavailable'}),
    ...latency('publication_to_push_service_acceptance',receipts.filter(r=>r.status==='ACCEPTED_BY_PUSH_SERVICE')
      .map(r=>({id:r.unitId,span:span(pubById.get(r.editionId).publishedAt,r.acceptedAt)}))),
    ...acquisitionMetrics(jobs,ctx.attempts),
    ...costMetrics(ctx.operations.filter(e=>linked(e.record)),verified.map(o=>o.opportunityId),
      campaignWide?'attributed_provider_operations_only':'directly_allocated_provider_operations_only'),
    effortMetric(ctx.interventions.filter(linked))];
}

function representativeFailures(ctx,sliceAll) {
  const due=ctx.opportunities.filter(ctx.isDue);
  const failures=OUTCOMES.filter(k=>!SUCCESS_OUTCOMES.includes(k)).flatMap(outcome=>due.filter(o=>o.effectiveOutcome===outcome)
    .sort((a,b)=>utcMillis(a.windowEnd.at)-utcMillis(b.windowEnd.at)||byId(a.opportunityId,b.opportunityId))
    .slice(0,FAILURE_EXAMPLES_PER_OUTCOME)
    .map(o=>({opportunityId:o.opportunityId,effectiveOutcome:outcome,recordedOutcome:o.outcome,outcomeReason:o.outcomeReason,
      language:o.language,variant:o.variant,evidenceRefs:refList(o.evidenceRefs)})));
  const slowest=sliceAll.filter(m=>m.metricId==='cutoff_to_public_readback'&&m.n).flatMap(m=>m.evidence.sampleIds.map(id=>{
    const o=ctx.opportunities.find(x=>x.opportunityId===id);
    return {opportunityId:id,clockBasis:m.clockBasis,latencyMs:span(o.windowEnd,ctx.confirmedBy.get(id).readback.firstPositiveAt).ms};
  })).sort((a,b)=>b.latencyMs-a.latencyMs||byId(a.opportunityId,b.opportunityId)).slice(0,SLOWEST_EXAMPLES);
  return {rule:`Per non-success outcome, the earliest ${FAILURE_EXAMPLES_PER_OUTCOME} due opportunities by cutoff then ID; plus the ${SLOWEST_EXAMPLES} slowest cutoff-to-read-back successes. Fixed before results are seen.`,
    failures,slowestSuccesses:slowest};
}

function campaignReport(c,diagnostics) {
  const ctx=campaignContext(c),k=c.campaign;
  const slices=[{dimension:'all',value:'all',metrics:sliceMetrics(ctx,ctx.opportunities,{campaignWide:true})}];
  for(const dimension of ['variant','partition','language','workload']) {
    for(const value of [...new Set(ctx.opportunities.map(o=>o[dimension]))].sort(byId))
      slices.push({dimension,value,metrics:sliceMetrics(ctx,ctx.opportunities.filter(o=>o[dimension]===value),{campaignWide:false})});
  }
  for(const value of [...new Set(ctx.jobs.map(j=>j.sourceType))].sort(byId))
    slices.push({dimension:'sourceType',value,metrics:acquisitionMetrics(ctx.jobs.filter(j=>j.sourceType===value),ctx.attempts)});
  return {campaignId:k.campaignId,experimentMode:k.experimentMode,providerExecution:k.providerExecution,cachePolicy:k.cachePolicy,
    faultSchedule:k.faultSchedule,protocolVersion:k.protocolVersion,codeCommit:k.codeCommit,datasetManifestSha256:k.datasetManifestSha256,
    observedUntil:stamp(k.observedUntil),deadlineMs:k.deadlineMs,
    independentGroups:new Set(ctx.opportunities.map(o=>o.independentGroupId)).size,
    integrity:diagnostics.filter(d=>d.campaignId===k.campaignId),
    slices,representativeFailures:representativeFailures(ctx,slices[0].metrics)};
}

export function buildReport(imported,{bundleSha256,catalog,catalogSha256}) {
  const offline=new Set(catalog.metrics.filter(m=>m.implementation==='offline_report').map(m=>m.id));
  const campaigns=[...imported.campaigns.values()].sort((a,b)=>byId(a.campaign.campaignId,b.campaign.campaignId))
    .map(c=>campaignReport(c,imported.diagnostics));
  for(const c of campaigns)for(const s of c.slices)for(const m of s.metrics)
    for(const metricId of [m.metricId,m.forMetric,m.summaryMethodMetricId].filter(Boolean))
      if(!offline.has(metricId))throw Error('UNTRACEABLE_METRIC:'+metricId);
  return {reportSchemaVersion:REPORT_SCHEMA_VERSION,analysisVersion:ANALYSIS_VERSION,evidenceSchemaVersion:EVIDENCE_SCHEMA_VERSION,
    status:'offline_report_from_normalized_evidence',
    reproduction:{bundleSha256,catalogSha256,catalogSchemaVersion:catalog.schemaVersion,
      command:`node evaluation/performance-reliability/report.mjs BUNDLE.jsonl --expect-bundle-sha256 ${bundleSha256}`},
    import:{inputRecords:imported.inputRecords,uniqueRecords:imported.uniqueRecords,duplicateRecords:imported.duplicateRecords,
      contradictions:imported.contradictions},
    pooling:'none: each campaign has exactly one experiment mode and is reported separately',
    campaigns,
    limitations:['Computed only from the supplied normalized evidence; collectors, observers and replay runners are not implemented.',
      'Latency distributions are conditional on success and split by clock basis; proxy bases are labelled and never pooled with observations.',
      'Wilson or clustered intervals are not applied: independence must be justified by the campaign design.',
      'Device receipt, human quality labels and source recall are unavailable from this evidence.',
      'Slice cost views exclude unallocated shared operations, which appear only in the campaign-wide slice.',
      'As-of truncation at observedUntil applies to opportunities and read-back; attempt, receipt, cost and intervention records are used as supplied.']};
}

const CSV_COLUMNS=['campaignId','experimentMode','cachePolicy','sliceDimension','sliceValue','metricId','forMetric','clockBasis','proxy',
  'unit','status','numerator','denominator','value','n','p50','p95','min','max'];
const cell=v=>{
  if(v===null||v===undefined)return '';
  const s=String(v);
  return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
};
/** Flat CSV of the headline numbers. Empty cells are unavailable, never zero; see `status`. */
export function reportToCsv(report) {
  const lines=[CSV_COLUMNS.join(',')];
  for(const c of report.campaigns)for(const s of c.slices)for(const m of s.metrics) {
    const value=Object.hasOwn(m,'value')?m.value:m.metricId==='attributed_provider_cost'?m.fullyReportedCostUsd
      :m.metricId==='operator_active_effort'?m.activeMinutes:null;
    const status=m.status??(m.unit==='ms'?(m.n?'assessed':'unavailable'):value===null?'unavailable':'assessed');
    const row={campaignId:c.campaignId,experimentMode:c.experimentMode,cachePolicy:c.cachePolicy,sliceDimension:s.dimension,
      sliceValue:s.value,...m,status,value:m.unit==='ms'?null:value};
    lines.push(CSV_COLUMNS.map(k=>cell(row[k])).join(','));
  }
  return lines.join('\n')+'\n';
}

export function reportFromBundle(bundleText,{catalogText}) {
  const catalog=JSON.parse(catalogText);
  return buildReport(importEvidence(parseEvidenceJsonl(bundleText)),
    {bundleSha256:sha(bundleText),catalog,catalogSha256:sha(catalogText)});
}

async function main() {
  const [bundlePath,...args]=process.argv.slice(2);
  const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  if(!bundlePath||bundlePath.startsWith('--'))throw Error('Usage: node evaluation/performance-reliability/report.mjs BUNDLE.jsonl [--expect-bundle-sha256 HEX] [--json OUT] [--csv OUT]');
  const bundleText=fs.readFileSync(bundlePath,'utf8');
  const expected=option('--expect-bundle-sha256');
  if(expected&&sha(bundleText)!==expected)throw Error('BUNDLE_HASH_MISMATCH');
  const catalogText=fs.readFileSync(new URL('./metric-catalog.json',import.meta.url),'utf8');
  const report=reportFromBundle(bundleText,{catalogText}),json=JSON.stringify(report,null,2)+'\n';
  const jsonOut=option('--json'),csvOut=option('--csv');
  if(jsonOut)fs.writeFileSync(jsonOut,json);
  if(csvOut)fs.writeFileSync(csvOut,reportToCsv(report));
  if(!jsonOut&&!csvOut)process.stdout.write(json);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
