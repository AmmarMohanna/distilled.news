import {afterEach,expect,it,vi} from 'vitest';
import {getExploreFeeds,getFeed,saveFeed,recommendSources,recommendSourceCandidates,searchSourceCandidates,register,forgotPassword} from './api';

it.each(['en','fr','ar'])('sends the currently chosen %s language when requesting either auth email',async language=>{
 localStorage.setItem('dn_language',language);
 const fetcher=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
 try {
  await register({email:'fixture@example.invalid',username:'Home',password:'local-only-fixture'});
  await forgotPassword('fixture@example.invalid');
  for(const [,init]of fetcher.mock.calls as unknown as [string,RequestInit][]){expect(JSON.parse(String(init.body))).toMatchObject({language,email:'fixture@example.invalid'});}
 } finally {localStorage.removeItem('dn_language');}
});

afterEach(()=>vi.unstubAllGlobals());
it('recovers the initial feed read from one temporary server failure',async()=>{
  const payload={briefing:{id:'feed'},editions:[]};
  const fetcher=vi.fn()
    .mockResolvedValueOnce(Response.json({code:'DATABASE_UNAVAILABLE'},{status:503}))
    .mockResolvedValueOnce(Response.json(payload));
  vi.stubGlobal('fetch',fetcher);
  await expect(getFeed('owner','news',{signal:new AbortController().signal,retryInitialRead:true})).resolves.toEqual(payload);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([403,404,429])('keeps feed response %s final without a retry',async status=>{
  const fetcher=vi.fn(async()=>Response.json({}, {status}));
  vi.stubGlobal('fetch',fetcher);
  await expect(getFeed('owner','news',{signal:new AbortController().signal,retryInitialRead:true})).rejects.toMatchObject({uiMessage:{details:{status}}});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not retry a cancelled feed read',async()=>{
  const controller=new AbortController();
  const fetcher=vi.fn(async()=>{
    controller.abort();
    return Response.json({}, {status:503});
  });
  vi.stubGlobal('fetch',fetcher);
  await expect(getFeed('owner','news',{signal:controller.signal,retryInitialRead:true})).rejects.toMatchObject({id:'REQUEST_FAILED'});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('delivers verified source-search matches before completion and keeps complete status separate',async()=>{
 let output!:ReadableStreamDefaultController<Uint8Array>;
 const body=new ReadableStream<Uint8Array>({start(controller){output=controller;}}),encoder=new TextEncoder();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{headers:{'content-type':'application/x-ndjson'}})));
 const progress=vi.fn(),row={source:'https://fast.example/',publisher:'fast.example',title:'Verified article'};
 const work=searchSourceCandidates('topic',undefined,{title:'Topic',description:'Topic reporting'},progress);
 const line=JSON.stringify({type:'progress',results:[row],unavailable:false})+'\n';
 output.enqueue(encoder.encode('\n'+line.slice(0,20)));output.enqueue(encoder.encode(line.slice(20)));
 await vi.waitFor(()=>expect(progress).toHaveBeenCalledWith({results:[row],unavailable:false}));
 output.enqueue(encoder.encode(JSON.stringify({type:'complete',results:[row],unavailable:false,verificationIncomplete:true})+'\n'));output.close();
 expect(await work).toEqual({results:[row],unavailable:false,verificationIncomplete:true});
});
it('does not report an interrupted source-search stream as complete',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({type:'progress',results:[],unavailable:false})+'\n',{headers:{'content-type':'application/x-ndjson'}})));
 await expect(searchSourceCandidates('topic',undefined,{title:'Topic',description:'Topic reporting'},vi.fn())).rejects.toBeInstanceOf(Error);
});
it('delivers verified suggestions before a slower check finishes and handles split stream chunks',async()=>{
 let output!:ReadableStreamDefaultController<Uint8Array>;
 const body=new ReadableStream<Uint8Array>({start(controller){output=controller}}),encoder=new TextEncoder();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{headers:{'content-type':'application/x-ndjson'}})));
 const progress=vi.fn();const result=recommendSourceCandidates('Tech','AI news',progress);
 const first=JSON.stringify({type:'progress',sources:['rss: https://fast.example/feed'],checks:[]})+'\n';
 output.enqueue(encoder.encode(first.slice(0,30)));output.enqueue(encoder.encode(first.slice(30)));
 await vi.waitFor(()=>expect(progress).toHaveBeenCalledWith({sources:['rss: https://fast.example/feed'],checks:[]}));
 output.enqueue(encoder.encode(JSON.stringify({type:'complete',sources:['rss: https://fast.example/feed','rss: https://slow.example/feed'],checks:[]})));
 output.close();
 expect((await result).sources).toHaveLength(2);
});
it('does not treat an interrupted recommendation stream as a complete result',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({type:'progress',sources:['rss: https://fast.example/feed']})+'\n',{headers:{'content-type':'application/x-ndjson'}})));
 const progress=vi.fn();await expect(recommendSourceCandidates('Tech','AI news',progress)).rejects.toMatchObject({id:'SOURCE_RECOMMENDATIONS_INTERRUPTED'});expect(progress).toHaveBeenCalledTimes(1);
});

