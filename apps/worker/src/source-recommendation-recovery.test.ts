import {expect,it,vi} from 'vitest';
import {verifiedSourceRecommendations} from './source-recommendations';
import {assessSources} from './source-assessment';
import type {Env} from './types';
vi.mock('./source-assessment',()=>({assessSources:vi.fn()}));
const rss='<rss><channel><title>News</title><item><guid>one</guid><title>Coconut farming</title><link>https://publisher.example/story</link></item></channel></rss>';
it.each([200,403])('uses one translated publisher search only after a working original search (HTTP %s)',async status=>{
 const context={title:'Coconut farming',description:'Coconut farming in local communities'};
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,actual,inputs)=>{expect(actual).toEqual(context);return inputs.map(input=>({input,status:'accepted',reason:'Fetched evidence for the original topic',checkedAt:new Date().toISOString()}));});
 const item=(index:number)=>`<item><guid>${index}</guid><title>Coconut farming research</title><link>https://news.google.com/rss/articles/${index}</link><source url="https://publisher${index}.example">Publisher</source></item>`;
 const queries:string[]=[];
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const fetcher=vi.fn<typeof fetch>(async url=>{
  if(String(url).includes('openrouter.ai'))return Response.json({choices:[{message:{content:JSON.stringify({sources:[],localizedSearchTerms:{fr:'culture du cocotier'}})}}]});
  const query=new URL(String(url)).searchParams.get('q')!;queries.push(query);
  if(query==='culture du cocotier')await gate;
  return new Response(`<rss><channel>${query==='culture du cocotier'?Array.from({length:15},(_,i)=>item(i+1)).join(''):item(0)}</channel></rss>`,{status});
 });
 const configured={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_FAST_CATALOG:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env;
 let finished=false;
 const pending=verifiedSourceRecommendations(configured,context,fetcher).then(result=>{finished=true;return result;});
 if(status===200){await vi.waitFor(()=>expect(queries).toContain('culture du cocotier'));expect(finished).toBe(false);}
 release();const result=await pending;
 expect(queries).toEqual(status===200?['Coconut farming','culture du cocotier']:['Coconut farming']);
 expect(result.sources.filter(source=>source.startsWith('news:'))).toHaveLength(1);
 if(status===200)expect(result.sources.length).toBeGreaterThanOrEqual(15);
});
it('does not admit an unsupported social homepage discovered from indexed search articles',async()=>{
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_context,inputs)=>inputs.map(input=>({input,status:'accepted',reason:'Fetched evidence',checkedAt:new Date().toISOString()})));
 const indexed='<rss><channel><item><guid>facebook-story</guid><title>Coconut farming update</title><link>https://news.google.com/rss/articles/story</link><source url="https://www.facebook.com">Facebook</source></item></channel></rss>';
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:[]})}}]}):new Response(indexed));
 const result=await verifiedSourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_FAST_CATALOG:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Coconut farming',description:'Coconut farming'},fetcher);
 expect(result.sources).not.toContain('https://www.facebook.com');
 expect(vi.mocked(assessSources).mock.calls.flatMap(([, ,inputs])=>inputs)).not.toContain('https://www.facebook.com');
});
it('stops queued Telegram lookups after an account rate limit while keeping other channels',async()=>{
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_context,inputs)=>inputs.map(input=>({input,status:input.includes('t.me')?'unverified':'accepted',reason:'Fetched result',checkedAt:new Date().toISOString(),...(input.includes('t.me')?{failureCode:'TELEGRAM_RATE_LIMIT' as const}:{})})));
 const sources=['https://t.me/first_channel','https://t.me/second_channel','https://t.me/third_channel','https://publisher.example/feed.xml'];
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_EXECUTION_SERVICE:{},SOURCE_EXECUTION_URL:'https://execution.example',SOURCE_EXECUTION_TOKEN:'test'} as Env;
 const result=await verifiedSourceRecommendations(env,{title:'Science',description:'Science updates'},fetcher);
 expect(result.sources).toEqual(['https://publisher.example/feed.xml']);
 expect(vi.mocked(assessSources).mock.calls.filter(([, ,inputs])=>inputs[0].includes('t.me'))).toHaveLength(1);
 expect(result.checks).toContainEqual(expect.objectContaining({failureCode:'TELEGRAM_RATE_LIMIT'}));
});

