import {expect,it,vi} from 'vitest';
import {readSearchFeed} from './source-search-feed';
import type {Env} from './types';
const url='https://publisher.example/feed.xml';
const xml='<rss><channel><item><guid>one</guid><title>Research</title><link>https://publisher.example/article</link></item></channel></rss>';
const configured=(fetcher:typeof fetch)=>({SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_EXECUTION_SERVICE:{fetch:fetcher},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env);
it.each(['<html><title>Just a moment</title><body>Verify you are human.</body></html>','<html><title>Page not found</title></html>','<rss><channel>broken'])('uses the free feed helper for invalid Worker HTTP 200 content %#',async body=>{
 const helper=vi.fn<typeof fetch>(async()=>Response.json({status:200,xml}));
 expect((await readSearchFeed(url,async()=>new Response(body),configured(helper))).body).toBe(xml);expect(helper).toHaveBeenCalledOnce();
});
it.each([xml,'<rss><channel><title>Empty feed</title></channel></rss>','<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty feed</title></feed>'])('does not retry a valid feed, including an empty feed %#',async body=>{
 const helper=vi.fn<typeof fetch>();expect((await readSearchFeed(url,async()=>new Response(body),configured(helper))).body).toBe(body);expect(helper).not.toHaveBeenCalled();
});
it('rejects a helper response that is also an HTML challenge',async()=>{
 const helper=vi.fn<typeof fetch>(async()=>Response.json({status:200,xml:'<html><title>Just a moment</title></html>'}));
 const found=await readSearchFeed(url,async()=>new Response('',{status:403}),configured(helper));expect(found.status).toBe(403);
});
