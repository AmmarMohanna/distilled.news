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

it('retains a short multi-bullet liveblog summary as partial content, excluding navigation',()=>{
 const a='Officials announced preliminary election results after counting ballots overnight. Coalition negotiations are continuing and no final agreement has been announced.';
 const b='The opposition disputed the projections and requested further counting. Election officials said the result remains provisional pending verification of outstanding ballots.';
 const html=`<main><header><h1>Election live updates</h1><div class="wysiwyg"><ul><li>${a}</li><li>${b}</li></ul></div></header></main><nav><li>NAVIGATION MUST NOT BECOME EVIDENCE</li></nav>`;
 const r=extractPublicHtml(html,'https://publisher.example/news/liveblog/2026/10/28/election');
 expect(r).toMatchObject({pageKind:'article',contentCompleteness:'PARTIAL'});expect(r.body).toContain(a);expect(r.body).toContain(b);expect(r.body).not.toContain('NAVIGATION');
});

it('keeps a headline-free homepage with link-wrapped headings and long previews as discovery',()=>{
 const cards=[1,2,3].map(i=>`<section><a href="/world/report-${i}"><h2>Report ${i}</h2></a><p>${first}</p></section>`).join('');
 const html=`<div role="main">${cards}</div>`;
 expect(extractPublicHtml(html,'https://publisher.example/').pageKind).toBe('listing');
 expect(discoverWebsiteArticles(html,'https://publisher.example/')?.articles).toHaveLength(3);
});

it('discovers styled paragraph headlines without promoting the surrounding news grid to article text',()=>{
 const cards=[1,2,3].map(i=>`<section><a href="/world/report-${i}"><p class="defaultstyled__StyledHeadline-sc-1dedoj7-8">Report ${i}</p></a><p>${first}</p></section>`).join('');
 const html=`<div role="main">${cards}</div>`;
 expect(extractPublicHtml(html,'https://publisher.example/').pageKind).toBe('listing');
 expect(discoverWebsiteArticles(html,'https://publisher.example/')?.articles).toHaveLength(3);
});

it('retains short explicitly scoped article prose as partial while rejecting an equally short generic teaser',()=>{
 const brief='Election officials released preliminary results and said outstanding ballots remain under review. No final coalition agreement has been announced.';
 const r=extractPublicHtml(`<meta property="og:type" content="article"><h1>Election update</h1><div itemprop="articleBody">${brief}</div>`,url);
 expect(r).toMatchObject({body:brief,pageKind:'article',contentCompleteness:'PARTIAL'});
 const teaser=extractPublicHtml(`<meta property="og:type" content="article"><meta name="description" content="${brief}"><h1>Election update</h1>`,url);
 expect(teaser.body.length).toBeLessThan(80);expect(teaser.contentCompleteness).toBeUndefined();
});
