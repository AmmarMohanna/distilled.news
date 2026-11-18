import {expect,it,vi} from 'vitest';
import type {SourceFetchRequest} from '@distilled/connectors';
import type {Env} from './types';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {websiteLinkSelector} from './website-link-fallback';

const request={scope:{feedId:'discovery-feed',feedSourceId:'discovery-source'}} as SourceFetchRequest;
const listing='https://publisher.example/latest-news';
const links=[{url:'https://publisher.example/story',title:'A story from the public listing'}];

it('requires an explicit model setting',()=>{
 expect(websiteLinkSelector({OPENROUTER_API_KEY:'test-only'} as Env)).toBeUndefined();
});

it('settles and replays a selection and never repeats an uncertain call',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(request.scope.feedId,JSON.stringify({revision:1,paused:false})).run();
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
   const sent=JSON.parse(String(init?.body));
   expect(sent.tools).toBeUndefined();
   expect(sent.max_tokens).toBe(180);
   return Response.json({id:'mock-generation',choices:[{message:{content:'{"ids":[0]}'},finish_reason:'stop'}],
    usage:{prompt_tokens:100,completion_tokens:10,cost:.0001}});
  });
  const select=websiteLinkSelector({DB:ctx.db,OPENROUTER_API_KEY:'test-only',SOURCE_WEBSITE_LINK_FALLBACK_MODEL:'openai/gpt-4.1-mini'} as Env,fetcher)!(request);
  expect(await select(listing,links)).toEqual([0]);
  expect(await select(listing,links)).toEqual([0]);
  expect(fetcher).toHaveBeenCalledOnce();
  const costs=await ctx.db.prepare('SELECT cost_usd,reported FROM v1_model_spending_settlements').all();
  expect(costs.results).toEqual([{cost_usd:.0001,reported:1}]);

  fetcher.mockRejectedValueOnce(new TypeError('connection lost'));
  const changed=[{...links[0],title:'A changed headline'}];
  expect(await select(listing,changed)).toEqual([]);
  expect(await select(listing,changed)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
 }finally{await ctx.dispose();}
});
