import {articleHtml,articlePage} from './test-fixtures/public-article';
import {expect,it,vi} from 'vitest';
import {searchSourceCandidates} from './source-search';
import {configuredSourceWebIndex} from './source-search-web-index';
vi.mock('./source-search-web-index',()=>({configuredSourceWebIndex:vi.fn(async()=>({items:[],available:false}))}));
import type {Env} from './types';
// Explicit relevance fixture: transport tests do not call a paid model.
vi.mock('./source-search-relevance',()=>({alignedSearchResults:vi.fn(async(_env:Env,_query:string,_topic:unknown,results:{title:string}[])=>({results:results.filter(row=>!['A football match','Unrelated theatre performance','A theatre production opens','AI workforce trends','Ammar Mohanna joins a theatre production'].includes(row.title)),unavailable:false}))}));
const enabled={SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true'} as Env;
it('streams free matches before supplementing a sparse search, preserving both sets',async()=>{
 const events:number[]=[],feed='https://techcrunch.com/feed/',first='https://techcrunch.com/research',extra='https://research.example/project';
 const fetcher:typeof fetch=async input=>String(input)===feed?new Response(`<rss><channel><item><guid>one</guid><title>Computing research</title><link>${first}</link></item></channel></rss>`):[first,extra].includes(String(input))?articlePage():new Response('',{status:403});
 vi.mocked(configuredSourceWebIndex).mockImplementationOnce(async()=>{expect(events).toEqual([1]);return {available:true,items:[{url:extra,title:'Computing research project',excerpt:'Computing discoveries'}]};});
 const result=await searchSourceCandidates({...enabled,SOURCE_SEARCH_WEB_DISCOVERY_ENABLED:'true'},'TechCrunch',fetcher,undefined,{owner:'owner',origin:'https://reader.example'},{title:'Computing',description:'Computing research'},async row=>{events.push(row.results.length);});
 expect(result.results.map(row=>row.articleUrl)).toEqual([first,extra]);expect(events).toEqual([1,2]);expect(result.unavailable).toBe(false);
});
it('does not pay for indexed discovery when the free search already has abundant verified matches',async()=>{
 vi.mocked(configuredSourceWebIndex).mockClear();
 const feed='https://techcrunch.com/feed/';
 const xml='<rss><channel>'+Array.from({length:12},(_,id)=>`<item><guid>${id}</guid><title>Computing discovery ${id}</title><link>https://techcrunch.com/research-${id}</link></item>`).join('')+'</channel></rss>';
 const fetcher:typeof fetch=async input=>String(input)===feed?new Response(xml):String(input).startsWith('https://techcrunch.com/research-')?articlePage():new Response('',{status:403});
 const result=await searchSourceCandidates({...enabled,SOURCE_SEARCH_WEB_DISCOVERY_ENABLED:'true'},'TechCrunch',fetcher,undefined,{owner:'owner',origin:'https://reader.example'},{title:'Computing',description:'Computing research'});
 expect(result.results).toHaveLength(12);expect(configuredSourceWebIndex).not.toHaveBeenCalled();
});
it.each([
 {query:'France 24 English',title:'Economy',description:'Economy, finance and international trade',feed:'https://www.france24.com/en/business-tech/rss',headline:'International trade grows as companies invest'},
 {query:'France 24 Français',title:'Économie',description:'Économie, entreprises, finance et commerce international',feed:'https://www.france24.com/fr/%C3%A9co-tech/rss',headline:'Le commerce mondial en progression'},
 {query:'فرانس 24',title:'اقتصاد',description:'الاقتصاد والشركات والتجارة',feed:'https://www.france24.com/ar/%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF/rss',headline:'نمو التجارة واستثمارات الشركات'}
])('searches a relevant category feed when the publisher front page lacks $title coverage',async row=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input)==='https://www.france24.com/economy-article'?articlePage():String(input)===row.feed?new Response(`<rss><channel><item><guid>economy</guid><title>${row.headline}</title><description>${row.headline}</description><link>https://www.france24.com/economy-article</link></item></channel></rss>`):new Response('<rss><channel><item><guid>other</guid><title>A football match</title><link>https://www.france24.com/football</link></item></channel></rss>'));
 const result=await searchSourceCandidates(enabled,row.query,fetcher,undefined,undefined,row);
 expect(result.results).toEqual([expect.objectContaining({source:'rss: '+row.feed,title:row.headline})]);
 expect(result.unavailable).toBe(false);
});
it.each([
 {query:'BBC World',feed:'https://feeds.bbci.co.uk/news/world/rss.xml',title:'World events',description:'International diplomacy and conflicts',headline:'International diplomacy talks resume'},
 {query:'France 24 Français',feed:'https://www.france24.com/fr/rss',title:'France',description:'Politique en France',headline:'France : le Parlement adopte une réforme politique'},
 {query:'فرانس 24',feed:'https://www.france24.com/ar/rss',title:'أخبار عربية',description:'أخبار العالم العربي والشرق الأوسط',headline:'الأردن يعلن تطورات سياسية في الشرق الأوسط'}
])('finds relevant publisher articles for $query without an external index',async row=>{
 const article=new URL('/article',row.feed).href;
 const xml=`<rss><channel><item><guid>one</guid><title>${row.headline}</title><description>${row.headline}</description><link>${article}</link></item></channel></rss>`;
 const fetcher=vi.fn<typeof fetch>(async url=>String(url)===row.feed?new Response(xml):String(url)===article?articlePage():new Response('',{status:403}));
 const result=await searchSourceCandidates(enabled,row.query,fetcher,undefined,undefined,row);
 expect(result.results).toEqual([expect.objectContaining({source:'rss: '+row.feed,title:row.headline,articleUrl:article})]);
 expect(result.unavailable).toBe(false);
});
it('searches a named publisher through readable article evidence when the external index is blocked',async()=>{
 const feed='https://techcrunch.com/feed/';
 const xml='<rss><channel><item><guid>one</guid><title>Computing startup announces a new processor</title><description>Technology companies are investing in computing hardware.</description><link>https://techcrunch.com/new-processor</link></item><item><guid>two</guid><title>Unrelated theatre performance</title><description>A new play opens.</description><link>https://techcrunch.com/play</link></item></channel></rss>';
 const fetcher=vi.fn<typeof fetch>(async url=>String(url)===feed?new Response(xml):String(url)==='https://techcrunch.com/new-processor'?articlePage():new Response('',{status:403}));
 const found=await searchSourceCandidates(enabled,'TechCrunch',fetcher,undefined,undefined,{title:'Computing',description:'Computing hardware and processors'});
 expect(found).toMatchObject({unavailable:false,results:[{source:'rss: '+feed,title:'Computing startup announces a new processor',articleUrl:'https://techcrunch.com/new-processor'}]});
 expect(fetcher.mock.calls.some(([url])=>String(url)===feed)).toBe(true);
 expect(fetcher.mock.calls.every(([url])=>String(url)===feed||String(url)==='https://techcrunch.com/new-processor'||String(url).startsWith('https://news.google.com/'))).toBe(true);
});
it('does not substitute a publisher catalog description for topic evidence',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>String(url)==='https://techcrunch.com/feed/'?new Response('<rss><channel><item><guid>one</guid><title>A theatre production opens</title><description>Actors perform a play.</description><link>https://techcrunch.com/play</link></item></channel></rss>'):new Response('',{status:403}));
 const found=await searchSourceCandidates(enabled,'TechCrunch',fetcher,undefined,undefined,{title:'Named Researcher',description:'Named Researcher discoveries'});
 expect(found).toMatchObject({results:[],unavailable:false,topicMismatch:true});
});
it('requires the search words and feed topic in article evidence before checking access',async()=>{
 const titles=['AI workforce trends','Ammar Mohanna presents an AI project','Ammar Mohanna joins a theatre production'];
 let googleQuery='';
 const fetcher=vi.fn<typeof fetch>(async url=>{
  if(String(url).startsWith('https://news.google.com/')){googleQuery=new URL(String(url)).searchParams.get('q')!;return new Response('<rss><channel>'+titles.map((title,i)=>`<item><guid>${i}</guid><title>${title}</title><link>https://publisher${i}.example/article</link><source url="https://publisher${i}.example">Publisher</source></item>`).join('')+'</channel></rss>');}
  return articlePage();
 });
 const result=await searchSourceCandidates(enabled,'AI',fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News and projects about Ammar Mohanna'});
 expect(googleQuery).toBe('AI');
 expect(result.results.map(row=>row.title)).toEqual(['Ammar Mohanna presents an AI project']);
 expect(fetcher).toHaveBeenCalledTimes(3);
});
it('reports off-topic indexed articles without offering them as sources',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('<rss><channel><item><guid>1</guid><title>AI workforce trends</title><link>https://publisher.example/article</link><source url="https://publisher.example">Publisher</source></item></channel></rss>'));
 const result=await searchSourceCandidates(enabled,'AI',fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News about Ammar Mohanna'});
 expect(result).toMatchObject({results:[],topicMismatch:true,unavailable:false});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('returns up to thirty relevant free results instead of twelve',async()=>{
 const xml='<rss><channel>'+Array.from({length:45},(_,i)=>`<item><guid>${i}</guid><title>Subject news ${i}</title><link>https://publisher${i}.example/article</link><source url="https://publisher${i}.example">Publisher</source></item>`).join('')+'</channel></rss>';
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(String(url).startsWith('https://news.google.com/')?xml:articleHtml()));
 expect((await searchSourceCandidates(enabled,'Subject news',fetcher)).results).toHaveLength(30);
});
it('reuses discovery after an incomplete access check rather than repeating the upstream search',async()=>{
 const saved=new Map<string,Response>(),cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{saved.set(key.url,value.clone());}};
 let available=false,googleReads=0;
 const fetcher=vi.fn<typeof fetch>(async url=>{
  if(String(url).startsWith('https://news.google.com/')){googleReads++;return new Response('<rss><channel><item><guid>1</guid><title>Subject news</title><link>https://publisher.example/article</link><source url="https://publisher.example">Publisher</source></item></channel></rss>');}
  if(!available)throw Error('temporary network failure');
  return articlePage();
 });
 const discovery={owner:'one',origin:'https://app.example',cache};
 expect((await searchSourceCandidates(enabled,'Subject news',fetcher,undefined,discovery)).accessIncomplete).toBe(true);
 available=true;
 expect((await searchSourceCandidates(enabled,'subject  news',fetcher,undefined,discovery)).results).toHaveLength(1);
 expect(googleReads).toBe(1);
});
it('omits relaxed search results that do not mention the complete query',async()=>{
  const titles=['From Raw Data to Graph-Native AI','Google DeepMind event at MSFEA highlights AI career paths','Man charged over Richmond Hill road rage','Ammar discusses AI','Mohanna presents a project','Ammar Mohanna presents a new project'];
  const xml='<rss><channel>'+titles.map((title,index)=>`<item><guid>${index}</guid><title>${title}</title><link>https://publisher${index}.example/article</link><source url="https://publisher${index}.example">Publisher</source></item>`).join('')+'</channel></rss>';
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).startsWith('https://news.google.com/')?new Response(xml):articlePage());
  const result=await searchSourceCandidates(enabled,'Ammar Mohanna',fetcher);
  expect(result.results.map(row=>row.title)).toEqual(['Ammar Mohanna presents a new project']);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each(['aljadded','Al Jadeed','الجديد'])('finds Al Jadeed by %s without inference or a paid request',async query=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('<html><p>'+(articleHtml())+'</p></html>',{headers:{'content-type':'text/html'}}));
  const result=await searchSourceCandidates(enabled,query,fetcher);
  expect(result.results[0]).toMatchObject({source:'https://www.aljadeed.tv/',title:'Al Jadeed · الجديد'});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('returns actual article titles and their publisher rather than turning the query into a source',async()=>{
  const fetcher=vi.fn<typeof fetch>(async url=>new Response(String(url).startsWith('https://news.google.com/')?'<rss><channel><item><title>New Beirut transit plan announced</title><link>https://publisher.example/story</link><guid>story</guid><source url="https://publisher.example">Publisher</source></item></channel></rss>':articleHtml()));
  const result=await searchSourceCandidates(enabled,'New Beirut transit plan announced',fetcher);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('q')).toBe('New Beirut transit plan announced');
  expect(result).toMatchObject({unavailable:false,results:[{source:'https://publisher.example/',title:'New Beirut transit plan announced',articleUrl:'https://publisher.example/story'}]});
});
it('reports transport failures without calling paid verification or inference',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('',{status:403}));
  const result=await searchSourceCandidates({...enabled,SOURCE_PAID_VERIFICATION_ENABLED:'true'} as Env,'obscure article title',fetcher);
  expect(result).toEqual({results:[],unavailable:true,accessIncomplete:false,verificationIncomplete:false});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('excludes paid-access publishers and keeps freely accessible matches without substitution',async()=>{
  const xml='<rss><channel>'+['one','two'].map(id=>`<item><guid>${id}</guid><title>Georges Khabbaz ${id}</title><link>https://lovin.co/${id}</link><source url="https://lovin.co">Lovin</source></item>`).join('')+'<item><guid>three</guid><title>Georges Khabbaz interview</title><link>https://other.example/interview</link><source url="https://other.example">Other</source></item></channel></rss>';
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).startsWith('https://news.google.com/')?new Response(xml):new Response(articleHtml(),{status:String(url).startsWith('https://lovin.co')?403:200}));
  const result=await searchSourceCandidates(enabled,'Georges Khabbaz',fetcher);
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({source:'https://other.example/',publisher:'other.example'});
  expect(result.results.some(row=>row.publisher==='lovin.co')).toBe(false);
  expect(result.results.find(row=>row.publisher==='other.example')).not.toHaveProperty('blocked');
  expect(fetcher).toHaveBeenCalledTimes(6);
});
it('rejects unsafe publishers advertised by search results',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('<rss><channel><item><title>Unsafe result</title><link>https://publisher.example/story</link><guid>story</guid><source url="https://127.0.0.1">Local</source></item></channel></rss>'));
  expect((await searchSourceCandidates(enabled,'unsafe result',fetcher)).results).toEqual([]);
});
it('does not search remotely when disabled or the query contains no searchable characters',async()=>{
  const fetcher=vi.fn();
  expect(await searchSourceCandidates({} as Env,'unknown publisher',fetcher)).toEqual({results:[],unavailable:true,accessIncomplete:false,verificationIncomplete:false});
  expect(await searchSourceCandidates(enabled,'??',fetcher)).toEqual({results:[],unavailable:false});
  expect(fetcher).not.toHaveBeenCalled();
});
