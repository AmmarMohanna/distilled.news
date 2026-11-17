import {expect,it} from 'vitest';
import {readArticleDateMetadata,unreadableArticleReason} from '../src/source-runtime/article-integrity';
const url='https://publisher.example/space/roman-telescope';
it('keeps original publication and update times separate, regardless of metadata order',()=>{
 const dates=readArticleDateMetadata('<meta property="article:modified_time" content="2026-10-21T12:00:00Z"><script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',url,datePublished:'2026-08-31',dateModified:'2026-10-21T12:00:00Z'})+'</script>',url);
 expect(dates).toMatchObject({publishedAt:'2026-08-31T00:00:00.000Z',updatedAt:'2026-10-21T12:00:00.000Z',publicationConflict:false});
});
it('never turns modified metadata, prose or a dated URL into a publication date',()=>{
 expect(readArticleDateMetadata('<meta itemprop="dateModified" content="2026-10-21"><article>Launched August 31, 2026</article>','https://publisher.example/2026/10/21/story')).toMatchObject({publishedAt:undefined,updatedAt:'2026-10-21T00:00:00.000Z'});
});
it('does not borrow dates from related articles or non-article schema nodes',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'NewsArticle',url:'https://publisher.example/other',datePublished:'2026-10-21'},{'@type':'WebPage',url,datePublished:'2026-10-21'}]})+'</script>';
 expect(readArticleDateMetadata(html,url).publishedAt).toBeUndefined();
});
it('retains explicit conflicting publication dates instead of picking the newest one',()=>{
 const html='<meta property="article:published_time" content="2026-10-21"><meta itemprop="datePublished" content="2026-08-31">';
 expect(readArticleDateMetadata(html,url)).toMatchObject({publishedAt:undefined,publicationConflict:true,candidates:expect.arrayContaining([{value:'2026-08-31T00:00:00.000Z',source:'html:datepublished'}])});
});
it('accepts a precise original time alongside date-only metadata and ignores malformed JSON',()=>{
 expect(readArticleDateMetadata('<meta property="article:published_time" content="2026-08-31"><time itemprop="datePublished" datetime="2026-08-31T12:00:00Z"></time><script type="application/ld+json">invalid</script>',url).publishedAt).toBe('2026-08-31T12:00:00.000Z');
});
it.each([
 'Readable introduction. '.repeat(10)+'QWxwaGEvYmV0YTEyMzQ1Njc4OTA='.repeat(70),
 'Readable introduction. '.repeat(10)+'&#12354;'.repeat(100),
 'Readable introduction. '.repeat(10)+'%E3%81%82'.repeat(100),
 'Readable introduction. '.repeat(10)+'\uFFFD'.repeat(50),
 'Readable introduction. '.repeat(10)+'~!@#$%^&*'.repeat(100),
])('rejects a readable opening followed by a corrupted or encoded body',text=>{
 expect(unreadableArticleReason(text)).toBeDefined();
});
it.each([
 'هذا تقرير علمي عن رحلة إلى أقمار المريخ. '.repeat(30),
 '日本の火星衛星探査計画についての記事です。'.repeat(30),
 'Une étude présente de nouvelles observations du télescope spatial. '.repeat(30),
 'The spacecraft will study the moons of Mars. '.repeat(30)+'https://example.com/'+ 'a'.repeat(300),
])('does not confuse multilingual prose or long cited URLs with obfuscation',text=>{
 expect(unreadableArticleReason(text)).toBeUndefined();
});
