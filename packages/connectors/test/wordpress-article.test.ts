import {expect,it} from 'vitest';
import {extractWordpressArticle} from '../src/source-runtime/wordpress-article';
const url='https://publisher.example/2026/10/report/',first='The company allocated 5 percent of its shares to a public benefit fund. ',last='The allocation does not give the fund control of the company.';
const html=`<meta property="og:type" content="article"><meta property="article:published_time" content="2026-10-18T20:37:40Z"><link rel="canonical" href="${url}"><h1>A fund &amp; its role</h1><nav>Other stories</nav><div class="entry-content wp-block-post-content"><p>${first.repeat(4)}</p><div><p>${last}</p></div><script>unsupported script text</script></div><footer>Footer text</footer>`;
it('retains the complete nested post including final qualifiers, decodes entities and excludes outside prose',()=>{
 const r=extractWordpressArticle(html,url,url)!;expect(r.text).toContain(first.trim());expect(r.text).toContain(last);expect(r.text).not.toMatch(/Footer text|Other stories|unsupported script text/);expect(r.title).toBe('A fund & its role');expect(r.canonicalItemUrl).toBe(url);
});
it.each([html.replace('og:type','other:type'),html.replace('2026-10-18T20:37:40Z','not-a-date'),html.replace('entry-content wp-block-post-content','entry-content'),html+'<div class="entry-content wp-block-post-content">Ambiguous body</div>',html.replace(url,'https://other.example/story/'),html+'<h1>Another title</h1>'])('declines ambiguous or insufficient extraction',h=>{expect(extractWordpressArticle(h,url,url)).toBeUndefined()});
