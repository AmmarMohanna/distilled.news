import {parseDirectorySearchHtml} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
export async function readWebSearch(query:string,fetcher:typeof fetch){
 if(/\baub\b|american university of beirut/i.test(query)){
  try{
   const url='https://www.aub.edu.lb/msfea/Pages/AI-Researchers-at-MSFEA.aspx';
   const response=await new WorkerPublicSourceFetch(url,recommendationFetch(fetcher,2500),{maxBytes:1_000_000}).get(url);
   if(response.status===200){const items=parseDirectorySearchHtml(response.body,url,'AUB');if(items.length)return {items,available:true};}
  }catch{/* Other configured discovery routes remain available. */}
 }
 return {items:[],available:false};
}
