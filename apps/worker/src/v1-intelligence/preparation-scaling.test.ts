import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {prepareV3Window} from './v3-window';
import {prepareArticles,selectPrior} from '@distilled/briefing';
it('measures preparation growth with equal new evidence and irrelevant published history',async()=>{
 const ctx=await createIntakeDatabase();try{
 await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,createdAt:'2026-08-01T00:00:00Z'});await acceptEvidence(store,1,'Parliament approved banking reform; presidential approval remains necessary.','publisher','2026-10-03T12:10:00Z','en','2026-10-03T12:05:00Z');
 const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
 let measured:{sql:string;rowsRead:number;bytes:number}[]=[];
 const wrap=(s:D1PreparedStatement,sql:string):D1PreparedStatement=>new Proxy(s,{get(target,key){if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args),sql);if(key==='all')return async()=>{const r=await target.all();measured.push({sql,rowsRead:r.meta.rows_read,bytes:Buffer.byteLength(JSON.stringify(r.results))});return r;};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 const tracked=new V1FeedStore({prepare(sql:string){return wrap(ctx.db.prepare(sql),sql)}} as D1Database);
 let expected:unknown;const results=[];
 for(const history of [0,100,500]){
  const old=await ctx.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='editions'").first<{n:number}>();
  for(let i=old!.n;i<history;i+=25){const statements=[];for(let j=i;j<Math.min(i+25,history);j++){const id='old-'+String(j).padStart(4,'0'),at='2026-08-01T00:30:00Z';const edition={id,createdAt:at,windowEnd:at,stories:[{candidateId:id,claims:[{text:'Old unrelated published development. '+ 'x'.repeat(1024)}]}],evidenceRevisionIds:[]};statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('editions',id,'feed-1',JSON.stringify(edition)),ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('publication_status',id,'feed-1',JSON.stringify({id,status:'PUBLISHED'})));}await ctx.db.batch(statements);}
  measured=[];const start=performance.now();const prepared=await prepareV3Window(tracked,'feed-1',window,window.end);const elapsedMs=performance.now()-start;
  const articles=prepareArticles(prepared.input.articles,{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}).prepared;
  const meaningful={articles:prepared.input.articles,selectedPrior:selectPrior(prepared.input.prior??[],articles,new Date(window.end))};if(expected===undefined)expected=meaningful;else expect(meaningful).toEqual(expected);
  results.push({history,elapsedMs,measuredAllRowsRead:measured.reduce((n,r)=>n+r.rowsRead,0),returnedBytes:measured.reduce((n,r)=>n+r.bytes,0),queries:measured});
 }
 const dir=new URL('../../../../.local-reports/v3-selective-query-investigation/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('preparation-scaling.json',dir),JSON.stringify({scope:'Synthetic local Miniflare; all() reads only; first() excluded. Equal one new article; older-than-memory unrelated history; no inference. Raw snapshots intentionally differ in prior; effective reader memory is equal.',results},null,2));
 expect(results[2].returnedBytes).toBeGreaterThan(results[0].returnedBytes);
 }finally{await ctx.dispose()}
},60000);
