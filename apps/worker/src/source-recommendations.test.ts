import {expect,it,vi} from 'vitest';
import {sourceRecommendations,verifiedSourceRecommendations} from './source-recommendations';
import type {Env} from './types';
const rss='<rss><channel><title>News</title><item><guid>one</guid><title>Topic news</title><link>https://publisher.example/story</link></item></channel></rss>';
it('starts with fast semantic discovery and uses one bounded web search for missing choices',async()=>{
 const dispatch=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:JSON.stringify({sources:[]})}}]}));
 await verifiedSourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Historical figure',description:'Historical research'},dispatch);
 const bodies=dispatch.mock.calls.map(([,init])=>JSON.parse(init!.body as string));
 expect(bodies).toHaveLength(2);
 expect(bodies[1].tools[0].parameters).toMatchObject({max_uses:1,max_results:5});
 expect(bodies[0]).not.toHaveProperty('tools');
});


it('makes no provider call while recommendations are disabled',async()=>{
 const fetcher=vi.fn();
 await expect(sourceRecommendations({} as Env,{title:'World',description:'News'},fetcher)).rejects.toThrow('not enabled');
 expect(fetcher).not.toHaveBeenCalled();
});

it('bounds the call and excludes unsafe suggestions without subscribing anything',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://feeds.bbci.co.uk/news/world/rss.xml','https://127.0.0.1/feed.xml','http://example.com/feed.xml']})}}]}):new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const sources=await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'World',description:'News'},fetcher);
 expect(sources).toEqual(['https://feeds.bbci.co.uk/news/world/rss.xml']);
 expect(fetcher).toHaveBeenCalledTimes(2);
 const options=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(JSON.parse(options[1].body as string)).toMatchObject({max_tokens:2400,temperature:0});
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
 expect(fetcher).toHaveBeenCalledTimes(3);
});

it('does not pad recommendations with multiple queries to the same Google News provider',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['news: coconut Australia','news: coconut farming Australia','news: Australian coconut market','https://publisher.example/coconut/rss.xml']})}}]}):new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Coconuts',description:'Coconut farming in Australia'},fetcher)).toEqual(['news: coconut Australia','https://publisher.example/coconut/rss.xml']);
});

it('does not return guessed RSS paths that fail both feed preflight and publisher discovery',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['news: coconut Australia','https://publisher.example/invented/rss.xml']})}}]}):new Response('<html>No RSS feed here.</html>',{headers:{'content-type':'text/html'}}));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Coconuts',description:'Australian farming'},fetcher)).toEqual(['news: coconut Australia']);
});

it('never suggests Google News when deployment access is disabled',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['news: coconut Australia','https://publisher.example/feed.xml']})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_GOOGLE_NEWS:'false',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Coconut',description:'Australian coconut industry'},fetcher)).toEqual(['https://publisher.example/feed.xml']);
 expect(fetcher.mock.calls.every(([url])=>!String(url).includes('news.google.com'))).toBe(true);
});

it('uses no search on the catalog pass and caps the fallback search',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://publisher.example/feed.xml']})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env;
 await sourceRecommendations(env,{title:'Solar',description:'Solar industry'},fetcher);
 await sourceRecommendations(env,{title:'Solar',description:'Solar industry'},fetcher,{search:true});
 const bodies=fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai')).map(([,init])=>JSON.parse(init!.body as string));
 expect(bodies[0]).not.toHaveProperty('tools');
 expect(bodies[1].tools).toEqual([{type:'openrouter:web_search',parameters:{engine:'exa',mode:'fast',max_uses:1,max_results:5,max_total_results:5,max_characters:1000}}]);
});

it('discovers the publisher feed when search returns an article URL',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://publisher.example/news/story']})}}]}):String(url).endsWith('/feed.xml')?new Response(rss):new Response('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Solar',description:'Solar industry'},fetcher)).toEqual(['rss: https://publisher.example/feed.xml']);
 expect(fetcher.mock.calls.some(([url])=>String(url)==='https://publisher.example/')).toBe(true);
});

it('narrows an advertised WordPress feed to real topic-search results',async()=>{
 const base=rss.replace('<channel>','<channel><generator>https://wordpress.org/?v=6</generator>');
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://publisher.example/feed.xml'],searchTerms:'coconut Australia'})}}]}):new Response(base));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 expect(await sourceRecommendations(env,{title:'Coconut',description:'Coconut in Australia'},fetcher)).toEqual(['rss: https://publisher.example/?s=coconut+Australia&feed=rss2']);
 expect(fetcher.mock.calls.some(([url])=>String(url)==='https://publisher.example/?s=coconut+Australia&feed=rss2')).toBe(true);
});


it('retains a broad batch of distinct publisher candidates and anchors current discovery to today',async()=>{
 const candidates=Array.from({length:12},(_,index)=>`https://publisher${index}.example/feed.xml`);
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}):new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const sources=await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Technology',description:'AI industry updates'},fetcher);
 expect(sources).toEqual(candidates);
 const body=JSON.parse(fetcher.mock.calls[0][1]!.body as string);
 expect(body.messages[0].content).toContain(`Today is ${new Date().toISOString().slice(0,10)}`);
 expect(body.messages[0].content).toContain('Do not add a past year');
});

it('caps an oversized discovery answer instead of failing the whole recommendation request',async()=>{
 const candidates=Array.from({length:40},(_,index)=>`https://publisher${index}.example/feed.xml`);
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}):new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 expect(await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Technology',description:'AI industry updates'},fetcher)).toEqual(candidates.slice(0,30));
 expect(fetcher).toHaveBeenCalledTimes(31);
});

it('uses semantic catalog selections for named subjects without literal catalog overlap',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({sources:[],catalogSources:['https://www.theguardian.com/football/rss','https://invented.example/feed']})}}]})
  :new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const result=await sourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'A named athlete',description:'Follow their news'},fetcher);
 expect(result).toEqual(['rss: https://www.theguardian.com/football/rss']);
 expect(fetcher.mock.calls.some(([url])=>String(url).includes('invented.example'))).toBe(false);
});

it('retains dedicated social channel candidates even with a full publisher list',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({sources:Array.from({length:30},(_,i)=>`https://publisher${i}.example/feed.xml`),channels:{telegram:['https://t.me/examplechannel'],x:['https://x.com/exampleaccount'],linkedin:['https://www.linkedin.com/company/examplecompany']}})}}]})
  :new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const configured={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_EXECUTION_URL:'https://execution.example',SOURCE_EXECUTION_TOKEN:'test',SOURCE_EXECUTION_SERVICE:{},APIFY_API_TOKEN:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_apify":1,"linkedin_apify":1}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.1}'} as Env;
 const result=await sourceRecommendations(configured,{title:'A subject',description:'News about the subject'},fetcher);
 expect(result).toEqual(expect.arrayContaining(['https://t.me/examplechannel','https://x.com/exampleaccount','https://www.linkedin.com/company/examplecompany']));
 expect(result).toHaveLength(33);
});
