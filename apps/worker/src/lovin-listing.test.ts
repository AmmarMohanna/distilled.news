import {expect,it} from 'vitest';
import {extractPublicHtml,discoverWebsiteArticles,isWebsiteListingUrl} from '@distilled/connectors';
const html=`<html><head><meta property="og:type" content="website"></head><body class="page-template-elementor_header_footer"><main><section><h1>Regional media brand</h1><p>${'Our regional publication connects readers with community reporting across several cities. '.repeat(6)}</p></section><section><h2>Featured stories</h2><a href="https://lovin.co/beirut/entertainment/example-report/"><h3>Beirut culture report</h3></a><a href="https://lovin.co/dubai/latest/example-report/"><h3>Dubai community report</h3></a></section></main></body></html>`;
it.each(['https://lovin.co/','https://lovin.co/beirut/en'])('keeps Lovin landing-page marketing separate from article evidence (%s)',url=>{
 expect(isWebsiteListingUrl(url)).toBe(true);
 expect(discoverWebsiteArticles(html,url)?.articles).toHaveLength(2);
 expect(extractPublicHtml(html,url)).toMatchObject({pageKind:'listing',articleLinks:['https://lovin.co/beirut/entertainment/example-report/','https://lovin.co/dubai/latest/example-report/']});
});
it('does not reinterpret a Lovin article URL or another publisher as a Lovin landing page',()=>{
 expect(isWebsiteListingUrl('https://lovin.co/beirut/entertainment/example-report/')).toBe(false);
 expect(isWebsiteListingUrl('https://other.example/beirut/en')).toBe(false);
});
