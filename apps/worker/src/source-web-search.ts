import {normalizeRssSnapshot,parseDirectorySearchHtml,parseWebSearchHtml} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
import {readSearchFeed} from './source-search-feed';
import type {Env} from './types';
export async function readWebSearch(query:string,fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>,env?:Env){
 const general=(async()=>{
  try{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(query.trim().toLocaleLowerCase()));
   const key=new Request('https://source-directory-cache.invalid/web-v1/'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''));
   try{const saved=await cache?.match(key);if(saved)return {items:await saved.json() as ReturnType<typeof parseWebSearchHtml>,available:true};}catch{}
   const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(query);
   const page=await new WorkerPublicSourceFetch(url,recommendationFetch(fetcher,2500),{maxBytes:1_000_000,followSameOriginRedirects:true}).get(url);
   if(page.status!==200||page.authenticationRequired)return {items:[],available:false};
   const items=parseWebSearchHtml(page.body);
   if(items.length)try{await cache?.put(key,Response.json(items,{headers:{'cache-control':'public, max-age=60'}}));}catch{}
   return {items,available:items.length>0||/class=["'][^"']*no-results/i.test(page.body)};
  }catch{return {items:[],available:false};}
 })();
 const rssIndex=async(section:'web'|'news')=>{
  try{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(query.trim().toLocaleLowerCase()));
   const key=new Request('https://source-directory-cache.invalid/bing-'+section+'-rss-v1/'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''));
   try{const saved=await cache?.match(key);if(saved)return {items:await saved.json() as ReturnType<typeof parseWebSearchHtml>,available:true};}catch{}
   const url='https://www.bing.com/'+(section==='news'?'news/':'')+'search?format=rss&count=30&q='+encodeURIComponent(query);
   const page=await readSearchFeed(url,fetcher,env);
   if(page.status!==200||page.authenticationRequired)return {items:[],available:false};
   const items=normalizeRssSnapshot(page.body,url).flatMap(item=>{
    if(!item.identityValid||!item.url||!item.title)return [];
    let target=item.url;
    try{
     const indexed=new URL(target);
     if(['bing.com','www.bing.com'].includes(indexed.hostname)&&indexed.pathname==='/news/apiclick.aspx'&&!indexed.username&&!indexed.password&&!indexed.port){target=indexed.searchParams.get('url')??'';}
     new WorkerPublicSourceFetch(target);
     const host=new URL(target).hostname;if(host==='bing.com'||host.endsWith('.bing.com'))return [];
    }catch{return [];}
    return [{url:target,title:item.title,excerpt:(item.body||item.excerpt||'').slice(0,1000)}];
   }).slice(0,30);
   if(items.length)try{await cache?.put(key,Response.json(items,{headers:{'cache-control':'public, max-age=60'}}));}catch{}
   return {items,available:items.length>0};
  }catch{return {items:[],available:false};}
 };
 const newsRss=rssIndex('news'),webRss=rssIndex('web');
 const directory=(async()=>{
 // Public directory contents are an index, not an institution keyword shortcut.
 // Search names against that index even when the user omits the institution.
 if(/\baub\b|american university of beirut/i.test(query)||(query.match(/[\p{L}\p{N}]+/gu)?.length??0)>=2){
  try{
   const url='https://www.aub.edu.lb/msfea/Pages/AI-Researchers-at-MSFEA.aspx';
   const key=new Request('https://source-directory-cache.invalid/aub-msfea-v1');
   try{const saved=await cache?.match(key);if(saved)return {items:await saved.json() as ReturnType<typeof parseDirectorySearchHtml>,available:true};}catch{}
   const response=await new WorkerPublicSourceFetch(url,recommendationFetch(fetcher,2500),{maxBytes:1_000_000}).get(url);
   if(response.status===200){const items=parseDirectorySearchHtml(response.body,url,'AUB');if(items.length){
    try{await cache?.put(key,Response.json(items,{headers:{'cache-control':'public, max-age=900'}}));}catch{}
    return {items,available:true};
   }}
  }catch{/* Other configured discovery routes remain available. */}
 }
 return {items:[],available:false};
 })();
 const found=await Promise.all([general,newsRss,webRss,directory]);
 return {items:[...new Map(found.flatMap(result=>result.items).map(item=>[item.url,item])).values()].slice(0,40),available:found.some(result=>result.available),accessIncomplete:!found[0].available&&!found[1].available&&!found[2].available};
}
