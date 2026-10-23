import {expect,it,vi} from 'vitest';
import {verifiedSourceRecommendations} from './source-recommendations';
import {assessSources} from './source-assessment';
import type {Env} from './types';
vi.mock('./source-assessment',()=>({assessSources:vi.fn()}));
const rss='<rss><channel><title>News</title><item><guid>one</guid><title>Coconut farming</title><link>https://publisher.example/story</link></item></channel></rss>';
it('offers twenty verified choices while preserving different available channels',async()=>{
 const candidates=[...Array.from({length:25},(_,i)=>`https://publisher${i}.example/feed.xml`),'https://t.me/science_updates','https://x.com/science_updates','https://www.linkedin.com/company/science-updates','news: science','https://science.example/'];
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_input,inputs)=>inputs.map(input=>({input,status:'accepted',reason:'Fetched evidence matches',checkedAt:new Date().toISOString()})));
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}):new Response(rss));
 const configured={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_EXECUTION_URL:'https://execution.example',SOURCE_EXECUTION_TOKEN:'test',SOURCE_EXECUTION_SERVICE:{},APIFY_API_TOKEN:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_apify":1,"linkedin_apify":1}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.1}'} as Env;
 const result=await verifiedSourceRecommendations(configured,{title:'Science',description:'Scientific research'},fetcher);
 expect(result.sources).toHaveLength(20);for(const source of candidates.slice(25))expect(result.sources).toContain(source);
 vi.mocked(assessSources).mockReset();
});

it('uses bounded replacement discovery and never rechecks duplicate candidates',async()=>{
 const rejected={input:'https://publisher.example/dead.xml',status:'unverified' as const,reason:'HTTP 404',checkedAt:new Date().toISOString()};
 const accepted={...rejected,input:'https://publisher.example/current.xml',status:'accepted' as const,reason:'Relevant'};
 vi.mocked(assessSources).mockResolvedValueOnce([rejected]).mockResolvedValueOnce([accepted]);
 let pass=0; const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:pass++===0?[rejected.input]:[rejected.input,accepted.input]})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const result=await verifiedSourceRecommendations(env,{title:'Pizza',description:'Pizza news'},fetcher);
 expect(result.sources).toEqual([accepted.input]);
 expect(result.checks).toHaveLength(2);
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(3);
 expect(assessSources).toHaveBeenLastCalledWith(env,{title:'Pizza',description:'Pizza news'},[accepted.input],expect.any(Function));
});

it.each([
 {upstreamStatus:503},
 {failureCode:'SOURCE_CONNECTION_FAILED' as const},
 {failureCode:'SOURCE_FETCH_TIMEOUT' as const}
])('avoids the failing Google News provider during replacement discovery: %j',async failure=>{
 const failed={input:'news: coconut Australia',kind:'google_news',status:'unverified' as const,reason:'Provider unavailable',...failure,checkedAt:new Date().toISOString()};
 const accepted={input:'https://publisher.example/coconut/rss.xml',status:'accepted' as const,reason:'Relevant',checkedAt:failed.checkedAt};
 vi.mocked(assessSources).mockReset().mockResolvedValueOnce([failed]).mockResolvedValueOnce([accepted]);
 let pass=0; const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:pass++===0?[failed.input]:['news: coconut farming Australia',accepted.input]})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const context={title:'Coconuts',description:'Australian coconut farming'};
 const result=await verifiedSourceRecommendations(env,context,fetcher);
 expect(result.sources).toEqual([accepted.input]);
 expect(assessSources).toHaveBeenLastCalledWith(env,context,[accepted.input],expect.any(Function));
 const prompt=JSON.parse(fetcher.mock.calls[1][1]!.body as string).messages[0].content;
 expect(prompt).toContain('can collect only these source families: rss.');
 expect(result.checks[0]).toEqual(failed);
});

it('recovers a dead RSS path from the publisher homepage and verifies the advertised replacement',async()=>{
 const failed={input:'https://publisher.example/rss/news.xml',kind:'rss_feed',status:'unverified' as const,reason:'HTTP 404',upstreamStatus:404,checkedAt:new Date().toISOString()};
 const accepted={input:'rss: https://publisher.example/rss.xml/',kind:'rss_feed',status:'accepted' as const,reason:'Relevant',checkedAt:failed.checkedAt};
 vi.mocked(assessSources).mockReset().mockResolvedValueOnce([accepted]);
 const feed='<rss><channel><title>Farming</title><item><guid>one</guid><title>Australian coconut growing</title><link>https://publisher.example/story</link></item></channel></rss>';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:[failed.input]})}}]}):String(input).endsWith('/rss.xml/')?new Response(feed,{headers:{'content-type':'application/rss+xml'}}):new Response('<a href="/rss.xml/">RSS</a>',{headers:{'content-type':'text/html'}}));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const context={title:'Coconuts',description:'Australian coconut farming'};
 const result=await verifiedSourceRecommendations(env,context,fetcher);
 expect(result.sources).toEqual([accepted.input]);
 expect(assessSources).toHaveBeenLastCalledWith(env,context,[accepted.input],expect.any(Function));
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(2);
});

it.each(['A named athlete','A historical researcher','Regional food production','A local public policy topic'])('continues discovery beyond a sparse first set for %s',async title=>{
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,context,inputs)=>{
  expect(context.title).toBe(title);
  return inputs.map(input=>({input,status:'accepted',reason:'Fetched article evidence matches the original subject',checkedAt:new Date().toISOString()}));
 });
 let proposals=0;
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({sources:Array.from({length:proposals++===0?2:18},(_,i)=>`https://pass${proposals}-publisher${i}.example/feed.xml`)})}}]})
  :new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const result=await verifiedSourceRecommendations(env,{title,description:'Ongoing relevant developments'},fetcher);
 expect(result.sources).toHaveLength(20);expect(proposals).toBe(2);
 expect(new Set(result.sources.map(url=>new URL(url).hostname)).size).toBe(20);
});
