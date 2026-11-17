/** Offline preparation only: writes fixed request pairs, no network/provider calls. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {EDITOR_SYSTEM_V4,EDITOR_SYSTEM_V5,VERIFY_SYSTEM,VERIFY_SYSTEM_V5,editorUser,verifyUser} from '../../packages/briefing/src/prompts';
import {prepareArticles} from '../../packages/briefing/src/prepare';
import {admitModelOperation,modelCapability} from '../../apps/worker/src/v1-intelligence/model-capacity';
const dir=fileURLToPath(new URL('../../.local-reports/leb-repeat-nov1/',import.meta.url));mkdirSync(dir,{recursive:true});
const retained=JSON.parse(readFileSync(resolve(dir,'operations.private.json'),'utf8')).result[0].results.filter((r:any)=>r.kind==='semantic_intents').map((r:any)=>JSON.parse(r.json));
const exact=(model:string)=>retained.find((r:any)=>r.input.model===model).input.state.request;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requests:any[]=[];
function pair(name:string,baseline:any,candidateSystem:string,expected:unknown,provenance:string){
 for(const variant of ['baseline','candidate']){
  const request={...baseline,system:variant==='baseline'?baseline.system:candidateSystem};
  const {signal:_,...state}=request;
  const admission=admitModelOperation(request.model,state,{type:'object',properties:{},required:[],additionalProperties:false},modelCapability(request.model),request.maxTokens);
  if(!admission.fits)throw Error('REQUEST_NOT_ADMITTED');
  requests.push({id:name+'-'+variant,variant,provenance,request,requestHash:hash(state),reservedUsd:admission.reservationCostUsd,inputTokenUpperBound:admission.inputTokenUpperBound,expected});
 }
}
pair('retained-editor',exact('openai/gpt-4.1'),EDITOR_SYSTEM_V5,{repeatedPlanShouldBeOmitted:true,otherDevelopments:'independent review required'},'Exact retained staging request; same evidence, prior, model and token limit.');
pair('retained-verifier',exact('openai/gpt-4.1-mini'),VERIFY_SYSTEM_V5,{item0:'redundant',item1:'review separately; shared attribution and chronology require source judgment'},'Exact retained staging verifier input and draft.');
const prior=[{id:'plan',at:'2026-11-01T07:00:00Z',headline:'Port authority proposes closing Harbour A if storm conditions worsen',body:'The proposal has not been approved.'},{id:'ships',at:'2026-11-01T07:00:00Z',headline:'Coastguard prepares possible restrictions at Harbour A and Harbour B',body:'Restrictions remain conditional on worsening conditions.'},{id:'estimate',at:'2026-11-01T07:00:00Z',headline:'The authority estimated repairs at $10 million',body:''}];
const facts=[
 ['recombined','A second outlet repeats the same authority proposal to close Harbour A and the same possible coastguard restrictions at Harbour A and Harbour B. No new decision has been announced.','redundant'],
 ['approved','The authority has now approved the previously proposed closure of Harbour A. The closure will start only if storm conditions worsen.','ok'],
 ['corrected','The authority corrected its earlier repair estimate: $8 million, not $10 million.','ok'],
 ['separate','A separate inspection found structural damage at Harbour C; it has now closed for repairs. This is unrelated to the conditional storm restrictions at Harbour A and Harbour B.','ok'],
 ['same-origin','Three outlets quote the same original authority statement proposing the closure of Harbour A if storm conditions worsen; no approval or new evidence is reported.','redundant'],
 ['confirmed','The coastguard independently inspected Harbour B and now confirms the previously unverified structural damage there. Earlier reports had only alleged damage.','ok']
] as const;
const feed={interest:'Important transport and port safety developments',language:'en' as const,windowMinutes:60},windowStart='2026-11-01T07:55:00Z',windowEnd='2026-11-01T08:55:00Z';
const articles=facts.map(([id,text])=>({id,source:'synthetic-control',publishedAt:'2026-11-01T08:10:00Z',text})),prepared=prepareArticles(articles,{nearDuplicate:1.01}).prepared;
const priorWithUnverified=[...prior,{id:'damage',at:'2026-11-01T07:00:00Z',headline:'Unverified reports allege structural damage at Harbour B',body:'No independent inspection has confirmed the allegation.'}];
pair('control-editor',{model:'openai/gpt-4.1',system:EDITOR_SYSTEM_V4,user:editorUser({feed,windowStart,windowEnd,prior:priorWithUnverified,articles:prepared,promptVersion:4}),maxTokens:4000},EDITOR_SYSTEM_V5,{omit:['recombined','same-origin'],retain:['approved','corrected','separate','confirmed']},'Synthetic controls, not evidence of real-world factual accuracy.');
pair('control-verifier',{model:'openai/gpt-4.1-mini',system:VERIFY_SYSTEM,user:verifyUser({windowEnd,prior:priorWithUnverified,sources:prepared,promptVersion:4,items:facts.map(([,text,verdict],index)=>({index,headline:text,body:'',relation:'new',sources:[prepared[index].ref],hints:[]}))}),maxTokens:3000},VERIFY_SYSTEM_V5,facts.map(([id,,verdict],i)=>({id,i,verdict})),'Synthetic controls of repetition, approval, correction, distinct occurrence, same-origin reporting and materially changed certainty.');
const result={schemaVersion:'novelty-union-comparison.v1',preparedAt:new Date().toISOString(),status:'PREPARED_NOT_RUN',paidCalls:0,maximumCalls:requests.length,reservationUsd:requests.reduce((n,r)=>n+r.reservedUsd,0),retryPolicy:'none; stop on uncertain outcome; existing authoritative accounting required',requests};
writeFileSync(resolve(dir,'comparison.private.json'),JSON.stringify(result,null,2)+'\n');
writeFileSync(resolve(dir,'comparison-public-summary.json'),JSON.stringify({schemaVersion:result.schemaVersion,status:result.status,maximumCalls:result.maximumCalls,reservationUsd:result.reservationUsd,pairs:requests.map(r=>({id:r.id,model:r.request.model,requestHash:r.requestHash,reservedUsd:r.reservedUsd,inputTokenUpperBound:r.inputTokenUpperBound,outputTokenLimit:r.request.maxTokens,provenance:r.provenance}))},null,2)+'\n');
console.log(JSON.stringify({status:result.status,maximumCalls:result.maximumCalls,reservationUsd:result.reservationUsd,requests:requests.map(r=>({id:r.id,reservedUsd:r.reservedUsd}))}));
