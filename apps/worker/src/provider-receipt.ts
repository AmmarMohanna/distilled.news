import {AsyncLocalStorage} from 'node:async_hooks';
export interface ProviderReceipt {provider:string;model:string;stage:'HEADERS';httpStatus:number;generationId?:string;requestId?:string}
const sinks=new AsyncLocalStorage<(receipt:ProviderReceipt)=>Promise<void>>();
export const withProviderReceiptSink=<T>(sink:(receipt:ProviderReceipt)=>Promise<void>,run:()=>Promise<T>):Promise<T>=>sinks.run(sink,run);
export async function captureProviderReceipt(receipt:ProviderReceipt):Promise<void>{await sinks.getStore()?.(receipt)}
/** Correlation only: a generation handle proves neither billing nor termination. */
export function providerResponseReceipt(response:Response,provider:string,model:string):ProviderReceipt {
 const id=(value:string|null,pattern:RegExp)=>value&&!/^(sk-|sk_or_|eyJ)/.test(value)&&pattern.test(value)?value:undefined;
 return {provider,model,stage:'HEADERS',httpStatus:response.status,generationId:id(response.headers.get('x-generation-id'),/^gen-[a-zA-Z0-9-]{1,124}$/),requestId:id(response.headers.get('x-request-id')??response.headers.get('request-id'),/^[a-zA-Z0-9_.:-]{1,96}$/)};
}
