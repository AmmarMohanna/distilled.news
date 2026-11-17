import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {applyTestMigration} from '../test-migrations';
import {V1FeedStore} from './store';
import {orderedPendingWindows} from './window-delivery';
import type {BriefingRequest} from './runtime';

it('preserves pending order, backoff, unknown outcomes and scope while skipping completed history',async()=>{
 const ctx=await createIntakeDatabase();try{
  const store=new V1FeedStore(ctx.db),now='2026-10-28T12:30:00Z';
  for(const id of ['feed','other'])await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,'{"revision":1}').run();
  const window={start:'2026-10-28T12:00:00Z',end:now,kind:'30M'};
  const records=[
   {id:'a',state:'PENDING',reason:'SEMANTIC_OUTCOME_UNKNOWN'},
   {id:'b',state:'PENDING',nextAttemptAt:'2026-10-28T12:31:00Z'},
   {id:'c',state:'PENDING',nextAttemptAt:now},
   {id:'d',state:'DONE',result:'DEFERRED'},
   {id:'e',state:'FAILED'},
   {id:'f'},
   {id:'g',state:'PENDING',window:{...window,end:'2026-10-28T13:00:00Z'}},
   {id:'h',state:'PENDING',nextAttemptAt:'invalid'},
  ];
  for(const r of records)await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests',r.id,'feed',JSON.stringify({window,...r})).run();
  await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','foreign','other',JSON.stringify({id:'foreign',window,state:'PENDING'})).run();
  const baseline=orderedPendingWindows(await store.list<BriefingRequest>('feed','briefing_requests'),now);
  expect(baseline.map(r=>r.id)).toEqual(['a','c']);
  // No migration is required for correctness. The partial index supplies scaling.
  expect(orderedPendingWindows(await store.pendingBriefingRequests('feed'),now)).toEqual(baseline);
  for(const name of ['0074_unresolved_publication_windows.sql','0079_feed_document_order.sql'])await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
  const reports=[];
  for(const history of [0,1000,5000]){
   if(history)await ctx.db.prepare("INSERT INTO v1_feed_documents SELECT 'briefing_requests','terminal-'||n,'feed',json_object('id','terminal-'||n,'state','DONE','result','PUBLISHED','window',json(?),'padding',?) FROM (WITH RECURSIVE numbers(n) AS (SELECT ? UNION ALL SELECT n+1 FROM numbers WHERE n+1<?) SELECT n FROM numbers)").bind(JSON.stringify(window),'x'.repeat(4096),history===1000?0:1000,history).run();
   const queries:{rows:number;bytes:number}[]=[];
   const measured=new Proxy(ctx.db,{get(target,key){
    if(key==='prepare')return (sql:string)=>{const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(t,k){if(k==='bind')return (...args:unknown[])=>wrap(t.bind(...args));if(k==='all')return async()=>{const result=await t.all();queries.push({rows:result.meta.rows_read,bytes:Buffer.byteLength(JSON.stringify(result.results))});return result;};const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value;}});return wrap(target.prepare(sql));};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
   }});
   const old=await new V1FeedStore(measured).list<BriefingRequest>('feed','briefing_requests');
   const pending=await new V1FeedStore(measured).pendingBriefingRequests('feed');
   expect(orderedPendingWindows(pending,now)).toEqual(orderedPendingWindows(old,now));
   expect(pending.map(r=>r.id)).toEqual(['a','b','c','g','h']);
   expect(queries[1].rows).toBeLessThan(15);
   const windows=await new V1FeedStore(measured).unresolvedPublicationWindows('feed');
   expect(windows).toEqual(old.filter(r=>r.state!=='DONE'||r.result==='DEFERRED').map(r=>({window:r.window})));
   expect(queries[2].rows).toBeLessThan(15);
   reports.push({history,baseline:queries[0],pending:queries[1]});
  }
  expect(reports[2].pending).toEqual(reports[0].pending);
  const dir=new URL('../../../../.local-reports/v3-capacity-followup/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('pending-read-scaling.json',dir),JSON.stringify({scope:'Synthetic local D1. Equal pending and runnable decisions; no inference.',reports},null,2));
 }finally{await ctx.dispose()}
},60000);

it('does not hide unrelated database failures behind the migration fallback',async()=>{
 let queries=0;
 const failure=new Error('D1_ERROR: database is unavailable');
 const db={prepare(){return {bind(){return this},all(){queries++;throw failure}}}} as unknown as D1Database;
 const store=new V1FeedStore(db);
 await expect(store.pendingBriefingRequests('feed')).rejects.toBe(failure);
 await expect(store.unresolvedPublicationWindows('feed')).rejects.toBe(failure);
 expect(queries).toBe(2);
});
