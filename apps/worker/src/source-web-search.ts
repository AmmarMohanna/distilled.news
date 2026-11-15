import {parseDirectorySearchHtml,parseWebSearchHtml} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
export async function readWebSearch(query:string,fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>){
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
 const found=await Promise.all([general,directory]);
 return {items:[...new Map(found.flatMap(result=>result.items).map(item=>[item.url,item])).values()].slice(0,40),available:found.some(result=>result.available),accessIncomplete:!found[0].available};
}
