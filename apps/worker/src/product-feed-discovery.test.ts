import {expect,it} from 'vitest';
import {discoverPublicRssFeed} from './product-feed-discovery';
import {resolveProductSourceInput} from './product-feeds';

const feed=`<?xml version="1.0"?><rss version="2.0"><channel><title>News</title><item><guid>one</guid><title>One</title><link>https://example.com/one</link></item></channel></rss>`;
it('prefers an advertised same-origin section feed over a generic site feed',async()=>{
 const seen:string[]=[];
 const fetcher=(async(input:RequestInfo|URL)=>{
  const url=String(input);seen.push(url);
  if(url.endsWith('/category/ai/'))return new Response(`<html><head><link href="/feed/" type="application/rss+xml" rel="alternate"><link rel="alternate" type="application/rss+xml" href="/category/ai/feed/"></head></html>`,{headers:{'content-type':'text/html'}});
  if(url.endsWith('/category/ai/feed/'))return new Response(feed,{headers:{'content-type':'application/rss+xml'}});
  throw new Error('Unapproved discovery URL');
 }) as typeof fetch;
 expect(await discoverPublicRssFeed('https://example.com/category/ai/',fetcher)).toBe('https://example.com/category/ai/feed/');
 expect(seen).toEqual(['https://example.com/category/ai/','https://example.com/category/ai/feed/']);
 expect(await resolveProductSourceInput('example.com/category/ai/',fetcher)).toMatchObject({
  detected:{kind:'rss_feed'},sourceUrl:'https://example.com/category/ai/feed/',input:'example.com/category/ai/'
 });
 expect(seen).toHaveLength(4);
});
it('does not probe another origin or a site-wide feed for a section',async()=>{
 const seen:string[]=[];
 const fetcher=(async(input:RequestInfo|URL)=>{seen.push(String(input));return new Response('<link rel="alternate" type="application/rss+xml" href="https://other.example/feed/"><link rel="alternate" type="application/rss+xml" href="/feed/">',{headers:{'content-type':'text/html'}})}) as typeof fetch;
 expect(await discoverPublicRssFeed('https://example.com/category/ai/',fetcher)).toBeUndefined();
 expect(seen).toEqual(['https://example.com/category/ai/']);
});
