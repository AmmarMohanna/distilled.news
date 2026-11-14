import {expect,it,vi} from 'vitest';
import {extractPublicHtml,isWebsiteListingUrl,SourceProviderError} from '@distilled/connectors';
import {hashContent} from '@distilled/contracts';
import {createCandidateAcquisitionRouter} from './acquisition-router';
import {AcquisitionFailure,type AcquisitionClaim} from './acquisition';
const url='https://publisher.example/topic/resource/2026/report/';
const prose='Officials published a detailed investigation describing the affected systems, the evidence collected and the conditions under which the incident occurred. ';
const body=prose.repeat(6);
const claim={job:{id:'job'},candidate:{id:'candidate'},input:{observation:{id:'obs',feedId:'feed',feedSourceId:'source',sourceId:'publisher',canonicalUrl:url,representation:'ARTICLE_EXCERPT',contentCompleteness:'PARTIAL'}}} as AcquisitionClaim;
const router=(text:string,contentType='text/html')=>createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00.000Z',preferFullArticle:true,publicGet:async()=>({url,body:text,contentType,status:200})});

it.each([
 {failure:'UNCERTAIN_PAID_SUBMISSION',expected:'PARTIAL'},
 {failure:'EXTRACTION_FAILED',expected:'PARTIAL'},
 {failure:'EXTRACTION_FAILED',headlineOnly:true},
 {failure:'EXTRACTION_FAILED',metadataOnly:true},
 {failure:'EXTRACTION_FAILED',differentPayload:true},
 {failure:'EXTRACTION_FAILED',listing:true},
 {failure:'AUTH_REQUIRED'},
 {failure:'POLICY_DENIED'},
 {failure:'INVALID_RESULT'},
] as const)('reuses only verified publisher prose after full-page acquisition fails (%j)',async scenario=>{
 const {failure}=scenario;
 const title='metadataOnly' in scenario?'برنامج تنفيذ الاختبارات الخطية':'Council releases the investigation';
 const body='headlineOnly' in scenario?`${title}. ${title}. Read more at https://publisher.example/notice`:
  'metadataOnly' in scenario?`${title} ‏اللغة ‏ Ar News Type:&nbsp; Army News Image:&nbsp; Date:&nbsp; الجمعة, نوفمبر 13, 2026 - 14:00`:prose;
 const representation='listing' in scenario?'LISTING_RESULT':'ARTICLE_EXCERPT';
 const ref=`source-payloads/${'a'.repeat(64)}/${'b'.repeat(64)}`;
 const publishedAt='2026-10-25T07:38:42.000Z';
 const observation={...claim.input.observation,operation:'UPSERT' as const,representation,suppliedPayloadRef:ref,publishedAtHint:publishedAt,
  contentHash:await hashContent({representation,title,body})};
 const input={observation,proposal:{observationId:'obs',connectorType:'rss',url,suppliedPayloadRef:ref}} as AcquisitionClaim['input'];
 const readPayload=vi.fn(async()=>({title,body:'differentPayload' in scenario?`${body} Changed.`:body}));
 const articleFallback=vi.fn(async()=>{
  if(failure==='UNCERTAIN_PAID_SUBMISSION')throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
  throw new AcquisitionFailure(failure,false,{detail:'test',...(failure==='EXTRACTION_FAILED'?{httpStatus:500}:{})});
 });
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00.000Z',preferFullArticle:true,
  publicGet:async()=>({url,body:'<html><body></body></html>',contentType:'text/html',status:500}),articleFallback,readPayload});
 const result=acquire({...claim,input});
 if('expected' in scenario)await expect(result).resolves.toMatchObject({title,body,publishedAt,canonicalUrl:url,
  representation:'ARTICLE_EXCERPT',contentCompleteness:scenario.expected,acquisitionProvider:'rss_supplied_excerpt',
  quality:{extractionComplete:false},provenance:{rawPayloadRef:ref}});
 else await expect(result).rejects.toMatchObject({code:failure});
 expect(articleFallback).toHaveBeenCalledTimes(1);
 if(['AUTH_REQUIRED','POLICY_DENIED','INVALID_RESULT'].includes(failure)||'listing' in scenario)expect(readPayload).not.toHaveBeenCalled();
});