it('sends only the product request including selected Daily time and inferred timezone',async()=>{
 const input={id:'feed',title:'News',interestProfile:'World news',sourceInputs:['https://example.com/rss.xml'],publicFeedEnabled:false,updateIntervalMinutes:1440 as const,briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',language:'en' as const};
 const fetcher=vi.fn(async()=>Response.json({briefing:input}));vi.stubGlobal('fetch',fetcher);
 expect(await saveFeed(input)).toEqual(input);
 const call=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(call[0]).toBe('/api/me/feeds');expect(call[1].credentials).toBe('include');
 expect(JSON.parse(call[1].body as string)).toEqual(input);
 expect(JSON.parse(call[1].body as string)).not.toHaveProperty('styleInstruction');
});

it('shows a real recommendation error without adding a source',async()=>{
 const fetcher=vi.fn(async()=>Response.json({error:'Source recommendations are not enabled on this deployment.'},{status:503}));vi.stubGlobal('fetch',fetcher);
 await expect(recommendSources('News','World')).rejects.toMatchObject({id:'SOURCE_RECOMMENDATIONS_DISABLED'});
 expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['{"type":"error","error":"Private upstream trace"}\n','Private malformed upstream trace\n'])('does not expose remote recommendation-stream details',async body=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{headers:{'content-type':'application/x-ndjson'}})));
 try{await recommendSourceCandidates('News','World',vi.fn());throw new Error('Expected failure');}
 catch(e){expect(e).toMatchObject({id:'REQUEST_FAILED'});expect(JSON.stringify(e)).not.toContain('Private');expect((e as Error).cause).toBeUndefined();}
});
it.each([null,[],42,'upstream error'])('handles non-object JSON error payload %j safely in both request paths',async payload=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(payload,{status:502})));
 await expect(recommendSources('News','World')).rejects.toMatchObject({id:'REQUEST_FAILED',uiMessage:{id:'REQUEST_FAILED',details:{status:502}}});
 await expect(recommendSourceCandidates('News','World',vi.fn())).rejects.toMatchObject({id:'REQUEST_FAILED',uiMessage:{id:'REQUEST_FAILED',details:{status:502}}});
});
it('revalidates an unchanged feed with its ETag and reuses the payload on 304',async()=>{
  const payload={briefing:{id:'feed'},editions:[]};
  const fetcher=vi.fn()
    .mockResolvedValueOnce(Response.json(payload,{headers:{ETag:'W/"7-abc"'}}))
    .mockResolvedValueOnce(new Response(null,{status:304,headers:{ETag:'W/"7-abc"'}}));
  vi.stubGlobal('fetch',fetcher);
  await expect(getFeed('etag-owner','news')).resolves.toEqual(payload);
  await expect(getFeed('etag-owner','news')).resolves.toEqual(payload);
  const [,second]=fetcher.mock.calls[1] as [string,RequestInit];
  expect((second.headers as Record<string,string>)['If-None-Match']).toBe('W/"7-abc"');
});

it('fetches exactly the requested Explore page and exposes its continuation',async()=>{
 const fetcher=vi.fn(async(_url: string)=>Response.json({feeds:[{id:'page-one'}],nextOffset:100}));vi.stubGlobal('fetch',fetcher);
 expect(await getExploreFeeds()).toMatchObject({feeds:[{id:'page-one'}],nextOffset:100});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/explore/feeds?offset=0');
});

it('preserves successful pending-activation semantics instead of reporting a committed save as failed',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({briefing:{id:'saved'},sourceActivation:'pending',pendingSourceIds:['second-source']},{status:202})));
 expect(await saveFeed({id:'saved',title:'Science',interestProfile:'Science',sourceInputs:['https://example.com/feed.xml'],language:'en',briefingTimezone:'UTC',publicFeedEnabled:true,updateIntervalMinutes:60})).toEqual({id:'saved',sourceActivation:'pending'});
});
