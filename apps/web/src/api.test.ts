import {afterEach,expect,it,vi} from 'vitest';
import {saveFeed,recommendSources,recommendSourceCandidates} from './api';

afterEach(()=>vi.unstubAllGlobals());
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
 const progress=vi.fn();await expect(recommendSourceCandidates('Tech','AI news',progress)).rejects.toThrow('interrupted');expect(progress).toHaveBeenCalledTimes(1);
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
 await expect(recommendSources('News','World')).rejects.toThrow('not enabled');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
