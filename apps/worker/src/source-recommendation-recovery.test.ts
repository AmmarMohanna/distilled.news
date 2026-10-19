import {expect,it,vi} from 'vitest';
import {verifiedSourceRecommendations} from './source-recommendations';
import {assessSources} from './source-assessment';
import type {Env} from './types';
vi.mock('./source-assessment',()=>({assessSources:vi.fn()}));
const rss='<rss><channel><title>News</title><item><guid>one</guid><title>Coconut farming</title><link>https://publisher.example/story</link></item></channel></rss>';

it('replaces failed recommendations once and only returns independently accepted replacements',async()=>{
 const rejected={input:'https://publisher.example/dead.xml',status:'unverified' as const,reason:'HTTP 404',checkedAt:new Date().toISOString()};
 const accepted={...rejected,input:'https://publisher.example/current.xml',status:'accepted' as const,reason:'Relevant'};
 vi.mocked(assessSources).mockResolvedValueOnce([rejected]).mockResolvedValueOnce([accepted]);
 let pass=0; const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:pass++===0?[rejected.input]:[rejected.input,accepted.input]})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const result=await verifiedSourceRecommendations(env,{title:'Pizza',description:'Pizza news'},fetcher);
 expect(result.sources).toEqual([accepted.input]);
 expect(result.checks).toHaveLength(2);
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(2);
 expect(assessSources).toHaveBeenLastCalledWith(env,{title:'Pizza',description:'Pizza news'},[accepted.input],fetcher);
});

it('avoids the failing Google News provider during replacement discovery without bypassing verification',async()=>{
 const failed={input:'news: coconut Australia',kind:'google_news',status:'unverified' as const,reason:'HTTP 503',upstreamStatus:503,checkedAt:new Date().toISOString()};
 const accepted={input:'https://publisher.example/coconut/rss.xml',status:'accepted' as const,reason:'Relevant',checkedAt:failed.checkedAt};
 vi.mocked(assessSources).mockReset().mockResolvedValueOnce([failed]).mockResolvedValueOnce([accepted]);
 let pass=0; const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:pass++===0?[failed.input]:['news: coconut farming Australia',accepted.input]})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 const context={title:'Coconuts',description:'Australian coconut farming'};
 const result=await verifiedSourceRecommendations(env,context,fetcher);
 expect(result.sources).toEqual([accepted.input]);
 expect(assessSources).toHaveBeenLastCalledWith(env,context,[accepted.input],fetcher);
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
 expect(assessSources).toHaveBeenLastCalledWith(env,context,[accepted.input],fetcher);
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(1);
});
