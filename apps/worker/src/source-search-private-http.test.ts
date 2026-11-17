import {expect,it,vi} from 'vitest';
import {freelyReadableResults} from './source-search-free';
import {articlePage} from './test-fixtures/public-article';
import type {Env} from './types';
const url='https://publisher.example/report';
const result={source:'https://publisher.example/',publisher:'publisher.example',title:'Research report',articleUrl:url};
const article={status:200,url,canonicalUrl:url,pageKind:'article',title:'Research report',body:'Original reporting about the latest scientific discovery. '.repeat(5)};
const configured=(fetcher:typeof fetch)=>({SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'private-test-token-'.repeat(3),SOURCE_EXECUTION_SERVICE:{fetch:fetcher}} as unknown as Env);
it('accepts a verified same-publisher article when its homepage is blocked',async()=>{
 const fetcher:typeof fetch=async input=>String(input)===url?articlePage():new Response('',{status:403});
 expect((await freelyReadableResults([result],fetcher)).results).toEqual([result]);
 expect((await freelyReadableResults([{...result,source:'https://other.example/'}],fetcher)).results).toEqual([]);
});
it('uses only the free anonymous article helper when Worker article access is blocked',async()=>{
 const helper=vi.fn<typeof fetch>(async(_target,init)=>{expect(JSON.parse(init!.body as string)).toEqual({kind:'public_article',input:{url}});return Response.json(article);});
 const denied:typeof fetch=async()=>new Response('',{status:403});
 expect((await freelyReadableResults([result],denied,undefined,configured(helper))).results).toEqual([result]);
 expect(helper).toHaveBeenCalledOnce();
});
it.each([
 {canonicalUrl:'https://publisher.example/other-report'},
 {url:'https://publisher.example/other-report'},
 {pageKind:'listing'},
 {title:''},
 {title:'Page not found'},
 {body:''},
 {accessRestricted:true},
 {authenticationRequired:true}
])('does not accept invalid or restricted helper evidence %#',async overrides=>{
 const env=configured(async()=>Response.json({...article,...overrides}));
 const found=await freelyReadableResults([result],async()=>new Response('',{status:403}),undefined,env);
 expect(found.results).toEqual([]);
});
it('does not negatively cache a helper timeout or describe it as confirmed denial',async()=>{
 const values=new Map<string,Response>();
 const cache={match:vi.fn(async(key:RequestInfo)=>values.get(String(key instanceof Request?key.url:key))?.clone()),put:vi.fn(async(key:RequestInfo,response:Response)=>{values.set(String(key instanceof Request?key.url:key),response.clone());})};
 const env=configured(async()=>{throw Error('timed out');});
 const found=await freelyReadableResults([result],async()=>new Response('',{status:403}),cache,env);
 expect(found.results).toEqual([]);expect(found.verificationIncomplete).toBe(true);
 expect([...values.keys()].filter(key=>key.includes('source-search-access'))).toHaveLength(1); // Homepage denial only.
});
it('queues private checks instead of losing later readable articles to two-slot contention',async()=>{
 let active=0,peak=0,calls=0;
 const helper=vi.fn<typeof fetch>(async(_target,init)=>{
  calls++;active++;peak=Math.max(peak,active);
  if(active>2){active--;return Response.json({error:'Busy'},{status:429});}
  try{
   await new Promise(resolve=>setTimeout(resolve,20));
   const target=JSON.parse(init!.body as string).input.url as string;
   const index=Number(new URL(target).pathname.slice(1));
   return Response.json(index<2?{status:403}:{...article,url:target,canonicalUrl:target});
  }finally{active--;}
 });
 const rows=Array.from({length:6},(_,i)=>({...result,articleUrl:'https://publisher.example/'+i}));
 const found=await freelyReadableResults(rows,async()=>new Response('',{status:403}),undefined,configured(helper));
 expect(found.results.map(row=>row.articleUrl)).toEqual(rows.slice(2).map(row=>row.articleUrl));
 expect(peak).toBe(2);expect(calls).toBe(6);expect(found.verificationIncomplete).toBe(false);
});
