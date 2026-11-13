import {expect,it,vi} from 'vitest';
import {freelyReadableResults,rememberUnavailableSearchSource} from './source-search-free';
const result=(source:string)=>({source,title:'Matching article',publisher:new URL(source).hostname});
it('offers readable sources and omits restricted sources without paid requests',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>new Response('Public source reporting. '.repeat(8),{status:String(url).includes('blocked')?403:200}));
 const checked=await freelyReadableResults([result('https://blocked.example/'),result('https://free.example/'),result('https://blocked.example/')],fetcher);
 expect(checked.results.map(row=>row.source)).toEqual(['https://free.example/']);expect(fetcher).toHaveBeenCalledTimes(2);expect(checked.accessIncomplete).toBe(false);
});
it('reuses public availability checks and honors a later confirmed free-access failure',async()=>{
 const values=new Map<string,Response>();
 const cache={match:vi.fn(async(key:RequestInfo)=>values.get(String(key instanceof Request?key.url:key))?.clone()),put:vi.fn(async(key:RequestInfo,value:Response)=>{values.set(String(key instanceof Request?key.url:key),value.clone());})};
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('Public source reporting. '.repeat(8)));
 const rows=[result('https://free.example/')];
 expect((await freelyReadableResults(rows,fetcher,cache)).results).toHaveLength(1);
 expect((await freelyReadableResults(rows,fetcher,cache)).results).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(1);
 await rememberUnavailableSearchSource(rows[0].source,cache);
 expect((await freelyReadableResults(rows,fetcher,cache)).results).toHaveLength(0);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not treat an HTTP 200 challenge or a malformed RSS response as usable free content',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(String(url).includes('challenge')?'<title>Just a moment</title>'+('Challenge. '.repeat(20)):'Not an RSS feed. '.repeat(20)));
 expect((await freelyReadableResults([result('https://challenge.example/'),{source:'rss: https://publisher.example/feed',publisher:'publisher.example',title:'Feed'}],fetcher)).results).toHaveLength(0);
});
