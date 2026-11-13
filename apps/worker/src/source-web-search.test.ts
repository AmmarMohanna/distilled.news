import {expect,it,vi} from 'vitest';
import {parseWebSearchHtml} from '@distilled/connectors';
import {searchSourceCandidates} from './source-search';
const profile='https://www.aub.edu/pages/profile.aspx?MemberId=am288';
const result=(url=profile,title='AUB - Faculty Member Profile - Ammar Mohanna')=>`<div class="result"><div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=tracking">${title}</a><a class="result__snippet">Faculty information and research at AUB.</a></div></div>`;
it('extracts the actual HTTPS result identity, decoded title and associated snippet',()=>{
 expect(parseWebSearchHtml(result())).toEqual([{url:profile,title:'AUB - Faculty Member Profile - Ammar Mohanna',excerpt:'Faculty information and research at AUB.'}]);
 expect(parseWebSearchHtml(result('https://other.example/','Research &amp; teaching'))[0].title).toBe('Research & teaching');
 expect(parseWebSearchHtml(result('javascript:alert(1)'))).toEqual([]);
 expect(parseWebSearchHtml('<div class="result--ad">'+result()+'</div>')).toEqual([]);
});
it('finds a relevant institutional profile without requiring a news entry or a working homepage',async()=>{
 const directory='<div class="researcher-card"><h4><a href="/pages/profile.aspx?MemberId=am288">Ammar Mohanna</a></h4><p>Lecturer researching AI at AUB.</p></div>';
 const target='https://www.aub.edu.lb/pages/profile.aspx?MemberId=am288';
 const fetcher=vi.fn<typeof fetch>(async input=>{
  const url=String(input);
  if(url==='https://www.aub.edu.lb/msfea/Pages/AI-Researchers-at-MSFEA.aspx')return new Response(directory);
  if(url===target)return new Response('<p>'+('Ammar Mohanna teaches at AUB and researches artificial intelligence. '.repeat(5))+'</p>');
  throw Error('The publisher homepage and unrelated news routes must not be fetched');
 });
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_RECOMMENDATIONS_WEB_HTML:'true'} as never,'ammar mohanna aub',fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News and projects related to Ammar Mohanna'});
 expect(found.results).toHaveLength(1);
 expect(found.results[0]).toMatchObject({source:target,articleUrl:target,publisher:'www.aub.edu.lb'});
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects private destinations and keeps the topic check for institutional results',async()=>{
 const directory='<div class="researcher-card"><h4><a href="https://127.0.0.1/private">Ammar Mohanna</a></h4></div><div class="researcher-card"><h4><a href="/pages/profile.aspx?MemberId=other">Another Researcher</a></h4><p>AI workforce at AUB</p></div>';
 const fetcher=vi.fn<typeof fetch>(async input=>new Response(String(input).includes('AI-Researchers-at-MSFEA')?directory:'<rss><channel></channel></rss>'));
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',SOURCE_RECOMMENDATIONS_WEB_HTML:'true'} as never,'ammar mohanna aub',fetcher,undefined,undefined,{title:'Ammar Mohanna',description:'News about Ammar Mohanna'});
 expect(found.results).toEqual([]);expect(found.topicMismatch).toBe(true);
 expect(fetcher.mock.calls.every(call=>!String(call[0]).includes('127.0.0.1'))).toBe(true);
});