it('bounds paid verification without holding up independent RSS checks',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let active=0,maximum=0;
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_context,inputs)=>{
  if(inputs[0].includes('x.com')){active++;maximum=Math.max(maximum,active);await gate;active--;}
  return inputs.map(input=>({input,status:'accepted',reason:'Fetched relevant article',checkedAt:new Date().toISOString()}));
 });
 const sources=[...Array.from({length:8},(_,i)=>`https://x.com/source${i}`),'https://publisher.example/feed.xml'];
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources})}}]}):new Response(rss));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test',APIFY_API_TOKEN:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_apify":5}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.05}'} as Env;
 const progress=vi.fn();const pending=verifiedSourceRecommendations(env,{title:'Science',description:'Science updates'},fetcher,undefined,progress);
 await vi.waitFor(()=>{expect(maximum).toBe(3);expect(progress).toHaveBeenCalledWith(expect.objectContaining({sources:expect.arrayContaining(['https://publisher.example/feed.xml'])}));});
 release();const result=await pending;expect(maximum).toBe(3);expect(result.sources).toHaveLength(9);
});
it('plans free sources when the remaining collector budget cannot cover paid verification',async()=>{
 const first=vi.fn(async()=>({reserved_usd:24.99,limit_usd:25}));
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_DAILY_BUDGET_USD:'25',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_apify":5,"linkedin_apify":5}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.05}',APIFY_API_TOKEN:'test',DB:{prepare:()=>({bind:()=>({first})})}} as unknown as Env;
 vi.mocked(assessSources).mockReset().mockImplementation(async(actual,_context,inputs)=>{expect(actual).toBe(env);return inputs.map(input=>({input,status:'accepted',reason:'Real fetched evidence',checkedAt:new Date().toISOString()}));});
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:['https://x.com/example','https://www.linkedin.com/company/example','https://publisher.example/feed.xml']})}}]}):new Response(rss));
 const result=await verifiedSourceRecommendations(env,{title:'Research',description:'Scientific research'},fetcher);
 expect(result.sources).toEqual(['https://publisher.example/feed.xml']);
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).messages[0].content).not.toContain('families: rss, google_news, x_profile');
 expect(env.SOURCE_PROVIDER_BUDGETS_JSON).toBe('{"x_apify":5,"linkedin_apify":5}');
});
it('recovers from a malformed first discovery response instead of abandoning the topic',async()=>{
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_context,inputs)=>inputs.map(input=>({input,status:'accepted',reason:'Relevant fetched evidence',checkedAt:new Date().toISOString()})));
 let proposals=0;
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:proposals++===0?'{':JSON.stringify({sources:['https://publisher.example/feed.xml']})}}]}):new Response(rss));
 const result=await verifiedSourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Coconut farming',description:'Coconut farming'},fetcher);
 expect(result.sources).toEqual(['https://publisher.example/feed.xml']);
 expect(proposals).toBeGreaterThan(1);
});

it('uses one final bounded search when verified results are still below fifteen',async()=>{
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_context,inputs)=>inputs.map(input=>({input,status:'accepted',reason:'Fetched relevant article',checkedAt:new Date().toISOString()})));
 const sizes=[8,4,2,2];let offset=0,pass=0;const bodies:Record<string,unknown>[]=[];
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(rss);
  bodies.push(JSON.parse(init!.body as string));const sources=Array.from({length:sizes[pass++]??0},()=>`https://publisher${offset++}.example/feed.xml`);
  return Response.json({choices:[{message:{content:JSON.stringify({sources})}}]});
 });
 const result=await verifiedSourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Narrow topic',description:'Exact narrow topic'},fetcher);
 expect(result.sources).toHaveLength(16);expect(bodies).toHaveLength(4);
 expect(bodies.filter(body=>body.tools)).toHaveLength(2);
 expect(result.checks).toHaveLength(16);
});
it('offers twenty verified choices while preserving different available channels',async()=>{
 const candidates=[...Array.from({length:25},(_,i)=>`https://publisher${i}.example/feed.xml`),'https://t.me/science_updates','https://x.com/science_updates','https://www.linkedin.com/company/science-updates','news: science','https://science.example/'];
 vi.mocked(assessSources).mockReset().mockImplementation(async(_env,_input,inputs)=>inputs.map(input=>({input,status:'accepted',reason:'Fetched evidence matches',checkedAt:new Date().toISOString()})));
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources:candidates})}}]}):String(url)==='https://science.example/'?new Response('<h1>Science news</h1>',{headers:{'content-type':'text/html'}}):String(url)==='https://science.example/feed/'?new Response('Not found',{status:404}):new Response(rss));
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
 for(const [,init] of fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))){
  const subject=JSON.parse(JSON.parse(init!.body as string).messages[1].content);
  expect(subject).toMatchObject({title:'Pizza',description:'Pizza news'});
  if(subject.discoveryContext)expect(subject.discoveryContext.excludedSources).toContain(rejected.input);
 }
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
