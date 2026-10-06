import {afterEach,expect,it,vi} from 'vitest';
import {saveFeed,recommendSources} from './api';

afterEach(()=>vi.unstubAllGlobals());

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
