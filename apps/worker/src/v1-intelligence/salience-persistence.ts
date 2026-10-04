import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore} from './store';
import {DeterministicSalienceScorer,type EventSalienceScorer,type SalienceInput,type SalienceResult} from './salience';
import {SEMANTIC_SALIENCE_POLICY} from './salience-router';
interface Intent {id:string;feedId:string;feedRevision:number;input:SalienceInput;token:string;leaseUntil:number;reservedCostUsd:number;reservedCalls:number;windowId?:string;createdAt:string}
interface Saved {id:string;feedId:string;input:SalienceInput;result:SalienceResult;createdAt:string}
export class SalienceContentionError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
/** One immutable intent per exact target/input/policy. Calls occur only after
 * durable intent commit, outside retryable CAS. Lost outcomes never auto-reissue. */
export async function durableSalience(store:V1FeedStore,input:SalienceInput,scorer:EventSalienceScorer,now:string,windowId?:string):Promise<Saved>{
 const id=await sha256(canonicalJson({input,policy:scorer.policyKey??SEMANTIC_SALIENCE_POLICY})),token=crypto.randomUUID();
 const acquired=await feedTransact(store,input.feedId,async tx=>{
  if(tx.snapshot.feed.revision!==input.feedRevision)throw new HandoffError('SCOPE_DENIED');
  const saved=await tx.read<Saved>('salience_results',id);if(saved)return {saved};
  const prior=await tx.read<Intent>('salience_intents',id);
  if(prior){
   if(prior.leaseUntil>Date.now())throw new SalienceContentionError();
   const result={...new DeterministicSalienceScorer().score(input),fallback:'SALIENCE_OUTCOME_UNKNOWN',usage:{calls:input.targetType==='EVENT'?2:1,costUsd:prior.reservedCostUsd,reported:false},route:'DETERMINISTIC_FALLBACK',attempts:[],componentOrigin:{overallScore:'DETERMINISTIC',otherComponents:'DETERMINISTIC'},latencyMs:0};
   const saved={id,feedId:input.feedId,input,result,createdAt:now};await tx.write('salience_results',id,saved);return {saved};
  }
  const reservedCostUsd=input.targetType==='EVENT'?.04:.02,reservedCalls=input.targetType==='EVENT'?2:1;
  if(windowId){
   let cost=0,calls=0,unknown=false;
   for(const intent of (await tx.list<Intent>('salience_intents')).filter(i=>i.windowId===windowId)){
    const saved=await tx.read<Saved>('salience_results',intent.id);
    cost+=saved?.result.usage.reported?saved.result.usage.costUsd:Math.max(intent.reservedCostUsd,saved?.result.usage.costUsd??0);
    calls+=saved?.result.usage.calls??intent.reservedCalls;
    unknown ||= saved?saved.result.usage.reported===false:intent.leaseUntil<=Date.now();
   }
   if(unknown || calls+reservedCalls>20 || cost+reservedCostUsd>.1+1e-9){
    const result={...new DeterministicSalienceScorer().score(input),fallback:unknown?'SALIENCE_WINDOW_OUTCOME_UNKNOWN':'SALIENCE_WINDOW_BUDGET_EXHAUSTED',route:'DETERMINISTIC_FALLBACK',attempts:[],latencyMs:0,componentOrigin:{overallScore:'DETERMINISTIC',otherComponents:'DETERMINISTIC'}};
    const saved={id,feedId:input.feedId,input,result,createdAt:now};await tx.write('salience_results',id,saved);return {saved};
   }
  }
  const intent:Intent={id,feedId:input.feedId,feedRevision:input.feedRevision,input,token,leaseUntil:Date.now()+30000,reservedCostUsd,reservedCalls,windowId,createdAt:now};
  await tx.write('salience_intents',id,intent);return {intent};
 });
 if(acquired.saved)return acquired.saved;
 const result=await scorer.score(input);
 return feedTransact(store,input.feedId,async tx=>{
  const saved=await tx.read<Saved>('salience_results',id);if(saved)return saved;
  const intent=await tx.read<Intent>('salience_intents',id);
  if(!intent || intent.token!==token || tx.snapshot.feed.revision!==input.feedRevision)throw new HandoffError('SCOPE_DENIED');
  const value:Saved={id,feedId:input.feedId,input,result,createdAt:now};await tx.write('salience_results',id,value);return value;
 });
}
