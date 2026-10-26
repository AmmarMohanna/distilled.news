/** Strict normalized evidence contract v0.1 for the offline report.
 * Records are metadata only: there is deliberately no field for article text,
 * prompts, model output, credentials or push endpoints. Every key is required
 * (unknown values are an explicit null, never an omission) and unknown keys are
 * rejected. Validation here is per record; campaign-relative rules (declared
 * clock domains, allowed bases per mode, frozen input hashes, references)
 * are enforced by the importer. */
import {utcMillis} from './metrics.mjs';

export const EVIDENCE_SCHEMA_VERSION='0.1';
export const MODES=['OFFLINE_CONTRACT','FROZEN_REPLAY','CONTROLLED_LIVE','HISTORICAL_AUDIT'];
export const OUTCOMES=['PUBLISHED_READBACK','QUIET','SAFE_REJECTED','FAILED','PERSISTED_UNCONFIRMED','PENDING','UNKNOWN','NOT_ADMITTED'];
/** A known terminal outcome resolves an opportunity; it is not necessarily delivery success. */
export const TERMINAL_OUTCOMES=['PUBLISHED_READBACK','QUIET','SAFE_REJECTED','FAILED','NOT_ADMITTED'];
export const SUCCESS_OUTCOMES=['PUBLISHED_READBACK','QUIET'];
export const CLOCK_KINDS=['WALL_UTC','LOGICAL_REPLAY','SYNTHETIC'];
/** Timestamp basis says how a boundary was established. Proxies stay labelled. */
export const BASIS_CLOCK_KIND={
  SYNTHETIC_FIXTURE:'SYNTHETIC',LOGICAL_REPLAY:'LOGICAL_REPLAY',SCHEDULE:'WALL_UTC',
  PROSPECTIVE_OBSERVATION:'WALL_UTC',APPLICATION_RECORDED_PROXY:'WALL_UTC',HISTORICAL_PROXY:'WALL_UTC'};
export const PROXY_BASES=['APPLICATION_RECORDED_PROXY','HISTORICAL_PROXY'];
export const BASES_BY_MODE={
  OFFLINE_CONTRACT:['SYNTHETIC_FIXTURE'],
  FROZEN_REPLAY:['LOGICAL_REPLAY','PROSPECTIVE_OBSERVATION','HISTORICAL_PROXY'],
  CONTROLLED_LIVE:['SCHEDULE','PROSPECTIVE_OBSERVATION','APPLICATION_RECORDED_PROXY'],
  HISTORICAL_AUDIT:['SCHEDULE','HISTORICAL_PROXY','APPLICATION_RECORDED_PROXY']};

// Identifiers are short opaque tokens so free text cannot ride along in an ID.
const ID=/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/,SHA=/^[0-9a-f]{64}$/,COMMIT=/^[0-9a-f]{7,40}$/,CODE=/^[A-Z][A-Z0-9_]{0,79}$/;

const fail=(errors,path,code)=>{errors.push(path+': '+code);return false;};
const id=(v,p,e)=>typeof v==='string'&&ID.test(v)||fail(e,p,'INVALID_ID');
const sha=(v,p,e)=>typeof v==='string'&&SHA.test(v)||fail(e,p,'INVALID_SHA256');
const commit=(v,p,e)=>typeof v==='string'&&COMMIT.test(v)||fail(e,p,'INVALID_COMMIT');
const code=(v,p,e)=>typeof v==='string'&&CODE.test(v)||fail(e,p,'INVALID_REASON_CODE');
const bool=(v,p,e)=>typeof v==='boolean'||fail(e,p,'INVALID_BOOLEAN');
const count=(v,p,e)=>Number.isSafeInteger(v)&&v>=0||fail(e,p,'INVALID_COUNT');
const usd=(v,p,e)=>typeof v==='number'&&Number.isFinite(v)&&v>=0||fail(e,p,'INVALID_USD');
const literal=x=>(v,p,e)=>v===x||fail(e,p,'EXPECTED_'+x);
const oneOf=list=>(v,p,e)=>list.includes(v)||fail(e,p,'INVALID_ENUM');
const nullable=check=>(v,p,e)=>v===null||check(v,p,e);
const list=(check,{min=0}={})=>(v,p,e)=>{
  if(!Array.isArray(v))return fail(e,p,'INVALID_ARRAY');
  if(v.length<min)return fail(e,p,'TOO_FEW_ITEMS');
  return v.map((x,i)=>check(x,p+'['+i+']',e)).every(Boolean);
};
const object=shape=>(v,p,e)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))return fail(e,p,'INVALID_OBJECT');
  let ok=true;
  for(const key of Object.keys(v))if(!Object.hasOwn(shape,key))ok=fail(e,p+'.'+key,'UNKNOWN_FIELD');
  for(const [key,check] of Object.entries(shape)) {
    if(!Object.hasOwn(v,key))ok=fail(e,p+'.'+key,'MISSING_FIELD');
    else if(!check(v[key],p+'.'+key,e))ok=false;
  }
  return ok;
};
const utc=(v,p,e)=>{try{utcMillis(v);return true;}catch{return fail(e,p,'INVALID_UTC_TIMESTAMP');}};
export const timestamp=object({at:utc,clockDomain:id,basis:oneOf(Object.keys(BASIS_CLOCK_KIND))});
const evidenceRef=object({kind:code,ref:id,sha256:nullable(sha)});
const refs=list(evidenceRef);
const header=type=>({recordType:literal(type),schemaVersion:literal(EVIDENCE_SCHEMA_VERSION),campaignId:id});

