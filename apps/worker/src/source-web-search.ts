import {parseDirectorySearchHtml} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
export async function readWebSearch(query:string,fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>){
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
}
