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
 if(diagnostic.stage==='OUTPUT_SCHEMA')return 'INVALID_STRUCTURED_OUTPUT';
 const raw=diagnostic.response,groups=Array.isArray(raw.groups)?raw.groups as Record<string,any>[]:[];
 const known=new Set(mentions.map(m=>m.id)),references=[...groups.flatMap(g=>Array.isArray(g.claimMentionIds)?g.claimMentionIds:[]),...(Array.isArray(raw.backgroundMentionIds)?raw.backgroundMentionIds:[])];
 if(references.some(id=>!known.has(id)))return 'INVALID_MENTION_REFERENCE';
 if(groups.some(g=>g.eventId!=null&&!input.candidates.some(c=>c.id===g.eventId)||g.storylineId!=null&&!(input.storylineIds??[]).includes(g.storylineId)))return 'INVALID_EVENT_OR_STORYLINE_REFERENCE';
 if(mentions.some(m=>!references.includes(m.id)))return 'INCOMPLETE_MENTION_COVERAGE';
 return 'INVALID_SOURCE_OR_IDENTITY_BINDING';
}
/** A known invalid result is not evidence that the article needs partitioning.
 * Repair the complete question once, retaining the original paid result. The
 * root receipt binds the repair identity across dates, attempts and restarts. */
export async function repairSemanticConstruction(store:V1FeedStore,base:SemanticOperationInput,failed:SemanticOperationResult<ConstructionOutcome>,mentions:ClaimMention[],input:EventMatchInput,strong:StrongSemanticModel,state:Record<string,unknown>,now:string,options:{lane?:BudgetLane;reuseContext?:unknown}):Promise<SemanticOperationResult<ConstructionOutcome>>{
 if(failed.failure!=='SEMANTIC_CONSTRUCTION_REJECTED'||!failed.usage.reported||failed.usage.calls!==1||!failed.validationDiagnostic)return failed;
 if(canonicalJson(semanticQuestion(failed.input))!==canonicalJson(semanticQuestion({...base,kind:'SEMANTIC_CONSTRUCTION',state})))throw Error('SEMANTIC_REPAIR_SCOPE_CHANGED');
 const {attempt:_,...completeState}=state;
 const diagnostic=failed.validationDiagnostic;
 const repairState={...completeState,repair:{policy:'construction-targeted-repair-v1',originalOperationId:failed.id,failureClass:constructionFailureClass(failed,mentions,input),rejectedResponse:diagnostic.response,rejection:diagnostic.rejection,instruction:'Correct only the diagnosed invalid structure or source/identity binding. Reconsider the complete article and all supplied factual mentions together. Preserve attribution, uncertainty and contradictions. Every mention must be accounted for. Do not invent missing identities, discard facts, or treat this repair as permission to split unrelated or related developments mechanically. Use DEFER for genuinely unresolved semantic identity.'}};
 const schema=scopedConstructionWireSchema(mentions,input),op={...base,kind:'SEMANTIC_CONSTRUCTION',budgetKey:'construction-repair:'+failed.id,policyVersion:base.policyVersion+':targeted-repair-v1',state:repairState};
 return durableSemanticOperation<ConstructionOutcome>(store,op,async()=>{
  const response=await strong.complete(base.feedId,'SEMANTIC_CONSTRUCTION_REPAIR',repairState,schema);let stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='OUTPUT_SCHEMA';
  try{const parsed=constructionSchema.parse(response.value);stage='CONSTRUCTION_BINDING';return {value:{construction:parseConstruction(response.value,mentions,input,{scorer:'GPT',policyVersion:op.policyVersion}),confidence:parsed.confidence},usage:response.usage}}
  catch(error){throw new SemanticValidationError({stage,response:response.value,rejection:{name:error instanceof Error?error.name:'UNKNOWN',...(error instanceof Error&&'code' in error?{code:String(error.code)}:{})}})}
 },now,()=>strong.usage(),{...options,operationAdmission:strong.admission?.(repairState,schema,'SEMANTIC_CONSTRUCTION_REPAIR')});
}
