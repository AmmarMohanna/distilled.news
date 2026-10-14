import {sha256,HandoffError} from '@distilled/contracts';
import type {FeedHttpPort} from '@distilled/connectors';
// Notification only: each waiter reloads durable bytes and checks its own
// authorization. The D1 lease remains the cross-isolate fetch authority.
const publicFetches=new WeakMap<D1Database,Map<string,Promise<void>>>();

/** Public HTTP bytes only. No sessions, paid results, feed receipts, cursors or
 * editorial state are shared. Authorization is rechecked on every cache read. */
export function sharedPublicHttp(db:D1Database,bucket:R2Bucket,http:FeedHttpPort,
 authorize:(url:string)=>Promise<void>,now=Date.now):FeedHttpPort {
 return {get:async(url,headers,bounds)=>{
  await authorize(url);
  // Anonymous validators are part of the key: a 304 may only be reused by
  // another consumer presenting precisely the same validator, never a newcomer.
  if(Object.keys(headers).some(k=>!['accept','accept-language','if-none-match','if-modified-since'].includes(k.toLowerCase()))){const response=await http.get(url,headers,bounds);await authorize(url);return response;}
  const normalized=Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]).sort(([a],[b])=>a.localeCompare(b));
  const key=await sha256(JSON.stringify(['public-http-v1',url,normalized]));
  const load=()=>db.prepare('SELECT expires_at,payload_key,status,headers FROM connector_public_fetch_cache WHERE cache_key=?').bind(key).first<{expires_at:number;payload_key:string|null;status:number;headers:string}>();
  const cached=await load();
  if(cached?.payload_key&&cached.expires_at>now()){
   const object=await bucket.get(cached.payload_key);
   if(object){const bytes=new Uint8Array(await object.arrayBuffer());await authorize(url);return {status:cached.status,headers:JSON.parse(cached.headers),bytes,telemetry:{requests:0,latencyMs:0,providerCostUsd:0,status:cached.status}};}
  }
  const token=crypto.randomUUID(),at=now();
  const claim=await db.prepare(`INSERT INTO connector_public_fetch_cache(cache_key,lease_until,token) VALUES(?,?,?)
   ON CONFLICT(cache_key) DO UPDATE SET lease_until=excluded.lease_until,token=excluded.token WHERE lease_until<=? RETURNING cache_key`).bind(key,at+90_000,token,at).first();
  if(!claim){
   const active=publicFetches.get(db)?.get(key);
   if(active){
    const timeout=bounds?.timeoutMs??15_000;if(!Number.isInteger(timeout)||timeout<1||timeout>60_000)throw Error('INVALID_HTTP_LIMITS');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([active,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HandoffError('TEMPORARY_UNAVAILABLE')),timeout);})]);}
    finally{if(timer)clearTimeout(timer);}
   }
   const completed=await load();
   if(completed?.payload_key&&completed.expires_at>now()){
    const object=await bucket.get(completed.payload_key);
    if(object){const bytes=new Uint8Array(await object.arrayBuffer());await authorize(url);return {status:completed.status,headers:JSON.parse(completed.headers),bytes,telemetry:{requests:0,latencyMs:0,providerCostUsd:0,status:completed.status}};}
   }
   // Other isolates retain durable retry/backoff rather than duplicate fetches.
   throw new HandoffError('TEMPORARY_UNAVAILABLE');
  }
  let completed!:()=>void;
  const active=new Promise<void>(resolve=>{completed=resolve}),flights=publicFetches.get(db)??new Map<string,Promise<void>>();
  publicFetches.set(db,flights);flights.set(key,active);
  try{
   const response=await http.get(url,headers,bounds);
   await authorize(url);
   // Origin privacy/cache directives apply even to nominally public URLs.
   const cacheControl=response.headers['cache-control']??'',maxAge=cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
   if([200,304].includes(response.status)&&!/(?:private|no-store|no-cache)/i.test(cacheControl)&&(!maxAge||Number(maxAge[1])>0)&&!response.headers['set-cookie']&&!(response.headers.vary??'').split(',').some(v=>v.trim()&&!['accept','accept-language'].includes(v.trim().toLowerCase()))){
    const objectKey=`connector-public-cache/${key}/${token}`;
    await bucket.put(objectKey,response.bytes);
    const saved=await db.prepare('UPDATE connector_public_fetch_cache SET payload_key=?,status=?,headers=?,expires_at=?,lease_until=0 WHERE cache_key=? AND token=?').bind(objectKey,response.status,JSON.stringify(response.headers),now()+Math.min(60_000,maxAge?Number(maxAge[1])*1000:60_000),key,token).run();
    if(saved.meta.changes===0)await bucket.delete(objectKey);
    else if(cached?.payload_key&&cached.payload_key!==objectKey)await bucket.delete(cached.payload_key);
   }
   return response;
  }finally{
   try{await db.prepare('UPDATE connector_public_fetch_cache SET lease_until=0 WHERE cache_key=? AND token=?').bind(key,token).run();}
   finally{if(flights.get(key)===active)flights.delete(key);completed();}
  }
 }};
}

export async function expireSharedPublicFetches(db:D1Database,bucket:R2Bucket,now=Date.now()){
 // Remove the index entry atomically before deleting its immutable generation.
 // A concurrent refresh can then install a new generation without its payload
 // being mistaken for the expired object selected by cleanup.
 const rows=await db.prepare('DELETE FROM connector_public_fetch_cache WHERE cache_key IN (SELECT cache_key FROM connector_public_fetch_cache WHERE expires_at<? AND lease_until<=? ORDER BY expires_at LIMIT 100) RETURNING payload_key').bind(now-3600_000,now).all<{payload_key:string|null}>();
 for(const row of rows.results){
  if(row.payload_key)await bucket.delete(row.payload_key);
 }
}
