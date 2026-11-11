import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {productPublicationState} from './product-feeds';
import type {Env} from './types';

it.each(['ACCOUNT_AUTHORIZATION_REQUIRED','ACCOUNT_RECOVERY_SCOPE_DENIED','ACCOUNT_RESOURCE_WAIT'])('surfaces %s as blocked instead of active preparation',async reason=>{
 const sqlite=new DatabaseSync(':memory:');
 try {
  sqlite.exec('CREATE TABLE v1_feed_documents(id TEXT,feed_id TEXT,kind TEXT,json TEXT)');
  sqlite.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').run('window','feed','briefing_requests',JSON.stringify({state:'PENDING',reason}));
  const db={prepare:(sql:string)=>({bind:(...args:string[])=>({first:async()=>sqlite.prepare(sql).get(...args)??null})})};
  expect(await productPublicationState({DB:db} as unknown as Env,'feed')).toBe('service_blocked');
 } finally {
  sqlite.close();
 }
});
