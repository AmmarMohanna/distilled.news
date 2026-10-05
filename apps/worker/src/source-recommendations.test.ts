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
 const sources=await sourceRecommendations({SOURCE_RECOMMENDATIONS_ENABLED:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'World',description:'News'},fetcher);
 expect(sources).toEqual(['https://feeds.bbci.co.uk/news/world/rss.xml']);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const options=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(JSON.parse(options[1].body as string)).toMatchObject({max_tokens:400,temperature:0});
});