it.each(['exact','foreign-result','wrong-headline'] as const)('uses the existing fallback for a verified publisher relocation with a client-rendered body (%s)',async mode=>{
 const target='https://publisher.example/news/224932/original-story',headline='Minister discusses media cooperation with the ambassador';
 const candidate={...claim,input:{...claim.input,observation:{...claim.input.observation,titleHint:headline}}};
 const html=`<link rel="canonical" href="${target}"><meta property="og:type" content="article"><meta property="og:title" content="${mode==='wrong-headline'?'An entirely different story':headline}"><div id="client-root"></div>`;
 const fallback=vi.fn(async()=>({status:200,url:mode==='foreign-result'?'https://other.example/unrelated':url,canonicalUrl:url,pageKind:'article',title:headline,body}));
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00Z',preferFullArticle:true,publicGet:async()=>({url:target,body:html,contentType:'text/html',status:200}),articleFallback:fallback});
 if(mode==='exact'){
  expect(await acquire(candidate)).toMatchObject({body,sourceObservationId:'obs',canonicalUrl:url});expect(fallback).toHaveBeenCalledWith(candidate);
 }else{
  await expect(acquire(candidate)).rejects.toMatchObject({code:mode==='wrong-headline'?'INVALID_RESULT':'EXTRACTION_FAILED'});
  expect(fallback).toHaveBeenCalledTimes(mode==='wrong-headline'?0:1);
 }
});
const nnaOrigin='https://nna-leb.gov.lb';
const nnaUrl=nnaOrigin+'/en/news/224914/minister-discusses-import-duties';
const nnaShortUrl=nnaOrigin+'/en/news/short/224914';
const nnaHeadline='Minister discusses import duties with local manufacturers';
const nnaDate='2026-09-21T10:56:57.000Z';
const nnaShell=`<link rel="canonical" href="${nnaUrl}"><meta property="og:type" content="article">
 <meta property="og:title" content="${nnaHeadline}"><meta property="article:published_time" content="${nnaDate}">`;

it.each([
 {from:nnaShortUrl,content:body,completeness:'UNKNOWN'},
 {from:nnaUrl,content:body,completeness:'UNKNOWN'},
 {from:nnaShortUrl,content:prose,completeness:'PARTIAL'},
])('uses the public publisher JSON for NNA article text ($from, $completeness)',async({from,content,completeness})=>{
 const fallback=vi.fn(async()=>undefined);
 const fetcher=vi.fn(async()=>Response.json({data:{data:{id:224914,slug:'minister-discusses-import-duties',
  title:nnaHeadline,url:nnaShortUrl,content:`<p>${content}</p>`},'related-news':[{content:'Unrelated article'}]}}));
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00Z',preferFullArticle:true,
  publicGet:async()=>({url:nnaUrl,body:nnaShell,contentType:'text/html',status:200}),fetcher,articleFallback:fallback});
 const candidate={...claim,input:{...claim.input,observation:{...claim.input.observation,canonicalUrl:from,
  titleHint:nnaHeadline,publishedAtHint:'2026-10-21T09:00:00Z'}}};
 expect(await acquire(candidate)).toMatchObject({body:content.trim(),canonicalUrl:from,publishedAt:nnaDate,
  contentCompleteness:completeness,provenance:{stages:expect.arrayContaining(['HTTP'])}});
 expect(fetcher).toHaveBeenCalledExactlyOnceWith(nnaOrigin+'/api/proxy/v2/en/news/224914',
  expect.objectContaining({redirect:'manual',headers:{accept:'application/json'}}));
 expect(fallback).not.toHaveBeenCalled();
});

