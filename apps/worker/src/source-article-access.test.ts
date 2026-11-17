import {articlePage} from './test-fixtures/public-article';
import {it,expect,vi} from 'vitest';
import {freelyReadableResults} from './source-search-free';
import type {Env} from './types';
it('hides a blocked article even when its publisher homepage is readable',async()=>{
 const article='https://publisher.example/premium-report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response('Payment required',{status:403}):new Response('<html><p>'+('Public publisher homepage. '.repeat(10))+'</p></html>',{headers:{'content-type':'text/html'}}));
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Relevant premium report',articleUrl:article}];
 expect(await freelyReadableResults(rows,fetcher)).toMatchObject({results:[],accessIncomplete:true,verificationIncomplete:false});
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(String(fetcher.mock.calls[0][0])).toBe('https://publisher.example/');
 expect((await fetcher(article)).status).toBe(403);
});

it('keeps readable articles from the same publisher and caches article failures separately',async()=>{
 const saved=new Map<string,Response>();
 const cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).endsWith('/paid')?new Response('Restricted',{status:403}):articlePage());
 const rows=['paid','free'].map(path=>({source:'https://publisher.example/',publisher:'publisher.example',title:path,articleUrl:'https://publisher.example/'+path}));
 for(let i=0;i<2;i++)expect((await freelyReadableResults(rows,fetcher,cache)).results.map(row=>row.title)).toEqual(['free']);
 expect(fetcher).toHaveBeenCalledTimes(3);
});
it('follows public article redirects and rejects unresolved Google wrappers',async()=>{
 const source='https://publisher.example/',article='https://news.google.com/rss/articles/story';
 const rows=[{source,publisher:'publisher.example',title:'Report',articleUrl:article}];
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response(null,{status:302,headers:{location:source+'report'}}):articlePage());
 expect((await freelyReadableResults(rows,fetcher)).results).toHaveLength(1);
 expect(fetcher.mock.calls.some(([url])=>String(url)===source+'report')).toBe(true);
 expect((await freelyReadableResults(rows,async()=>new Response('Google wrapper contents. '.repeat(10)))).results).toEqual([]);
});
it.each(['https://127.0.0.1/private','https://publisher.example/login'])('never follows an unsafe or login redirect to %s',async location=>{
 const article='https://publisher.example/report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response(null,{status:302,headers:{location}}):articlePage());
 expect((await freelyReadableResults([{source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl:article}],fetcher)).results).toEqual([]);
 expect(fetcher.mock.calls.some(([url])=>String(url)===location)).toBe(false);
});
const listing='https://news.google.com/rss/articles/ArticleA?oc=5';
function resolverEnv(service:typeof fetch):Env{return {SOURCE_GOOGLE_RESOLUTION_ENABLED:'true',SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;}
it('streams a verified direct article while Google resolution is pending and preserves final result order',async()=>{
 let release!:()=>void,first!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;}),progress=new Promise<void>(resolve=>{first=resolve;});
 const service=vi.fn<typeof fetch>(async()=>{await waiting;return Response.json({results:[{inputUrl:listing,url:'https://publisher.example/google-report'}]});});
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Indexed report',articleUrl:listing},{source:'https://publisher.example/',publisher:'publisher.example',title:'Direct report',articleUrl:'https://publisher.example/direct-report'}];
 const received:string[][]=[];
 const work=freelyReadableResults(rows,async()=>articlePage(),undefined,resolverEnv(service),async results=>{received.push(results.map(row=>row.title));first();});
 try{await progress;expect(received[0]).toEqual(['Direct report']);}
 finally{release();}
 expect((await work).results.map(row=>row.title)).toEqual(['Indexed report','Direct report']);
 expect(service).toHaveBeenCalledOnce();
});
it('checks a readable Google result beyond position thirty in a cold sixty-link batch',async()=>{
 const urls=Array.from({length:60},(_,i)=>listing.replace('ArticleA','Article'+i));
 const service=vi.fn<typeof fetch>(async(_input,init)=>{
  const payload=JSON.parse(init!.body as string);
  expect(payload.input.urls).toEqual(urls);expect(payload.input.maxFreshDecodes).toBe(60);
  return Response.json({results:[{inputUrl:urls[59],url:'https://publisher.example/last'}]});
 });
 const rows=urls.map(articleUrl=>({source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl}));
 const result=await freelyReadableResults(rows,async url=>String(url).startsWith('https://publisher.example/')?articlePage():new Response('Blocked',{status:403}),undefined,resolverEnv(service));
 expect(result.results.map(row=>row.articleUrl)).toEqual(['https://publisher.example/last']);
 expect(service).toHaveBeenCalledTimes(1);
});
it('resolves Google listings through one free helper batch, verifies the actual articles and reuses resolutions',async()=>{
 const second=listing.replace('ArticleA','ArticleB');
 const service=vi.fn<typeof fetch>(async(_url,init)=>{
  expect(JSON.parse(init!.body as string)).toEqual({kind:'google_resolve',input:{urls:[listing,second],timeoutSeconds:8,maxFreshDecodes:60}});
  return Response.json({results:[{inputUrl:listing,url:'https://publisher.example/free'},{inputUrl:second,url:'https://publisher.example/paid'}]});
 });
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).endsWith('/paid')?new Response('Forbidden',{status:403}):articlePage());
 const saved=new Map<string,Response>(),cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 const rows=[listing,second,listing].map(articleUrl=>({source:'https://publisher.example/',publisher:'publisher.example',title:'Relevant report',articleUrl}));
 for(let attempt=0;attempt<2;attempt++){
  const result=await freelyReadableResults(rows,fetcher,cache,resolverEnv(service));
  expect(result.results.map(row=>row.articleUrl)).toEqual(['https://publisher.example/free','https://publisher.example/free']);
 }
 expect(service).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(3);
 expect(fetcher.mock.calls.every(([url])=>!String(url).includes('news.google.com'))).toBe(true);
});
it.each(['https://127.0.0.1/private','https://unrelated.example/report','https://user:secret@publisher.example/report','https://publisher.example/login'])('rejects unsafe, unrelated or restricted resolver output %s',async target=>{
 const service=vi.fn<typeof fetch>(async()=>Response.json({results:[{inputUrl:listing,url:target}]}));
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('Google wrapper contents. '.repeat(10)));
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl:listing}];
 expect((await freelyReadableResults(rows,fetcher,undefined,resolverEnv(service))).results).toEqual([]);
 expect(fetcher.mock.calls.some(([url])=>String(url)===target)).toBe(false);
});
it('does not invoke the helper when resolution is disabled or the listing is not an allowed Google URL',async()=>{
 const service=vi.fn<typeof fetch>(async()=>{throw Error('No helper expected');});
 const fetcher:typeof fetch=async()=>new Response('Google wrapper contents. '.repeat(10));
 const row={source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl:listing};
 await freelyReadableResults([row],fetcher,undefined,{...resolverEnv(service),SOURCE_GOOGLE_RESOLUTION_ENABLED:'false'});
 await freelyReadableResults([{...row,articleUrl:listing+'&token=secret'}],fetcher,undefined,resolverEnv(service));
 expect(service).not.toHaveBeenCalled();
});
