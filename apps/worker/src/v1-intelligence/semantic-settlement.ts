import {settleModelSpending} from './model-spending';
import {HandoffError} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {SemanticContentionError,type SemanticIntent,type SemanticOperationInput,type SemanticOperationResult} from './semantic-operations';
import type {FeedTransaction,V1FeedStore} from './store';
/** Only operational day and retry number are absent from the reusable question.
 * Evidence, Feed revision, model, policy and complete semantic state remain bound. */
export function semanticQuestion(input:SemanticOperationInput):unknown {
 const {budgetKey:_,state,...identity}=input;
 if(state&&typeof state==='object'&&!Array.isArray(state)){const {attempt:__,...context}=state as Record<string,unknown>;return {...identity,state:context}}
 return {...identity,state};
}
export async function findSemanticReuse<T>(tx:FeedTransaction,input:SemanticOperationInput,compatibilityHash?:string):Promise<SemanticOperationResult<T>|undefined>{
 // Preserve the complete predicate and returned order, while retaining only
 // identities/sizes across pages instead of every historical graph snapshot.
 tx.metrics.preloadQueries++;
 const rows=await tx.store.db.prepare("SELECT d.id,json_extract(d.json,'$.id') AS document_id,length(CAST(d.json AS BLOB)) AS bytes FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind='semantic_intents' AND EXISTS(SELECT 1 FROM json_each(d.json,'$.input.evidenceRevisionIds') e WHERE e.value=?) AND json_extract(d.json,'$.input.kind')=?").bind(input.feedId,input.evidenceRevisionIds[0],input.kind).all<{id:string;document_id:string;bytes:number}>();
 if(rows.results.some(row=>typeof row.document_id!=='string'||row.id!==row.document_id))throw new HandoffError('SCOPE_DENIED');
 const ids=rows.results.map(row=>row.id);
 // Eager preload rejected foreign receipts anywhere in the candidate universe,
 // even after a reusable first answer. Keep that fail-closed ownership check.
 const resultSizes=await tx.transientReadSizes('semantic_results',ids),settlementSizes=await tx.transientReadSizes('semantic_settlements',ids);
 for(let offset=0;offset<rows.results.length;){
  const page:string[]=[];let bytes=0;
  while(offset<rows.results.length&&page.length<4){
   const row=rows.results[offset],size=row.bytes+(resultSizes.get(row.id)??0)+(settlementSizes.get(row.id)??0);
   if(page.length&&bytes+size>2*1024*1024)break;
   page.push(row.id);bytes+=size;offset++;
  }
  // Persisted intents deliberately bypass transaction staged/cache values, as
  // the old direct JSON scan did. An oversized candidate is processed alone.
  tx.metrics.preloadQueries++;
  const intents=await tx.store.readMany<SemanticIntent>(tx.snapshot.feed.id,'semantic_intents',page);
  const savedResults=await tx.readTransientMany<SemanticOperationResult<T>>('semantic_results',page),settlements=await tx.readTransientMany<SemanticOperationResult<T>&{token:string}>('semantic_settlements',page);
  for(const id of page){
  const intent=intents.get(id);if(!intent||intent.id!==id)throw new HandoffError('SCOPE_DENIED');
  const saved=savedResults.get(id),settled=settlements.get(id);
  const result=saved??(settled?.usage.reported&&settled.token===intent.token?settled:undefined);
  // An unreported/expired paid operation is not permission to bill again.
  // Legacy records without compatibility metadata retain a conservative fence.
  if(!result?.usage.reported){
   const sameQuestion=canonicalJson(semanticQuestion(intent.input))===canonicalJson(semanticQuestion(input));
   // Construction wire/preview changes must not rebill an UNKNOWN question
   // against the same immutable source and semantic version context.
   const versions=(state:any)=>({events:(state?.events??[]).map((e:any)=>[e.id,e.versionId]).sort(),memory:(state?.memory??[]).map((m:any)=>[m.id,m.versionId]).sort()});
   const mentionScope=(state:any)=>Array.isArray(state?.claimMentions)?state.claimMentions.map((m:any)=>[m.id,m.text]).sort():null;
   const sameConstruction=mentionScope(intent.input.state)!==null&&canonicalJson(mentionScope(intent.input.state))===canonicalJson(mentionScope(input.state))&&input.kind==='SEMANTIC_CONSTRUCTION'&&intent.input.model===input.model&&intent.input.feedRevision===input.feedRevision&&intent.input.policyVersion===input.policyVersion&&canonicalJson(versions(intent.input.state))===canonicalJson(versions(input.state));
   const samePublication=input.kind.startsWith('PUBLICATION_')&&(input.state as any)?.publicationScope&&canonicalJson((input.state as any).publicationScope)===canonicalJson((intent.input.state as any)?.publicationScope)&&intent.input.model===input.model&&intent.input.feedRevision===input.feedRevision;
   if(!result&&intent.leaseUntil>Date.now()){if(sameQuestion||sameConstruction||samePublication||compatibilityHash&&intent.compatibilityHash===compatibilityHash)throw new SemanticContentionError();continue}
   if(!intent.compatibilityHash||sameQuestion||sameConstruction||samePublication||intent.compatibilityHash===compatibilityHash){
    const fenced:SemanticOperationResult<T>={...(result??{id:intent.id,feedId:input.feedId,input:intent.input,status:'DEFERRED' as const,usage:{calls:1,costUsd:intent.reservedCostUsd,reported:false},latencyMs:0,createdAt:intent.createdAt}),status:'DEFERRED',failure:'SEMANTIC_OUTCOME_UNKNOWN'};
    if(!result)await tx.write('semantic_results',intent.id,fenced);return fenced;
   }
  }
  if(result?.status==='SUCCEEDED'&&compatibilityHash&&intent.compatibilityHash===compatibilityHash)return result;
  // A reported construction failure is reusable evidence for targeted repair or
  // capacity continuation, never a reason to rebill the same root question.
  if(input.kind==='SEMANTIC_CONSTRUCTION'&&result?.usage.reported&&result.usage.calls===1&&['SEMANTIC_CONSTRUCTION_REJECTED','SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED'].includes(result.failure??'')&&compatibilityHash&&intent.compatibilityHash===compatibilityHash)return result;
  }
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
 const accountReceipt=await store.db.prepare('SELECT id FROM v1_model_spending_reservations WHERE id=?').bind('semantic_intents:'+intent.id).first();
 // Financial settlement must survive a semantic receipt exceeding D1 storage.
 if(accountReceipt)await settleModelSpending(store.db,'semantic_intents:'+intent.id,intent.token,result.usage);
 await store.db.batch([
  store.db.prepare(`UPDATE v1_feeds SET epoch=epoch+1 WHERE id=? AND ${authorization} AND NOT EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_settlements' AND id=?)`).bind(intent.feedId,...args,intent.id),
  store.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'semantic_settlements',?,?,? WHERE ${authorization} ON CONFLICT(kind,id) DO NOTHING`).bind(intent.id,intent.feedId,JSON.stringify({...result,token:intent.token}),...args)
 ]);
 const receipt=await store.read<{token:string}> (intent.feedId,'semantic_settlements',intent.id);
 if(receipt?.token!==intent.token)throw new HandoffError('SCOPE_DENIED');
}
