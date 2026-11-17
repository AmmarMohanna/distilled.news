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

it('assembles streamed structured output and preserves the final reported cost',async()=>{
 const receipt=vi.fn(),usage=vi.fn(async(_record:any)=>{});let request:any;
 const fetcher:typeof fetch=async(_url,init)=>{request=JSON.parse(String(init!.body));const text=': OPENROUTER PROCESSING\r\n\r\ndata: '+JSON.stringify({id:'gen-streamed',choices:[{delta:{content:'{"ok":'},finish_reason:null}]})+'\r\n\r\ndata: '+JSON.stringify({id:'gen-streamed',choices:[{delta:{content:'true}'},finish_reason:'stop'}]})+'\r\n\r\ndata: '+JSON.stringify({id:'gen-streamed',choices:[{delta:{content:''},finish_reason:'stop'}],usage:{cost:.004,prompt_tokens:30,completion_tokens:8}})+'\r\n\r\ndata: [DONE]\r\n\r\n';const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close()}}),{headers:{'content-type':'text/event-stream','x-generation-id':'gen-streamed'}})};
 expect(await boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'openai/gpt-4.1-mini',fetcher,usageRecorder:usage,onProviderReceipt:receipt} as any,'feed','event_review','CONSTRUCTION','{}',schema)).toEqual({ok:true});
 expect(request.stream).toBe(true);expect(usage.mock.calls[0][0].reportedCostUsd).toBe(.004);expect(receipt).toHaveBeenCalledWith(expect.objectContaining({stage:'USAGE',generationId:'gen-streamed',reportedCostUsd:.004}));
});
it.each(['truncated','wrong-generation','provider-error'])('rejects %s streams without treating partial prose or intermediate usage as completion',async mode=>{
 const usage=vi.fn(async(_record:any)=>{}),id=mode==='wrong-generation'?'gen-foreign':'gen-expected';
 const frame=mode==='provider-error'?{id,error:{message:'provider disconnected'},choices:[]}:{id,choices:[{delta:{content:'{"ok":true}'},finish_reason:'stop'}],usage:{cost:.01}};
 const text='data: '+JSON.stringify(frame)+'\n\n'+(mode==='truncated'?'':'data: [DONE]\n\n');
 await expect(boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'openai/gpt-4.1-mini',usageRecorder:usage,fetcher:async()=>new Response(text,{headers:{'content-type':'text/event-stream','x-generation-id':'gen-expected'}})},'feed','event_review','CONSTRUCTION','{}',schema)).rejects.toThrow('MODEL_RESPONSE_INVALID');
 expect(usage.mock.calls[0][0].reportedCostUsd).toBeUndefined();
});
it('retains a JSON response generation handle when the proxy omits its header',async()=>{
 const receipt=vi.fn();
 expect(await boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'openai/gpt-4.1-mini',onProviderReceipt:receipt,fetcher:async()=>Response.json({id:'gen-body-recovery',choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}],usage:{cost:.001}})},'feed','event_review','CONSTRUCTION','{}',schema)).toEqual({ok:true});
 expect(receipt).toHaveBeenCalledWith(expect.objectContaining({stage:'GENERATION',generationId:'gen-body-recovery'}));
});
it('conflicting JSON generation IDs cannot attribute a reported cost to this operation',async()=>{
 const usage=vi.fn(async(_record:any)=>{});
 await expect(boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'openai/gpt-4.1-mini',usageRecorder:usage,fetcher:async()=>Response.json({id:'gen-foreign',choices:[{message:{content:'{"ok":true}'}}],usage:{cost:.04}},{headers:{'x-generation-id':'gen-owned'}})},'feed','event_review','CONSTRUCTION','{}',schema)).rejects.toThrow('MODEL_RESPONSE_INVALID');
 expect(usage.mock.calls[0][0].reportedCostUsd).toBeUndefined();
});
