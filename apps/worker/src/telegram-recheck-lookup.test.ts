import {expect,it} from 'vitest';
import {D1ProviderPollScheduler,sourceSqlFromD1,type SourceFetchRequest} from '@distilled/connectors';
import {createIntakeDatabase,seedIntakeScope,scopeFixture} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {scheduleRecentTelegramRecheck} from './connector-runtime';

it('Telegram conflict recheck seeks only same-source pending authoritative jobs in stable ID order',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
 const store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await store.registerScope({...scopeFixture,feedId:'other-feed',feedSourceId:'other-source'});
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<7000)
 INSERT INTO v1_jobs(id,feed_source_id,item_key,json)
 SELECT 'other-'||n,'other-source','telegram:-100123:'||n,json_object('kind','AUTHORITATIVE_RECHECK','state','PENDING') FROM history`).run();
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<7000)
 INSERT INTO v1_jobs(id,feed_source_id,item_key,json)
 SELECT 'retained-'||printf('%05d',n),'feed-source-1','telegram:-100123:'||n,json_object('kind','AUTHORITATIVE_RECHECK','state','PENDING') FROM history`).run();
 await ctx.db.prepare('INSERT INTO connector_item_fingerprints VALUES(?,?,?,?,?,?,?)').bind('feed-1','feed-source-1','source-1','telegram:-100123:9',1,'fingerprint',1).run();
 let rows=0;const plans:string[]=[];
 const db=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>{
   const statement=target.prepare(sql);if(!sql.startsWith('SELECT DISTINCT item_key AS key FROM v1_jobs'))return statement;
   return {bind:(...args:unknown[])=>({all:async()=>{const result=await statement.bind(...args).all();rows=result.meta.rows_read;const plan=await target.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all<{detail:string}>();plans.push(...plan.results.map(r=>r.detail));return result;}})};
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const scheduler=new D1ProviderPollScheduler(sourceSqlFromD1(ctx.db),{collect:async()=>{throw Error('must not fetch')}},async()=>true);
 const request:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'feed-source-1',sourceId:'source-1'},configurationRevision:1,runId:'telegram-run',source:{family:'telegram',locator:'telegram',channelId:'-100123',public:true},requestedBounds:{},limit:3};
 expect(await scheduleRecentTelegramRecheck(db,scheduler,request,new Date('2026-10-10T08:00:00Z'))).toBe(true);
 console.info(JSON.stringify({telegramConflictLookupRows:rows,plans}));
 expect(rows).toBeLessThan(20);
 for(const [id,key,kind,state]of [['a','4','AUTHORITATIVE_RECHECK','PENDING'],['b','4','AUTHORITATIVE_RECHECK','PENDING'],['c','7','AUTHORITATIVE_RECHECK','PENDING'],['d','2','AUTHORITATIVE_RECHECK','PENDING'],['e','8','AUTHORITATIVE_RECHECK','PENDING'],['f','3','AUTHORITATIVE_RECHECK','DONE'],['g','1','ACQUIRE','PENDING']] as const){
  await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(id,'feed-source-1',`telegram:-100123:${key}`,JSON.stringify({kind,state})).run();
 }
 expect(await scheduleRecentTelegramRecheck(db,scheduler,request,new Date('2026-10-11T08:00:00Z'))).toBe(true);
 const jobs=await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs ORDER BY due_at').all<{request:string}>();
 expect(jobs.results.map(r=>JSON.parse(r.request).recheckItemKeys)).toEqual([['telegram:-100123:1','telegram:-100123:2','telegram:-100123:3'],['telegram:-100123:4','telegram:-100123:7','telegram:-100123:2']]);
 expect(rows).toBeLessThan(20);
 }finally{await ctx.dispose()}
});
