import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {writePrivate,journal} from './client.mjs';
import {budgetStop} from './manifest.mjs';
const sum=(values)=>values.reduce((n,v)=>n+v,0);
export function quantile(values,p){if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);}
export class CampaignObservation{
 constructor(manifest,plan){this.m=manifest;this.plan=plan;this.items=new Map();this.operations=new Map();this.visibility=new Map();this.violations=[];this.feeds=new Map();this.browser=new Map();this.samples=[];this.ledger=new Map();this.costs=null;}
 accept(snapshot){
  if(snapshot.runId!==this.m.runId||snapshot.schemaVersion!=='distilled-real-snapshot.v1')throw Error('SNAPSHOT_BINDING');
  for(const item of snapshot.items){
   const offered=this.plan.opportunities.find(o=>o.id===item.id&&o.feedId===item.feedId);if(!offered)throw Error('UNPLANNED_OPPORTUNITY');
   if(item.window.start!==offered.window.start||item.window.end!==offered.window.end)this.violate('WINDOW_REINTERPRETED',item.id);
   if(item.editionId&&item.engine!=='v3')this.violate('UNEXPECTED_PUBLICATION_ENGINE',item.id);
   if(item.duplicateEditions>0)this.violate('DUPLICATE_PUBLICATION',item.id);
   if(item.unownedCitations>0)this.violate('CITATION_OWNERSHIP',item.id);
   if(item.editionId&&item.citationCount===0)this.violate('PUBLISHED_WITHOUT_CITATIONS',item.id);
   if(item.publishedAt&&Date.parse(item.publishedAt)<Date.parse(offered.window.scheduledFor??offered.window.end))this.violate('PREMATURE_PUBLICATION',item.id);
   for(const op of item.operations){const key=item.feedId+':'+op.id,prior=this.operations.get(key);if(prior?.reported&&(!op.reported||prior.settledUsd!==op.settledUsd))this.violate('SETTLEMENT_MUTATED',op.id);this.operations.set(key,{...op,feedId:item.feedId});}
   for(const receipt of item.paymentEvidence??[])if(receipt.generationIds.length>1)this.violate('MULTIPLE_GENERATIONS_ONE_PAID_IDENTITY',receipt.operationId);
   this.items.set(item.id,item);
  }
  for(const account of snapshot.financial??[])for(const r of account.reservations)this.ledger.set(r.id,r);
  for(const feed of snapshot.feeds)this.feeds.set(feed.feedId,feed);
  for(const run of snapshot.browserAgent?.runs??[])this.browser.set(run.runId,run);
  this.samples.push({at:snapshot.observedAt,work:snapshot.work,coverageComplete:snapshot.coverageComplete});
 }
 restore(saved){if(saved.runId!==this.m.runId)throw Error('OBSERVER_STATE_BINDING');this.items=new Map(saved.items.map(i=>[i.id,i]));this.visibility=new Map(saved.visibility);this.violations=saved.violations;this.operations=new Map(saved.operations??[]);this.feeds=new Map(saved.feeds??[]);this.samples=saved.samples??[];this.browser=new Map((saved.browser??[]).map(b=>[b.runId,b]));}
 violate(kind,id){if(!this.violations.some(v=>v.kind===kind&&v.id===id))this.violations.push({kind,id,at:new Date().toISOString()});}
 visible(id,at,positive){const prev=this.visibility.get(id)??{};if(positive&&!prev.firstPositive)this.visibility.set(id,{...prev,firstPositive:at});else if(!positive&&!prev.firstPositive)this.visibility.set(id,{...prev,lastNegative:at});}
 reconcileCosts(costs){
  if(costs?.complete!==true||!Number.isFinite(costs.settledUsd)||!Number.isFinite(costs.outstandingReservedUsd)||!Number.isSafeInteger(costs.modelCalls)||!Number.isSafeInteger(costs.uncertainOperations)||!costs.evidenceHash)throw Error('COMPLETE_COST_EVIDENCE_REQUIRED');
  if(costs.settledUsd<0||costs.outstandingReservedUsd<0||Date.now()-Date.parse(costs.observedAt)>60000||Date.parse(costs.observedAt)>Date.now())throw Error('COST_EVIDENCE_INVALID');this.costs=costs;
 }
 summary(now=Date.now()){
  const due=this.plan.opportunities.filter(o=>Date.parse(o.window.scheduledFor??o.window.end)<=now),ops=[...this.operations.values()],items=due.map(o=>this.items.get(o.id)).filter(Boolean);
  const completed=due.filter(o=>this.visibility.get(o.id)?.firstPositive||this.items.get(o.id)?.state==='DONE'&&this.items.get(o.id)?.result==='QUIET');
  const mature=due.filter(o=>Date.parse(o.window.scheduledFor??o.window.end)+this.m.deadlineGraceMs<=now);
  const deadlineStates=mature.map(o=>{
   const item=this.items.get(o.id),v=this.visibility.get(o.id),deadline=Date.parse(o.window.scheduledFor??o.window.end)+this.m.deadlineGraceMs;
   if(v?.firstPositive&&Date.parse(v.firstPositive)<=deadline)return 'BY_DEADLINE';
   if(v?.lastNegative&&Date.parse(v.lastNegative)>=deadline||item?.publishedAt&&Date.parse(item.publishedAt)>deadline)return 'LATE';
   if(item?.result==='QUIET'&&item.completedAt)return Date.parse(item.completedAt)<=deadline?'BY_DEADLINE':'LATE';
   return 'UNKNOWN';
  });
  const byDeadline=deadlineStates.filter(x=>x==='BY_DEADLINE'),deadlineUnknown=deadlineStates.filter(x=>x==='UNKNOWN');
  const latency=due.flatMap(o=>{const at=this.visibility.get(o.id)?.firstPositive;return at?[Date.parse(at)-Date.parse(o.window.scheduledFor??o.window.end)]:[];});
  const knownAge=[...this.feeds.values()].filter(f=>f.oldestPendingAt).map(f=>Math.max(0,now-Date.parse(f.oldestPendingAt)));
  return {offered:due.length,completed:completed.length,publishedReadback:due.filter(o=>this.visibility.get(o.id)?.firstPositive).length,quiet:items.filter(i=>i.state==='DONE'&&i.result==='QUIET').length,matureDeadlines:mature.length,byDeadline:byDeadline.length,deadlineUnknown:deadlineUnknown.length,confirmedLate:deadlineStates.filter(x=>x==='LATE').length,byDeadlineRate:mature.length&&!deadlineUnknown.length?byDeadline.length/mature.length:null,byDeadlineBounds:mature.length?{lower:byDeadline.length/mature.length,upper:(byDeadline.length+deadlineUnknown.length)/mature.length}:null,unresolved:due.length-completed.length,publicationLatencyMs:{samples:latency.length,p50:quantile(latency,.5),p95:quantile(latency,.95),p99:quantile(latency,.99),kind:'first-positive upper observation bound; success-only, exploratory tails'},modelCalls:this.costs?.modelCalls??sum(ops.map(o=>o.calls??0)),settledUsd:this.costs?.settledUsd??sum(ops.filter(o=>o.reported).map(o=>o.settledUsd??0)),outstandingReservedUsd:this.costs?.outstandingReservedUsd??sum(ops.filter(o=>!o.reported).map(o=>o.reservedUsd??0)),uncertainOperations:Math.max(this.costs?.uncertainOperations??0,ops.filter(o=>o.uncertain).length),missingCallCounts:ops.filter(o=>o.calls===null).length,tokensInObserved:sum(ops.map(o=>o.tokensIn??0)),tokensOutObserved:sum(ops.map(o=>o.tokensOut??0)),operationsMissingTokens:ops.filter(o=>o.tokensIn===null||o.tokensOut===null).length,modelFailuresObserved:ops.filter(o=>o.failure).length,repairOperationsObserved:ops.filter(o=>o.parent).length,modelLatencyMs:{samples:ops.filter(o=>Number.isFinite(o.latencyMs)).length,p50:quantile(ops.map(o=>o.latencyMs).filter(Number.isFinite),.5),p95:quantile(ops.map(o=>o.latencyMs).filter(Number.isFinite),.95)},backlog:sum([...this.feeds.values()].map(f=>f.backlog)),oldestPendingMs:knownAge.length?Math.max(...knownAge):[...this.feeds.values()].some(f=>f.backlog)?null:0,missingPendingAge:sum([...this.feeds.values()].map(f=>f.backlog-f.timestamped)),safetyViolations:this.violations.length,coverageComplete:due.every(o=>this.items.has(o.id))&&this.samples.length>0&&now-Date.parse(this.samples.at(-1).at)<=this.m.pollSeconds*2000&&this.samples.every(s=>s.coverageComplete),browserRuns:this.browser.size,browserRunsObserved:[...this.browser.values()].filter(b=>b.state!=='NOT_OBSERVED').length,financialCoverageComplete:!!this.costs&&now-Date.parse(this.costs.observedAt)<=60000,accountLedger:{settledUsd:sum([...this.ledger.values()].filter(r=>r.reported).map(r=>r.settledUsd)),heldUsd:sum([...this.ledger.values()].filter(r=>!r.reported).map(r=>r.reservedUsd)),reservations:this.ledger.size},factualAccuracy:null,notes:['Model calls are observed operation receipts, not inferred from HTTP.','Setup/artwork/collector costs require separate account-ledger reconciliation.','Zero observed safety violations is not proof of absence.']};
 }
}
export async function observeOnce(m,client,dir,registry,observation,adminCookie,costs){
 const offered=observation.plan.opportunities;
 for(let n=0;n<offered.length;n+=5){const batch=offered.slice(n,n+5);const r=await client.request(`/api/admin/agentops/campaigns/${m.runId}/snapshot`,{method:'POST',cookie:adminCookie,body:{opportunities:batch.map(o=>({feedId:o.feedId,window:o.window})),...(registry.browserRuns?.length?{browserRuns:registry.browserRuns}: {})},category:'observer'});observation.accept(r.value);writePrivate(dir,'last-snapshot.private.json',r.value);}
 for(const o of offered){
  const item=observation.items.get(o.id);
  if(item&&(item.state==='FAILED'||item.operations.some(op=>op.failure))&&!existsSync(resolve(dir,o.id+'.failure-evidence.private.json'))){const evidence=await client.request(`/api/admin/agentops/campaigns/${m.runId}/evidence`,{method:'POST',cookie:adminCookie,body:{feedId:o.feedId,window:o.window},category:'private-failure-evidence-export'});writePrivate(dir,o.id+'.failure-evidence.private.json',evidence.value);}
  if(!item?.editionId){if(item)observation.visible(o.id,observation.samples.at(-1).at,false);continue;}if(observation.visibility.get(o.id)?.isolationChecked)continue;
  const owner=registry.users.find(u=>u.id===o.ownerId),other=registry.users.find(u=>u.id!==o.ownerId);if(!owner||!other)throw Error('OWNER_REGISTRY');
  const base='/api/feed/'+encodeURIComponent(o.username)+'/'+encodeURIComponent(o.slug),path=base+'/editions/'+encodeURIComponent(item.editionId);
  const response=await client.request(path,{cookie:owner.cookie,category:'edition-readback',expected:[200,404,503]});
  const edition=response.value?.edition??response.value;const positive=response.status===200&&edition?.id===item.editionId;
  observation.visible(o.id,new Date().toISOString(),positive);
  if(positive){if(!existsSync(resolve(dir,o.id+'.evidence.private.json'))){const evidence=await client.request(`/api/admin/agentops/campaigns/${m.runId}/evidence`,{method:'POST',cookie:adminCookie,body:{feedId:o.feedId,window:o.window},category:'private-evidence-export'});writePrivate(dir,o.id+'.evidence.private.json',evidence.value);}
   if(Date.parse(observation.visibility.get(o.id).firstPositive)<Date.parse(o.window.scheduledFor??o.window.end))observation.violate('PREMATURE_READER_VISIBILITY',o.id);writePrivate(dir,o.id+'.edition.private.json',response.value);if(edition.windowStart&&edition.windowStart!==o.window.start||edition.windowEnd&&edition.windowEnd!==o.window.end)observation.violate('READER_WINDOW_MISMATCH',o.id);}
  if(!o.public){for(const cookie of [undefined,other.cookie]){const probe=await client.request(path,{cookie,category:'isolation-probe',expected:[200,401,403,404]});if(probe.status===200)observation.violate('CROSS_ACCOUNT_OR_ANONYMOUS_LEAKAGE',o.id);}}
  if(positive)observation.visibility.set(o.id,{...observation.visibility.get(o.id),isolationChecked:true});
 }
 if(costs)observation.reconcileCosts(costs);
 const summary=observation.summary();writePrivate(dir,'observer.private.json',{runId:m.runId,summary,items:[...observation.items.values()],operations:[...observation.operations],feeds:[...observation.feeds],samples:observation.samples,visibility:[...observation.visibility],violations:observation.violations,browser:[...observation.browser.values()]});
 const stop=budgetStop(m,summary);journal(dir,{category:'observation-summary',...summary,stop});return {summary,stop};
}
