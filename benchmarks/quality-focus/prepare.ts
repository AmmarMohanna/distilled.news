/** Offline-only frozen comparison preparation. Never invokes a provider. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {CONSOLIDATE_SYSTEM,EDITOR_SYSTEM_V4} from '../../packages/briefing/src/prompts';
import {admitModelOperation,modelCapability} from '../../apps/worker/src/v1-intelligence/model-capacity';
const dir=fileURLToPath(new URL('../../.local-reports/leb-quality-latest/',import.meta.url));
const load=(name:string)=>JSON.parse(readFileSync(dir+name,'utf8'));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const consolidation=load('consolidation-requests.private.json');
const editor=load('editor-requests.private.json');
const newest=consolidation.find((r:any)=>r.editionId==='f1c673e7ed90ec208ad4afc4ff3a2381e020146ea18c9ee878d4eac7a8060770').request;
const brevity=consolidation.find((r:any)=>r.editionId==='69f09cdeb86f1abad969ce2897f8a72a40ab978b405adc53c3a17087d0d4d2a8').request;
const transfer=consolidation.find((r:any)=>r.editionId==='2297f8d3d90ba022c4f8e02d64285c54a69c376da0777301ccf38715c993de29').request;
const update=editor.find((r:any)=>r.request.user.includes('\u0646\u0635\u0641 \u0642\u0627\u0626\u0645')).request;
const rules={selection:'An announced action that can interrupt government operations or alter public services is substantive news, not routine commentary merely because it comes from a political actor. Rank it above general appeals; preserve attribution and prospective status, and keep distinct developments separate.',brevity:'Let the headline carry the main idea. Use the body only for essential information the headline does not convey; if it adds nothing, return an empty body. Preserve unique locations, consequences, attribution and uncertainty, without restating the headline.',update:'For an update, identify the new information relative to what the reader was already told. Preserve the source wording that qualifies a measurement; do not treat differently described weights or totals as a correction or directly comparable figures unless the evidence establishes that.'};
const cases=[{id:'selection-development',request:newest,rule:rules.selection,expected:'Retain the attributed prospective cabinet boycott, avoid unrelated merges; do not fabricate a completed boycott. Protected leads stay protected.'},{id:'brevity-development',request:brevity,rule:rules.brevity,expected:'No duplicate flare body; preserve crash location and traffic consequences. No loss of essential facts or hedges.'},{id:'update-development',request:update,rule:rules.update,expected:'Preserve reported weight basis and continuity with prior seizure reporting; do not invent a correction or conflate net/gross measures. No important unrelated development lost.'},{id:'selection-transfer',request:transfer,rule:rules.selection,expected:'Keep electricity risk and official food-safety meeting with time/uncertainty. No unrelated merge or lower-value substitution. Not an unseen-source holdout: this window has already been reviewed.'}];
const pricing=load('pricing.json').models.find((m:any)=>m.id==='openai/gpt-4.1');
assert.equal(Number(pricing.pricing.prompt),0.000002);assert.equal(Number(pricing.pricing.completion),0.000008);
const requests=cases.flatMap(c=>{
 assert.equal(c.request.model,'openai/gpt-4.1');assert.equal(c.request.maxTokens,4000);
 assert.equal(c.request.system,c.id==='update-development'?EDITOR_SYSTEM_V4:CONSOLIDATE_SYSTEM);
 return ['baseline','candidate'].map(variant=>{
  const request={...c.request,system:c.request.system+(variant==='candidate'?'\n\n'+c.rule:'')};
  const {system:_,...fixed}=request;const {system:__,...originalFixed}=c.request;assert.deepEqual(fixed,originalFixed);
  const admission=admitModelOperation(request.model,request,{type:'object',properties:{},required:[],additionalProperties:false},modelCapability(request.model),request.maxTokens);assert.ok(admission.fits);
  return {id:c.id+'-'+variant,case:c.id,variant,request,requestHash:hash(request),fixedInputHash:hash(fixed),reservedUsd:admission.reservationCostUsd,expected:c.expected};
 });
});
assert.equal(requests.length,8);for(let i=0;i<8;i+=2)assert.equal(requests[i].fixedInputHash,requests[i+1].fixedInputHash);
const plan={schemaVersion:'distilled-quality-focus.v1',preparedAt:new Date().toISOString(),status:'PREPARED_NOT_RUN',paidCalls:0,additionalInferenceCostUsd:0,maximumCalls:8,maximumReservedUsd:requests.reduce((n,r)=>n+r.reservedUsd,0),parameters:{model:'openai/gpt-4.1',temperature:0.1,jsonMode:true,maxTokens:4000,retries:0},limitations:['Small AI-assisted development/transfer evaluation, not human gold or an unseen-source holdout.','Consolidation inputs contain drafts, not full source evidence; assess findings against retained original articles offline.','No production prompt or lead-protection change. No publication, deployment, notifications or live traffic.','Real execution requires fresh approval and existing authoritative reservation/settlement; stop on uncertainty.'],requests};
writeFileSync(dir+'quality-focus-plan.private.json',JSON.stringify(plan,null,2)+'\n');
const summary={...plan,requests:requests.map(({request,...r})=>r)};writeFileSync(dir+'quality-focus-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:plan.status,requests:requests.length,reservationUsd:plan.maximumReservedUsd,fixedInputPairsVerified:4,productionChanged:false}));
