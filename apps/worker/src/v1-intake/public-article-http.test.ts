import {it,expect,vi} from 'vitest';import {readPublicArticle} from './public-article-http';
import {BoundedFeedHttp} from '@distilled/connectors';
import {PUBLIC_ARTICLE_MAX_BYTES} from './public-article-http';
const reply=(status:number,headers:Record<string,string>={},text='')=>({status,headers,bytes:new TextEncoder().encode(text),telemetry:{requests:1,latencyMs:0,providerCostUsd:0 as const,status}});
it('distinguishes a public cross-origin redirect so the exact-article fallback can handle it',async()=>{
 const get=vi.fn().mockResolvedValue(reply(303,{location:'https://idp.nature.com/authorize?response_type=cookie'}));
 await expect(readPublicArticle({get},'https://www.nature.com/articles/story')).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'ARTICLE_CROSS_ORIGIN_REDIRECT'}});
 expect(get).toHaveBeenCalledTimes(1);
});
it('reads publisher HTML larger than the previous six-megabyte limit while retaining a bounded transport',async()=>{
 const body='<html>'+ ' '.repeat(8_000_000)+'</html>';
 const http=new BoundedFeedHttp(async()=>new Response(body),{maxBytes:PUBLIC_ARTICLE_MAX_BYTES});
 expect((await readPublicArticle(http,'https://publisher.example/story')).body).toBe(body);
});
it('classifies oversized publisher responses instead of leaving an unexpected crash lease',async()=>{
 const http=new BoundedFeedHttp(async()=>new Response('x'.repeat(PUBLIC_ARTICLE_MAX_BYTES+1)),{maxBytes:PUBLIC_ARTICLE_MAX_BYTES});
 await expect(readPublicArticle(http,'https://publisher.example/story')).rejects.toMatchObject({code:'BODY_BUDGET_EXCEEDED',transient:false});
});
it('resolves an exact publisher-local redirect and exposes the final transport URL',async()=>{
 const get=vi.fn().mockResolvedValueOnce(reply(301,{location:'/news/story/'})).mockResolvedValueOnce(reply(200,{'content-type':'text/html'},'Article text'));
 expect(await readPublicArticle({get},'https://publisher.example/news/story')).toMatchObject({url:'https://publisher.example/news/story/',status:200,body:'Article text'});
 expect(get).toHaveBeenCalledTimes(2);
});
it.each(['https://other.example/article','http://publisher.example/article','https://user:pass@publisher.example/article','https://127.0.0.1/article'])('rejects redirect %s before fetching it',async location=>{
 const get=vi.fn().mockResolvedValue(reply(302,{location}));await expect(readPublicArticle({get},'https://publisher.example/story')).rejects.toThrow();expect(get).toHaveBeenCalledTimes(1);
});
it('bounds loops and never turns a 401 into successful article collection',async()=>{
 const get=vi.fn().mockResolvedValue(reply(302,{location:'/story'}));await expect(readPublicArticle({get},'https://publisher.example/story')).rejects.toMatchObject({code:'POLICY_DENIED'});expect(get).toHaveBeenCalledTimes(1);
 expect(await readPublicArticle({get:async()=>reply(401,{'www-authenticate':'Basic'})},'https://publisher.example/story')).toMatchObject({status:401,authenticationRequired:true});
});
