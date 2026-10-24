/** Offline reference arithmetic only. Callers must validate the underlying
 * event/receipt meaning, clock domain, campaign cohort and cost attribution.
 * No network, pricing estimates, ledger writes or inference execution. */

function count(value,name) {
  if(!Number.isSafeInteger(value)||value<0)throw Error('INVALID_COUNT:'+name);
}
function nonnegative(value,name) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('INVALID_NUMBER:'+name);
}
function identity(value,name) {
  if(typeof value!=='string'||!value.trim())throw Error('INVALID_ID:'+name);
}

export function utcMillis(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw Error('INVALID_UTC_TIMESTAMP');
  const time=Date.parse(value);
  const normalized=value.includes('.')?value:value.replace(/Z$/,'.000Z');
  if(!Number.isFinite(time)||new Date(time).toISOString()!==normalized)throw Error('INVALID_UTC_TIMESTAMP');
  return time;
}

export function durationMs(start,end) {
  const a=start===null?null:utcMillis(start),b=end===null?null:utcMillis(end);
  if(a===null||b===null)return null;
  if(b<a)throw Error('NEGATIVE_DURATION_REQUIRES_INVESTIGATION');
  return b-a;
}

export function proportion(numerator,denominator) {
  count(numerator,'numerator');count(denominator,'denominator');
  if(numerator>denominator)throw Error('NUMERATOR_EXCEEDS_DENOMINATOR');
  return {numerator,denominator,value:denominator?numerator/denominator:null};
}

/** Caller must justify independent Bernoulli trials. Never automatically apply
 * this to correlated feed windows, model repetitions or cluster comparisons. */
export function wilson95(successes,trials) {
  const rate=proportion(successes,trials);
  if(!trials)return {...rate,interval:null,method:'wilson-95-independent-trials-only'};
  const z=1.959963984540054,z2=z*z,p=rate.value,scale=1+z2/trials;
  const center=(p+z2/(2*trials))/scale;
  const half=z*Math.sqrt(p*(1-p)/trials+z2/(4*trials*trials))/scale;
  return {...rate,interval:{lower:Math.max(0,center-half),upper:Math.min(1,center+half)},method:'wilson-95-independent-trials-only'};
}

