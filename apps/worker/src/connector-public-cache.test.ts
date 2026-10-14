import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sharedPublicHttp,expireSharedPublicFetches} from './connector-public-cache';

const databases:DatabaseSync[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
function setup(){
 let claimReads=0;
 const sqlite=new DatabaseSync(':memory:');databases.push(sqlite);
 sqlite.exec('CREATE TABLE connector_public_fetch_cache(cache_key TEXT PRIMARY KEY,lease_until INTEGER DEFAULT 0,token TEXT,expires_at INTEGER DEFAULT 0,payload_key TEXT,status INTEGER,headers TEXT)');
 sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 const db={prepare:(sql:string)=>{let args:unknown[]=[];const statement={bind:(...v:unknown[])=>{args=v;return statement},first:async()=>{const row=sqlite.prepare(sql).get(...args as any[])??null;if(sql.startsWith('INSERT INTO connector_public_fetch_cache'))claimReads++;return row;},all:async()=>({results:sqlite.prepare(sql).all(...args as any[])}),run:async()=>({meta:sqlite.prepare(sql).run(...args as any[])})};return statement},batch:async(statements:any[])=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 const objects=new Map<string,Uint8Array>();
 const bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b)},get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer}:null},delete:async(k:string)=>{objects.delete(k)}} as unknown as R2Bucket;
 return {db,bucket,objects,sqlite,get claimReads(){return claimReads}};
}
const response=(status=200,headers:Record<string,string>={})=>({status,headers,bytes:new TextEncoder().encode('article'),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});

it('keeps conditional responses separate from unconditional requests',async()=>{
 const s=setup();let calls=0;
 const http=sharedPublicHttp(s.db,s.bucket,{get:async(_u,h)=>{calls++;return response(h['if-none-match']?304:200)}},async()=>{},()=>1000);
 expect((await http.get('https://example.com/article',{'if-none-match':'v1'})).status).toBe(304);
 expect((await http.get('https://example.com/article',{})).status).toBe(200);
 await http.get('https://example.com/article',{'if-none-match':'v1'});expect(calls).toBe(2);
});

it('does not share cookies, authenticated requests or private origin responses',async()=>{
 for(const [requestHeaders,responseHeaders] of [[{cookie:'session'},{}],[{authorization:'Bearer private'},{}],[{}, {'cache-control':'private'}],[{}, {'set-cookie':'session=private'}],[{}, {vary:'Cookie'}]] as [Record<string,string>,Record<string,string>][]){
  const s=setup();let calls=0;
  const http=sharedPublicHttp(s.db,s.bucket,{get:async()=>{calls++;return response(200,responseHeaders)}},async()=>{},()=>1000);
  await http.get('https://example.com/article',requestHeaders);await http.get('https://example.com/article',requestHeaders);
  expect(calls).toBe(2);expect(s.objects.size).toBe(0);
 }
});

it('single-flights concurrent misses and rechecks authorization after transport',async()=>{
 const s=setup();let release!:(r:ReturnType<typeof response>)=>void,calls=0,approved=true;
 const http=sharedPublicHttp(s.db,s.bucket,{get:async()=>{calls++;return new Promise(resolve=>{release=resolve})}},async()=>{if(!approved)throw Error('REVOKED')},()=>1000);
 const first=http.get('https://example.com/article',{});
 while(!release)await new Promise(resolve=>setTimeout(resolve,1));
 const second=http.get('https://example.com/article',{});
 // Attach both rejection handlers before transport settles. A revoked owner
 // publishes no cache entry, so its waiter must retry without refetching here.
 const outcomes=Promise.allSettled([first,second]);
 await vi.waitFor(()=>expect(s.claimReads).toBe(2));
 approved=false;release(response());
 expect((await outcomes).map(result=>result.status==='rejected'?result.reason.message:'fulfilled')).toEqual(['REVOKED','TEMPORARY_UNAVAILABLE']);
 expect(calls).toBe(1);expect(s.objects.size).toBe(0);
});

it('expiry cleanup removes only the old immutable generation',async()=>{
 const s=setup();await sharedPublicHttp(s.db,s.bucket,{get:async()=>response()},async()=>{},()=>1000).get('https://example.com/article',{});
 expect(s.objects.size).toBe(1);await expireSharedPublicFetches(s.db,s.bucket,4_000_000);
 expect(s.objects.size).toBe(0);expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM connector_public_fetch_cache').get()).toEqual({n:0});
});
