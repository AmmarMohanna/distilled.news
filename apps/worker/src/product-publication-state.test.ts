import {it,expect} from 'vitest';import {DatabaseSync} from 'node:sqlite';import {productPublicationState} from './product-feeds';import type {Env} from './types';
it('does not call pending publication failed solely because a source has incomplete coverage',async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
 sqlite.exec('CREATE TABLE v1_feed_documents(id TEXT,feed_id TEXT,kind TEXT,json TEXT)');
 const row={id:'window',state:'PENDING',coverage:{state:'INCOMPLETE'},createdAt:'2026-10-27T12:00:00Z'};
 sqlite.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').run('window','feed','briefing_requests',JSON.stringify(row));
 const db={prepare:(sql:string)=>{let args:any[]=[];const statement={bind:(...v:any[])=>{args=v;return statement},first:async()=>sqlite.prepare(sql).get(...args)??null};return statement}} as unknown as D1Database;
 expect(await productPublicationState({DB:db} as Env,'feed')).toBe('checking');
 sqlite.prepare('UPDATE v1_feed_documents SET json=?').run(JSON.stringify({...row,state:'DONE',result:'QUIET'}));expect(await productPublicationState({DB:db} as Env,'feed')).toBe('failed');
 sqlite.prepare('UPDATE v1_feed_documents SET json=?').run(JSON.stringify({...row,state:'FAILED'}));expect(await productPublicationState({DB:db} as Env,'feed')).toBe('failed');
 }finally{sqlite.close()}
});
