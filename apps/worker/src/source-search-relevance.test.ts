import {expect,it,vi} from 'vitest';
import {alignedSearchResults} from './source-search-relevance';
import {campaignAssessmentFetcher} from './agentops-assessment';
import type {Env} from './types';
vi.mock('./agentops-assessment',()=>({campaignAssessmentFetcher:vi.fn((_env:Env,_owner:string,fetcher:typeof fetch)=>fetcher)}));
const env={OPENROUTER_API_KEY:'test',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'} as Env;
const topic={title:'Ammar Mohanna',description:'Recent research and projects by Ammar Mohanna at AUB'};
const rows=[{source:'https://one.example',title:'Ammar Mohanna presents research',publisher:'one.example',excerpt:'Ammar Mohanna presents a new project at AUB.'},{source:'https://two.example',title:'AI workforce trends',publisher:'two.example',excerpt:'An unrelated AI conference.'}];
const reply=(results:unknown)=>Response.json({choices:[{message:{content:JSON.stringify({results})}}]});
it('makes one capped model request, preserves identities and rejects broad overlap for a named subject',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const request=JSON.parse(init!.body as string),data=JSON.parse(request.messages[1].content);
  expect(request).toMatchObject({model:env.SOURCE_ASSESSMENT_MODEL,max_tokens:2200,temperature:0});
  expect(request).not.toHaveProperty('tools');
  expect(data).toMatchObject({feed:topic,query:'Ammar Mohanna AUB'});
  expect(request.messages[0].content).toContain('shared industry, similar names or generic AI coverage are insufficient');
  return reply([{id:1,alignment:'NO'},{id:0,alignment:'YES'}]);
 });
 expect(await alignedSearchResults(env,'Ammar Mohanna AUB',topic,rows,fetcher,'owner')).toEqual({results:[rows[0]],unavailable:false});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(campaignAssessmentFetcher).toHaveBeenCalledWith(expect.objectContaining({SOURCE_ASSESSMENT_SHARED_MODEL_CAPACITY_ENABLED:'true'}),'owner',fetcher);
});
it.each([
 [],[{id:0,alignment:'YES'},{id:0,alignment:'NO'}],
 [{id:0,alignment:'YES'},{id:2,alignment:'YES'}],
 [{id:0,alignment:'YES'},{id:1,alignment:'MAYBE'}],
 [{id:0,alignment:'YES',url:'https://invented.example'},{id:1,alignment:'NO'}]
].map(decisions=>({decisions})))('fails closed on incomplete, duplicate, invented or malformed decisions %#',async({decisions})=>{
 const fetcher=vi.fn<typeof fetch>(async()=>reply(decisions));
 expect(await alignedSearchResults(env,'Ammar',topic,rows,fetcher,'owner')).toEqual({results:[],unavailable:true});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('hides unknown results without labelling them off topic',async()=>{
 expect(await alignedSearchResults(env,'Ammar',topic,rows,async()=>reply([{id:0,alignment:'YES'},{id:1,alignment:'UNKNOWN'}]),'owner')).toEqual({results:[rows[0]],unavailable:true});
});
it('does not retry failed provider calls',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>{throw Error('lost response');});
 expect(await alignedSearchResults(env,'Ammar',topic,rows,fetcher,'owner')).toEqual({results:[],unavailable:true});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('bounds latency even when the model transport ignores cancellation',async()=>{
 vi.useFakeTimers();
 try{
  const fetcher=vi.fn<typeof fetch>(()=>new Promise(()=>{}));
  const pending=alignedSearchResults(env,'Ammar',topic,rows,fetcher,'owner');
  await vi.advanceTimersByTimeAsync(8000);
  expect(await pending).toEqual({results:[],unavailable:true});
  expect(fetcher).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});
it('skips inference for empty results and fails closed without configured credentials or owner',async()=>{
 const fetcher=vi.fn();
 expect(await alignedSearchResults(env,'Ammar',topic,[],fetcher,'owner')).toEqual({results:[],unavailable:false});
 expect(await alignedSearchResults({} as Env,'Ammar',topic,rows,fetcher,'owner')).toEqual({results:[],unavailable:true});
 expect(await alignedSearchResults(env,'Ammar',topic,rows,fetcher)).toEqual({results:[],unavailable:true});
 expect(fetcher).not.toHaveBeenCalled();
});
