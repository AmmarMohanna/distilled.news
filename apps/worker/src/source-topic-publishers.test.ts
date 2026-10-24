import {expect,it,vi} from 'vitest';
import {topicPublishers,readTopicPublishers} from './source-topic-publishers';
import type {Env} from './types';
const search='https://news.google.com/rss/search?q=subject';
const item=(origin:string,id='1')=>`<item><guid>${id}</guid><title>Named subject reports substantive research findings</title><link>https://news.google.com/rss/articles/${id}</link><description>Current reporting on this subject.</description><source url="${origin}">Publisher</source></item>`;
it('discovers publisher origins only from real search article identities',()=>{
 expect(topicPublishers(`<rss><channel>${item('https://publisher.example')}${item('javascript:alert(1)','2')}</channel></rss>`,search)).toEqual([expect.objectContaining({publisherOrigin:'https://publisher.example',title:expect.stringContaining('Named subject'),url:'https://news.google.com/rss/articles/1'})]);
 expect(topicPublishers('<rss><channel><source url="https://publisher.example">Topic query</source></channel></rss>',search)).toEqual([]);
});
it('bounds independent publisher discovery and samples per publisher',()=>{
 const xml=`<rss><channel>${Array.from({length:30},(_,i)=>item(`https://publisher${i}.example`,String(i))).join('')}${item('https://publisher0.example','extra')}${item('https://publisher0.example','overflow')}</channel></rss>`;
 const found=topicPublishers(xml,search);expect(new Set(found.map(row=>row.publisherOrigin)).size).toBe(24);expect(found.filter(row=>row.publisherOrigin==='https://publisher0.example')).toHaveLength(2);
});

it.each([503,403,429])('uses the configured Google runtime only for transient HTTP %s',async status=>{
 const service=vi.fn(async(_url:unknown,init:RequestInit)=>{expect(JSON.parse(init.body as string)).toEqual({kind:'google_feed',input:{url:search}});return Response.json({status:200,xml:`<rss><channel>${item('https://publisher.example')}</channel></rss>`})});
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 const rows=await readTopicPublishers(env,search,vi.fn(async()=>new Response('unavailable',{status})));
 expect(rows).toHaveLength(status===503?1:0);expect(service).toHaveBeenCalledTimes(status===503?1:0);
});