/** Per-isolate cache for the public feed page.
 *
 * Why memory and not the Cache API: the Cache API is a no-op on *.workers.dev
 * hosts, which is where QA runs, and it would need a purge on withdrawal.
 * Here every entry is keyed by the feed's read version (migration 0095), which
 * triggers bump on any edition or publication-status write, so a publish or a
 * withdrawal is visible on the next request with no purge.
 *
 * What is cached is data only. Access checks, the viewer's star and the
 * feed's own settings are still read on every request by the route.
 *
 * Concurrent misses for the same key share one build, so a burst of readers on
 * one feed costs one set of D1 reads per isolate instead of one per reader. */
import type {Env} from './types';

interface Entry<T> {value:T;expires:number;bytes:number;seq:number}
const MAX_ENTRIES=256;
const MAX_BYTES=24*1024*1024;
/** Even with a version key, citation display names and catalog labels can be
 * repaired in place. Bound how long such cosmetic changes can stay hidden. */
const EDITIONS_MAX_AGE_MS=5*60_000;
const DEFAULT_STATUS_SECONDS=15;

class MemoCache {
 private entries=new Map<string,Entry<unknown>>();
 private inflight=new Map<string,Promise<Entry<unknown>>>();
 private bytes=0;private seq=0;
 async get<T>(key:string,ttlMs:number,build:()=>Promise<T>,now=Date.now()):Promise<{value:T;seq:number;hit:boolean}> {
  const found=this.entries.get(key);
  if(found&&found.expires>now){
   // Refresh LRU position.
   this.entries.delete(key);this.entries.set(key,found);
   return {value:found.value as T,seq:found.seq,hit:true};
  }
  if(found)this.remove(key);
  let pending=this.inflight.get(key) as Promise<Entry<T>>|undefined;
  const shared=Boolean(pending);
  if(!pending){
   pending=build().then(value=>{
    const bytes=approximateBytes(value),entry:Entry<T>={value,expires:Date.now()+ttlMs,bytes,seq:++this.seq};
    if(bytes<=MAX_BYTES/4){this.entries.set(key,entry);this.bytes+=bytes;this.evict();}
    return entry;
   }).finally(()=>{this.inflight.delete(key);});
   this.inflight.set(key,pending as Promise<Entry<unknown>>);
  }
  const entry=await pending;
  return {value:entry.value,seq:entry.seq,hit:shared};
 }
 clear(){this.entries.clear();this.inflight.clear();this.bytes=0;}
 get size(){return this.entries.size}
 private remove(key:string){const entry=this.entries.get(key);if(entry){this.bytes-=entry.bytes;this.entries.delete(key);}}
 private evict(){
  for(const key of this.entries.keys()){
   if(this.entries.size<=MAX_ENTRIES&&this.bytes<=MAX_BYTES)break;
   this.remove(key);
  }
 }
}

function approximateBytes(value:unknown):number {
 try{return JSON.stringify(value)?.length??0}catch{return MAX_BYTES}
}

const cache=new MemoCache();

export function feedReadCacheEnabled(env:Env):boolean {return env.FEED_READ_CACHE_ENABLED==='true'}

/** One indexed primary-key read. A feed with no publication writes since
 * migration 0095 reads as version 0, which is still a stable key. */
export async function feedReadVersion(db:D1Database,feedId:string):Promise<number> {
 const row=await db.prepare('SELECT version FROM v1_feed_read_versions WHERE feed_id=?').bind(feedId).first<{version:number}>();
 return row?.version??0;
}

/** An isolate serves one deployment and one D1 database, so feed id and version identify the data. */
export function cachedFeedEditions<T>(feedId:string,version:number,build:()=>Promise<T>) {
 return cache.get(`editions:${feedId}:${version}`,EDITIONS_MAX_AGE_MS,build);
}

/** Collection status and progress change with background work, not with
 * publication, so they get a short time-to-live instead of a version alone. */
export function cachedFeedStatus<T>(env:Env,feedId:string,version:number,build:()=>Promise<T>,scope:'status'|'source-diagnostics'|'timeline-status'='status') {
 const seconds=Number(env.FEED_STATUS_CACHE_SECONDS??DEFAULT_STATUS_SECONDS);
 const ttl=Number.isFinite(seconds)&&seconds>=0&&seconds<=120?seconds*1000:DEFAULT_STATUS_SECONDS*1000;
 return cache.get(`${scope}:${feedId}:${version}`,ttl,build);
}

/** Small, stable, non-cryptographic hash for ETags of non-secret public data. */
export function fnv1a(text:string):string {
 let hash=0x811c9dc5;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}
 return hash.toString(36);
}

export function resetFeedReadCacheForTests(){cache.clear()}
export function feedReadCacheSizeForTests(){return cache.size}
