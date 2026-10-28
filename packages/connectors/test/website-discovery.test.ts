import {describe,it,expect} from 'vitest';
import {discoverWebsiteArticles,isWebsiteListingUrl} from '../src/source-runtime/website-discovery';
const url='https://publisher.example/news';
describe('source-scoped article discovery',()=>{
 it('filters observed publisher section links while retaining their article children',()=>{
  for(const url of ['https://www.jpost.com/science','https://www.jpost.com/israel-news/culture/','https://www.thenationalnews.com/business/','https://www.thenationalnews.com/podcasts/tarab','https://www.lbcgroup.tv/news-highlights/ar'])expect(isWebsiteListingUrl(url)).toBe(true);
  for(const url of ['https://other.example/science','https://www.jpost.com/science/article-123456','https://www.thenationalnews.com/business/2026/10/28/story/','https://www.thenationalnews.com/podcasts/tarab/episode-one','https://www.lbcgroup.tv/news/lebanon/123456/story/ar'])expect(isWebsiteListingUrl(url)).toBe(false);
  const html='<main><a href="/business"><h2>Business</h2></a><a href="/business/2026/10/28/story"><h2>Actual reported development</h2></a></main>';
  expect(discoverWebsiteArticles(html,'https://www.thenationalnews.com/magazine/')?.articles).toEqual([{url:'https://www.thenationalnews.com/business/2026/10/28/story',title:'Actual reported development'}]);
 });
 it('retains only the headline from whole-card links containing labels and summaries',()=>{
  const html='<main><a href="/story"><span>Investigation</span><h3>Exact article headline</h3><p>Summary and extra context</p><span>Play 02:29</span></a><a href="/second"><h3>Second headline</h3></a></main>';
  expect(discoverWebsiteArticles(html,url)?.articles[0]).toEqual({url:'https://publisher.example/story',title:'Exact article headline'});
 });
 it('does not classify an article as its embedded parent CollectionPage',()=>{
  for(const collection of [{'@type':'CollectionPage',url:'/soccer/'},{'@type':'CollectionPage'},{'@type':'SearchResultsPage',url:'/search/'}]){
   const html='<meta property="og:type" content="article"><article><h1>Player update</h1><p>Reported development.</p></article><script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',url, isPartOf:collection})+'</script>';
   expect(discoverWebsiteArticles(html,url)).toBeUndefined();
  }
 });
 it('keeps an explicitly bound CollectionPage as discovery even with article metadata',()=>{
  const html='<meta property="og:type" content="article"><script type="application/ld+json">'+JSON.stringify({'@type':'CollectionPage',url})+'</script><h2><a href="/one">One</a></h2>';
  expect(discoverWebsiteArticles(html,url)?.articles).toEqual([{url:'https://publisher.example/one',title:'One'}]);
 });
 it('treats a news index as discovery despite misleading article metadata',()=>{
  const html='<meta property="og:type" content="article"><article><h1>All NASA News</h1><p>Unrelated summaries</p><h2><a href="/missions/artemis/flight">Flight news</a></h2><h2><a href="/science/research">Research news</a></h2></article>';
  expect(discoverWebsiteArticles(html,'https://www.nasa.gov/news/all-news/')?.articles).toEqual([{url:'https://www.nasa.gov/missions/artemis/flight',title:'Flight news'},{url:'https://www.nasa.gov/science/research',title:'Research news'}]);
  expect(discoverWebsiteArticles('<p>Unknown index layout</p>','https://www.nasa.gov/news/all-news/')).toEqual({articles:[],nextPage:undefined});
 });
 it('excludes div-based global navigation while discovering item-heading links',()=>{
  const html='<div id="global-navigation"><a href="/missions"><h3>Missions</h3></a></div><main><div class="hds-content-item"><a class="hds-content-item-heading" href="/science/new-result">Research result</a></div></main>';
  expect(discoverWebsiteArticles(html,'https://www.nasa.gov/news/all-news/')?.articles).toEqual([{url:'https://www.nasa.gov/science/new-result',title:'Research result'}]);
 });
 it('does not invent a next URL or claim exhaustion for JavaScript-only pagination',()=>{
  const html='<div class="hds-content-item"><a class="hds-content-item-heading" href="/science/result">Result</a></div><a class="next page-numbers" data-page-number="2" href="#">Next</a>';
  expect(discoverWebsiteArticles(html,'https://www.nasa.gov/news/all-news/')).toMatchObject({articles:[{url:'https://www.nasa.gov/science/result'}],paginationUnresolved:true});
 });
 it('discovers CoinDesk-style headings inside links on a tag listing',()=>{
  const html='<main>'+['ETF decision','Corporate purchase'].map((title,i)=>`<div class="flex"><a class="content-card-title" href="/markets/2026/10/15/story-${i}"><h3>${title}</h3></a><p>Summary</p></div>`).join('')+'</main>';
  expect(discoverWebsiteArticles(html,'https://publisher.example/tag/bitcoin')?.articles).toEqual([
   {url:'https://publisher.example/markets/2026/10/15/story-0',title:'ETF decision'},
   {url:'https://publisher.example/markets/2026/10/15/story-1',title:'Corporate purchase'}]);
 });
 it('never promotes an unrecognized tag layout into full article evidence',()=>{
  expect(discoverWebsiteArticles('<main><p>Several headline excerpts</p></main>','https://publisher.example/tag/bitcoin')).toEqual({articles:[],nextPage:undefined});
 });
 it('discovers independent headline entries without turning a listing into article evidence',()=>{
  const html='<nav><a href="/about">About</a></nav>'+['Flight policy changes','Minister considers resignation','Security investigation'].map((t,i)=>`<div class="latest-story"><a class="title" href="/articles/${i}">${t}</a><a href="/articles/${i}#comments">Comments</a></div>`).join('');
  expect(discoverWebsiteArticles(html,url)).toEqual({articles:['Flight policy changes','Minister considers resignation','Security investigation'].map((title,i)=>({url:`https://publisher.example/articles/${i}`,title})),nextPage:undefined});
 });
 it('keeps direct articles intact despite related links',()=>{
  expect(discoverWebsiteArticles('<meta property="og:type" content="article"><article><h1>A complex development</h1><p>Supported detail</p></article><div class="story"><a class="title" href="/one">One</a></div><div class="story"><a class="title" href="/two">Two</a></div>',url)).toBeUndefined();
 });
 it('preserves every discovered article, excluding navigation and foreign or credential-bearing URLs',()=>{
  const html=Array.from({length:125},(_,i)=>`<article><h2><a href="/item/${i}?utm_source=index">Item ${i}</a></h2></article>`).join('')+'<nav><h2><a href="/login">Login</a></h2></nav><article><h2><a href="https://other.example/story">Foreign</a></h2></article><article><h2><a href="https://user:pass@publisher.example/story">Credentials</a></h2></article>';
  const result=discoverWebsiteArticles(html,url)!;
  expect(result.articles).toHaveLength(125);expect(result.articles[124]).toEqual({url:'https://publisher.example/item/124',title:'Item 124'});
 });
 it('normalizes duplicate links and validates pagination independently of news eligibility',()=>{
  const html='<div class="story"><a class="title" href="/one">One</a><a class="title" href="/one#top">One</a></div><div class="story"><a class="title" href="/two">Two</a></div><a rel="next" href="/news?page=2">Next</a>';
  expect(discoverWebsiteArticles(html,url)).toEqual({articles:[{url:'https://publisher.example/one',title:'One'},{url:'https://publisher.example/two',title:'Two'}],nextPage:'https://publisher.example/news?page=2'});
  expect(discoverWebsiteArticles(html.replace('/news?page=2','https://foreign.example/news'),url)?.nextPage).toBeUndefined();
 });
 it('keeps a single substantive article intact when related headline links are outside it',()=>{
  expect(discoverWebsiteArticles('<article><h1>Development</h1><p>Complete supported reporting.</p></article><section><h2><a href="/related-one">Related one</a></h2><h2><a href="/related-two">Related two</a></h2></section>',url)).toBeUndefined();
 });
 it('recognizes structured listings without inventing article body or dates',()=>{
  expect(discoverWebsiteArticles('<script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'ListItem',item:{url:'/one',name:'One'}}]})+'</script>',url)).toEqual({articles:[{url:'https://publisher.example/one',title:'One'}],nextPage:undefined});
  expect(discoverWebsiteArticles('<nav><a href="/one">One</a><a href="/two">Two</a></nav>',url)).toBeUndefined();
 });
});

