import {durationMs,latencySummary} from '../../evaluation/performance-reliability/metrics.mjs';
/** Offline projection of explicitly collected COMPLETE trace views, not a live observer.
 * Private identities are used only for deduplication and never returned as labels. */
export function projectSnapshots(pages) {
 if(!Array.isArray(pages)||!pages.length||pages.length>1000)throw Error('BOUNDED_INPUT_REQUIRED');
 const seen=new Map(),records=[];let windowKey;
 for(const p of pages){
  if(p.schemaVersion!=='pipeline-trace-v1'||typeof p.feed?.id!=='string')throw Error('INVALID_TRACE');
  if(!p.window?.start||!p.window?.end)throw Error('EXPLICIT_WINDOW_REQUIRED');
  if(durationMs(p.window.start,p.window.end)<=0)throw Error('INVALID_WINDOW');
  const w=JSON.stringify(p.window);windowKey??=w;if(w!==windowKey)throw Error('MIXED_WINDOWS');
  if(!Array.isArray(p.items)||!p.page||p.page.nextCursor||p.page.total!==p.items.length)throw Error('INCOMPLETE_VIEW');
  if(!['overview','operations','sources'].includes(p.view))throw Error('UNSUPPORTED_VIEW');
  const k=p.feed.id+':'+p.view,bytes=JSON.stringify(p);
  if(seen.has(k)){if(seen.get(k)!==bytes)throw Error('CONFLICTING_SNAPSHOT');continue;}
  seen.set(k,bytes);records.push(p);
 }
 const values={},samples={model:[],publication:[],v3_edit:[],v3_verify:[],v3_repair:[],v3_consolidate:[]},operations=new Map();
 const add=(key,value)=>{if(value===null||value===undefined)return;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('INVALID_VALUE');values[key]=(values[key]??0)+value;};
 const outcomes=['published','quiet','deferred','failed','blocked','pending','unknown'];
 for(const p of records){
  if(p.view==='overview'){
   for(const o of outcomes)values['publication_'+o]??=0;
   for(const stage of ['edit','verify','repair','consolidate']){
    const elapsed=p.summary?.v3Run?.timings?.stages?.[stage];
    if(elapsed!=null){if(typeof elapsed!=='number'||!Number.isFinite(elapsed)||elapsed<0)throw Error('INVALID_STAGE_DURATION');samples['v3_'+stage].push(elapsed);}
   }
   const r=p.summary?.publication?.briefingRequest;
   const outcome=!r?'unknown':r.state==='DONE'&&r.result==='PUBLISHED'?'published':r.state==='DONE'&&r.result==='QUIET'?'quiet':r.result==='DEFERRED'?'deferred':r.blocked===true||(r.blocked&&typeof r.blocked==='object'&&typeof r.blocked.since==='string')||r.diagnosticState==='BLOCKED'?'blocked':r.state==='FAILED'?'failed':['PENDING','RUNNING','WAITING_BUDGET'].includes(r.state)?'pending':'unknown';
   add('publication_'+outcome,1);
   for(const q of p.summary?.queue?.outcomes??[])if(['FAILED','DELIVERY_EXHAUSTED','DELIVERY_REJECTED','RETRYABLE_WAIT'].includes(q.outcome))add('queue_'+q.outcome.toLowerCase(),q.deliveries);
   const coverage=r?.coverage?.state; if(coverage)add('coverage_incomplete',coverage==='INCOMPLETE'?1:0);
   for(const e of p.summary?.publication?.recordedEditions??[]){const d=durationMs(e.scheduledFor??null,e.recordedPublishedAt??e.publishedAt??null);if(d!==null)samples.publication.push(d);}
  }
  if(p.view==='operations')for(const o of p.items){
   if(typeof o.id!=='string'||!['semantic_intents','model_intents','salience_intents','semantic_results','semantic_resource_waits'].includes(o.recordKind))throw Error('INVALID_OPERATION');
   const k=p.feed.id+':'+o.recordKind+':'+o.id;
   if(operations.has(k)){if(JSON.stringify(operations.get(k))!==JSON.stringify(o))throw Error('CONFLICTING_OPERATION');continue;}
   operations.set(k,o);
  }
  if(p.view==='sources')for(const source of p.items){
   for(const j of source.collection?.jobCounts??[]){
    if(!['ACQUIRE','REASSESS'].includes(j.kind)||!['PENDING','RUNNING','FAILED','DONE'].includes(j.state))continue;
    add('jobs_'+j.kind.toLowerCase()+'_'+j.state.toLowerCase(),j.count);
    add('job_attempts',j.attempts);add('job_resource_waits',j.resourceWaits);
    if(['PENDING','RUNNING'].includes(j.state)&&j.timestampedJobs!=null){
     if(j.timestampedJobs>j.count)throw Error('INVALID_TIMESTAMP_COVERAGE');
     add('pending_timestamp_missing_jobs',j.count-j.timestampedJobs);
     add('pending_timestamp_observed_jobs',j.timestampedJobs);
     if(j.oldestEnqueuedAt&&source.collection.observedAt){
      const age=durationMs(j.oldestEnqueuedAt,source.collection.observedAt);
      values.oldest_observed_pending_age_ms=Math.max(values.oldest_observed_pending_age_ms??0,age);
     }
    }
   }
   if(source.collection?.pollingState)add('source_'+(['SUCCESS','FAILED','BLOCKED','DEFERRED'].includes(source.collection.pollingState)?source.collection.pollingState.toLowerCase():'unknown'),1);
  }
 }
 if(records.some(p=>p.view==='operations')){
  values.unknown_cost_operations=0;values.unsettled_operations=0;let allKnown=true;const repairs=new Set();
  for(const [operationKey,o] of operations){
   if(['semantic_resource_waits','semantic_results'].includes(o.recordKind)){add('unattributed_operation_records',1);continue;}
   add('operations',1);
   if(o.accountSettlementState!=='SETTLED'){allKnown=false;add('unsettled_operations',1);}
   add('reserved_ceiling_usd',o.reservedExposureUsd);
   add('model_calls',o.calls);
   for(const id of o.repairOperationIds??[])repairs.add(JSON.stringify([operationKey.slice(0,operationKey.indexOf(':'+o.recordKind+':')),id]));
   if(typeof o.failure==='string'&&/^SEMANTIC_PROVIDER_(?:FAILURE|HTTP_[0-9]{3})$/.test(o.failure))add('provider_failed_operations',1);
   if(o.reportedCostUsd==null){allKnown=false;add('unknown_cost_operations',1);}else add('confirmed_partial_cost_usd',o.reportedCostUsd);
   add('provider_reported_partial_cost_usd',o.providerReportedCostUsd);
   add('held_exposure_usd',o.heldExposureUsd);
   add('tokens_in',o.tokensIn);add('tokens_out',o.tokensOut);
   if(o.latencyMs!=null){add('model_duration_ms_sum',o.latencyMs);samples.model.push(o.latencyMs);}
   if(o.failure)add('failed_operations',1);
  }
  values.referenced_repair_operations=repairs.size;
  if(allKnown)values.settled_cost_usd=values.confirmed_partial_cost_usd??0;
 }
 for(const [kind,s] of Object.entries(samples))if(s.length){const q=latencySummary(s);values[kind+'_duration_ms_p50']=q.p50;values[kind+'_duration_ms_p95']=q.p95;values[kind+'_duration_samples']=q.n;}
 return {schemaVersion:'agentops-snapshot.v1',mode:'HISTORICAL_AUDIT',values,limitations:['Scoped retained snapshot; not an independent offered-opportunity denominator.','Recorded publication timestamp is a proxy, not public read-back.','Gauges replace prior snapshots; never sum repeated scrapes.','Missing fields are absent, not zero; partial costs exclude unknown charges.','Quantiles use Aya R7; fewer than 100 samples is exploratory.']};
}
export function prometheus(snapshot){return Object.entries(snapshot.values).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`# TYPE distilled_${k} gauge\ndistilled_${k} ${v}\n`).join('');}
