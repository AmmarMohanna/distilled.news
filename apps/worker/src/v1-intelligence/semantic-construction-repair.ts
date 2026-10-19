import {constructionTransport,GROUP_OWNERSHIP_VERSION} from './construction-transport';
import {canonicalJson} from '../v1-intake/canonical';
import {semanticQuestion} from './semantic-settlement';
import {constructionSchema,parseConstruction,scopedConstructionWireSchema} from './semantic-construction';
import {durableSemanticOperation,SemanticValidationError,type SemanticOperationInput,type SemanticOperationResult,type BudgetLane} from './semantic-operations';
import type {ConstructionOutcome} from './semantic-continuation';
import type {ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
import type {StrongSemanticModel} from './semantic-model';
import type {V1FeedStore} from './store';
/** Structural diagnostics are objective scope checks, not semantic judgments. */
export function constructionFailureClass(failed:SemanticOperationResult<ConstructionOutcome>,mentions:ClaimMention[],input:EventMatchInput):string {
 const diagnostic=failed.validationDiagnostic;if(!diagnostic)return 'DIAGNOSTIC_UNAVAILABLE';
 if(diagnostic.rejection.mechanicalIssues?.length)return diagnostic.rejection.mechanicalIssues[0].code;
 if(diagnostic.rejection.binding)return diagnostic.rejection.binding.invariant;
 if(diagnostic.stage==='OUTPUT_SCHEMA')return 'INVALID_STRUCTURED_OUTPUT';
 const raw=diagnostic.response,groups=Array.isArray(raw.groups)?raw.groups as Record<string,any>[]:[];
 const known=new Set(mentions.map(m=>m.id)),references=[...groups.flatMap(g=>Array.isArray(g.claimMentionIds)?g.claimMentionIds:[]),...(Array.isArray(raw.backgroundMentionIds)?raw.backgroundMentionIds:[])];
 if(references.some(id=>!known.has(id)))return 'INVALID_MENTION_REFERENCE';
 if(groups.some(g=>g.eventId!=null&&!input.candidates.some(c=>c.id===g.eventId)||g.storylineId!=null&&!(input.storylineIds??[]).includes(g.storylineId)))return 'INVALID_EVENT_OR_STORYLINE_REFERENCE';
 if(mentions.some(m=>!references.includes(m.id)))return 'INCOMPLETE_MENTION_COVERAGE';
 return 'INVALID_SOURCE_OR_IDENTITY_BINDING';
}
/** Rejected proposals are diagnostics, never an authoritative historical partition. */
export function constructionRepairOwnership(response:Record<string,any>,mentions:ClaimMention[]){
 const normalize=(id:string)=>mentions.some(m=>m.id===id)?id:/^C\d+$/.test(id)?mentions[Number(id.slice(1))]?.id??id:id;
 return {allowedClaimMentionIds:mentions.map(m=>m.id),groups:(Array.isArray(response.groups)?response.groups:[]).map((g:any,index:number)=>{
  const ids=(response.dispositionByUnitId?Object.keys(response.dispositionByUnitId).filter(id=>response.dispositionByUnitId[id]===g.groupId):g.claimMentionIds??g.ownedPassages?.map((p:any)=>p.passageId)??[]).map(normalize),allowed=new Set(ids);
  const refs=[...(g.storylineState?.openQuestionMentionIds??[]).map((id:string)=>({field:'storylineState.openQuestionMentionIds',claimMentionId:normalize(id)})),...(g.storylineState?.expectedNextDate?[{field:'storylineState.expectedNextDate',claimMentionId:normalize(g.storylineState.expectedNextDate.claimMentionId)}]:[]),...(g.entities??[]).flatMap((e:any)=>(e.claimMentionIds??[]).map((id:string)=>({field:'entities.claimMentionIds',claimMentionId:normalize(id)}))),...(g.slots??[]).map((s:any)=>({field:'slots.claimMentionId',claimMentionId:normalize(s.claimMentionId)}))];
  return {groupId:g.groupId??'G'+index,storylineId:g.storylineId??null,proposedClaimMentionIds:ids,offendingReferences:refs.filter((r:any)=>!allowed.has(r.claimMentionId))};
 })};
}
/** A known invalid result is not evidence that the article needs partitioning.
 * Repair the complete question once, retaining the original paid result. The
 * root receipt binds the repair identity across dates, attempts and restarts. */
export async function repairSemanticConstruction(store:V1FeedStore,base:SemanticOperationInput,failed:SemanticOperationResult<ConstructionOutcome>,mentions:ClaimMention[],input:EventMatchInput,strong:StrongSemanticModel,state:Record<string,unknown>,now:string,options:{lane?:BudgetLane;reuseContext?:unknown}):Promise<SemanticOperationResult<ConstructionOutcome>>{
 if(failed.failure!=='SEMANTIC_CONSTRUCTION_REJECTED'||!failed.usage.reported||failed.usage.calls!==1||!failed.validationDiagnostic)return failed;
 if(canonicalJson(semanticQuestion(failed.input))!==canonicalJson(semanticQuestion({...base,kind:'SEMANTIC_CONSTRUCTION',state})))throw Error('SEMANTIC_REPAIR_SCOPE_CHANGED');
 const {attempt:_,...completeState}=state;
 const diagnostic=failed.validationDiagnostic,owned=state.constructionOwnershipVersion===GROUP_OWNERSHIP_VERSION,repairVersion=owned?'construction-targeted-repair-v3-disposition':'construction-targeted-repair-v1';
 const repairState={...completeState,repair:{policy:repairVersion,...(owned?{ownership:constructionRepairOwnership(diagnostic.response,mentions),mechanicalIssues:diagnostic.rejection.mechanicalIssues??[],ownershipInstruction:'For each offending reference, the listed group owns only proposedClaimMentionIds. Do not echo the foreign reference or silently add its ID during decoding. Use the unchanged source passage catalog to explicitly select dispositionByUnitId destinations, retaining valid parts and keeping independent developments separate. The rejected proposal is not a canonical partition. Group-local references in storylineState must refer to units assigned to that group. Each ClaimMention has one scalar disposition; do not return legacy membership lists. DEFER semantic identity if genuinely uncertain.'}:{}),originalOperationId:failed.id,failureClass:constructionFailureClass(failed,mentions,input),rejectedResponse:diagnostic.response,rejection:diagnostic.rejection,instruction:'Correct only the diagnosed invalid structure or source/identity binding. Reconsider the complete article and all supplied factual mentions together. Preserve attribution, uncertainty and contradictions. Every mention must be accounted for. Do not invent missing identities, discard facts, or treat this repair as permission to split unrelated or related developments mechanically. Use DEFER for genuinely unresolved semantic identity.'}};
 const transport=owned?constructionTransport(mentions,input,repairState):undefined,schema=transport?.schema??scopedConstructionWireSchema(mentions,input),wireState=transport?.state??repairState,op={...base,kind:'SEMANTIC_CONSTRUCTION',budgetKey:'construction-repair:'+failed.id,policyVersion:base.policyVersion+(owned?':targeted-repair-v3-disposition':':targeted-repair-v1'),state:repairState};
 return durableSemanticOperation<ConstructionOutcome>(store,op,async()=>{
  const response=await strong.complete(base.feedId,'SEMANTIC_CONSTRUCTION_REPAIR',wireState,schema);let stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='OUTPUT_SCHEMA',diagnosticResponse=response.value;
  try{if(!transport)constructionSchema.parse(response.value);stage='CONSTRUCTION_BINDING';diagnosticResponse=transport?transport.decode(response.value):response.value;const parsed=constructionSchema.parse(diagnosticResponse);return {value:{construction:parseConstruction(diagnosticResponse,mentions,input,{scorer:'GPT',policyVersion:op.policyVersion}),confidence:parsed.confidence,...(owned?{...transport?.audit(response.value),rawResponse:response.rawResponse}: {})},usage:response.usage}}
  catch(error){throw new SemanticValidationError({stage,response:response.value,...(response.rawResponse?{rawResponse:response.rawResponse}:{}),rejection:{name:error instanceof Error?error.name:'UNKNOWN',...(error instanceof Error&&'mechanicalIssues' in error?{mechanicalIssues:error.mechanicalIssues as import('./construction-diagnostics').ConstructionIssue[]}:{}),...(error instanceof Error&&'binding' in error?{binding:error.binding as {invariant:string;path:(string|number)[]}}:{}),...(error instanceof Error&&'code' in error?{code:String(error.code)}:{})}})}
 },now,()=>strong.usage(),{...options,operationAdmission:strong.admission?.(wireState,schema,'SEMANTIC_CONSTRUCTION_REPAIR')});
}