it('typed NewsArticle entries inside an ItemList remain discovery, not a current-page article',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'ListItem',item:{'@type':'NewsArticle',url:'/one',headline:'One'}},{'@type':'ListItem',item:{'@type':'NewsArticle',url:'/two',headline:'Two'}}]})+'</script>';
 expect(discoverWebsiteArticles(html,url)?.articles).toEqual([{url:'https://publisher.example/one',title:'One'},{url:'https://publisher.example/two',title:'Two'}]);
});

function promedPage(alerts:unknown[],title='Outbreak report'){
 const row='29:T4,text25:'+JSON.stringify(['$','$L28',null,{alerts}])+'\n',mid=Math.floor(row.length/2);
 return '<table><tr><td>'+title+'</td></tr></table>'+[row.slice(0,mid),row.slice(mid)].map(part=>'<script>self.__next_f.push('+JSON.stringify([1,part])+')</script>').join('');
}
it('discovers ProMED public alert identities and original issue dates from split data frames',()=>{
 const alert={alert_id:8735910,post_title:'Outbreak report',issue_date:'$D2026-10-27T05:04:00.000Z',date_created:'$D2026-10-26T16:48:24.000Z'};
 expect(discoverWebsiteArticles(promedPage([alert,alert]),'https://www.promedmail.org/')).toEqual({articles:[{url:'https://www.promedmail.org/alert/8735910',title:'Outbreak report',publishedAt:'2026-10-27T05:04:00.000Z'}],paginationUnresolved:true});
});
it('does not fabricate ProMED identities or borrow dates from unrelated fields',()=>{
 const html=promedPage([{alert_id:12,post_title:'Outbreak report',date_created:'$D2026-10-26T16:48:24.000Z'},{alert_id:-1,post_title:'Outbreak report'},{alert_id:'13',post_title:'Outbreak report'},{alert_id:14,post_title:'Hidden report'}]);
 expect(discoverWebsiteArticles(html,'https://www.promedmail.org/')?.articles).toEqual([{url:'https://www.promedmail.org/alert/12',title:'Outbreak report'}]);
 expect(discoverWebsiteArticles(html,'https://publisher.example/')).toBeUndefined();
 expect(discoverWebsiteArticles(html,'https://www.promedmail.org/alert/12')).toBeUndefined();
});
it('ignores executable and malformed ProMED data without evaluating it',()=>{
 expect(discoverWebsiteArticles('<script>self.__next_f.push([1,evil()])</script><table><tr><td>Outbreak report</td></tr></table>','https://www.promedmail.org/')).toBeUndefined();
});

it('keeps metadata-free prose articles with related links out of listing discovery',()=>{
 const prose='Officials published a detailed investigation describing the affected systems, the evidence collected and the conditions under which the incident occurred. ';
 const html='<main><h1>Incident investigation</h1><div class="article-body"><p>'+prose.repeat(3)+'</p><p>'+prose.repeat(2)+'</p></div><h2><a href="/related-one">Related one</a></h2><h2><a href="/related-two">Related two</a></h2></main>';
 expect(discoverWebsiteArticles(html,'https://publisher.example/topic/resource/2026/report/')).toBeUndefined();
});
