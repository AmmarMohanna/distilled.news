import {expect,it,vi} from 'vitest';
import {boundedCompletion} from './ai';
import {captureProviderReceipt,providerResponseReceipt,withProviderReceiptSink} from './provider-receipt';
const schema={type:'object',additionalProperties:false,required:['ok'],properties:{ok:{type:'boolean'}}};
it('receipt: concurrent asynchronous operations cannot exchange receipt ownership',async()=>{
 const a:any[]=[],b:any[]=[],receipt=(id:string)=>({provider:'OPENROUTER',model:'fixture',stage:'HEADERS' as const,httpStatus:200,generationId:id});
 await Promise.all([withProviderReceiptSink(async r=>{a.push(r)},async()=>{await new Promise(r=>setTimeout(r,5));await captureProviderReceipt(receipt('gen-a'))}),withProviderReceiptSink(async r=>{b.push(r)},async()=>{await captureProviderReceipt(receipt('gen-b'))})]);
 await captureProviderReceipt(receipt('gen-outside'));
 expect(a.map(r=>r.generationId)).toEqual(['gen-a']);expect(b.map(r=>r.generationId)).toEqual(['gen-b']);
});
it('receipt: malformed or credential-shaped header identifiers are not retained',()=>{
 expect(providerResponseReceipt(new Response('',{headers:{'x-generation-id':'sk-secret','x-request-id':'Bearer secret'}}),'OPENROUTER','fixture').generationId).toBeUndefined();
 expect(providerResponseReceipt(new Response('',{headers:{'x-request-id':'Bearer secret'}}),'OPENROUTER','fixture').requestId).toBeUndefined();
});
it('receipt: captures the generation handle before a response body stalls, without reporting a fabricated cost',async()=>{
 vi.useFakeTimers();try{
  const receipt=vi.fn(),usage=vi.fn(async(_record:any)=>{});
  const fetcher:typeof fetch=async(_url,init)=>{const body=new ReadableStream({start(controller){init!.signal!.addEventListener('abort',()=>controller.error(new DOMException('aborted','AbortError')))}});return new Response(body,{headers:{'x-generation-id':'gen-recoverable','x-request-id':'req-recoverable'}})};
  const pending=boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'openai/gpt-4.1-mini',fetcher,timeoutMs:10,usageRecorder:usage,onProviderReceipt:receipt} as any,'feed','event_review','SEMANTIC_CONSTRUCTION','{}',schema);
  const checked=expect(pending).rejects.toThrow('MODEL_TIMEOUT');await vi.advanceTimersByTimeAsync(10);await checked;
  expect(receipt).toHaveBeenCalledWith(expect.objectContaining({generationId:'gen-recoverable',requestId:'req-recoverable',stage:'HEADERS'}));
  expect(usage.mock.calls[0][0].reportedCostUsd).toBeUndefined();
 }finally{vi.useRealTimers()}
});
