import {AsyncLocalStorage} from 'node:async_hooks';
export interface ProviderBillingUnits {unit:'NEURON';quantity:number}
export interface ProviderReceipt {reportedBillingUnits?:ProviderBillingUnits;provider:string;model:string;stage:'HEADERS'|'GENERATION'|'USAGE';httpStatus:number;generationId?:string;requestId?:string;reportedCostUsd?:number;inputTokens?:number;outputTokens?:number;finishReason?:string}
const sinks=new AsyncLocalStorage<(receipt:ProviderReceipt)=>Promise<void>>();
export const withProviderReceiptSink=<T>(sink:(receipt:ProviderReceipt)=>Promise<void>,run:()=>Promise<T>):Promise<T>=>sinks.run(sink,run);
export async function captureProviderReceipt(receipt:ProviderReceipt):Promise<void>{await sinks.getStore()?.(receipt)}
/** Correlation only: a generation handle proves neither billing nor termination. */
export function providerResponseReceipt(response:Response,provider:string,model:string):ProviderReceipt {
 const id=(value:string|null,pattern:RegExp)=>value&&!/^(sk-|sk_or_|eyJ)/.test(value)&&pattern.test(value)?value:undefined;
 return {provider,model,stage:'HEADERS',httpStatus:response.status,generationId:id(response.headers.get('x-generation-id'),/^gen-[a-zA-Z0-9-]{1,124}$/),requestId:id(response.headers.get('x-request-id')??response.headers.get('request-id')??(provider==='CLOUDFLARE'?response.headers.get('cf-aig-log-id')??response.headers.get('cf-ray'):null),/^[a-zA-Z0-9_.:-]{1,96}$/)};
}
export function providerBodyReceipt(header:ProviderReceipt,id:unknown):ProviderReceipt {
 if(header.provider==='WORKERS_AI'||header.provider==='CLOUDFLARE'){if(typeof id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(id)&&!/^(sk-|sk_or_|eyJ)/.test(id))return {...header,generationId:id};return header;}
 if(typeof id!=='string'||!/^gen-[a-zA-Z0-9-]{1,124}$/.test(id))return header;
 if(header.generationId&&header.generationId!==id)throw Error('MODEL_RESPONSE_IDENTITY_MISMATCH');
 return {...header,generationId:id};
}
