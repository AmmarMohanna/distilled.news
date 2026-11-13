import {expect,it,vi} from 'vitest';
import {searchSourceCandidates} from './source-search';
import type {Env} from './types';
const enabled={SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true'} as Env;
it('returns up to thirty relevant free results instead of twelve',async()=>{
 const xml='<rss><channel>'+Array.from({length:45},(_,i)=>`<item><guid>${i}</guid><title>Subject news ${i}</title><link>https://news.google.com/rss/articles/${i}</link><source url="https://publisher${i}.example">Publisher</source></item>`).join('')+'</channel></rss>';
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(String(url).startsWith('https://news.google.com/')?xml:'Public reporting. '.repeat(20)));
 expect((await searchSourceCandidates(enabled,'Subject news',fetcher)).results).toHaveLength(30);
});
it('reuses discovery after an incomplete access check rather than repeating the upstream search',async()=>{
 const saved=new Map<string,Response>(),cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 let available=false,googleReads=0;
 const fetcher=vi.fn<typeof fetch>(async url=>{
  if(String(url).startsWith('https://news.google.com/')){googleReads++;return new Response('<rss><channel><item><guid>1</guid><title>Subject news</title><link>https://news.google.com/rss/articles/1</link><source url="https://publisher.example">Publisher</source></item></channel></rss>');}
  if(!available)throw Error('temporary network failure');
  return new Response('Public reporting. '.repeat(20));
 });
 const discovery={owner:'one',origin:'https://app.example',cache};
 expect((await searchSourceCandidates(enabled,'Subject news',fetcher,undefined,discovery)).accessIncomplete).toBe(true);
 available=true;
 expect((await searchSourceCandidates(enabled,'subject  news',fetcher,undefined,discovery)).results).toHaveLength(1);
 expect(googleReads).toBe(1);
});
it('omits relaxed search results that do not mention the complete query',async()=>{
  const titles=['From Raw Data to Graph-Native AI','Google DeepMind event at MSFEA highlights AI career paths','Man charged over Richmond Hill road rage','Ammar discusses AI','Mohanna presents a project','Ammar Mohanna presents a new project'];
  const xml='<rss><channel>'+titles.map((title,index)=>`<item><guid>${index}</guid><title>${title}</title><link>https://news.google.com/rss/articles/${index}</link><source url="https://publisher${index}.example">Publisher</source></item>`).join('')+'</channel></rss>';
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).startsWith('https://news.google.com/')?new Response(xml):new Response('Public source reporting. '.repeat(8)));
  const result=await searchSourceCandidates(enabled,'Ammar Mohanna',fetcher);
  expect(result.results.map(row=>row.title)).toEqual(['Ammar Mohanna presents a new project']);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['aljadded','Al Jadeed','الجديد'])('finds Al Jadeed by %s without inference or a paid request',async query=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('<html><p>'+('Public source reporting. '.repeat(8))+'</p></html>',{headers:{'content-type':'text/html'}}));
  const result=await searchSourceCandidates(enabled,query,fetcher);
  expect(result.results[0]).toMatchObject({source:'https://www.aljadeed.tv/',title:'Al Jadeed · الجديد'});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('returns actual article titles and their publisher rather than turning the query into a source',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('<rss><channel><item><title>New Beirut transit plan announced</title><link>https://news.google.com/rss/articles/story</link><guid>story</guid><source url="https://publisher.example">Publisher</source></item></channel></rss>'));
  const result=await searchSourceCandidates(enabled,'New Beirut transit plan announced',fetcher);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('q')).toBe('New Beirut transit plan announced');
  expect(result).toMatchObject({unavailable:false,results:[{source:'https://publisher.example/',title:'New Beirut transit plan announced',articleUrl:'https://news.google.com/rss/articles/story'}]});
});
it('reports transport failures without calling paid verification or inference',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('',{status:403}));
  const result=await searchSourceCandidates({...enabled,SOURCE_PAID_VERIFICATION_ENABLED:'true'} as Env,'obscure article title',fetcher);
  expect(result).toEqual({results:[],unavailable:true,accessIncomplete:false});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('excludes paid-access publishers and keeps freely accessible matches without substitution',async()=>{
  const xml='<rss><channel>'+['one','two'].map(id=>`<item><guid>${id}</guid><title>Georges Khabbaz ${id}</title><link>https://news.google.com/rss/articles/${id}</link><source url="https://lovin.co">Lovin</source></item>`).join('')+'<item><guid>three</guid><title>Georges Khabbaz interview</title><link>https://news.google.com/rss/articles/three</link><source url="https://other.example">Other</source></item></channel></rss>';
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).startsWith('https://news.google.com/')?new Response(xml):new Response('Public source reporting. '.repeat(8),{status:String(url).startsWith('https://lovin.co')?403:200}));
  const result=await searchSourceCandidates(enabled,'Georges Khabbaz',fetcher);
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({source:'https://other.example/',publisher:'other.example'});
  expect(result.results.some(row=>row.publisher==='lovin.co')).toBe(false);
  expect(result.results.find(row=>row.publisher==='other.example')).not.toHaveProperty('blocked');
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('rejects unsafe publishers advertised by search results',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('<rss><channel><item><title>Unsafe result</title><link>https://news.google.com/rss/articles/story</link><guid>story</guid><source url="https://127.0.0.1">Local</source></item></channel></rss>'));
  expect((await searchSourceCandidates(enabled,'unsafe result',fetcher)).results).toEqual([]);
});
it('does not search remotely when disabled or the query contains no searchable characters',async()=>{
  const fetcher=vi.fn();
  expect(await searchSourceCandidates({} as Env,'unknown publisher',fetcher)).toEqual({results:[],unavailable:true,accessIncomplete:false});
  expect(await searchSourceCandidates(enabled,'??',fetcher)).toEqual({results:[],unavailable:false});
  expect(fetcher).not.toHaveBeenCalled();
});
