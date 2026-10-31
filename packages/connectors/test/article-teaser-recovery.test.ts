import {it,expect} from 'vitest';
import {extractPublicHtml} from '../src/source-runtime/public-html';
import {sameArticleUrl} from '../src/source-runtime/article-schema';
import {discoverWebsiteArticles,isWebsiteListingUrl} from '../src/source-runtime/website-discovery';
const old='https://www.uefa.com/womenschampionsleague/news/02aa-21e36ef64792-e4a02e83d527-1000--old-headline/';
const canonical=old.replace('old-headline','updated-headline');
const first='The home side confirmed its place in the next stage after winning the match. '.repeat(4);
const second='The coach said the next fixture would determine the final position in the group. '.repeat(4);
const page=(body:string,structured='A short preview of the match.',extra='')=>`<link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',url:canonical,articleBody:structured,datePublished:'2026-10-29T06:00:00Z'})}</script><article><h1>Matchday preview</h1>${body}</article>${extra}`;
it('retains the visible article instead of a JSON-LD teaser when the publisher updates its slug',()=>{
 const result=extractPublicHtml(page(`<div class="article_body"><p>${first}</p><p>${second}</p></div>`),old);
 expect(result.body).toContain(first.trim());expect(result.body).toContain(second.trim());expect(result.body).not.toBe('A short preview of the match.');
 expect(result.publishedAt).toBe('2026-10-29T06:00:00.000Z');expect(result.canonicalUrl).toBe(canonical);expect(result.pageKind).toBe('article');
 expect(sameArticleUrl(old,canonical)).toBe(true);
});
it('does not replace structured article text with ambiguous bodies or unrelated page text',()=>{
 const ambiguous=extractPublicHtml(page(`<div class="article_body"><p>${first}</p><p>${second}</p></div><div class="article_body"><p>${first}</p><p>${second}</p></div>`),old);
 expect(ambiguous.body).toBe('A short preview of the match.');
 const unrelated=extractPublicHtml(page('<p>Preview only.</p>',undefined,`<nav><p>${first}</p><p>${second}</p></nav>`),old);
 expect(unrelated.body).toBe('A short preview of the match.');
});
it('keeps substantive structured evidence rather than silently substituting different visible reporting',()=>{
 const retained='The retained structured article contains a substantive account. '.repeat(8);
 expect(extractPublicHtml(page(`<div class="article_body"><p>${first}</p><p>${second}</p></div>`,retained),old).body).toBe(retained);
});
it('never equates unrelated publishers, competitions, IDs, or content queries',()=>{
 expect(sameArticleUrl(old,canonical.replace('womenschampionsleague','news-media'))).toBe(true);
 expect(sameArticleUrl(old,canonical.replace('womenschampionsleague','news-media').replace('21e36ef64792','21e36ef64793'))).toBe(false);
 for(const other of [canonical.replace('21e36ef64792','21e36ef64793'),canonical.replace('womenschampionsleague','uefachampionsleague'),canonical.replace('www.uefa.com','example.com'),canonical+'?edition=other'])expect(sameArticleUrl(old,other)).toBe(false);
});
it('does not enqueue ESA archive navigation as an article',()=>{
 const archive='https://www.esa.int/Science_Exploration/Space_Science/(archive)/0';
 expect(isWebsiteListingUrl(archive)).toBe(true);
 expect(isWebsiteListingUrl(archive.replace('www.esa.int','publisher.example'))).toBe(false);
 const html='<main><h1>Space science</h1><article><a href="/Science_Exploration/Space_Science/(archive)/0"><h2>Archive</h2></a></article><article><a href="/Science_Exploration/Space_Science/mission-report"><h2>Mission report</h2></a></article><article><a href="/Science_Exploration/Space_Science/new-observation"><h2>New observation</h2></a></article></main>';
 expect(discoverWebsiteArticles(html,'https://www.esa.int/Science_Exploration/Space_Science')?.articles.map(a=>a.url)).toEqual(['https://www.esa.int/Science_Exploration/Space_Science/mission-report','https://www.esa.int/Science_Exploration/Space_Science/new-observation']);
});
