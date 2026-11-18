import {describe,expect,it,vi} from 'vitest';
import {WebsiteSourceProvider} from '../src/source-runtime/website-providers';
import {discoverByUrlPattern} from '../src/source-runtime/website-discovery';
import type {SourceFetchRequest} from '../src/source-runtime/provider-types';
import type {FeedHttpPort} from '../src/source-runtime/ports';

/*
 * Per-source collection scenarios. The pages are synthetic: they copy each
 * publisher's URL scheme and listing shape, not its real markup or text.
 * Real captured pages live in test/fixtures/publishers (see
 * scripts/capture-publisher-fixtures.mjs) and run in publisher-captures.test.ts.
 */
const scope={feedId:'feed',feedSourceId:'feed-source',sourceId:'source'};
const run={...scope,id:'run',sequence:1,startedAt:'2026-11-18T10:00:00.000Z',configurationKey:'configuration'};
const encoder=new TextEncoder();
const arabic=(words:string)=>words.split(' ').map(encodeURIComponent).join('-');

interface Publisher {name:string;locator:string;story:(i:number)=>string;title:(i:number)=>string;sections:string[]}
const publishers:Publisher[]=[
 {name:'Al Arabiya economy',locator:'https://www.alarabiya.net/aswaq/economy',
  story:i=>`/aswaq/economy/2026/11/${String(10+i).padStart(2,'0')}/${arabic('ارتفاع أسعار النفط في الأسواق')}-${i}`,
  title:i=>`ارتفاع أسعار النفط في الأسواق العالمية ${i}`,sections:['/aswaq/microscope','/aswaq/economy','/aswaq/real-estate']},
 {name:'Al Modon politics',locator:'https://www.almodon.com/politics',
  story:i=>`/politics/2026/11/${String(10+i).padStart(2,'0')}/${arabic('جلسة حكومية جديدة في بيروت')}-${i}`,
  title:i=>`جلسة حكومية جديدة في بيروت اليوم ${i}`,sections:['/politics','/economy','/culture']},
 {name:'BBC Arabic',locator:'https://www.bbc.com/arabic',
  story:i=>`/arabic/articles/c${i}x7k2m9q4ro`,
  title:i=>`تطورات جديدة في المنطقة رقم ${i}`,sections:['/arabic/topics/c2dwqd1zr92t','/arabic/live']},
 {name:'Now Lebanon',locator:'https://nowlebanon.com/',
  story:i=>`/lebanon-cabinet-talks-stall-again-${i}/`,
  title:i=>`Lebanon cabinet talks stall again, part ${i}`,sections:['/category/politics/','/tag/economy/']},
];

const nav=(p:Publisher)=>`<header><nav>${p.sections.map(s=>`<a href="${s}">Section ${s}</a>`).join('')}</nav></header>`;
/** The card layout regular discovery reads: headline links inside story cards. */
const cards=(p:Publisher,ids:number[])=>`<html><head><title>${p.name}</title></head><body>${nav(p)}<main>${ids.map(i=>
 `<article class="story-card"><h3><a href="${p.story(i)}">${p.title(i)}</a></h3><p>Short deck for story ${i}.</p></article>`).join('')}</main><footer><a href="/about">About</a></footer></body></html>`;
/** The same stories after a redesign: no headings, no story classes. */
const redesigned=(p:Publisher,ids:number[])=>`<html><head><title>${p.name}</title></head><body>${nav(p)}<main><div class="g7x">${ids.map(i=>
 `<div class="q2"><a class="z1" href="${p.story(i)}"><span>${p.title(i)}</span></a><span class="m">5 min</span></div>`).join('')}</div></main></body></html>`;
/** A script-rendered listing: the story links exist only in page data. */
const scriptRendered=(p:Publisher,ids:number[])=>`<html><head><title>${p.name}</title></head><body>${nav(p)}<div id="root"></div>
 <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{items:ids.map(i=>({href:p.story(i),headline:p.title(i)})),logo:'/static/logo.png'}}})}</script></body></html>`;

const http=(status:number,html:string,headers:Record<string,string>={}):FeedHttpPort=>({get:vi.fn(async()=>({status,headers,bytes:encoder.encode(html),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}))});
/** The trusted extractor sees a listing but finds no links in it. */
const extractor=()=>({execute:vi.fn(async()=>({pageKind:'listing',articleLinks:[]}))});
const request=(p:Publisher):SourceFetchRequest=>({scope,runId:'run',source:{family:'website',locator:p.locator},requestedBounds:{},limit:30});
const absolute=(p:Publisher,i:number)=>new URL(p.story(i),p.locator).href;
const collect=(p:Publisher,status:number,html:string,headers?:Record<string,string>)=>{
 const execution=extractor();
 return {execution,page:new WebsiteSourceProvider('website_http',http(status,html,headers),execution).fetch(request(p),run)};
};