/** Identity fields per record type. Financial operations are globally scoped by
 * provider + canonical billing ID, so one operation cannot be attributed twice. */
export const IDENTITY={
  campaign:['campaignId'],opportunity:['campaignId','opportunityId'],acquisitionJob:['campaignId','jobId'],
  attempt:['campaignId','attemptId'],financialOperation:['provider','operationId'],
  publication:['campaignId','editionId'],subscriptionReceipt:['campaignId','unitId'],intervention:['campaignId','interventionId']};

export const RECORD_SCHEMAS={
  campaign:object({...header('campaign'),protocolVersion:id,experimentMode:oneOf(MODES),
    providerExecution:oneOf(['NONE','DOUBLED','REAL']),faultSchedule:nullable(id),cachePolicy:id,
    codeCommit:nullable(commit),datasetManifestSha256:nullable(sha),
    inputs:list(object({caseId:id,sha256:sha})),
    clockDomains:list(object({id,kind:oneOf(CLOCK_KINDS)}),{min:1}),
    observedUntil:timestamp,deadlineMs:nullable(count),evidenceRefs:refs}),
  opportunity:object({...header('opportunity'),opportunityId:id,feedId:id,scheduleRevision:id,
    windowStart:timestamp,windowEnd:timestamp,variant:id,partition:id,language:oneOf(['en','ar','fr','mixed']),
    workload:id,independentGroupId:id,caseId:nullable(id),inputSha256:nullable(sha),
    outcome:oneOf(OUTCOMES),outcomeReason:nullable(code),outcomeAt:nullable(timestamp),evidenceRefs:refs}),
  acquisitionJob:object({...header('acquisitionJob'),jobId:id,opportunityId:nullable(id),
    sourceType:oneOf(['RSS','GOOGLE_NEWS','X','TELEGRAM','LINKEDIN','WEBSITE','SYNTHETIC']),
    outcome:oneOf(['ACCEPTED_READABLE','PARTIAL','REJECTED_UNREADABLE','PERMANENT_SOURCE_ERROR','TRANSIENT_FAILURE','NOT_STARTED','UNKNOWN']),
    outcomeReason:nullable(code),evidenceRefs:refs}),
  attempt:object({...header('attempt'),attemptId:id,kind:oneOf(['ACQUISITION','PROCESSING','INFERENCE','PUSH']),
    parentId:id,attemptIndex:count,startedAt:nullable(timestamp),completedAt:nullable(timestamp),
    outcome:oneOf(['SUCCEEDED','FAILED','TIMED_OUT','IN_PROGRESS','UNKNOWN']),errorCode:nullable(code),evidenceRefs:refs}),
  financialOperation:object({...header('financialOperation'),provider:id,operationId:id,opportunityId:nullable(id),
    allocation:oneOf(['DIRECT','UNALLOCATED_SHARED']),reservedCeilingUsd:usd,actualCostUsd:nullable(usd),
    confirmation:oneOf(['LEDGER_SETTLED','PROVIDER_REPORTED','UNKNOWN']),evidenceRefs:refs}),
  publication:object({...header('publication'),editionId:id,opportunityId:id,publishedAt:timestamp,
    readback:object({lastNegativeAt:nullable(timestamp),firstPositiveAt:nullable(timestamp),probeIntervalMs:nullable(count)}),
    evidenceRefs:refs}),
  subscriptionReceipt:object({...header('subscriptionReceipt'),unitId:id,editionId:id,subscriptionVersionId:id,
    status:oneOf(['ACCEPTED_BY_PUSH_SERVICE','REJECTED_BY_PUSH_SERVICE','NOT_SENT','UNKNOWN']),
    observedFullHorizon:bool,acceptedAt:nullable(timestamp),networkSendId:nullable(id),evidenceRefs:refs}),
  intervention:object({...header('intervention'),interventionId:id,opportunityId:nullable(id),actorRole:id,kind:code,
    startedAt:timestamp,endedAt:nullable(timestamp),activeMinutes:nullable(usd),evidenceRefs:refs})
};

