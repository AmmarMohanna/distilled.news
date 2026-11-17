import {expect,it,vi} from 'vitest';
import {searchSourceCandidates} from './source-search';
import * as accounting from './agentops-assessment';
import type {Env} from './types';
const context={title:'Economy and Finance',description:'Economy, finance and international trade'};
const env={OPENROUTER_API_KEY:'test',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true'} as Env;
const completion=(results:unknown)=>Response.json({choices:[{message:{content:JSON.stringify({results})}}]});
it('returns a relevant indexed article after free Google resolution through the search pipeline',async()=>{
 const spy=vi.spyOn(accounting,'campaignAssessmentFetcher').mockImplementation((_env,_owner,fetcher)=>fetcher);
 const listing='https://news.google.com/rss/articles/RelevantArticle';
 const service=vi.fn<typeof fetch>(async()=>Response.json({results:[{inputUrl:listing,url:'https://publisher.example/report'}]}));
 const configured={...env,SOURCE_GOOGLE_RESOLUTION_ENABLED:'true',SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 const fetcher:typeof fetch=async(input)=>{
  if(String(input)==='https://openrouter.ai/api/v1/chat/completions')return completion([{id:0,alignment:'YES'}]);
  if(String(input).startsWith('https://news.google.com/rss/search?'))return new Response(`<rss><channel><item><guid>relevant</guid><title>Economy growth strengthens exports</title><description>Economy and trade reporting.</description><link>${listing}</link><source url="https://publisher.example">Publisher</source></item></channel></rss>`);
  if(String(input).startsWith('https://publisher.example/'))return new Response('Public economy reporting. '.repeat(10));
  return new Response('Google wrapper contents. '.repeat(10));
 };
 try{
  const result=await searchSourceCandidates(configured,'economy',fetcher,undefined,{owner:'owner',origin:'https://app.example'},context);
  expect(result).toMatchObject({unavailable:false,results:[{source:'https://publisher.example/',articleUrl:'https://publisher.example/report'}]});
  expect(service.mock.calls.some(([,init])=>JSON.parse((init as RequestInit).body as string).kind==='google_resolve')).toBe(true);
 }finally{spy.mockRestore();}
});
it('includes the sixth relevant RSS article in the bounded model batch',async()=>{
 const spy=vi.spyOn(accounting,'campaignAssessmentFetcher').mockImplementation((_env,_owner,fetcher)=>fetcher);
 try{
  let seen:string[]=[];
  const headlines=['A football match','New theatre season','A music festival','A cooking show','A film premiere','Economy growth strengthens exports'];
  const feed='https://techcrunch.com/feed/';
  const fetcher:typeof fetch=async(input,init)=>{
   if(String(input)==='https://openrouter.ai/api/v1/chat/completions'){
    const rows=JSON.parse(JSON.parse(init!.body as string).messages[1].content).results;
    seen=rows.map((r:{title:string})=>r.title);
    return completion(rows.map((r:{id:number;title:string})=>({id:r.id,alignment:r.title.includes('Economy')?'YES':'NO'})));
   }
   if(String(input)===feed)return new Response('<rss><channel>'+headlines.map((title,id)=>`<item><guid>${id}</guid><title>${title}</title><description>${title}</description><link>https://techcrunch.com/article-${id}</link></item>`).join('')+'</channel></rss>');
   if(String(input)==='https://techcrunch.com/article-5')return new Response('Public economy reporting. '.repeat(10));
   return new Response('',{status:403});
  };
  const result=await searchSourceCandidates(env,'TechCrunch',fetcher,undefined,{owner:'owner',origin:'https://app.example'},{...context,title:'Economy'});
  expect(seen).toHaveLength(6);
  expect(seen).toContain(headlines[5]);
  expect(result.results.map(row=>row.title)).toEqual([headlines[5]]);
  expect(result.topicMismatch).toBeUndefined();
 }finally{spy.mockRestore();}
});
