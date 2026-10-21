import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {runStorageMaintenance} from './storage-maintenance';
import {readFileSync} from 'node:fs';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
let objects:Map<string,string>;
let bucket:R2Bucket;
const now=new Date('2026-10-21T12:00:00Z');
beforeEach(async()=>{
 ctx=await createIntakeDatabase();
 await ctx.db.exec(readFileSync(new URL('../migrations/0060_storage_retention_indexes.sql',import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' '));
 await ctx.db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed-1',JSON.stringify({id:'feed-1',revision:1})).run();
 objects=new Map();
 bucket={put:vi.fn(async(key:string,value:string)=>{objects.set(key,value);return {key}}),get:vi.fn(async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null)} as unknown as R2Bucket;
});
afterEach(async()=>ctx.dispose());
function wait(id='wait',overrides:Record<string,unknown>={}){return {id,feedId:'feed-1',operationId:'operation-'+id,status:'DEFERRED',category:'MODEL_CAPACITY',failure:'SEMANTIC_CONTEXT_LIMIT',input:{kind:'RELATION',model:'model',evidenceRevisionIds:['evidence-1'],state:{text:'x'.repeat(20000)}},usage:{calls:0,costUsd:0,reported:true},createdAt:now.toISOString(),...overrides}}
async function insert(kind:string,value:Record<string,unknown>){await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind,value.id,'feed-1',JSON.stringify(value)).run()}
async function read(kind:string,id:string){const row=await ctx.db.prepare('SELECT json FROM v1_feed_documents WHERE kind=? AND id=?').bind(kind,id).first<{json:string}>();return row?JSON.parse(row.json):undefined}
const run=()=>runStorageMaintenance({DB:ctx.db,RAW_ARCHIVE:bucket},now);
it('archives exact payloads before compacting and preserves paid identities and published support',async()=>{
 const original=wait();await insert('semantic_resource_waits',original);
 await insert('semantic_intents',{...original,id:'paid'});await insert('editions',{id:'edition',evidenceRevisionIds:['evidence-1']});
 const result=await run(),saved=await read('semantic_resource_waits','wait');
 expect(result.archived).toBe(1);expect(result.bytesOffloaded).toBeGreaterThan(19000);
 expect(objects.get(saved.archiveKey)).toBe(JSON.stringify(original));expect(saved.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
 expect(saved.input).toEqual({kind:'RELATION',model:'model',evidenceRevisionIds:['evidence-1'],stateOmitted:true});
 expect(saved.operationId).toBe(original.operationId);expect(saved.usage).toEqual(original.usage);
 expect(await read('semantic_intents','paid')).toEqual({...original,id:'paid'});
 expect(await read('editions','edition')).toEqual({id:'edition',evidenceRevisionIds:['evidence-1']});
 await run();expect(bucket.put).toHaveBeenCalledTimes(1);
});
it.each(['write','verify'])('leaves SQL and its cursor intact when the archive %s fails',async(failure)=>{
 const original=wait();await insert('semantic_resource_waits',original);
 if(failure==='write')vi.mocked(bucket.put).mockRejectedValueOnce(Error('R2 unavailable'));
 else vi.mocked(bucket.get).mockResolvedValueOnce({text:async()=>'corrupt'} as R2ObjectBody);
 await expect(run()).rejects.toThrow();expect(await read('semantic_resource_waits','wait')).toEqual(original);
 expect(await ctx.db.prepare('SELECT key FROM settings').all()).toMatchObject({results:[]});
});
it('rolls back replacement if inserting the compact record fails',async()=>{
 const original=wait();await insert('semantic_resource_waits',original);
 await ctx.db.exec("CREATE TRIGGER compact_failure BEFORE INSERT ON v1_feed_documents WHEN json_extract(NEW.json,'$.archiveKey') IS NOT NULL BEGIN SELECT RAISE(ABORT,'fixture'); END");
 await expect(run()).rejects.toThrow();expect(await read('semantic_resource_waits','wait')).toEqual(original);
 expect(objects.size).toBe(1);
});
it('expires only unpaid diagnostics and dead ownership, retaining live renewals and unknown charges',async()=>{
 const old='2026-08-01T00:00:00Z';await insert('semantic_resource_waits',wait('old',{createdAt:old}));
 await insert('semantic_resource_waits',wait('unknown',{createdAt:old,usage:{calls:1,costUsd:.02,reported:false}}));
 await insert('semantic_work_leases',{id:'dead',leaseUntil:now.getTime()-2*86400000});
 await insert('semantic_work_releases',{id:'dead',token:'dead-token'});
 await insert('semantic_work_leases',{id:'live',parentLeaseId:'dead',leaseUntil:now.getTime()+90000});
 await ctx.db.prepare('INSERT INTO v1_queue_outcomes VALUES(?,?,?,?,?,?,?,?)').bind('old','v1_acquisition','job','feed-1',1,'RETRYABLE_WAIT','TEMPORARY_UNAVAILABLE',old).run();
 const result=await run();expect(result.expired).toBe(1);expect(result.expiredLeases).toBe(1);expect(result.expiredQueueOutcomes).toBe(1);
 expect(await read('semantic_resource_waits','old')).toBeUndefined();expect(await read('semantic_resource_waits','unknown')).toBeDefined();
 expect(await read('semantic_work_leases','dead')).toBeUndefined();expect(await read('semantic_work_releases','dead')).toBeUndefined();
 expect(await read('semantic_work_leases','live')).toBeDefined();expect(objects.size).toBe(1);
});
it('bounds each sweep and resumes at a durable cursor after a restart',async()=>{
 for(let i=0;i<55;i++)await insert('semantic_resource_waits',wait(String(i).padStart(3,'0')));
 expect((await run()).scanned).toBe(50);expect(await read('semantic_resource_waits','054')).toHaveProperty('input.state');
 const next=await run();expect(next.scanned).toBe(5);expect(next.total.archived).toBe(55);expect(next.total.cursor).toBe('');
 expect(await read('semantic_resource_waits','054')).toHaveProperty('archiveKey');
},15000);
