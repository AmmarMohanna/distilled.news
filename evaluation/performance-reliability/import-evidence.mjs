/** Strict, idempotent importer for normalized evidence bundles (JSON Lines).
 * Schema, reference, clock-domain, mode-basis and frozen-input-hash errors are
 * fatal. Contradictions between records are reported, never resolved by
 * picking a value: a contradicted opportunity stays in every denominator with
 * an UNKNOWN effective outcome, and a contradicted financial operation becomes
 * an unknown cost. Records are immutable; a later observation is a new record. */
import {createHash} from 'node:crypto';
import {utcMillis} from './metrics.mjs';
import {validateRecord,recordIdentity,canonicalJson,BASES_BY_MODE,BASIS_CLOCK_KIND} from './evidence-schema.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');

export function parseEvidenceJsonl(text) {
  if(typeof text!=='string')throw Error('INVALID_EVIDENCE_BUNDLE');
  const records=[];
  text.split('\n').forEach((line,i)=>{
    if(!line.trim())return;
    try{records.push(JSON.parse(line));}catch{throw Error('INVALID_JSONL_LINE:'+(i+1));}
  });
  return records;
}

class EvidenceError extends Error {
  constructor(code,details){super(code+'\n'+details.join('\n'));this.code=code;this.details=details;}
}

/** Walk every timestamp object in a record with its field path. */
function timestamps(record) {
  const found=[];
  const walk=(v,p)=>{
    if(!v||typeof v!=='object')return;
    if(typeof v.at==='string'&&'clockDomain' in v&&'basis' in v){found.push([p,v]);return;}
    for(const [k,x] of Object.entries(v))walk(x,p?p+'.'+k:k);
  };
  walk(record,'');
  return found;
}

