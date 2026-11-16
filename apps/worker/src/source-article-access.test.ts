import {it,expect,vi} from 'vitest';
import {freelyReadableResults} from './source-search-free';
it('hides a blocked article even when its publisher homepage is readable',async()=>{
 const article='https://publisher.example/premium-report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response('Payment required',{status:403}):new Response('<html><p>'+('Public publisher homepage. '.repeat(10))+'</p></html>',{headers:{'content-type':'text/html'}}));
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Relevant premium report',articleUrl:article}];
 expect(await freelyReadableResults(rows,fetcher)).toMatchObject({results:[],accessIncomplete:true});
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(String(fetcher.mock.calls[0][0])).toBe('https://publisher.example/');
 expect((await fetcher(article)).status).toBe(403);
});

it('keeps readable articles from the same publisher and caches article failures separately',async()=>{
 const saved=new Map<string,Response>();
 const cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).endsWith('/paid')?new Response('Restricted',{status:403}):new Response('Public article reporting. '.repeat(10)));
 const rows=['paid','free'].map(path=>({source:'https://publisher.example/',publisher:'publisher.example',title:path,articleUrl:'https://publisher.example/'+path}));
 for(let i=0;i<2;i++)expect((await freelyReadableResults(rows,fetcher,cache)).results.map(row=>row.title)).toEqual(['free']);
 expect(fetcher).toHaveBeenCalledTimes(3);
});
it('follows public article redirects and rejects unresolved Google wrappers',async()=>{
 const source='https://publisher.example/',article='https://news.google.com/rss/articles/story';
 const rows=[{source,publisher:'publisher.example',title:'Report',articleUrl:article}];
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response(null,{status:302,headers:{location:source+'report'}}):new Response('Public article reporting. '.repeat(10)));
 expect((await freelyReadableResults(rows,fetcher)).results).toHaveLength(1);
 expect(fetcher.mock.calls.some(([url])=>String(url)===source+'report')).toBe(true);
 expect((await freelyReadableResults(rows,async()=>new Response('Google wrapper contents. '.repeat(10)))).results).toEqual([]);
});
it.each(['https://127.0.0.1/private','https://publisher.example/login'])('never follows an unsafe or login redirect to %s',async location=>{
 const article='https://publisher.example/report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)===article?new Response(null,{status:302,headers:{location}}):new Response('Public homepage reporting. '.repeat(10)));
 expect((await freelyReadableResults([{source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl:article}],fetcher)).results).toEqual([]);
 expect(fetcher.mock.calls.some(([url])=>String(url)===location)).toBe(false);
});