describe.each(publishers)('$name collection scenarios',p=>{
 it('first poll: collects every story card and no section links',async()=>{
  const page=await collect(p,200,cards(p,[1,2,3,4,5])).page;
  expect(page.items.map(i=>i.url)).toEqual([1,2,3,4,5].map(i=>absolute(p,i)));
  expect(page.items.every(i=>i.representation==='LISTING_RESULT'&&i.sourceItemKey===`url:${i.url}`)).toBe(true);
  for(const section of p.sections)expect(page.items.map(i=>i.url)).not.toContain(new URL(section,p.locator).href);
  expect(page.complete).toBe(true);
 });

 it('later poll: new stories appear and kept stories keep the same identity',async()=>{
  const first=await collect(p,200,cards(p,[1,2,3,4,5])).page;
  const later=await collect(p,200,cards(p,[6,7,8,3,4,5])).page;
  expect(later.items.map(i=>i.url)).toEqual(expect.arrayContaining([6,7,8].map(i=>absolute(p,i))));
  const kept=(page:typeof first)=>page.items.filter(i=>[3,4,5].map(n=>absolute(p,n)).includes(String(i.url))).map(i=>i.sourceItemKey);
  expect(kept(later)).toEqual(kept(first));
 });

 it('layout change: the URL-pattern parser still finds the stories and marks coverage incomplete',async()=>{
  const page=await collect(p,200,redesigned(p,[1,2,3,4])).page;
  expect(page.items.map(i=>i.url).sort()).toEqual([1,2,3,4].map(i=>absolute(p,i)).sort());
  expect(page.complete).toBe(false);
 });

 it('script-rendered listing: story links are read from page data',async()=>{
  const page=await collect(p,200,scriptRendered(p,[1,2,3])).page;
  expect(page.items.map(i=>i.url).sort()).toEqual([1,2,3].map(i=>absolute(p,i)).sort());
  expect(page.complete).toBe(false);
 });

 it('empty page: fails as an unreadable listing instead of succeeding with nothing',async()=>{
  await expect(collect(p,200,`<html><head><title>${p.name}</title></head><body>${nav(p)}<main></main></body></html>`).page)
   .rejects.toMatchObject({code:'MALFORMED',diagnostic:{detail:'NO_LISTING_LINKS'}});
 });

 it('too few article-shaped links: does not guess from one or two links',async()=>{
  await expect(collect(p,200,redesigned(p,[1,2])).page).rejects.toMatchObject({code:'MALFORMED',diagnostic:{detail:'NO_LISTING_LINKS'}});
 });

 it('redirect to another site: reported as a redirect, not parsed',async()=>{
  const {execution,page}=collect(p,301,'',{location:'https://elsewhere.example/'});
  await expect(page).rejects.toMatchObject({code:'CHALLENGE',diagnostic:{detail:'UPSTREAM_REDIRECT',httpStatus:301}});
  expect(execution.execute).not.toHaveBeenCalled();
 });

 it('bot challenge page: reported as a challenge, not as an empty listing',async()=>{
  await expect(collect(p,200,'<html><head><title>Just a moment...</title></head><body></body></html>').page)
   .rejects.toMatchObject({code:'CHALLENGE',diagnostic:{detail:'ACCESS_CHALLENGE_PAGE'}});
 });

 it.each([[403,'ACCESS_BLOCKED','CHALLENGE'],[404,'HTTP_NOT_FOUND','UNAVAILABLE'],[503,'UPSTREAM_TRANSPORT_FAILURE','TRANSIENT']] as const)(
  'HTTP %s: keeps the precise failure',async(status,detail,code)=>{
   await expect(collect(p,status,'').page).rejects.toMatchObject({code,diagnostic:{detail,httpStatus:status}});
  });
});

describe('URL-pattern listing parser',()=>{
 const base='https://news.example/latest';
 const link=(href:string,title='A sufficiently long headline')=>`<div><a href="${href}"><span>${title}</span></a></div>`;
 it('keeps only the dominant article URL family',()=>{
  const html=`<main>${[1,2,3].map(i=>link(`/2026/11/1${i}/story-${i}`)).join('')}${link('/tag/economy')}${link('/category/politics/world')}
   ${link('https://other.example/2026/11/12/outside')}${link('/2026/11/12/story-1?share=1')}${link('/images/2026/11/12/photo.jpg')}${link('/about-us-and-our-team-today')}</main>`;
  expect(discoverByUrlPattern(html,base).map(a=>a.url)).toEqual([1,2,3].map(i=>`https://news.example/2026/11/1${i}/story-${i}`));
 });
 it('returns nothing below three matching links',()=>{
  expect(discoverByUrlPattern(`<main>${link('/2026/11/11/a')}${link('/2026/11/12/b')}</main>`,base)).toEqual([]);
 });
 it('ignores page chrome and asset paths in page data',()=>{
  const data=JSON.stringify({a:'/_next/static/chunks/2026/11/12/x-12345.js',b:'/wp-content/uploads/2026/11/12/y',c:'https://cdn.example/2026/11/12/z'});
  expect(discoverByUrlPattern(`<header>${[1,2,3].map(i=>link(`/2026/11/1${i}/nav-${i}`)).join('')}</header><script type="application/json">${data}</script>`,base)).toEqual([]);
 });
});
