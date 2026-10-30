import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sharedGoogleArticleResolver} from './google-article-resolution';
const databases:DatabaseSync[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
function setup(){
 const sqlite=new DatabaseSync(':memory:');databases.push(sqlite);
 sqlite.exec('CREATE TABLE connector_public_fetch_cache(cache_key TEXT PRIMARY KEY,lease_until INTEGER DEFAULT 0,token TEXT,expires_at INTEGER DEFAULT 0,payload_key TEXT,status INTEGER,headers TEXT)');
 const db={prepare:(sql:string)=>{let args:unknown[]=[];const statement={bind:(...v:unknown[])=>{args=v;return statement},first:async()=>sqlite.prepare(sql).get(...args as any[])??null,run:async()=>({meta:sqlite.prepare(sql).run(...args as any[])})};return statement;}} as unknown as D1Database;
 const objects=new Map<string,Uint8Array>();
 const bucket={put:async(k:string,b:Uint8Array)=>objects.set(k,b.slice()),get:async(k:string)=>{const b=objects.get(k);return b?{size:b.length,arrayBuffer:async()=>b.slice().buffer}:null},delete:async(k:string)=>{objects.delete(k)}} as unknown as R2Bucket;
 return {db,bucket,sqlite,objects};
}
const listing='https://news.google.com/rss/articles/ArticleA?oc=5',publisher='https://publisher.example/news/report';
const success=(url=publisher)=>({results:[{inputUrl:listing,url}]});
it('reuses an attested link across calls without occupying the helper and revalidates source authority',async()=>{
 const s=setup();let now=1000;const execute=vi.fn(async()=>success()),authorize=vi.fn(async()=>{});
 const resolve=sharedGoogleArticleResolver(s.db,s.bucket,{execute},authorize,()=>now);
 expect(await resolve(listing)).toEqual({inputUrl:listing,url:publisher});now+=120000;
 expect(await resolve(listing)).toEqual({inputUrl:listing,url:publisher});expect(execute).toHaveBeenCalledTimes(1);
 authorize.mockRejectedValueOnce(Error('REVOKED'));
 await expect(resolve(listing)).rejects.toThrow('REVOKED');expect(execute).toHaveBeenCalledTimes(1);
 now+=3600_000;await resolve(listing);expect(execute).toHaveBeenCalledTimes(2);
});
it('never caches missing, unrelated or private target resolutions',async()=>{
 const s=setup();const execute=vi.fn().mockResolvedValueOnce({results:[]}).mockResolvedValueOnce(success('https://127.0.0.1/private')).mockResolvedValueOnce({results:[{inputUrl:listing+'wrong',url:publisher}]}).mockResolvedValueOnce(success());
 const resolve=sharedGoogleArticleResolver(s.db,s.bucket,{execute},async()=>{});
 await expect(resolve(listing)).rejects.toMatchObject({code:'TRANSIENT'});
 await expect(resolve(listing)).rejects.toMatchObject({code:'MALFORMED'});
 await expect(resolve(listing)).rejects.toMatchObject({code:'TRANSIENT'});
 expect(s.objects.size).toBe(0);await expect(resolve(listing)).resolves.toEqual({inputUrl:listing,url:publisher});
});
it('coalesces competing isolates with durable backpressure and does not start a second resolution',async()=>{
 const s=setup();let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const execute=vi.fn(async()=>{entered();await gate;return success()});
 const first=sharedGoogleArticleResolver(s.db,s.bucket,{execute},async()=>{});
 const otherDb={prepare:s.db.prepare.bind(s.db)} as D1Database;
 const second=sharedGoogleArticleResolver(otherDb,s.bucket,{execute},async()=>{});
 const pending=first(listing);await started;
 await expect(second(listing)).rejects.toMatchObject({code:'BACKPRESSURE',diagnostic:{detail:'GOOGLE_RESOLUTION_IN_FLIGHT'}});
 expect(execute).toHaveBeenCalledTimes(1);release();await pending;
 expect(await second(listing)).toEqual({inputUrl:listing,url:publisher});expect(execute).toHaveBeenCalledTimes(1);
});
it('keeps distinct listing identities separate and rejects credential-bearing or arbitrary query URLs',async()=>{
 const s=setup();const execute=vi.fn(async(_kind,_input:any)=>({results:[{inputUrl:_input.urls[0],url:publisher}]}));
 const resolve=sharedGoogleArticleResolver(s.db,s.bucket,{execute},async()=>{});
 await resolve(listing);await resolve(listing.replace('ArticleA','ArticleB'));expect(execute).toHaveBeenCalledTimes(2);
 for(const url of [listing+'&token=secret',listing.replace('news.google.com','other.example'),'https://user:secret@news.google.com/articles/ArticleA'])await expect(resolve(url)).rejects.toMatchObject({code:'MALFORMED'});
 expect(execute).toHaveBeenCalledTimes(2);
});
