import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {durationMs,latencySummary} from '../evaluation/performance-reliability/metrics.mjs';
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
 const values={},samples={model:[],publication:[]},operations=new Map();
 const add=(key,value)=>{if(value===null||value===undefined)return;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('INVALID_VALUE');values[key]=(values[key]??0)+value;};
 const outcomes=['published','quiet','deferred','failed','blocked','pending','unknown'];
 for(const p of records){
  if(p.view==='overview'){
   for(const o of outcomes)values['publication_'+o]??=0;
   const r=p.summary?.publication?.briefingRequest;
   const outcome=!r?'unknown':r.state==='DONE'&&r.result==='PUBLISHED'?'published':r.state==='DONE'&&r.result==='QUIET'?'quiet':r.result==='DEFERRED'?'deferred':r.blocked===true?'blocked':r.state==='FAILED'?'failed':['PENDING','RUNNING','WAITING_BUDGET'].includes(r.state)?'pending':'unknown';
   add('publication_'+outcome,1);
   const coverage=r?.coverage?.state; if(coverage)add('coverage_incomplete',coverage==='INCOMPLETE'?1:0);
   for(const e of p.summary?.publication?.recordedEditions??[]){const d=durationMs(e.scheduledFor??null,e.publishedAt??null);if(d!==null)samples.publication.push(d);}
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
   }
   if(source.collection?.pollingState)add('source_'+(['SUCCESS','FAILED','BLOCKED','DEFERRED'].includes(source.collection.pollingState)?source.collection.pollingState.toLowerCase():'unknown'),1);
  }
 }
 if(records.some(p=>p.view==='operations')){
  values.unknown_cost_operations=0;let allKnown=true;
  for(const o of operations.values()){
   if(['semantic_resource_waits','semantic_results'].includes(o.recordKind)){add('unattributed_operation_records',1);continue;}
   add('operations',1);
   if(o.reportedCostUsd==null){allKnown=false;add('unknown_cost_operations',1);}else add('confirmed_partial_cost_usd',o.reportedCostUsd);
   add('provider_reported_partial_cost_usd',o.providerReportedCostUsd);
   add('held_exposure_usd',o.heldExposureUsd);
   add('tokens_in',o.tokensIn);add('tokens_out',o.tokensOut);
   if(o.latencyMs!=null){add('model_duration_ms_sum',o.latencyMs);samples.model.push(o.latencyMs);}
   if(o.failure)add('failed_operations',1);
  }
  if(allKnown)values.settled_cost_usd=values.confirmed_partial_cost_usd??0;
 }
 for(const [kind,s] of Object.entries(samples))if(s.length){const q=latencySummary(s);values[kind+'_duration_ms_p50']=q.p50;values[kind+'_duration_ms_p95']=q.p95;values[kind+'_duration_samples']=q.n;}
 return {schemaVersion:'agentops-snapshot.v1',mode:'HISTORICAL_AUDIT',values,limitations:['Scoped retained snapshot; not an independent offered-opportunity denominator.','Recorded publication timestamp is a proxy, not public read-back.','Gauges replace prior snapshots; never sum repeated scrapes.','Missing fields are absent, not zero; partial costs exclude unknown charges.','Quantiles use Aya R7; fewer than 100 samples is exploratory.']};
}
export function prometheus(snapshot){return Object.entries(snapshot.values).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`# TYPE distilled_${k} gauge\ndistilled_${k} ${v}\n`).join('');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const files=process.argv.slice(2);if(!files.length)throw Error('Provide complete private trace JSON files; no network is performed');
 for(const f of files)if(readFileSync(f).byteLength>20_000_000)throw Error('INPUT_TOO_LARGE');
 const snapshot=projectSnapshots(files.map(f=>JSON.parse(readFileSync(f,'utf8'))));process.stdout.write(prometheus(snapshot));
}
