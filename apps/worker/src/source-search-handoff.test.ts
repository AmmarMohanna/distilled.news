import {articlePage} from './test-fixtures/public-article';
import {afterEach,expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import * as assessment from './source-assessment';
import * as accounting from './agentops-assessment';
import type {Env} from './types';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function setup(blocked=false,slow?:()=>Promise<void>){
 vi.spyOn(accounting,'campaignAssessmentFetcher').mockImplementation((_env,_owner,fetcher)=>fetcher);
 const saved=new Map<string,Response>();
 const cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 vi.stubGlobal('caches',{open:async()=>cache});
 let modelCalls=0;
 const fetcher:typeof fetch=async(input)=>{
  if(String(input)==='https://openrouter.ai/api/v1/chat/completions'){
   modelCalls++;return Response.json({choices:[{message:{content:JSON.stringify({results:[{id:0,alignment:'YES'},...(blocked?[{id:1,alignment:'YES'}]:[])]})}}]});
  }
  if(String(input).startsWith('https://news.google.com/rss/search?'))return new Response('<rss><channel>'+['free',...(blocked?['paid']:[])].map((path,id)=>`<item><guid>${id}</guid><title>Economy growth strengthens exports</title><description>Economy reporting with substantive trade developments.</description><link>https://news.google.com/rss/articles/${path}</link><source url="https://publisher.example">Publisher</source></item>`).join('')+'</channel></rss>');
  if(String(input).endsWith('/paid')){await slow?.();return new Response('Forbidden',{status:403});}
  return articlePage();
 };
 const service=vi.fn<typeof fetch>(async(_url,init)=>{
  const request=JSON.parse(init!.body as string);
  return request.kind==='google_resolve'?Response.json({results:request.input.urls.map((url:string)=>({inputUrl:url,url:'https://publisher.example/'+url.split('/').pop()}))}):Response.json({status:403});
 });
 const app=createApp({repository:new InMemoryRepository(),fetcher});
 const env={ADMIN_SESSION_SECRET:'admin-secret',ADMIN_SETUP_TOKEN:'setup-token',PUBLIC_WEB_BASE_URL:'https://distilled.news',SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_ASSESSMENT_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_GOOGLE_RESOLUTION_ENABLED:'true',SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 const response=await app.request('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'probe@example.com',username:'review-probe',password:'password123',setupToken:'setup-token'})},env);
 expect(response.status).toBe(200);
 const headers={cookie:response.headers.get('set-cookie')!.split(';')[0],'content-type':'application/json'};
 const search=async()=>{
  const response=await app.request('/api/me/sources/search',{method:'POST',headers,body:JSON.stringify({q:'economy',title:'Economy',description:'Economy reporting'})},env);
  expect(response.status).toBe(200);return response.json() as Promise<{results:{source:string;articleUrl:string}[];accessIncomplete?:boolean}>;
 };
 return {app,env,headers,search,modelCalls:()=>modelCalls};
}
it('streams verified matches and exposes their normal assessment evidence before a slow sibling finishes',async()=>{
 let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});
 const s=await setup(true,()=>waiting);
 const response=await s.app.request('/api/me/sources/search',{method:'POST',headers:{...s.headers,accept:'application/x-ndjson'},body:JSON.stringify({q:'economy',title:'Economy',description:'Economy reporting'})},s.env);
 expect(response.headers.get('content-type')).toContain('application/x-ndjson');
 const reader=response.body!.getReader(),decoder=new TextDecoder();let text='';
 try{
  while(!text.includes('"type":"progress"')){const part=await reader.read();expect(part.done).toBe(false);text+=decoder.decode(part.value);}
  expect(text).toContain('https://publisher.example/free');
  const spy=vi.spyOn(assessment,'assessSource').mockResolvedValue({input:'https://publisher.example/',status:'unverified',reason:'test',checkedAt:new Date().toISOString()});
  await s.app.request('/api/me/sources/assess',{method:'POST',headers:s.headers,body:JSON.stringify({title:'Economy',description:'Economy reporting',source:'https://publisher.example/',searchQuery:'economy'})},s.env);
  expect(spy.mock.calls[0][5]?.[0].url).toBe('https://publisher.example/free');
  release();for(;;){const part=await reader.read();if(part.done)break;text+=decoder.decode(part.value);}
  expect(text).toContain('"type":"complete"');
 }finally{release();await reader.cancel();}
});
it.each([false,true])('passes resolved search evidence to assessment, including partial searches (%s)',async blocked=>{
 const s=await setup(blocked);
 const result=await s.search();expect(result.results[0].articleUrl).toBe('https://publisher.example/free');
 const spy=vi.spyOn(assessment,'assessSource').mockResolvedValue({input:'https://publisher.example/',status:'unverified',reason:'No matching homepage evidence',checkedAt:new Date().toISOString()});
 const response=await s.app.request('/api/me/sources/assess',{method:'POST',headers:s.headers,body:JSON.stringify({title:'Economy',description:'Economy reporting',source:result.results[0].source,searchQuery:'economy'})},s.env);
 expect(response.status).toBe(200);expect(spy).toHaveBeenCalledOnce();
 expect(spy.mock.calls[0][5]).toEqual([{publisherOrigin:'https://publisher.example',title:'Economy growth strengthens exports',url:'https://publisher.example/free',excerpt:'Economy reporting with substantive trade developments.'}]);
 await s.search();expect(s.modelCalls()).toBe(1);
});
it('reuses successful searches with a blocked sibling without another model call',async()=>{
 const s=await setup(true);
 for(let i=0;i<2;i++){
  const result=await s.search();expect(result.results.map(row=>row.articleUrl)).toEqual(['https://publisher.example/free']);expect(result.accessIncomplete).toBe(true);
 }
 expect(s.modelCalls()).toBe(1);
});
it('does not transfer cached article evidence to a different publisher or topic',async()=>{
 const s=await setup();await s.search();
 const spy=vi.spyOn(assessment,'assessSource').mockResolvedValue({input:'https://other.example/',status:'unverified',reason:'No matching evidence',checkedAt:new Date().toISOString()});
 for(const overrides of [{source:'https://other.example/'},{title:'Science'}]){
  const response=await s.app.request('/api/me/sources/assess',{method:'POST',headers:s.headers,body:JSON.stringify({title:'Economy',description:'Economy reporting',source:'https://publisher.example/',searchQuery:'economy',...overrides})},s.env);
  expect(response.status).toBe(200);
 }
 expect(spy).toHaveBeenCalledTimes(2);
 expect(spy.mock.calls.every(call=>call[5]===undefined)).toBe(true);
});
