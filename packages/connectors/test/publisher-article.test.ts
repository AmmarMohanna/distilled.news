import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {extractPublicHtml} from '../src/source-runtime/public-html';
import {discoverWebsiteArticles} from '../src/source-runtime/website-discovery';
import {readArticleDateMetadata} from '../src/source-runtime/article-integrity';
import {sameArticleUrl} from '../src/source-runtime/article-schema';

const url='https://publisher.example/opinion/123-local-policy';
const headline='A policy development';
const body='The council approved a public proposal after discussing its implications. '.repeat(12).trim();
const metadata=(identity:Record<string,unknown>={})=>`<link rel="canonical" href="${url}"><h1>${headline}</h1><script type="application/ld+json">${JSON.stringify({'@type':'OpinionNewsArticle','@id':'123',headline,datePublished:'2025-09-03T12:15:45+0100',...identity})}</script>`;
const related='<aside><h2><a href="/related/one">One</a></h2><h2><a href="/related/two">Two</a></h2></aside>';

it('extracts MTV raw article prose with a bound numeric identity instead of login chrome',()=>{
 const original='https://www.mtv.com.lb/News/local/1752795/story',canonical='https://www.mtv.com.lb/news/1752795';
 const html=`<h1>Welcome back</h1><meta property="og:type" content="article"><meta property="og:title" content="${headline}"><meta property="og:url" content="${canonical}"><link rel="canonical" href="${canonical}"><div id="articleParams" articleId="1752795" articleTitle="${headline}"><div class="articles-report">${body}<br><div class="article-ad">Advertisement content must be excluded</div></div></div>`;
 expect(extractPublicHtml(html,original)).toMatchObject({title:headline,body,canonicalUrl:original,pageKind:'article'});
 for(const invalid of [html.replace('articleId="1752795"','articleId="999"'),html.replace(`articleTitle="${headline}"`,'articleTitle="Other headline"'),html.replace('/news/1752795','/news/999')])expect(extractPublicHtml(invalid,original).body).not.toBe(body);
 expect(extractPublicHtml(html,'https://other.example/News/local/1752795/story').body).not.toBe(body);
});

it('recognizes an opinion article with an opaque CMS ID using its canonical and headline',()=>{
 const html=metadata()+`<div class="field--name-body"><p>${body}</p></div>`+related;
 expect(discoverWebsiteArticles(html,url)).toBeUndefined();
 expect(extractPublicHtml(html,url)).toMatchObject({body,pageKind:'article'});
 expect(readArticleDateMetadata(html,url).publishedAt).toBe('2025-09-03T11:15:45.000Z');
});
it('does not borrow opinion metadata or dates from a different article',()=>{
 const html=metadata({headline:'Different headline',url:'https://publisher.example/other'})+related;
 expect(readArticleDateMetadata(html,url).publishedAt).toBeUndefined();
 expect(extractPublicHtml(html,url).pageKind).not.toBe('article');
});
it('supports URL and fragment article IDs while refusing a foreign ID',()=>{
 for(const id of [url+'#article','#article']){
  expect(extractPublicHtml(metadata({'@id':id})+`<div class="article-body">${body}</div>`,url).body).toBe(body);
 }
 expect(extractPublicHtml(metadata({'@id':'https://other.example/story'})+`<div class="article-body">${body}</div>`,url).body).toBe('');
});
it.each(['article-body field-item','field--name-body'])('extracts only the explicit %s body',classes=>{
 const html=`<meta property="og:type" content="article"><h1>${headline}</h1><div class="${classes}"><p>${body}</p></div>`+related;
 expect(extractPublicHtml(html,url)).toMatchObject({pageKind:'article',body});
});
it('reads description content only inside an explicit schema Article, without sharing controls',()=>{
 const html=`<meta property="og:type" content="article"><div itemtype="http://schema.org/Article"><h1>${headline}</h1><div class="sharing-widget">Share text</div><div itemprop="description"><p>${body}</p></div></div>`;
 expect(extractPublicHtml(html,url).body).toBe(body);
 expect(extractPublicHtml(html.replace('itemtype="http://schema.org/Article"',''),url).body).toBe('');
});
it('declines ambiguous explicit article bodies rather than joining unrelated content',()=>{
 const html=`<meta property="og:type" content="article"><main><div class="article-body">${body}</div><div class="article-body">Other story</div></main>`;
 expect(extractPublicHtml(html,url).body).toBe('');
});
it('treats nested CMS body wrappers as one body without discarding text',()=>{
 const html=metadata()+`<div class="entry-content"><div class="field--name-body"><p>${body}</p></div></div>`;
 expect(extractPublicHtml(html,url).body).toBe(body);
});
it('keeps opinion, latest-article and live indexes out of discovered article candidates',()=>{
 const html='<main><h2><a href="/opinions">Opinion</a></h2><h2><a href="/latest-articles">Latest</a></h2><h2><a href="/live/">Live</a></h2><h3><a href="/opinion/123-story">Actual article</a></h3></main>';
 expect(discoverWebsiteArticles(html,'https://publisher.example/home/writer/Person')?.articles).toEqual([{url:'https://publisher.example/opinion/123-story',title:'Actual article'}]);
});
it('tracking-only URL equivalence never admits another article, origin or content query',()=>{
 expect(sameArticleUrl(url+'?traffic_source=rss',url)).toBe(true);
 expect(sameArticleUrl(url+'?utm_source=rss#top',url)).toBe(true);
 for(const different of [url+'/other',url+'?edition=other',url.replace('publisher.example','other.example'),url.replace('https:','http:')])expect(sameArticleUrl(url,different)).toBe(false);
});

// Optional read-only replay of privately retained publisher HTML. No network,
// provider calls or article text in test output; normal CI uses synthetic fixtures.
it.skipIf(!process.env.DISTILLED_PUBLISHER_HTML)('replays retained publisher bodies and rejects index pages',()=>{
 const dir=process.env.DISTILLED_PUBLISHER_HTML!;
 for(const [file,target] of [
  ['article.html','https://english.aawsat.com/opinion/5182273-tianjin-summit-2025-region-center-new-global-order'],
  ['arabnews.com.html','https://www.arabnews.com/middle-east/israel-lebanon-agreement-shines-light-on-long-lost-jewish-community-3007060'],
  ['naharnet.com.html','https://www.naharnet.com/stories/en/323367-report-isf-pursuing-3-men-who-escorted-hezbollah-explosives-truck'],
 ]){
  const html=readFileSync(join(dir,file),'utf8');
  expect(discoverWebsiteArticles(html,target),file).toBeUndefined();
  const article=extractPublicHtml(html,target);
  expect(article.pageKind,file).toBe('article');expect(article.body.length,file).toBeGreaterThan(200);
  if(file==='article.html')expect(readArticleDateMetadata(html,target).publishedAt).toBe('2025-09-03T11:15:45.000Z');
 }
 for(const [file,target] of [['author.html','https://english.aawsat.com/home/writer/Nadim%20Koteich'],['jpost.com.html','https://www.jpost.com/latest-articles'],['cbsnews.com.html','https://www.cbsnews.com/live/']]){
  const result=discoverWebsiteArticles(readFileSync(join(dir,file),'utf8'),target);
  expect(result,file).toBeDefined();expect(result!.articles.every(a=>a.url!==target),file).toBe(true);
 }
});
