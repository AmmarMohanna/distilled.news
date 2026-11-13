import {WorkerPublicSourceFetch} from './public-source-fetch';
import {recommendationFetch} from './source-recommendation-fetch';
type Suggestions={suggestions:string[];unavailable:boolean};
export async function sourceQuerySuggestions(query:string,language:string,owner:string,fetcher:typeof fetch,cache?:Pick<Cache,'match'|'put'>,beforeFetch?:()=>Promise<void>):Promise<Suggestions>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,language,query.toLocaleLowerCase()])));
 const key=new Request('https://source-suggest-cache.invalid/'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
 try{const saved=await cache?.match(key);if(saved)return await saved.json() as Suggestions;}catch{}
 await beforeFetch?.();
 try{
  // Fixed public endpoint, no feed description, account data, cookies or paid route.
  const url=new URL('https://www.google.com/complete/search');
  url.search=new URLSearchParams({client:'firefox',q:query,hl:language}).toString();
  const page=await new WorkerPublicSourceFetch(url.href,recommendationFetch(fetcher,1500),{maxBytes:65536}).get(url.href);
  if(page.status!==200)return {suggestions:[],unavailable:true};
  const data:unknown=JSON.parse(page.body);
  if(!Array.isArray(data)||typeof data[0]!=='string'||data[0].toLocaleLowerCase()!==query.toLocaleLowerCase()||!Array.isArray(data[1]))return {suggestions:[],unavailable:true};
  const suggestions=[...new Set(data[1].filter((value:unknown):value is string=>typeof value==='string'&&value.trim().length>=2&&value.length<=200&&!/[<>\u0000-\u001f]/.test(value)).map((value:string)=>value.trim()))].slice(0,8);
  const result={suggestions,unavailable:false};
  try{await cache?.put(key,Response.json(result,{headers:{'cache-control':`public, max-age=${suggestions.length?600:60}`}}));}catch{}
  return result;
 }catch{return {suggestions:[],unavailable:true};}
}
