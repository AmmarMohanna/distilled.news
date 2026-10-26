import {expect,it,vi} from 'vitest';
import {assessmentModelPayload} from './source-assessment-model';

it('bounds a model transport that ignores its abort signal',async()=>{
 const dispatch=vi.fn<typeof fetch>(async()=>new Promise<Response>(()=>{}));
 await expect(assessmentModelPayload(dispatch,'https://model.example',{method:'POST',body:'unchanged'},10)).rejects.toThrow('ASSESSMENT_MODEL_TIMEOUT');
 expect(dispatch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
it('bounds a response whose headers arrive but JSON body never finishes',async()=>{
 const cancel=vi.fn();const dispatch=vi.fn<typeof fetch>(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel})));
 await expect(assessmentModelPayload(dispatch,'https://model.example',{},10)).rejects.toThrow('ASSESSMENT_MODEL_TIMEOUT');
 expect(cancel).toHaveBeenCalledOnce();
});
it('retains the model response body limit',async()=>{
 await expect(assessmentModelPayload(async()=>new Response('x'.repeat(16_385)),'https://model.example',{})).rejects.toThrow('ASSESSMENT_MODEL_OVERSIZED_RESPONSE');
});
it('returns bounded JSON and distinguishes a provider HTTP error',async()=>{
 expect(await assessmentModelPayload(async()=>Response.json({answer:'YES'}),'https://model.example',{})).toEqual({ok:true,payload:{answer:'YES'}});
 expect(await assessmentModelPayload(async()=>new Response('Unavailable',{status:503}),'https://model.example',{})).toEqual({ok:false});
});
