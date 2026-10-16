import {it,expect,vi} from 'vitest';import {readPublicArticle} from './public-article-http';
const reply=(status:number,headers:Record<string,string>={},text='')=>({status,headers,bytes:new TextEncoder().encode(text),telemetry:{requests:1,latencyMs:0,providerCostUsd:0 as const,status}});
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
