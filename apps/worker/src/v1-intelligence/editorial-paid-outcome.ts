import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {V1FeedStore} from './store';
import type {SemanticOperationInput,SemanticOperationResult} from './semantic-operations';
/** An operator's exact paid terminal proof is an overlay, never an edit of an
 * immutable semantic receipt and never a semantic acceptance. Missing/mismatched
 * evidence leaves the original UNKNOWN fence intact. */
export async function confirmedEditorialOutcome<T>(store:V1FeedStore,input:SemanticOperationInput,original:SemanticOperationResult<T>):Promise<SemanticOperationResult<T>>{
 if(input.kind!=='COMPARATIVE_EDITORIAL_PLAN'||original.status!=='DEFERRED'||original.usage.reported||original.value!==undefined)return original;
 const id=await sha256(canonicalJson(input));if(original.id!==id||canonicalJson(original.input)!==canonicalJson(input))return original;
 const proof=await store.read<any>(input.feedId,'editorial_response_recoveries','length-accounting:'+id);
 if(!proof||proof.scope!=='LOCAL_ONLY_FINANCIAL_CONFIRMATION_NO_SEMANTIC_PROMOTION'||proof.operationId!==id||proof.providerFinishReason!=='length'||proof.originalResultHash!==await sha256(canonicalJson(original))||proof.originalResult?.status!=='DEFERRED'||!proof.rawResponseHash||!proof.remotePaidOperationId||proof.remoteReceipt?.reported!==1||proof.remoteReceipt.model!==input.model)return original;
 const intent=await store.read<any>(input.feedId,'semantic_intents',id),usage=proof.correctedUsage;
 if(!intent?.token||proof.localReservationToken!==intent.token||canonicalJson(intent.input)!==canonicalJson(input)||usage?.calls!==1||usage.reported!==true||!Number.isFinite(usage.costUsd)||usage.costUsd<0||usage.costUsd!==proof.remoteReceipt.cost_usd)return original;
 const receipt=await store.db.prepare('SELECT s.token,s.reported,s.cost_usd FROM v1_model_spending_reservations r JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.id=? AND r.token=?').bind('semantic_intents:'+id,intent.token).first<{token:string;reported:number;cost_usd:number}>();
 if(!receipt||receipt.token!==intent.token||receipt.reported!==1||receipt.cost_usd!==usage.costUsd)return original;
 return {...original,failure:'SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED',usage};
}