it.each([
 {id:224918},
 {slug:'other-story'},
 {title:'A different event reported by the same publisher'},
 {url:'https://other.example/article'},
])('rejects NNA JSON when publisher article identity differs (%j)',async(wrong)=>{
 const fetcher=vi.fn(async()=>Response.json({data:{data:{id:224914,slug:'minister-discusses-import-duties',
  title:nnaHeadline,url:nnaShortUrl,content:`<p>${body}</p>`,...wrong}}}));
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00Z',preferFullArticle:true,
  publicGet:async()=>({url:nnaUrl,body:nnaShell,contentType:'text/html',status:200}),fetcher});
 const candidate={...claim,input:{...claim.input,observation:{...claim.input.observation,
  canonicalUrl:nnaShortUrl,titleHint:nnaHeadline}}};
 await expect(acquire(candidate)).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'ARTICLE_REDIRECT_TEXT_UNAVAILABLE'}});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('extracts source-owned prose without requiring a supported URL layout or article metadata',async()=>{
 const html='<nav>Unrelated navigation</nav><main><h1>Investigation</h1><div class="article-body"><p>'+prose.repeat(3)+'</p><p>'+prose.repeat(3)+'</p></div><h2><a href="/related">Related article</a></h2><h2><a href="/another">Another article</a></h2></main>';
 expect(isWebsiteListingUrl(url)).toBe(true);
 const p=extractPublicHtml(html,url);expect(p.pageKind).toBe('article');expect(p.body).not.toContain('Related article');
 const fallback=vi.fn(async()=>undefined);
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00.000Z',preferFullArticle:true,publicGet:async()=>({url,body:html,contentType:'text/html',status:200}),articleFallback:fallback});
 const acquired=await acquire(claim);expect(acquired.body).toContain(prose.trim());expect(acquired.body).not.toContain('Related article');expect(acquired).toMatchObject({canonicalUrl:url,sourceObservationId:'obs',representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN',quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:false}});
 expect(fallback).not.toHaveBeenCalled();
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
it.each([
 {name:'recognized listing URL',target:url,listingUrl:true,code:'UNSUPPORTED',detail:'LISTING_PAGE',fallbackCalls:0},
 {name:'article-style URL',target:'https://publisher.example/news/2026/report/',listingUrl:false,code:'EXTRACTION_FAILED',detail:'NO_PRIMARY_ARTICLE_TEXT',fallbackCalls:1}
] as const)('rejects headline-index HTML at $name with its exact failure and fallback contract',async({target,listingUrl,code,detail,fallbackCalls})=>{
 const html='<main><h1>Latest news</h1>'+[1,2,3].map(n=>'<article><h2><a href="/story/'+n+'">Headline '+n+'</a></h2><p>'+prose+'</p></article>').join('')+'</main>';
 expect(isWebsiteListingUrl(target)).toBe(listingUrl);
 expect(extractPublicHtml(html,target).pageKind).toBe('listing');
 const fallback=vi.fn(async()=>undefined),candidate={...claim,input:{...claim.input,observation:{...claim.input.observation,canonicalUrl:target}}};
 const acquire=createCandidateAcquisitionRouter({now:()=> '2026-10-27T12:00:00.000Z',preferFullArticle:true,publicGet:async()=>({url:target,body:html,contentType:'text/html',status:200}),articleFallback:fallback});
 await expect(acquire(candidate)).rejects.toMatchObject({code,transient:false,diagnostic:{detail}});
 expect(fallback).toHaveBeenCalledTimes(fallbackCalls);
 if(fallbackCalls===1)expect(fallback).toHaveBeenCalledWith(candidate);
});

it('retains a readable main body even without article tags, headings or metadata',async()=>{
 const acquired=await router('<main><p>'+prose.repeat(3)+'</p><p>'+prose.repeat(3)+'</p></main>')(claim);
 expect(acquired.body).toContain(prose.trim());expect(acquired.contentCompleteness).toBe('UNKNOWN');
});

it('reads a text-bearing main container without paragraph markup',async()=>{
 expect((await router('<main>'+body+'</main>')(claim)).body).toBe(body.trim());
});
