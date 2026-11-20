import {expect,it,vi} from 'vitest';
import {parseWebSearchHtml} from '@distilled/connectors';
import {searchSourceCandidates} from './source-search';
import {readWebSearch} from './source-web-search';
vi.mock('./source-search-relevance',()=>({alignedSearchResults:vi.fn(async(_env:unknown,_query:string,_topic:unknown,rows:{title:string}[])=>({results:rows.filter(row=>!row.title.includes('Another Researcher')),unavailable:false}))}));
const profile='https://www.aub.edu/pages/profile.aspx?MemberId=am288';
const result=(url=profile,title='AUB - Faculty Member Profile - Ammar Mohanna')=>`<div class="result"><div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=tracking">${title}</a><a class="result__snippet">Faculty information and research at AUB.</a></div></div>`;
it('extracts the actual HTTPS result identity, decoded title and associated snippet',()=>{
 expect(parseWebSearchHtml(result())).toEqual([{url:profile,title:'AUB - Faculty Member Profile - Ammar Mohanna',excerpt:'Faculty information and research at AUB.'}]);
 expect(parseWebSearchHtml(result('https://other.example/','Research &amp; teaching'))[0].title).toBe('Research & teaching');
 expect(parseWebSearchHtml(result('javascript:alert(1)'))).toEqual([]);
 expect(parseWebSearchHtml('<div class="result--ad">'+result()+'</div>')).toEqual([]);
});
it.each(['ammar mohanna aub','ammar mohanna'])('finds a relevant institutional profile for %s without requiring a news entry or working homepage',async query=>{
 const directory='<div class="researcher-card"><h4><a href="/pages/profile.aspx?MemberId=am288">Ammar Mohanna</a></h4><p>Lecturer researching AI at AUB.</p></div>';
 const target='https://www.aub.edu.lb/pages/profile.aspx?MemberId=am288';
 const fetcher=vi.fn<typeof fetch>(async input=>{
  const url=String(input);
  if(url==='https://www.aub.edu.lb/msfea/Pages/AI-Researchers-at-MSFEA.aspx')return new Response(directory);
  if(url===target)return new Response('<html><head><title>Ammar Mohanna — AUB profile</title></head><body><main><h1>Ammar Mohanna</h1><p>'+('Ammar Mohanna teaches at AUB and researches artificial intelligence. '.repeat(3))+'</p><p>'+('His profile describes his research projects and academic publications. '.repeat(3))+'</p></main></body></html>');
  throw Error('The publisher homepage and unrelated news routes must not be fetched');
 });
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_RECOMMENDATIONS_WEB_HTML:'true'} as never,query,fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News and projects related to Ammar Mohanna'});
 expect(found.results).toHaveLength(1);
 expect(found.results[0]).toMatchObject({source:target,articleUrl:target,publisher:'www.aub.edu.lb'});
 expect(fetcher.mock.calls.filter(call=>String(call[0])===target)).toHaveLength(1);
});
it('rejects private destinations and keeps the topic check for institutional results',async()=>{
 const directory='<div class="researcher-card"><h4><a href="https://127.0.0.1/private">Ammar Mohanna</a></h4></div><div class="researcher-card"><h4><a href="/pages/profile.aspx?MemberId=other">Another Researcher</a></h4><p>AI workforce at AUB</p></div>';
 const fetcher=vi.fn<typeof fetch>(async input=>new Response(String(input).includes('duckduckgo')?'<div class="no-results">No results</div>':String(input).includes('AI-Researchers-at-MSFEA')?directory:'<rss><channel></channel></rss>'));
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_RECOMMENDATIONS_WEB_HTML:'true'} as never,'AI research',fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News about Ammar Mohanna'});
 expect(found.results).toEqual([]);expect(found.topicMismatch).toBe(true);
 expect(fetcher.mock.calls.every(call=>!String(call[0]).includes('127.0.0.1'))).toBe(true);
});
it('shares the public directory index across name searches without repeating its fetch',async()=>{
 const values=new Map<string,Response>(),cache={match:async(key:Request)=>values.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{values.set(key.url,value.clone());}};
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('<div class="researcher-card"><h4><a href="/pages/profile.aspx?MemberId=am288">Ammar Mohanna</a></h4><p>AI researcher</p></div>'));
 expect((await readWebSearch('ammar mohanna',fetcher,cache)).items).toHaveLength(1);
 expect((await readWebSearch('another researcher',fetcher,cache)).items).toHaveLength(1);
 expect(fetcher.mock.calls.filter(call=>String(call[0]).includes('AI-Researchers-at-MSFEA'))).toHaveLength(1);
});
it('finds ordinary web pages for a topic outside the institutional directory',async()=>{
 const url='https://research.example/people/samira-haddad';
 const fetcher=vi.fn<typeof fetch>(async input=>{
  if(String(input).startsWith('https://html.duckduckgo.com/html/?q='))return new Response(result(url,'Samira Haddad research projects'));
  if(String(input)===url)return new Response('<html><head><title>Samira Haddad — research profile</title></head><body><main><h1>Samira Haddad</h1><p>'+('Samira Haddad research projects and publications. '.repeat(3))+'</p><p>'+('This profile describes her current research and scientific publications. '.repeat(3))+'</p></main></body></html>');
  return new Response('Unavailable',{status:503});
 });
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_RECOMMENDATIONS_WEB_HTML:'true'} as never,'Samira Haddad',fetcher,undefined,undefined,{title:'Professor Samira Haddad',description:'I want details about recent work of Samira Haddad'});
 expect(found.results).toEqual([expect.objectContaining({source:url,title:'Samira Haddad research projects'})]);
 expect(found.unavailable).toBe(false);
});
it('reports a blocked web index as incomplete even if a directory was readable',async()=>{
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('duckduckgo')?new Response('Blocked',{status:403}):new Response('<div class="researcher-card"><h4><a href="/people/other">Other Researcher</a></h4></div>'));
 const result=await readWebSearch('Samira Haddad',fetcher);
 expect(result.available).toBe(true);expect(result.accessIncomplete).toBe(true);
});
it.each(['Lebanon','économie française','أخبار العلوم'])('uses direct general-web RSS identities when the HTML index is unavailable for %s',async query=>{
 const target='https://independent.example/news/report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).startsWith('https://www.bing.com/search?')?new Response(`<rss><channel><item><guid>report</guid><title>Actual reporting</title><description>Original indexed excerpt.</description><link>${target}</link></item><item><guid>unsafe</guid><title>Unsafe result</title><link>https://127.0.0.1/private</link></item></channel></rss>`):new Response('Blocked',{status:403}));
 const found=await readWebSearch(query,fetcher);
 expect(found).toMatchObject({available:true,accessIncomplete:false,items:[{url:target,title:'Actual reporting',excerpt:'Original indexed excerpt.'}]});
 expect(new URL(String(fetcher.mock.calls.find(([url])=>String(url).startsWith('https://www.bing.com/'))![0])).searchParams.get('q')).toBe(query);
 expect(fetcher.mock.calls.every(([url])=>!String(url).includes('127.0.0.1'))).toBe(true);
});
it('unwraps only the explicit news-index redirect identity and never fetches its wrapper or unsafe destinations',async()=>{
 const target='https://independent.example/news/report';
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).startsWith('https://www.bing.com/news/search?')?new Response(`<rss><channel><item><guid>article</guid><title>Actual reporting</title><description>Publisher reporting.</description><link>http://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(target)}</link></item><item><guid>private</guid><title>Unsafe</title><link>http://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent('https://127.0.0.1/private')}</link></item></channel></rss>`):new Response('',{status:403}));
 const found=await readWebSearch('topic',fetcher);
 expect(found.items).toEqual([{url:target,title:'Actual reporting',excerpt:'Publisher reporting.'}]);
 expect(found.accessIncomplete).toBe(false);
 expect(fetcher.mock.calls.every(([url])=>!String(url).includes('/news/apiclick')&&!String(url).includes('127.0.0.1'))).toBe(true);
});
