import {sha256} from '@distilled/contracts';
import type {ModelResponse} from '@distilled/briefing';
import type {ProviderReceipt} from '../provider-receipt';
import type {SemanticIntent} from './semantic-operations';
import {canonicalJson} from '../v1-intake/canonical';
import {ModelSpendingWait} from './model-spending';

export class ResponseCheckpointPending extends ModelSpendingWait {
 constructor(){super('V3_RESPONSE_AWAITING_PERSISTENCE')}
}
export interface ResponseCheckpoint {key:string;bodyHash:string;generationId?:string}
export const V3_RESPONSE_CHECKPOINT_POLICY='R2_COMPLETE_PROVIDER_RESPONSE_V1' as const;
const keyFor=(intent:SemanticIntent)=>`model-responses/v3/${encodeURIComponent(intent.feedId)}/${intent.id}/${intent.token}.json`;
interface Checkpoint {version:1;operationId:string;feedId:string;token:string;inputHash:string;model:string;httpStatus:number;header:ProviderReceipt;raw:string;bodyHash:string}

/** The private immutable body is saved independently of D1 receipt writes.
 * A billing receipt alone is never sufficient to recover semantic output. */
export async function saveV3Response(bucket:R2Bucket,intent:SemanticIntent,raw:string,header:ProviderReceipt):Promise<ResponseCheckpoint>{
 const key=keyFor(intent),bodyHash=await sha256(raw),inputHash=await sha256(canonicalJson(intent.input));
 if(inputHash!==intent.id)throw Error('SEMANTIC_RESPONSE_CHECKPOINT_IDENTITY');
 const value:Checkpoint={version:1,operationId:intent.id,feedId:intent.feedId,token:intent.token,inputHash,model:intent.input.model,httpStatus:header.httpStatus,header,raw,bodyHash};
 const saved=await bucket.put(key,JSON.stringify(value),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 if(!saved){const existing=await bucket.get(key);if(!existing||await existing.text()!==JSON.stringify(value))throw Error('SEMANTIC_RESPONSE_CHECKPOINT_CONFLICT')}
 return {key,bodyHash,generationId:header.generationId};
}

async function readV3Response(bucket:R2Bucket,intent:SemanticIntent){
 let text:string;
 try{const object=await bucket.get(keyFor(intent));if(!object)return undefined;text=await object.text()}catch{throw new ResponseCheckpointPending()}
 const saved:Checkpoint=JSON.parse(text),inputHash=await sha256(canonicalJson(intent.input));
 if(saved.version!==1||saved.operationId!==intent.id||saved.feedId!==intent.feedId||saved.token!==intent.token||saved.inputHash!==inputHash||inputHash!==intent.id||saved.model!==intent.input.model||intent.input.kind!=='V3_EDITOR_VERIFIER'||saved.httpStatus!==200||saved.header.provider!=='OPENROUTER'||saved.header.model!==intent.input.model||saved.bodyHash!==await sha256(saved.raw))throw Error('SEMANTIC_RESPONSE_CHECKPOINT_IDENTITY');
 const body=JSON.parse(saved.raw),cost=body.usage?.cost;
 if(typeof body.id!=='string'||!/^gen-[a-zA-Z0-9-]{1,124}$/.test(body.id)||saved.header.generationId&&saved.header.generationId!==body.id||typeof cost!=='number'||!Number.isFinite(cost)||cost<0)throw Error('SEMANTIC_RESPONSE_CHECKPOINT_INVALID');
 const inputTokens=body.usage.prompt_tokens??0,outputTokens=body.usage.completion_tokens??0;
 if(![inputTokens,outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('SEMANTIC_RESPONSE_CHECKPOINT_INVALID');
 return {body,usage:{calls:1,costUsd:cost,reported:true,tokensIn:inputTokens,tokensOut:outputTokens},responseCheckpoint:{key:keyFor(intent),bodyHash:saved.bodyHash,generationId:body.id} satisfies ResponseCheckpoint};
}
export async function recoverV3ResponseBilling(bucket:R2Bucket,intent:SemanticIntent){
 const saved=await readV3Response(bucket,intent);if(!saved)return undefined;
 return {usage:saved.usage,responseCheckpoint:saved.responseCheckpoint};
}
export async function recoverV3Response(bucket:R2Bucket,intent:SemanticIntent){
 const saved=await readV3Response(bucket,intent);if(!saved)return undefined;
 const choice=saved.body.choices?.[0];
 if(typeof choice?.message?.content!=='string'||!choice.message.content.trim())throw Error('SEMANTIC_RESPONSE_CHECKPOINT_INVALID');
 const value:ModelResponse={text:choice.message.content,inputTokens:saved.usage.tokensIn,outputTokens:saved.usage.tokensOut,costUsd:saved.usage.costUsd,finishReason:choice.finish_reason};
 return {value,usage:saved.usage,responseCheckpoint:saved.responseCheckpoint};
}
