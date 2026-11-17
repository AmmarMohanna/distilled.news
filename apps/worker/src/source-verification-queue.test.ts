import {it,expect} from 'vitest';
import {freelyReadableResults} from './source-search-free';
import {articleHtml,articlePage} from './test-fixtures/public-article';
it('checks thirty delayed publisher/article pairs without queue starvation or exceeding six requests',async()=>{
 let active=0,peak=0;const seen=new Set<string>();
 const fetcher:typeof fetch=async(input)=>{
  active++;peak=Math.max(peak,active);seen.add(String(input));
  try{await new Promise(resolve=>setTimeout(resolve,200));return articlePage();}finally{active--;}
 };
 const rows=Array.from({length:30},(_,i)=>({source:`https://publisher${i}.example/`,publisher:`publisher${i}.example`,title:'Report',articleUrl:`https://publisher${i}.example/article`}));
 const result=await freelyReadableResults(rows,fetcher);
 expect(result.results).toHaveLength(30);expect(seen.size).toBe(60);expect(peak).toBeLessThanOrEqual(6);
 expect(result.verificationIncomplete).toBe(false);
});
it('marks timed-out checks as unknown, does not cache denial, and permits a successful retry',async()=>{
 const saved=new Map<string,Response>(),cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 const rows=[{source:'https://publisher.example/report',publisher:'publisher.example',title:'Report',articleUrl:'https://publisher.example/report'}];
 const result=await freelyReadableResults(rows,async()=>{throw new DOMException('Timed out','TimeoutError');},cache);
 expect(result).toMatchObject({results:[],verificationIncomplete:true});expect(saved.size).toBe(0);
 expect((await freelyReadableResults(rows,async()=>articlePage(),cache)).results).toHaveLength(1);
});
it('bounds a hung transport without labeling it a confirmed access denial',async()=>{
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Report'}];
 const started=Date.now();
 const result=await freelyReadableResults(rows,async()=>new Promise<Response>(()=>{}));
 expect(result).toMatchObject({results:[],verificationIncomplete:true});
 expect(Date.now()-started).toBeLessThan(6000);
});
it.each([
 ['soft 404','<html><head><title>Article not found</title></head><body><main><h1>Article not found</h1><p>'+('Please visit another page. '.repeat(15))+'</p></main></body></html>'],
 ['category','<html><head><title>Economy</title></head><body><nav>'+('Sections and categories '.repeat(20))+'</nav><h1>Economy</h1><a href="/one">Report one</a><a href="/two">Report two</a></body></html>'],
 ['empty article','<html><head><title>Report</title><meta property="og:type" content="article"></head><body><article><h1>Report</h1></article><script>'+('hydrationOnly();'.repeat(30))+'</script></body></html>'],
 ['different canonical',articleHtml().replace('</head>','<link rel="canonical" href="https://publisher.example/other"></head>')]
])('rejects an HTTP 200 %s response',async(_name,html)=>{
 const rows=[{source:'https://publisher.example/',publisher:'publisher.example',title:'Report',articleUrl:'https://publisher.example/report'}];
 const result=await freelyReadableResults(rows,async input=>String(input).endsWith('/report')?new Response(html):articlePage());
 expect(result.results).toEqual([]);expect(result.verificationIncomplete).toBe(false);
});
