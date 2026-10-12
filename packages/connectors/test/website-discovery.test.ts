import {describe,it,expect} from 'vitest';
import {discoverWebsiteArticles} from '../src/source-runtime/website-discovery';
const url='https://publisher.example/news';
describe('source-scoped article discovery',()=>{
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
