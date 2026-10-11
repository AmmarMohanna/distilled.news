import {HandoffError} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {SemanticIntent,SemanticOperationInput,SemanticOperationResult} from './semantic-operations';
import type {FeedTransaction,V1FeedStore} from './store';
/** Only operational day and retry number are absent from the reusable question.
 * Evidence, Feed revision, model, policy and complete semantic state remain bound. */
export function semanticQuestion(input:SemanticOperationInput):unknown {
 const {budgetKey:_,state,...identity}=input;
 if(state&&typeof state==='object'&&!Array.isArray(state)){const {attempt:__,...context}=state as Record<string,unknown>;return {...identity,state:context}}
 return {...identity,state};
}
export async function findSemanticReuse<T>(tx:FeedTransaction,input:SemanticOperationInput,compatibilityHash?:string):Promise<SemanticOperationResult<T>|undefined>{
 const rows=await tx.store.db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.evidenceRevisionIds[0]')=? AND json_extract(json,'$.input.kind')=?").bind(input.feedId,input.evidenceRevisionIds[0],input.kind).all<{json:string}>();
 const intents=rows.results.map(row=>JSON.parse(row.json) as SemanticIntent);
 await tx.preload('semantic_results',intents.map(intent=>intent.id));await tx.preload('semantic_settlements',intents.map(intent=>intent.id));
 for(const intent of intents){
  const saved=await tx.read<SemanticOperationResult<T>>('semantic_results',intent.id),settled=await tx.read<SemanticOperationResult<T>&{token:string}>('semantic_settlements',intent.id);
  const result=saved??(settled?.usage.reported&&settled.token===intent.token?settled:undefined);
  // An unreported/expired paid operation is not permission to bill again.
  // Legacy records without compatibility metadata retain a conservative fence.
  if(!result?.usage.reported){
   const sameQuestion=canonicalJson(semanticQuestion(intent.input))===canonicalJson(semanticQuestion(input));
   if(!result&&intent.leaseUntil>Date.now()){if(sameQuestion||compatibilityHash&&intent.compatibilityHash===compatibilityHash)throw new HandoffError('TEMPORARY_UNAVAILABLE');continue}
   if(!intent.compatibilityHash||sameQuestion||intent.compatibilityHash===compatibilityHash){
    return {...(result??{id:intent.id,feedId:input.feedId,input:intent.input,status:'DEFERRED' as const,usage:{calls:1,costUsd:intent.reservedCostUsd,reported:false},latencyMs:0,createdAt:intent.createdAt}),status:'DEFERRED',failure:'SEMANTIC_OUTCOME_UNKNOWN'};
   }
  }
  if(result?.status==='SUCCEEDED'&&compatibilityHash&&intent.compatibilityHash===compatibilityHash)return result;
 }
 return undefined;
}
/** Billing settlement is independent of active source/processing leases. A token
 * from the immutable committed intent is required; no semantic state is updated.
 * Epoch advancement and receipt insertion are atomic, so concurrent admission
 * cannot commit against an accounting snapshot predating the settlement. */
export async function settleSemanticOperation<T>(store:V1FeedStore,intent:SemanticIntent,result:SemanticOperationResult<T>):Promise<void>{
 const authorization="EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_intents' AND id=? AND feed_id=? AND json_extract(json,'$.token')=?)";
 const args=[intent.id,intent.feedId,intent.token];
 await store.db.batch([
  store.db.prepare(`UPDATE v1_feeds SET epoch=epoch+1 WHERE id=? AND ${authorization} AND NOT EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_settlements' AND id=?)`).bind(intent.feedId,...args,intent.id),
  store.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'semantic_settlements',?,?,? WHERE ${authorization} ON CONFLICT(kind,id) DO NOTHING`).bind(intent.id,intent.feedId,JSON.stringify({...result,token:intent.token}),...args)
 ]);
 const receipt=await store.read<{token:string}> (intent.feedId,'semantic_settlements',intent.id);
 if(receipt?.token!==intent.token)throw new HandoffError('SCOPE_DENIED');
}
