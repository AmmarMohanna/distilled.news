import {expect,it,vi} from 'vitest';
import {searchSourceCandidates} from './source-search';
import * as accounting from './agentops-assessment';
import type {Env} from './types';
const context={title:'Economy and Finance',description:'Economy, finance and international trade'};
const env={OPENROUTER_API_KEY:'test',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true'} as Env;
const completion=(results:unknown)=>Response.json({choices:[{message:{content:JSON.stringify({results})}}]});
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
