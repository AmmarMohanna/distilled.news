import {it,expect} from 'vitest';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {confirmedEditorialOutcome} from './editorial-paid-outcome';

async function fixture(){
 const input:any={feedId:'feed',feedRevision:1,evidenceRevisionIds:['source'],kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'old',model:'openrouter:gpt-4.1',budgetKey:'day',state:{facts:['fact']}};
 const id=await sha256(canonicalJson(input));
 const original:any={id,feedId:'feed',input,status:'DEFERRED',failure:'SEMANTIC_PROVIDER_FAILURE',usage:{calls:1,costUsd:.2,reported:false},latencyMs:100,createdAt:'2026-10-20'};
 const intent={token:'owned',input},receipt={token:'owned',reported:1,cost_usd:.14};
 const proof:any={scope:'LOCAL_ONLY_FINANCIAL_CONFIRMATION_NO_SEMANTIC_PROMOTION',operationId:id,providerFinishReason:'length',originalResultHash:await sha256(canonicalJson(original)),originalResult:structuredClone(original),rawResponseHash:'response-hash',remotePaidOperationId:'remote-op',remoteReceipt:{reported:1,model:input.model,cost_usd:.14},localReservationToken:'owned',correctedUsage:{calls:1,costUsd:.14,reported:true}};
 const store:any={read:async(_feed:string,kind:string)=>kind==='editorial_response_recoveries'?proof:intent,db:{prepare:()=>({bind:()=>({first:async()=>receipt})})}};
 return {input,original,proof,intent,receipt,store};
}
it('derives a known failed outcome from matching terminal proof without changing the immutable original',async()=>{
 const f=await fixture(),before=canonicalJson(f.original),result=await confirmedEditorialOutcome(f.store,f.input,f.original);
 expect(result.status).toBe('DEFERRED');expect(result.value).toBeUndefined();expect(result.failure).toBe('SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED');expect(result.usage).toEqual({calls:1,costUsd:.14,reported:true});expect(canonicalJson(f.original)).toBe(before);
});
it.each(['hash','token','unsettled','cost','finish','model','accepted','absent'])('preserves the unknown fence for %s proof',async mode=>{
 const f=await fixture();
 if(mode==='hash')f.proof.originalResultHash='different';
 if(mode==='token')f.proof.localReservationToken='foreign';
 if(mode==='unsettled')f.receipt.reported=0;
 if(mode==='cost')f.receipt.cost_usd=.13;
 if(mode==='finish')f.proof.providerFinishReason='stop';
 if(mode==='model')f.proof.remoteReceipt.model='other';
 if(mode==='accepted')f.original.value={accepted:true};
 if(mode==='absent')f.store.read=async()=>null;
 expect(await confirmedEditorialOutcome(f.store,f.input,f.original)).toBe(f.original);
});
