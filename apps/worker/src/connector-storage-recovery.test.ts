import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {expect,it} from 'vitest';
import {authorizeConnectorStorageCanary,consumeConnectorStorageCanary} from './connector-storage-recovery';

it.each([true,false])('opens a single grant only when SQLite can reuse real freed pages (%s)',async reusable=>{
  const sqlite=new DatabaseSync(':memory:');
  try {
    sqlite.exec(`PRAGMA auto_vacuum=NONE;
      CREATE TABLE briefings(id TEXT PRIMARY KEY,paused INTEGER);
      CREATE TABLE sources(id TEXT PRIMARY KEY,briefing_id TEXT,enabled INTEGER,collection_owner TEXT);
      INSERT INTO briefings VALUES('feed',0);
      INSERT INTO sources VALUES('source','feed',1,'connector');
      CREATE TABLE connector_storage_recovery(id INTEGER PRIMARY KEY,token TEXT,feed_id TEXT,source_id TEXT,until_ms INTEGER,state TEXT,allocated_bytes INTEGER);
      CREATE TABLE connector_storage_probe(id INTEGER PRIMARY KEY,payload BLOB);
      CREATE TABLE fixture(payload BLOB);`);
    const allocated=()=>4096*Number(sqlite.prepare('PRAGMA page_count').get()?.page_count);
    if(reusable){
      sqlite.exec('INSERT INTO fixture SELECT zeroblob(524288) FROM json_each(\'[1,2,3,4,5,6,7,8,9,10]\')');
      const before=allocated();
      sqlite.exec('DELETE FROM fixture');
      expect(allocated()).toBe(before);
      expect(sqlite.prepare('PRAGMA freelist_count').get()?.freelist_count).toBeGreaterThan(1000);
    }
    const offset=9_020_000_000-allocated();
    const prepare=(sql:string,args:SQLInputValue[]=[])=>({
      bind:(...values:SQLInputValue[])=>prepare(sql,values),
      first:async()=>sqlite.prepare(sql).get(...args)??null,
      run:()=>({success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes),size_after:allocated()+offset}})
    });
    const db={prepare,batch:async(statements:ReturnType<typeof prepare>[])=>{
      sqlite.exec('BEGIN');
      try{const results=statements.map(statement=>statement.run());sqlite.exec('COMMIT');return results;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }} as unknown as D1Database;
    const now=1000;
    expect(await authorizeConnectorStorageCanary(db,'feed','source',now)).toBe(reusable);
    expect(await consumeConnectorStorageCanary(db,'other-feed',['source'],allocated()+offset,now)).toBeUndefined();
    expect(await consumeConnectorStorageCanary(db,'feed',['source'],allocated()+offset,now)).toBe(reusable?'source':undefined);
    expect(await consumeConnectorStorageCanary(db,'feed',['source'],allocated()+offset,now)).toBeUndefined();
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM connector_storage_probe').get()?.count).toBe(0);
  } finally { sqlite.close(); }
});
