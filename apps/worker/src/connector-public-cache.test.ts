import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {PUBLIC_ARTICLE_HTML_MAX_BYTES} from '@distilled/connectors';
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

it.each(['access_token','api_key','apikey','token','authorization'])('explicit %s query credentials bypass shared storage across approved feeds',async credential=>{
 const s=setup();let calls=0,approvals=0;
 const transport={get:async()=>{calls++;return response()}};
 const url='https://example.com/feed.xml?'+credential+'=synthetic-private-value';
 const first=sharedPublicHttp(s.db,s.bucket,transport,async()=>{approvals++},()=>1000);
 const other=sharedPublicHttp(s.db,s.bucket,transport,async()=>{approvals++},()=>1000);
 await first.get(url,{});await other.get(url,{});
 expect(calls).toBe(2);expect(approvals).toBe(4);expect(s.objects.size).toBe(0);
 expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM connector_public_fetch_cache').get()).toEqual({n:0});
});
it('ordinary public search and page queries still share approved bytes',async()=>{
 const s=setup();let calls=0;
 const transport={get:async()=>{calls++;return response()}};
 const url='https://example.com/feed.xml?q=AI+news&page=2';
 await sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000).get(url,{});
 await sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000).get(url,{});
 expect(calls).toBe(1);expect(s.objects.size).toBe(1);
});
it('a cache populated by a larger transport cannot exceed a later caller response cap',async()=>{
 const s=setup();let calls=0;const transport={get:async()=>{calls++;return response()}};
 await sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000).get('https://example.com/size',{});
 const small=sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000,3);
 await expect(small.get('https://example.com/size',{})).rejects.toThrow('FEED_TOO_LARGE');
 expect(calls).toBe(1);
});
it('a cache waiter independently enforces its smaller response cap',async()=>{
 const s=setup();let release!:(r:ReturnType<typeof response>)=>void,calls=0;
 const transport={get:async()=>{calls++;return new Promise<ReturnType<typeof response>>(resolve=>{release=resolve})}};
 const large=sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000).get('https://example.com/wait-size',{});
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 const small=sharedPublicHttp(s.db,s.bucket,transport,async()=>{},()=>1000,3).get('https://example.com/wait-size',{});
 const outcome=expect(small).rejects.toThrow('FEED_TOO_LARGE');
 await vi.waitFor(()=>expect(s.claimReads).toBe(2));release(response());
 await large;await outcome;expect(calls).toBe(1);
});
it.each([{attempts:0},{attempts:6},{timeoutMs:0},{timeoutMs:60001}])('cached responses cannot bypass invalid transport limits %j',async bounds=>{
 const s=setup(),http=sharedPublicHttp(s.db,s.bucket,{get:async()=>response()},async()=>{},()=>1000);
 await http.get('https://example.com/limits',{});
 await expect(http.get('https://example.com/limits',{},bounds)).rejects.toThrow('INVALID_HTTP_LIMITS');
});

it('accepts the article runtime limit and reuses large public HTML through the cache',async()=>{
 const s=setup(),bytes=new TextEncoder().encode('<article>'+ 'x'.repeat(8_000_000)+'</article>');let calls=0;
 const upstream={get:async()=>{calls++;return {...response(),bytes}}};
 const http=sharedPublicHttp(s.db,s.bucket,upstream,async()=>{},()=>1000,PUBLIC_ARTICLE_HTML_MAX_BYTES);
 expect((await http.get('https://example.com/article',{})).bytes.byteLength).toBe(bytes.byteLength);
 expect((await http.get('https://example.com/article',{})).bytes.byteLength).toBe(bytes.byteLength);
 expect(calls).toBe(1);
});
it('keeps general requests bounded at two MB and rejects configured limits above the article maximum',async()=>{
 const s=setup(),upstream={get:async()=>({...response(),bytes:new Uint8Array(2_000_001)})};
 await expect(sharedPublicHttp(s.db,s.bucket,upstream,async()=>{}).get('https://example.com/article',{})).rejects.toThrow('FEED_TOO_LARGE');
 await expect(sharedPublicHttp(s.db,s.bucket,upstream,async()=>{},Date.now,PUBLIC_ARTICLE_HTML_MAX_BYTES+1).get('https://example.com/article',{})).rejects.toThrow('INVALID_HTTP_LIMITS');
});
