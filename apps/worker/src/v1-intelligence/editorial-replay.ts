import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {compactEditorialInput,keyedEditorialState,expandEditorialInput,boundedEditorialInput} from './editorial-transport';
import type {SemanticOperationInput} from './semantic-operations';
import type {V1FeedStore} from './store';
import type {editorialPlannerState} from './editorial-plan';
export type EditorialParent=ReturnType<typeof editorialPlannerState>;
export interface StartedEditorialBoundary {inputState:ReturnType<typeof keyedEditorialState>|ReturnType<typeof compactEditorialInput>['state'];transport:ReturnType<typeof compactEditorialInput>;keyed:boolean;bounded?:ReturnType<typeof boundedEditorialInput>;operationInput?:SemanticOperationInput}
/** Capability changes cannot create a second paid question. Recover the exact
 * retained wire scope before considering any new model-sized boundary. The
 * historical codec prunes last ordinary candidates; reconstruct that owned
 * scope, then require complete byte-equivalence, not a guessed partial match. */
export async function findStartedEditorialBoundary(store:V1FeedStore,common:Omit<SemanticOperationInput,'state'>,parents:EditorialParent[]):Promise<{state:EditorialParent;boundary:StartedEditorialBoundary}|undefined>{
 const rows=await store.db.prepare("SELECT id,json FROM v1_feed_documents WHERE feed_id=? AND kind IN ('semantic_intents','semantic_results') AND json_extract(json,'$.input.kind')=? AND json_extract(json,'$.input.model')=? AND json_extract(json,'$.input.policyVersion')=? AND json_extract(json,'$.input.budgetKey')=? AND json_extract(json,'$.input.feedRevision')=? ORDER BY id,kind").bind(common.feedId,common.kind,common.model,common.policyVersion,common.budgetKey,common.feedRevision).all<{id:string;json:string}>();
 const seen=new Set<string>();let unmatchedStarted=false;
 for(const row of rows.results){
  if(seen.has(row.id))continue;const record=JSON.parse(row.json),input=record.input as SemanticOperationInput;
  if(!record.token&&!(record.usage?.calls>0))continue;
  if(input.feedId!==common.feedId||!Array.isArray(input.evidenceRevisionIds)||input.evidenceRevisionIds.some(id=>typeof id!=='string'))throw new HandoffError('SCOPE_DENIED');
  if(canonicalJson([...input.evidenceRevisionIds].sort())!==canonicalJson([...common.evidenceRevisionIds].sort()))continue;
  seen.add(row.id);if(await sha256(canonicalJson(input))!==row.id)throw new HandoffError('SCOPE_DENIED');
  const expanded=expandEditorialInput(input.state) as {candidates?:unknown[]};
  if(!Array.isArray(expanded.candidates))throw new HandoffError('SCOPE_DENIED');
  const count=expanded.candidates.length;
  for(const state of parents){
   const offeredCandidates=[...state.candidates],overflowIds:string[]=[];
   if(count>offeredCandidates.length)continue;
   while(offeredCandidates.length>count){let i=-1;for(let j=offeredCandidates.length-1;j>=0;j--)if(!offeredCandidates[j].protectedReasons.length&&!offeredCandidates[j].correctionObligationIds.length){i=j;break}if(i<0)break;overflowIds.unshift(offeredCandidates.splice(i,1)[0].targetVersionId)}
   if(offeredCandidates.length!==count)continue;
   const transport=compactEditorialInput({...state,candidates:offeredCandidates});
   const wires=[{state:transport.state,keyed:false},{state:keyedEditorialState(transport.state,{compact:false}),keyed:true},{state:keyedEditorialState(transport.state),keyed:true}];
   const match=wires.find(w=>canonicalJson(w.state)===canonicalJson(input.state));if(!match)continue;
   const inputState=input.state as StartedEditorialBoundary['inputState'];
   return {state,boundary:{inputState,transport,keyed:match.keyed,operationInput:input,bounded:match.keyed?{inputState:inputState as ReturnType<typeof keyedEditorialState>,transport,offeredCandidates,overflowIds,failure:undefined}:undefined}};
  }
  unmatchedStarted=true;
 }
 // An unmatched possibly-paid frame is not authorization to rebuild and bill.
 // Preserve the original records and fail visibly; no invented decoder/plan.
 if(unmatchedStarted){console.warn(JSON.stringify({type:'V1_EDITORIAL_PAID_SCOPE_FENCED',feedId:common.feedId,kind:common.kind,budgetKey:common.budgetKey}));throw new HandoffError('TEMPORARY_UNAVAILABLE')}
 return undefined;
}
