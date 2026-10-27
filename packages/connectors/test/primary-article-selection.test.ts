import {expect,it} from 'vitest';
import {extractPublicHtml,discoverWebsiteArticles} from '../src';
const url='https://publisher.example/news/report';
const first='Officials described a newly identified outbreak and the surveillance work under way. '.repeat(5);
const last='Transmission between people has not been confirmed. The investigation remains ongoing and the finding provisional.';
const prose=`<p>${first}</p><p>${last}</p>`;
const card='<article><h2><a href="/unrelated">Unrelated story</a></h2><p>RELATED CARD MUST NOT BECOME EVIDENCE.</p></article>';
it('reaches the story body through its headline header without selecting an earlier card',()=>{
 const r=extractPublicHtml(`<main>${card}<article><header><h1>Report</h1></header>${prose}${card}</article></main>`,url);
 expect(r.pageKind).toBe('article');expect(r.body).toContain(last);expect(r.body).not.toContain('RELATED CARD');
});
it('handles duplicate headings and nested cards while preserving the primary story qualification',()=>{
 const html=`<main>${card}<article><header><h1>Report</h1></header><h1>Report</h1>${prose}${card}${card}</article></main>`;
 const r=extractPublicHtml(html,url);expect(r.pageKind).toBe('article');expect(r.body).toContain(last);expect(r.body).not.toContain('RELATED CARD');expect(discoverWebsiteArticles(html,url)).toBeUndefined();
});
it.each(['article-text','elementor-widget-theme-post-content','field--name-body'])('recognizes %s independently of other headings',className=>{
 const html=`<main><h1>Report</h1><div class="${className}">${prose}</div>${card}<section><h1>Other coverage</h1>${card}</section></main>`;
 const r=extractPublicHtml(html,url);expect(r.pageKind).toBe('article');expect(r.body).toContain(last);expect(r.body).not.toContain('RELATED CARD');
});
it('retains both adjacent body sections rather than only the first one',()=>{
 const html=`<main><h1>Report</h1><section class="post-content"><p>${first}</p></section><section class="post-content"><p>${first}</p><p>${last}</p></section>${card}${card}</main>`;
 const r=extractPublicHtml(html,url);expect(r.pageKind).toBe('article');expect(r.body).toContain(last);expect(r.body).not.toContain('RELATED CARD');
});
it('recognizes a long-form main body beside related cards',()=>{
 const r=extractPublicHtml(`<main><div><h1>Report</h1></div><section>${prose}</section>${card}${card}</main>`,url);
 expect(r.pageKind).toBe('article');expect(r.body).toContain(last);expect(r.body).not.toContain('RELATED CARD');
});
it('keeps a collection of long article cards as discovery',()=>{
 const cards=Array.from({length:4},(_,i)=>`<article><h2><a href="/story-${i}">Story ${i}</a></h2>${prose}</article>`).join('');
 const html=`<main><h1>Latest news</h1>${cards}</main>`;
 expect(extractPublicHtml(html,url).pageKind).toBe('listing');expect(discoverWebsiteArticles(html,url)?.articles).toHaveLength(4);
});
it('does not accept a footer body class as missing article evidence',()=>{
 const r=extractPublicHtml(`<h1>Report</h1><main>Content unavailable</main><footer class="post-content">${prose}</footer>`,url);
 expect(r.body).not.toContain(first.trim());expect(r.body.length).toBeLessThan(200);
});