export function percentileR7(values,p) {
  if(!Array.isArray(values)||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('INVALID_PERCENTILE_SAMPLE');
  if(typeof p!=='number'||!Number.isFinite(p)||p<0||p>1)throw Error('INVALID_PERCENTILE');
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,lo=Math.floor(index),weight=index-lo;
  return sorted[lo]+(sorted[Math.ceil(index)]-sorted[lo])*weight;
}

export function latencySummary(values) {
  if(!Array.isArray(values))throw Error('INVALID_LATENCY_SAMPLE');
  values.forEach(v=>nonnegative(v,'latencyMs'));
  const min=values.length?values.reduce((a,b)=>Math.min(a,b)):null;
  const max=values.length?values.reduce((a,b)=>Math.max(a,b)):null;
  return {unit:'ms',n:values.length,p50:percentileR7(values,.5),p95:percentileR7(values,.95),min,max,
    method:'Hyndman-Fan-R7',inference:'descriptive-only',
    tailWarning:values.length<100?'Fewer than 100 completed observations; tail estimate is exploratory.':
      'Sample size alone does not establish tail precision or independence.'};
}

/** A normalized success boundary is supplied by a future evidence collector:
 * e.g. valid public read-back, or explicit quiet completion under the protocol.
 * This helper does NOT turn any persisted result into operational success.
 * All rows belong to one declared clock domain/variant/language/cohort.
 * Later success events may be supplied for an as-of analysis; they are ignored
 * until observedUntil. A null means no established success time, never zero. */
export function deadlineCohort(rows,{observedUntil,deadlineMs}) {
  if(!Array.isArray(rows))throw Error('INVALID_COHORT');
  nonnegative(deadlineMs,'deadlineMs');
  const end=utcMillis(observedUntil),ids=new Set();
  let due=0,mature=0,immature=0,future=0,matureMet=0,observedMet=0,immatureUnresolved=0,observedSuccesses=0;
  for(const row of rows) {
    identity(row.opportunityId,'opportunityId');
    if(ids.has(row.opportunityId))throw Error('DUPLICATE_OPPORTUNITY');
    ids.add(row.opportunityId);
    const at=utcMillis(row.dueAt),success=row.successAt===null?null:utcMillis(row.successAt);
    if(success!==null&&success<at)throw Error('SUCCESS_PRECEDES_CUTOFF');
    const deadline=at+deadlineMs;
    if(!Number.isSafeInteger(deadline))throw Error('INVALID_DEADLINE');
    if(at>end){future++;continue;}
    due++;
    const visible=success!==null&&success<=end,met=visible&&success<=deadline;
    if(visible)observedSuccesses++;
    if(met)observedMet++;
    if(deadline<=end){mature++;if(met)matureMet++;}
    else {immature++;if(!met)immatureUnresolved++;}
  }
  return {due,mature,immature,future,observedSuccesses,
    deadlineSuccess:proportion(matureMet,mature),
    dueCohortBounds:{lower:due?observedMet/due:null,upper:due?(observedMet+immatureUnresolved)/due:null,
      meaning:'Bounds on deadline attainment for this due cohort, not a confidence interval.'},
    inference:'descriptive-only; correlation and failure-state breakdown require campaign analysis'};
}

/** Final normalized operation snapshots only. Duplicated join rows must agree.
 * A changing/contradictory financial record must be reconciled by the collector,
 * not resolved here by taking a cheaper value. Identity is provider + globally
 * scoped canonical billing operation ID, NOT edition/attempt/receipt-row ID.
 * Costs include only attributed provider operations, not full infrastructure. */
export function costSummary(rows,verifiedPublishedBriefings) {
  if(!Array.isArray(rows))throw Error('INVALID_COST_ROWS');
  count(verifiedPublishedBriefings,'verifiedPublishedBriefings');
  const unique=new Map();
  for(const row of rows) {
    identity(row.provider,'provider');identity(row.operationId,'operationId');
    nonnegative(row.reservedCeilingUsd,'reservedCeilingUsd');
    if(!['LEDGER_SETTLED','PROVIDER_REPORTED','UNKNOWN'].includes(row.confirmation))throw Error('INVALID_COST_CONFIRMATION');
    if(row.actualCostUsd!==null)nonnegative(row.actualCostUsd,'actualCostUsd');
    if((row.confirmation==='UNKNOWN')!==(row.actualCostUsd===null))throw Error('INCONSISTENT_COST_EVIDENCE');
    const value={provider:row.provider,operationId:row.operationId,reservedCeilingUsd:row.reservedCeilingUsd,
      actualCostUsd:row.actualCostUsd,confirmation:row.confirmation};
    const key=JSON.stringify([row.provider,row.operationId]),previous=unique.get(key);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(value))throw Error('CONFLICTING_OPERATION_ACCOUNTING');
    unique.set(key,value);
  }
  let known=0,settled=0,unknown=0,settledCount=0,reserved=0,exposure=0;
  for(const row of unique.values()) {
    reserved+=row.reservedCeilingUsd;
    if(row.actualCostUsd===null)unknown++;else known+=row.actualCostUsd;
    if(row.confirmation==='LEDGER_SETTLED'){settledCount++;settled+=row.actualCostUsd;}
    else exposure+=Math.max(row.reservedCeilingUsd,row.actualCostUsd??0);
  }
  for(const [name,value] of Object.entries({known,settled,reserved,exposure}))nonnegative(value,'aggregate_'+name);
  const full=unknown?null:known;
  return {costScope:'attributed_provider_operations_only',currency:'USD',operations:unique.size,
    duplicateJoinRows:rows.length-unique.size,knownReportedCostUsd:known,ledgerSettledCostUsd:settled,
    unknownCostOperations:unknown,fullyReportedCostUsd:full,totalReservedCeilingsUsd:reserved,
    unsettledRecordedExposureUsd:exposure,
    settlementCoverage:proportion(settledCount,unique.size),
    verifiedPublishedBriefings,
    costPerPublishedReportedUsd:full===null||!verifiedPublishedBriefings?null:full/verifiedPublishedBriefings,
    note:'Recorded exposure is not actual spend or a guaranteed billing cap. Infrastructure, estimates and unallocated shared costs are excluded.'};
}
