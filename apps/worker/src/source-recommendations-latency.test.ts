import {expect,it,vi} from 'vitest';
import {verifiedSourceRecommendations} from './source-recommendations';
import type {Env} from './types';
vi.mock('./source-assessment',()=>({assessSources:vi.fn(async(_env,_input,sources:string[])=>sources.map(input=>({input,status:'accepted',reason:'Verified article evidence',checkedAt:new Date().toISOString(),kind:'rss_feed'})))}));
it('returns twenty verified independent publishers without another search just to fill a social-channel quota',async()=>{
 const sources=Array.from({length:20},(_,i)=>`rss: https://publisher${i}.example/feed.xml`);
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({sources})}}]}):new Response('<rss><channel><item><guid>one</guid><title>Topic reporting</title><link>https://publisher.example/story</link></item></channel></rss>'));
 const result=await verifiedSourceRecommendations({SOURCE_CONNECTORS_ENABLED:'true',SOURCE_RECOMMENDATIONS_ENABLED:'true',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env,{title:'Topic',description:'Relevant reporting'},fetcher);
 expect(result.sources).toHaveLength(20);
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(1);
});
