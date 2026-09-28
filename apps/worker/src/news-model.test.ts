import {expect,it,vi} from 'vitest';
import {OpenAIGatewaySummaryAdapter} from './ai';
import {personalNewsBriefing,type BriefingEvidence} from '@distilled/core';

const text='Police confirmed 12 injuries after Hurricane Polo reached category 3.';
const input={briefing:personalNewsBriefing,evidence:[{messageId:'source-1',text,sourceUrl:'https://publisher.example/polo',postedAt:'2026-09-28T12:00:00Z'} as BriefingEvidence]};
it('uses existing OpenRouter credentials with strict synthesis and separate grounding, recording safe provider usage',async()=>{
  let calls=0;const usage=vi.fn(async()=>{}),fetcher=vi.fn(async(_url,init)=>{
    expect(init!.redirect).toBe("manual");const body=JSON.parse(init!.body as string);expect(body.response_format.type).toBe('json_schema');expect(body.tools).toBeUndefined();
    return Response.json({choices:[{message:{content:JSON.stringify(++calls===1?{claims:[{text,support:[{messageId:'source-1',quote:text}]}]}:{supported:true})}}],usage:{prompt_tokens:150,completion_tokens:40,cost:0.001}});
  }) as typeof fetch;
  const adapter=new OpenAIGatewaySummaryAdapter({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'test-only-key',model:'openai/gpt-4.1-mini',fetcher,usageRecorder:usage});
  const claims=await adapter.summarizeGrounded(input);
  expect(claims[0].support[0].messageId).toBe('source-1');expect(fetcher).toHaveBeenCalledTimes(2);
  expect(usage.mock.calls.map(call=>(call as any)[0].phase)).toEqual(['synthesis','grounding']);
  expect(JSON.stringify(usage.mock.calls)).not.toMatch(/test-only-key|confirmed|authorization/);
});
it('rejects a model sentence which its evidence checker cannot entail',async()=>{
  let calls=0;const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:JSON.stringify(++calls===1?{claims:[{text:'Police confirmed 12 injuries and declared the crisis resolved.',support:[{messageId:'source-1',quote:text}]}]}:{supported:false})}}]})) as typeof fetch;
  const adapter=new OpenAIGatewaySummaryAdapter({accountId:'',gatewayId:'',apiKey:'test',model:'fixture',provider:'OPENROUTER',fetcher});
  await expect(adapter.summarizeGrounded(input)).rejects.toThrow('GROUNDING_REJECTED');
});
