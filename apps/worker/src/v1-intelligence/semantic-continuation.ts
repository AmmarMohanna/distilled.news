import {developmentWireCandidates,developmentReconciliationSchema,reconstructDevelopments,DEVELOPMENT_RECONCILIATION_INSTRUCTION} from './development-reconciliation';
import {boundedSettledMap,inferenceConcurrency} from './parallel-inference';
import {constructionTransport,isDispositionVersion,MINIMAL_CONSTRUCTION_VERSION,PACKET_CONSTRUCTION_VERSION} from './construction-transport';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore,feedTransact} from './store';
import {assertClaimSpan,type ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
import type {StrongSemanticModel} from './semantic-model';
import {semanticQuestion} from './semantic-settlement';
import {durableSemanticOperation,SemanticValidationError,type SemanticOperationInput,type SemanticOperationResult} from './semantic-operations';
import {parseConstruction,scopedConstructionWireSchema,constructionSchema} from './semantic-construction';
import type {SemanticConstruction} from './semantic-state';
import type {BudgetLane} from './semantic-operations';
export interface ConstructionOutcome {construction:SemanticConstruction;confidence:number}
/** Packets are execution units, never Events. No packet result becomes canonical
 * before complete, source-bound reconciliation. Paid stages remain immutable and
 * restartable; resource waits do not replace semantic judgments. */
export async function continueSemanticConstruction(store:V1FeedStore,base:SemanticOperationInput,mentions:ClaimMention[],input:EventMatchInput,strong:StrongSemanticModel,state:Record<string,any>,now:string,options:{lane?:BudgetLane;reuseContext?:unknown;concurrency?:number;reconciliation?:'CLAIMS'|'DEVELOPMENTS'}):Promise<SemanticOperationResult<ConstructionOutcome>>{
 const parent=store;store=new V1FeedStore(parent.db,parent.semanticLease,parent.spendingAccountId);store.transactionQueue={tail:Promise.resolve()};
 if(base.feedId!==input.revision.feedId||!base.evidenceRevisionIds.includes(input.revision.id))throw Error('SEMANTIC_SCOPE_CHANGED');for(const m of mentions)assertClaimSpan(m,input.revision);
 const workId=await sha256(canonicalJson({identity:semanticQuestion(base),mentions:mentions.map(m=>m.id),policy:'construction-continuation-v1'}));
 const packetState=(packet:ClaimMention[],fullContext=false)=>({...state,...(fullContext&&state.constructionOwnershipVersion===MINIMAL_CONSTRUCTION_VERSION?{constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION}:{}),...(state.source?{source:{...state.source,text:fullContext?state.source.text:undefined},sourceContext:fullContext?'Complete immutable source for attribution, quotation and temporal context; assign only offered packet mentions.':'Exact packet mention spans; full document remains retained for reconciliation.'}:{}),claimMentions:packet.map(m=>({id:m.id,text:m.sourceText,sourceField:m.span.field,span:m.span,reportingRoleHint:m.reportingRole,certainty:m.certainty,attribution:m.attribution})),continuation:{workId,stage:'PACKET',completeDocument:false,instruction:'This is an execution packet, not an Event boundary. Identify supported developments provisionally. Another operation must reconcile packets before canonical construction. All omitted mention identities remain durable.'}});
 const admission=(packet:ClaimMention[])=>{const wire=constructionTransport(packet,input,packetState(packet,true));return strong.admission?.(wire.state,wire.schema,'SEMANTIC_CONSTRUCTION')};
 const proposedPackets:string[][]=[];
 let pendingOffset=0;
 while(pendingOffset<mentions.length){let lo=1,hi=mentions.length-pendingOffset,size=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(admission(mentions.slice(pendingOffset,pendingOffset+mid))?.fits){size=mid;lo=mid+1}else hi=mid-1}const packet=mentions.slice(pendingOffset,pendingOffset+Math.max(1,size));proposedPackets.push(packet.map(m=>m.id));pendingOffset+=packet.length}
 const work=await feedTransact(store,base.feedId,async tx=>{
  if(tx.snapshot.feed.revision!==base.feedRevision)throw Error('SEMANTIC_SCOPE_CHANGED');
  const prior=await tx.read<{id:string;packetMentionIds:string[][];contextPolicy?:string;reconciliationMode?:'CLAIMS'|'DEVELOPMENTS'}>('semantic_construction_work',workId);if(prior)return prior;
  const manifest={id:workId,feedId:base.feedId,evidenceRevisionIds:base.evidenceRevisionIds,claimMentionIds:mentions.map(m=>m.id),packetMentionIds:proposedPackets,sourceRevisionId:input.revision.id,model:strong.model,policy:'construction-continuation-v1',contextPolicy:'complete-source-v1',reconciliationMode:options.reconciliation??'DEVELOPMENTS',createdAt:now};await tx.write('semantic_construction_work',workId,manifest);return manifest;
 });
 const packetMentions=new Map(mentions.map(m=>[m.id,m]));
 if(canonicalJson(work.packetMentionIds.flat())!==canonicalJson(mentions.map(m=>m.id)))throw Error('SEMANTIC_PACKET_SCOPE_CHANGED');
 const packetConstructions:SemanticConstruction[]=[];
 const operationIds:string[]=[],packetGroups:SemanticConstruction['groups']=[],backgroundMentionIds:string[]=[];
 let minimumConfidence=1;
 const execute=async(scope:ClaimMention[],wire:Record<string,any>,phase:string,index:number)=>{
  const model=strong.forPhase?.(phase)??strong.fork?.()??strong;
  const transport=constructionTransport(scope,input,Object.fromEntries(Object.entries(wire).filter(([key])=>key!=='attempt'))),schema=transport.schema,op={...base,kind:'SEMANTIC_CONSTRUCTION',model:model.model,budgetKey:'construction:'+workId,policyVersion:base.policyVersion+':continuation-v1:'+phase,state:transport.state};
  const result=await durableSemanticOperation<ConstructionOutcome>(store,op,async()=>{
   const outcome=await model.complete(base.feedId,phase,transport.state,schema);let stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='OUTPUT_SCHEMA';
   try{if(!isDispositionVersion(state.constructionOwnershipVersion))constructionSchema.parse(outcome.value);stage='CONSTRUCTION_BINDING';const decoded=transport.decode(outcome.value),parsed=constructionSchema.parse(decoded);return {value:{construction:parseConstruction(decoded,scope,input,{scorer:'GPT',policyVersion:op.policyVersion}),confidence:parsed.confidence,...(isDispositionVersion(state.constructionOwnershipVersion)?{...transport.audit(outcome.value),rawResponse:outcome.rawResponse}: {})},usage:outcome.usage}}
   catch(error){throw new SemanticValidationError({stage,response:outcome.value,...(outcome.rawResponse?{rawResponse:outcome.rawResponse}:{}),rejection:{name:error instanceof Error?error.name:'UNKNOWN',...(error instanceof Error&&'mechanicalIssues' in error?{mechanicalIssues:error.mechanicalIssues as import('./construction-diagnostics').ConstructionIssue[]}:{}),...(error instanceof Error&&'binding' in error?{binding:error.binding as {invariant:string;path:(string|number)[]}}:{}),...(error instanceof Error&&'code' in error?{code:String(error.code)}:{})}})}
  },now,()=>model.usage(),{...options,operationAdmission:model.admission?.(transport.state,schema,phase)});
  const progressId=JSON.stringify([workId,phase,index,result.id,result.status,result.failure??null]);await feedTransact(store,base.feedId,async tx=>{if(!await tx.read('semantic_construction_progress',progressId))await tx.write('semantic_construction_progress',progressId,{id:progressId,feedId:base.feedId,workId,stage:phase,index,operationId:result.id,claimMentionIds:scope.map(m=>m.id),status:result.status,reason:result.failure,createdAt:now})});return result;
 };
 let halt:SemanticOperationResult<ConstructionOutcome>|undefined;
 const results=await boundedSettledMap(work.packetMentionIds,options.concurrency??inferenceConcurrency(),async(ids,index)=>{
  if(halt)return halt;
  const packet=ids.map(id=>packetMentions.get(id)!);
  const result=await execute(packet,packetState(packet,work.contextPolicy==='complete-source-v1'),'SEMANTIC_CONSTRUCTION',index);if(result.status!=='SUCCEEDED')halt=result;return result;
 });
 // Drain every started operation first; select failure deterministically in source order.
 for(const settled of results){
  if(settled.status==='rejected')throw settled.reason;
  const result=settled.value;operationIds.push(result.id);
  if(result.status!=='SUCCEEDED'||!result.value)return result;
  packetConstructions.push(result.value.construction);packetGroups.push(...result.value.construction.groups);backgroundMentionIds.push(...result.value.construction.backgroundMentionIds);minimumConfidence=Math.min(minimumConfidence,result.value.confidence);
 }
 if((work.reconciliationMode??(work.contextPolicy?'DEVELOPMENTS':'CLAIMS'))==='DEVELOPMENTS'){
  const phase='SEMANTIC_DEVELOPMENT_RECONCILIATION',model=strong.forPhase?.(phase)??strong.fork?.()??strong;
  const candidates=developmentWireCandidates(packetConstructions,mentions);
  const wire={source:state.source,events:state.events,storylines:state.storylines,developments:candidates,backgroundEvidence:mentions.filter(m=>backgroundMentionIds.includes(m.id)),continuation:{workId,stage:'DEVELOPMENT_RECONCILIATION',operationIds,completeDocument:true},instruction:DEVELOPMENT_RECONCILIATION_INSTRUCTION};
  const op={...base,kind:'SEMANTIC_CONSTRUCTION',model:model.model,budgetKey:'construction:'+workId,policyVersion:base.policyVersion+':development-reconciliation-v1',state:wire};
  return durableSemanticOperation<ConstructionOutcome>(store,op,async()=>{
   const response=await model.complete(base.feedId,phase,wire,developmentReconciliationSchema);
   try{const construction=reconstructDevelopments(response.value,packetConstructions,mentions,input,{scorer:'GPT',policyVersion:op.policyVersion});
    return {value:{construction,confidence:Math.min(minimumConfidence,Number(response.value.confidence)),packetOperationIds:operationIds,developmentRelationships:response.value.groups},usage:response.usage};
   }catch(error){throw new SemanticValidationError({stage:'CONSTRUCTION_BINDING',response:response.value,...(response.rawResponse?{rawResponse:response.rawResponse}:{}),rejection:{name:error instanceof Error?error.name:'UNKNOWN',code:error instanceof Error?error.message:'INVALID_DEVELOPMENT_RECONCILIATION'}})}
  },now,()=>model.usage(),{...options,operationAdmission:model.admission?.(wire,developmentReconciliationSchema,phase)});
 }
 const reconciliation={...state,...(state.source?{source:{...state.source,text:undefined}}:{}),claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,sourceField:m.span.field,span:m.span,certainty:m.certainty,attribution:m.attribution})),packetGroups,backgroundMentionIds,continuation:{workId,stage:'RECONCILIATION',operationIds,completeDocument:true,instruction:'Reconcile ALL packet groups together using supported mention meaning. Packet boundaries are not Event boundaries. Merge different packets if they describe the same development; preserve independent developments. Retain every mention and all uncertainty/attribution. Do not force a split or merge to fit capacity.'}};
 const result=await execute(mentions,reconciliation,'SEMANTIC_RECONCILIATION',0);
 return result.value?{...result,value:{...result.value,confidence:Math.min(minimumConfidence,result.value.confidence)}}:result;
}
