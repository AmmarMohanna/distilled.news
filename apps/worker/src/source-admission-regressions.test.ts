import {articlePage} from './test-fixtures/public-article';
import {expect,it,vi} from 'vitest';
import {readTopicPublishers} from './source-topic-publishers';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import * as assessment from './source-assessment';
import * as accounting from './agentops-assessment';
import type {Env} from './types';
it('waits for readable helper results when the public route returns empty',async()=>{
 let helperDone=false;
 const service=vi.fn(async()=>{await new Promise(resolve=>setTimeout(resolve,20));helperDone=true;return Response.json({status:200,xml:'<rss><channel><item><guid>one</guid><title>Relevant subject reporting</title><description>Substantive evidence about the subject.</description><link>https://news.google.com/rss/articles/one</link><source url="https://publisher.example">Publisher</source></item></channel></rss>'});});
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 const worker=vi.fn<typeof fetch>(async()=>new Response('<rss><channel></channel></rss>'));
 const result=await readTopicPublishers(env,'https://news.google.com/rss/search?q=subject',worker,undefined,undefined,{preferRuntime:true,raceRoutes:true});
 expect(result).toHaveLength(1);
 await vi.waitFor(()=>expect(helperDone).toBe(true));
 expect(await readTopicPublishers(env,'https://news.google.com/rss/search?q=subject',worker,undefined,undefined,{preferRuntime:true})).toHaveLength(1);
});
it('limits repeated uncached source assessments per account',async()=>{
 const spy=vi.spyOn(assessment,'assessSource').mockImplementation(async(_env,_context,input)=>({input,status:'rejected',reason:'Unrelated',checkedAt:new Date().toISOString()}));
 try{
  const app=createApp({repository:new InMemoryRepository()});
  const env={ADMIN_SESSION_SECRET:'admin-secret',ADMIN_SETUP_TOKEN:'setup-token',PUBLIC_WEB_BASE_URL:'https://distilled.news',SOURCE_ASSESSMENT_ENABLED:'true'} as Env;
  const setup=await app.request('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'review@example.com',username:'review-checks',password:'password123',setupToken:'setup-token'})},env);
  expect(setup.status).toBe(200);
  const headers={cookie:setup.headers.get('set-cookie')!.split(';')[0],'content-type':'application/json'};
  for(let i=0;i<35;i++){
   const response=await app.request('/api/me/sources/assess',{method:'POST',headers,body:JSON.stringify({title:'Economy',description:'Economy updates',source:`https://publisher.example/article-${i}`})},env);
   expect(response.status).toBe(i<30?200:429);
   if(i>=30)expect(response.headers.get("Retry-After")).toBe("300");
  }
  expect(spy).toHaveBeenCalledTimes(30);
 }finally{spy.mockRestore();}
});

it('returns empty only after both readable search routes have no results',async()=>{
 const service=vi.fn(async()=>Response.json({status:200,xml:'<rss><channel></channel></rss>'}));
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 const worker=vi.fn<typeof fetch>(async()=>new Response('<rss><channel></channel></rss>'));
 expect(await readTopicPublishers(env,'https://news.google.com/rss/search?q=subject',worker,undefined,undefined,{preferRuntime:true,raceRoutes:true})).toEqual([]);
 expect(worker).toHaveBeenCalledTimes(1);expect(service).toHaveBeenCalledTimes(1);
});

it('returns and caches a partially successful model batch through the authenticated search API',async()=>{
 const spy=vi.spyOn(accounting,'campaignAssessmentFetcher').mockImplementation((_env,_owner,fetcher)=>fetcher);
 const saved=new Map<string,Response>();
 const cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 vi.stubGlobal('caches',{open:async()=>cache});
 let modelCalls=0,indexReads=0;
 try{
  const fetcher:typeof fetch=async(input)=>{
   if(String(input)==='https://openrouter.ai/api/v1/chat/completions'){
    modelCalls++;
    return Response.json({choices:[{message:{content:JSON.stringify({results:[{id:0,alignment:'YES'},{id:1,alignment:'UNKNOWN'}]})}}]});
   }
   if(String(input).startsWith('https://news.google.com/rss/search?')){
    indexReads++;
    return new Response('<rss><channel>'+['techcrunch.com','wired.com'].map((host,id)=>`<item><guid>${id}</guid><title>New processor development</title><description>Computing research findings.</description><link>https://${host}/report</link><source url="https://${host}">Publisher</source></item>`).join('')+'</channel></rss>');
   }
   return articlePage();
  };
  const app=createApp({repository:new InMemoryRepository(),fetcher});
  const env={ADMIN_SESSION_SECRET:'admin-secret',ADMIN_SETUP_TOKEN:'setup-token',PUBLIC_WEB_BASE_URL:'https://distilled.news',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env;
  const setup=await app.request('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'partial@example.com',username:'partial-search',password:'password123',setupToken:'setup-token'})},env);
  const headers={cookie:setup.headers.get('set-cookie')!.split(';')[0],'content-type':'application/json'};
  for(let i=0;i<2;i++){
   const response=await app.request('/api/me/sources/search',{method:'POST',headers,body:JSON.stringify({q:'processor',title:'Computing',description:'Computing developments'})},env);
   expect(response.status).toBe(200);
   expect(await response.json()).toMatchObject({unavailable:false,results:[{publisher:'techcrunch.com'}]});
  }
  expect(modelCalls).toBe(1);expect(indexReads).toBe(1);
 }finally{spy.mockRestore();vi.unstubAllGlobals();}
});
