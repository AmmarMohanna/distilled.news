import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {V1FeedStore} from './store';
/** Explicit operator recovery of a complete provider response. Original failed
 * records stay immutable; every consumer still validates the recovered verdict. */
export async function recoveredPublicationResponse<T extends {id:string;input:any;status:string;usage:any;value?:unknown}>(store:V1FeedStore,original:T):Promise<T>{
 if(store.spendingAccountId!=='local-news-mirror'||original.status!=='DEFERRED'||original.value!==undefined||original.input.kind!=='PUBLICATION_GROUNDING')return original;
 const proof=await store.read<any>(original.input.feedId,'publication_response_recoveries',original.id);
 if(!proof||proof.scope!=='EXACT_COMPLETE_PROVIDER_RESPONSE_OPERATOR_RECOVERY'||!proof.originalHashes?.includes(await sha256(canonicalJson(original)))||proof.operationId!==original.id||proof.providerFinishReason!=='stop'||!proof.responseHash||!proof.generationId||proof.remoteReceipt?.reported!==1||proof.remoteReceipt.model!==original.input.model||!proof.value||proof.valueHash!==await sha256(canonicalJson(proof.value)))return original;
 const intent=await store.read<any>(original.input.feedId,'semantic_intents',original.id);
 if(!intent?.token||proof.localToken!==intent.token||canonicalJson(intent.input)!==canonicalJson(original.input)||proof.usage?.reported!==true||proof.usage.calls!==1||proof.usage.costUsd!==proof.remoteReceipt.cost_usd)return original;
 const receipt=await store.db.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind('semantic_intents:'+original.id).first<any>();
 if(!receipt||receipt.token!==intent.token||receipt.reported!==1||receipt.cost_usd!==proof.usage.costUsd)return original;
 return {...original,status:'SUCCEEDED',failure:undefined,value:proof.value,usage:proof.usage};
}
