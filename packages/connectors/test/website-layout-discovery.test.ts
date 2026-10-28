import {expect,it} from 'vitest';
import {discoverWebsiteArticles} from '../src/source-runtime/website-discovery';
it('discovers body article cards inside a layout that has a sidebar without collecting sidebar or navigation links',()=>{
 const html='<div class="row has-sidebar has-more-top-stories"><section><article><a href="/news/first"><h2>First report</h2></a></article><article><a href="/news/second"><h2>Second report</h2></a></article></section><aside><a href="/news/related"><h2>Related story</h2></a></aside><div class="sidebar"><a href="/news/sidebar"><h2>Sidebar story</h2></a></div><nav><a href="/news/nav"><h2>Navigation</h2></a></nav></div>';
 expect(discoverWebsiteArticles(html,'https://publisher.example/')).toMatchObject({articles:[{url:'https://publisher.example/news/first'},{url:'https://publisher.example/news/second'}]});
});
