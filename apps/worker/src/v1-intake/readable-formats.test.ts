import {expect,it,vi} from 'vitest';
import {extractPublicHtml} from '@distilled/connectors';
import {createCandidateAcquisitionRouter} from './acquisition-router';
import type {AcquisitionClaim} from './acquisition';
const url='https://publisher.example/topic/resource/2026/report/';
const prose='Officials published a detailed investigation describing the affected systems, the evidence collected and the conditions under which the incident occurred. ';
const body=prose.repeat(6);
const claim={job:{id:'job'},candidate:{id:'candidate'},input:{observation:{id:'obs',feedId:'feed',feedSourceId:'source',sourceId:'publisher',canonicalUrl:url,representation:'ARTICLE_EXCERPT',contentCompleteness:'PARTIAL'}}} as AcquisitionClaim;
const router=(text:string,contentType='text/html')=>createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00.000Z',preferFullArticle:true,publicGet:async()=>({url,body:text,contentType,status:200})});
it('extracts source-owned prose without requiring a supported URL layout or article metadata',async()=>{
 const html='<nav>Unrelated navigation</nav><main><h1>Investigation</h1><div class="article-body"><p>'+prose.repeat(3)+'</p><p>'+prose.repeat(3)+'</p></div><h2><a href="/related">Related article</a></h2><h2><a href="/another">Another article</a></h2></main>';
 const p=extractPublicHtml(html,url);expect(p.pageKind).toBe('article');expect(p.body).not.toContain('Related article');
 const acquired=await router(html)(claim);expect(acquired.body).toContain(prose.trim());expect(acquired).toMatchObject({representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN',quality:{extractionSuccess:true,extractionComplete:false}});
});
it.each(['text/plain','text/markdown','text/x-markdown'])('retains readable %s response text exactly',async media=>{
 expect((await router(body,media)(claim)).body).toBe(body);
});
it.each(['application/json','application/vnd.publisher+json'])('reads source-owned article text from %s',async media=>{
 const acquired=await router(JSON.stringify({url,title:'Investigation',articleBody:body,datePublished:'2026-10-26T10:00:00Z'}),media)(claim);
 expect(acquired).toMatchObject({title:'Investigation',body,publishedAt:'2026-10-26T10:00:00.000Z',contentCompleteness:'UNKNOWN'});
});
it('rejects unrelated JSON identities and preserves genuine authentication requirements',async()=>{
 await expect(router(JSON.stringify({url:'https://other.example/report',body}),'application/json')(claim)).rejects.toMatchObject({code:'INVALID_RESULT'});
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00Z',publicGet:async()=>({url,body,contentType:'text/plain',status:401})});
 await expect(acquire(claim)).rejects.toMatchObject({code:'AUTH_REQUIRED'});
});
it('does not turn a headline index into a full article',async()=>{
 const html='<main><h1>Latest news</h1>'+[1,2,3].map(n=>'<article><h2><a href="/story/'+n+'">Headline '+n+'</a></h2><p>'+prose+'</p></article>').join('')+'</main>';
 expect(extractPublicHtml(html,url).pageKind).toBe('listing');
 await expect(router(html)(claim)).rejects.toMatchObject({code:'EXTRACTION_FAILED'});
});

it('retains a readable main body even without article tags, headings or metadata',async()=>{
 const acquired=await router('<main><p>'+prose.repeat(3)+'</p><p>'+prose.repeat(3)+'</p></main>')(claim);
 expect(acquired.body).toContain(prose.trim());expect(acquired.contentCompleteness).toBe('UNKNOWN');
});

it('reads a text-bearing main container without paragraph markup',async()=>{
 expect((await router('<main>'+body+'</main>')(claim)).body).toBe(body.trim());
});