export function importEvidence(records) {
  if(!Array.isArray(records))throw Error('INVALID_EVIDENCE_RECORDS');
  const schemaErrors=[];
  records.forEach((r,i)=>validateRecord(r).forEach(e=>schemaErrors.push('record '+i+' '+e)));
  if(schemaErrors.length)throw new EvidenceError('EVIDENCE_SCHEMA_INVALID',schemaErrors);

  // Idempotent identities: identical repeats are duplicates, differing repeats are contradictions.
  const unique=new Map(),variants=new Map();
  let duplicateRecords=0;
  for(const record of records) {
    const key=recordIdentity(record),body=canonicalJson(record);
    if(!unique.has(key)){unique.set(key,record);variants.set(key,new Set([body]));continue;}
    if(variants.get(key).has(body))duplicateRecords++;
    else variants.get(key).add(body);
  }
  const contradictions=[...variants].filter(([,v])=>v.size>1).map(([key,v])=>{
    const [recordType,...identity]=JSON.parse(key);
    return {recordType,identity,variantSha256:[...v].map(sha).sort()};
  }).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
  const contradicted=new Set(contradictions.map(c=>JSON.stringify([c.recordType,...c.identity])));

  const fatal=[],diagnostics=[];
  const campaigns=new Map();
  for(const r of unique.values())if(r.recordType==='campaign') {
    if(contradicted.has(recordIdentity(r)))fatal.push('campaign '+r.campaignId+': CONTRADICTORY_CAMPAIGN_MANIFEST');
    campaigns.set(r.campaignId,{campaign:r,opportunities:new Map(),acquisitionJobs:new Map(),attempts:new Map(),
      financialOperations:new Map(),publications:new Map(),subscriptionReceipts:new Map(),interventions:new Map()});
  }
  const bucket={opportunity:'opportunities',acquisitionJob:'acquisitionJobs',attempt:'attempts',financialOperation:'financialOperations',
    publication:'publications',subscriptionReceipt:'subscriptionReceipts',intervention:'interventions'};
  const bucketKey={opportunity:'opportunityId',acquisitionJob:'jobId',attempt:'attemptId',publication:'editionId',
    subscriptionReceipt:'unitId',intervention:'interventionId'};
  for(const r of unique.values()) {
    if(r.recordType==='campaign')continue;
    const c=campaigns.get(r.campaignId);
    if(!c){fatal.push(r.recordType+' '+recordIdentity(r)+': UNKNOWN_CAMPAIGN');continue;}
    const key=r.recordType==='financialOperation'?JSON.stringify([r.provider,r.operationId]):r[bucketKey[r.recordType]];
    const bad=contradicted.has(recordIdentity(r));
    c[bucket[r.recordType]].set(key,{record:r,contradicted:bad,variants:bad?[...variants.get(recordIdentity(r))].map(b=>JSON.parse(b)):null});
  }

  for(const [campaignId,c] of campaigns) {
    const mode=c.campaign.experimentMode,domains=new Map(c.campaign.clockDomains.map(d=>[d.id,d.kind]));
    const inputs=new Map(c.campaign.inputs.map(i=>[i.caseId,i.sha256]));
    const horizonDomain=c.campaign.observedUntil.clockDomain;
    const all=[{record:c.campaign},...Object.values(bucket).flatMap(b=>[...c[b].values()])];
    for(const {record} of all) {
      const where=record.recordType+' '+recordIdentity(record);
      for(const [path,t] of timestamps(record)) {
        if(!domains.has(t.clockDomain))fatal.push(where+' '+path+': UNDECLARED_CLOCK_DOMAIN');
        else if(domains.get(t.clockDomain)!==BASIS_CLOCK_KIND[t.basis])fatal.push(where+' '+path+': BASIS_CLOCK_KIND_MISMATCH');
        if(!BASES_BY_MODE[mode].includes(t.basis))fatal.push(where+' '+path+': BASIS_NOT_ALLOWED_IN_'+mode);
      }
    }
    const opp=id=>c.opportunities.get(id);
    for(const {record:o} of c.opportunities.values()) {
      if(o.windowEnd.clockDomain!==horizonDomain)fatal.push('opportunity '+o.opportunityId+': WINDOW_AND_HORIZON_CLOCK_DOMAINS_DIFFER');
      if(o.caseId!==null&&inputs.get(o.caseId)!==o.inputSha256)fatal.push('opportunity '+o.opportunityId+': INPUT_HASH_MISMATCH');
    }
    const requireOpportunity=(record,idField)=>{
      if(record[idField]!==null&&!opp(record[idField]))fatal.push(record.recordType+' '+recordIdentity(record)+': UNKNOWN_OPPORTUNITY_IN_CAMPAIGN');
    };
    for(const b of ['acquisitionJobs','financialOperations','publications','interventions'])
      for(const {record} of c[b].values())requireOpportunity(record,'opportunityId');
    for(const {record:a} of c.attempts.values())
      if(!c.acquisitionJobs.has(a.parentId)&&!opp(a.parentId))fatal.push('attempt '+a.attemptId+': UNKNOWN_PARENT_IN_CAMPAIGN');
    for(const {record:s} of c.subscriptionReceipts.values())
      if(!c.publications.has(s.editionId))fatal.push('subscriptionReceipt '+s.unitId+': UNKNOWN_EDITION_IN_CAMPAIGN');

    // Cross-record consistency: diagnostics, not deletions.
    const end=c.campaign.observedUntil;
    const confirmed=new Map();
    for(const {record:p,contradicted:bad} of c.publications.values()) {
      const u=p.readback.firstPositiveAt;
      if(bad||!u||!opp(p.opportunityId))continue;
      if(u.clockDomain===end.clockDomain&&utcMillis(u.at)>utcMillis(end.at))continue;
      const list=confirmed.get(p.opportunityId)??[];list.push(p.editionId);confirmed.set(p.opportunityId,list);
    }
    for(const [opportunityId,editions] of confirmed)if(editions.length>1)
      diagnostics.push({campaignId,code:'DUPLICATE_LOGICAL_PUBLICATION',opportunityId,editionIds:editions.sort(),safetyInvariant:true});
    for(const entry of c.opportunities.values()) {
      const o=entry.record;
      let effective=entry.contradicted?'UNKNOWN':o.outcome;
      if(entry.contradicted)diagnostics.push({campaignId,code:'CONTRADICTORY_OPPORTUNITY_RECORDS',opportunityId:o.opportunityId});
      else if(o.outcome==='PUBLISHED_READBACK'&&!confirmed.has(o.opportunityId)) {
        effective='UNKNOWN';
        diagnostics.push({campaignId,code:'PUBLISHED_READBACK_WITHOUT_CONFIRMED_READBACK',opportunityId:o.opportunityId});
      } else if(o.outcome==='QUIET'&&o.outcomeAt===null)
        diagnostics.push({campaignId,code:'QUIET_WITHOUT_COMPLETION_TIME',opportunityId:o.opportunityId});
      entry.effectiveOutcome=effective;
    }
    for(const [key,{record:f,contradicted:bad}] of c.financialOperations)
      if(bad)diagnostics.push({campaignId,code:'CONTRADICTORY_FINANCIAL_OPERATION',provider:f.provider,operationId:f.operationId});
  }
  // A financial identity contradicted across campaigns is attributed to none of them silently.
  for(const [key,bodies] of variants) {
    const owners=new Set([...bodies].map(b=>JSON.parse(b)).filter(r=>r.recordType==='financialOperation').map(r=>r.campaignId));
    if(owners.size>1)fatal.push('financialOperation '+key+': OPERATION_ATTRIBUTED_TO_MULTIPLE_CAMPAIGNS');
  }
  if(fatal.length)throw new EvidenceError('EVIDENCE_REFERENCE_INVALID',[...new Set(fatal)].sort());
  diagnostics.sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
  return {inputRecords:records.length,uniqueRecords:unique.size,duplicateRecords,contradictions,diagnostics,campaigns};
}
