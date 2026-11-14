import type {searchSourceCandidates} from './source-search';
type Result=Awaited<ReturnType<typeof searchSourceCandidates>>;
/** Per-owner, deployment-local ephemeral search cache. No raw query in keys,
 * private feed reads, persistent database rows or module-level request state.
 */
async function cacheKey(owner:string,query:string,origin:string,kind='results'){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['search-v6-directory-index',kind,owner,query.trim().toLocaleLowerCase().replace(/\s+/g,' ')])));
 const digest=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 return new Request(new URL('/__source-search-cache/'+digest,origin));
}
export async function readSourceSearchCache(owner:string,query:string,origin:string,cache?:Pick<Cache,'match'>):Promise<Result|undefined>{
 try{const saved=await cache?.match(await cacheKey(owner,query,origin));return saved?await saved.json() as Result:undefined;}catch{return;}
}
export async function cachedSourceSearch(owner:string,query:string,origin:string,load:()=>Promise<Result>,cache?:Pick<Cache,'match'|'put'>,checkCached?:(result:Result)=>Promise<Result>,kind='results'):Promise<Result>{
 const key=await cacheKey(owner,query,origin,kind);
 try{const saved=await cache?.match(key);if(saved){const result=await saved.json() as Result;return checkCached?await checkCached(result):result;}}catch{/* A cache failure cannot disable search. */}
 const result=await load();
 if(!result.unavailable&&!result.accessIncomplete)try{await cache?.put(key,Response.json(result,{headers:{'cache-control':'public, max-age=120'}}));}catch{/* Transient optimization only. */}
 return result;
}
