import {expect,it,vi} from 'vitest';
import {configuredSourceWebIndex} from './source-search-web-index';
import type {Env} from './types';
vi.mock('./agentops-assessment',()=>({campaignAssessmentFetcher:vi.fn((_env:Env,_owner:string,fetcher:typeof fetch)=>fetcher)}));
const env={OPENROUTER_API_KEY:'test',SOURCE_DISCOVERY_MODEL:'openai/gpt-4.1'} as Env;
const citation=(url:string,title='Actual indexed page',content='Original search-provider evidence.')=>({type:'url_citation',url_citation:{url,title,content}});
it.each(['ammar mohanna aub','économie','أخبار العلوم'])('uses real indexed evidence rather than generated URLs for %s',async query=>{
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const request=JSON.parse(init!.body as string);
  expect(request).toMatchObject({model:env.SOURCE_DISCOVERY_MODEL,max_tokens:128,max_tool_calls:1,tool_choice:'required'});
  expect(request.tools[0].parameters).toMatchObject({engine:'exa',mode:'fast',max_uses:1,max_results:25,max_total_results:25,max_characters:1000});
  expect(JSON.parse(request.messages[1].content).query).toBe(query);
  return Response.json({choices:[{message:{content:'{"url":"https://invented.example/"}',annotations:[citation('https://actual.example/article'),citation('https://actual.example/article'),citation('https://127.0.0.1/private'),citation('https://user:secret@actual.example/private'),citation('https://missing-evidence.example/','','')]}}]});
 });
 expect(await configuredSourceWebIndex(env,query,'owner',fetcher)).toEqual({available:true,items:[{url:'https://actual.example/article',title:'Actual indexed page',excerpt:'Original search-provider evidence.'}]});
 expect(fetcher).toHaveBeenCalledOnce();
});
it('retains actual indexed titles without excerpts for normal relevance and readability checks',async()=>{
 const result=await configuredSourceWebIndex(env,'person','owner',async()=>Response.json({choices:[{message:{annotations:[{type:'url_citation',url_citation:{url:'https://actual.example/profile',title:'Actual person profile'}}]}}]}));
 expect(result).toEqual({available:true,items:[{url:'https://actual.example/profile',title:'Actual person profile',excerpt:''}]});
});
it('reuses a deterministic UTC-day discovery request and does not use feed descriptions as search words',async()=>{
 const bodies:string[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{bodies.push(init!.body as string);return Response.json({choices:[{message:{annotations:[]}}]});};
 await configuredSourceWebIndex(env,'Same query','owner',fetcher);await configuredSourceWebIndex(env,'Same query','owner',fetcher);
 expect(bodies[0]).toBe(bodies[1]);expect(JSON.parse(JSON.parse(bodies[0]).messages[1].content).snapshotDayUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
it('fails closed without actual web citations and never retries failed calls',async()=>{
 const failed=vi.fn<typeof fetch>(async()=>{throw Error('lost response');});
 expect(await configuredSourceWebIndex(env,'query','owner',failed)).toEqual({available:false,items:[]});expect(failed).toHaveBeenCalledOnce();
 expect(await configuredSourceWebIndex(env,'query','owner',async()=>Response.json({choices:[{message:{content:'https://invented.example'}}]}))).toEqual({available:false,items:[]});
});