/** Order two timestamps only when they share a clock domain; never across. */
function ordered(a,b,path,errors,code='TIMESTAMPS_OUT_OF_ORDER') {
  if(a&&b&&a.clockDomain===b.clockDomain&&utcMillis(b.at)<utcMillis(a.at))fail(errors,path,code);
}

function semantic(r,errors) {
  switch(r.recordType) {
    case 'campaign':
      if(new Set(r.clockDomains.map(d=>d.id)).size!==r.clockDomains.length)fail(errors,'clockDomains','DUPLICATE_CLOCK_DOMAIN');
      if(new Set(r.inputs.map(i=>i.caseId)).size!==r.inputs.length)fail(errors,'inputs','DUPLICATE_CASE_ID');
      if(r.experimentMode==='OFFLINE_CONTRACT'&&r.providerExecution==='REAL')fail(errors,'providerExecution','REAL_PROVIDER_IN_OFFLINE_MODE');
      break;
    case 'opportunity':
      if(r.windowStart.clockDomain!==r.windowEnd.clockDomain)fail(errors,'windowEnd','WINDOW_CROSSES_CLOCK_DOMAINS');
      else if(utcMillis(r.windowEnd.at)<=utcMillis(r.windowStart.at))fail(errors,'windowEnd','EMPTY_OR_NEGATIVE_WINDOW');
      if((r.caseId===null)!==(r.inputSha256===null))fail(errors,'inputSha256','CASE_AND_HASH_MUST_BE_PAIRED');
      // A success cannot precede the cutoff; an admission denial or failure may be decided earlier.
      if(SUCCESS_OUTCOMES.includes(r.outcome))ordered(r.windowEnd,r.outcomeAt,'outcomeAt',errors,'SUCCESS_PRECEDES_CUTOFF');
      break;
    case 'attempt':
      ordered(r.startedAt,r.completedAt,'completedAt',errors);
      if(r.outcome!=='IN_PROGRESS'&&r.outcome!=='UNKNOWN'&&r.completedAt===null)fail(errors,'completedAt','FINISHED_ATTEMPT_WITHOUT_COMPLETION');
      break;
    case 'financialOperation':
      if((r.confirmation==='UNKNOWN')!==(r.actualCostUsd===null))fail(errors,'actualCostUsd','INCONSISTENT_COST_EVIDENCE');
      if((r.allocation==='UNALLOCATED_SHARED')!==(r.opportunityId===null))fail(errors,'allocation','ALLOCATION_OPPORTUNITY_MISMATCH');
      break;
    case 'publication':
      ordered(r.readback.lastNegativeAt,r.readback.firstPositiveAt,'readback.firstPositiveAt',errors,'POSITIVE_PROBE_PRECEDES_NEGATIVE');
      ordered(r.publishedAt,r.readback.firstPositiveAt,'readback.firstPositiveAt',errors,'READBACK_PRECEDES_PUBLICATION');
      break;
    case 'subscriptionReceipt':
      if((r.status==='ACCEPTED_BY_PUSH_SERVICE')!==(r.acceptedAt!==null))fail(errors,'acceptedAt','ACCEPTANCE_TIME_MISMATCH');
      break;
    case 'intervention':
      ordered(r.startedAt,r.endedAt,'endedAt',errors);
      break;
  }
}

/** Returns a list of `path: CODE` errors; empty means the record is valid. */
export function validateRecord(record) {
  const errors=[];
  const schema=RECORD_SCHEMAS[record?.recordType];
  if(!schema)return ['recordType: UNSUPPORTED_RECORD_TYPE'];
  if(schema(record,record.recordType,errors))semantic(record,errors);
  return errors;
}

export function recordIdentity(record) {
  return JSON.stringify([record.recordType,...IDENTITY[record.recordType].map(k=>record[k])]);
}

/** Key-sorted JSON so identical evidence compares equal regardless of key order. */
export function canonicalJson(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
