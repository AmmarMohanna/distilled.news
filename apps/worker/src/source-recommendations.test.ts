import {expect,it,vi} from 'vitest';
import {sourceRecommendations} from './source-recommendations';
import type {Env} from './types';

it('makes no provider call while recommendations are disabled',async()=>{
 const fetcher=vi.fn();
 await expect(sourceRecommendations({} as Env,{title:'World',description:'News'},fetcher)).rejects.toThrow('not enabled');
 expect(fetcher).not.toHaveBeenCalled();
});

it('bounds the call and excludes unsafe suggestions without subscribing anything',async()=>{
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:JSON.stringify({sources:['https://feeds.bbci.co.uk/news/world/rss.xml','https://127.0.0.1/feed.xml','http://example.com/feed.xml']})}}]}));
 const sources=await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'World',description:'News'},fetcher);
 expect(sources).toEqual(['https://feeds.bbci.co.uk/news/world/rss.xml']);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const options=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(JSON.parse(options[1].body as string)).toMatchObject({max_tokens:400,temperature:0});
});

it('excludes unconfigured source families even when the model suggests them',async()=>{
 const candidates=['https://www.bbc.com/news','https://t.me/bbcnews','https://x.com/BBCWorld','https://www.linkedin.com/company/bbc-news','news: Lebanon economy'];
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}));
 expect(await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'World',description:'News'},fetcher)).toEqual(['news: Lebanon economy']);
 const body=JSON.parse((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
 expect(body.messages[0].content).toContain('can collect only these source families: rss, google_news');
});

it('resolves an advertised RSS feed when website extraction is unavailable',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://publisher.example/']})}}]})
  :String(input).endsWith('/rss.xml')
   ?new Response('<rss version="2.0"><channel><title>News</title><item><guid>one</guid><title>Latest news</title><link>https://publisher.example/story</link></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}})
   :new Response('<link rel="alternate" type="application/rss+xml" href="/rss.xml">',{headers:{'content-type':'text/html'}}));
 expect(await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'World',description:'News'},fetcher)).toEqual(['rss: https://publisher.example/rss.xml']);
});

it('retains social and website suggestions when their collectors are configured',async()=>{
 const candidates=['https://www.bbc.com/news','https://t.me/bbcnews','https://x.com/BBCWorld','https://www.linkedin.com/company/bbc-news','news: Lebanon economy'];
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}));
 const configured={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_EXECUTION_URL:'https://execution.example',SOURCE_EXECUTION_TOKEN:'test',SOURCE_EXECUTION_SERVICE:{},APIFY_API_TOKEN:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_apify":1,"linkedin_apify":1}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.1}'} as Env;
 expect(await sourceRecommendations(configured,{title:'World',description:'News'},fetcher)).toEqual(candidates);
 expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not pad recommendations with multiple queries to the same Google News provider',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:JSON.stringify({sources:['news: coconut Australia','news: coconut farming Australia','news: Australian coconut market','https://publisher.example/coconut/rss.xml']})}}]}));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Coconuts',description:'Coconut farming in Australia'},fetcher)).toEqual(['news: coconut Australia','https://publisher.example/coconut/rss.xml']);
});
