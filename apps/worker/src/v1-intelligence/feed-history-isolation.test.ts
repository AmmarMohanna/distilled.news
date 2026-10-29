import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyTestMigration} from '../test-migrations';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
it('history reads do not scan other feeds to satisfy identity ordering',async()=>{
 const ctx=await createIntakeDatabase();try{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0079_feed_document_order.sql',import.meta.url),'utf8'));
 const seed=new V1FeedStore(ctx.db);await seed.registerFeed(feedFixture);await seed.registerFeed({...feedFixture,id:'foreign-feed'});
 const statements:D1PreparedStatement[]=[];
 for(let i=0;i<100;i++){const id='foreign-'+i;for(const kind of ['editions','publication_status','v3_window_results'])statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind,id,'foreign-feed',JSON.stringify(kind==='publication_status'?{id,status:'PUBLISHED'}:{id,createdAt:'2026-08-01T00:00:00Z',windowEnd:'2026-08-01T00:00:00Z',evidenceRevisionIds:[],stories:[]})));}
 for(let i=0;i<statements.length;i+=60)await ctx.db.batch(statements.slice(i,i+60));
 const measured:{sql:string;rows:number}[]=[];const wrap=(s:D1PreparedStatement,sql:string):D1PreparedStatement=>new Proxy(s,{get(t,k){if(k==='bind')return (...args:any[])=>wrap(t.bind(...args),sql);if(k==='all')return async()=>{const r=await t.all();measured.push({sql,rows:r.meta.rows_read});return r;};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 const store=new V1FeedStore({prepare(sql:string){return wrap(ctx.db.prepare(sql),sql)}} as D1Database);
 expect(await store.list('feed-1','v3_window_results')).toEqual([]);expect(await store.publicationPreparationHistory('feed-1',Date.parse('2026-10-01T00:00:00Z'))).toEqual([]);expect(await store.publishedEditionHistory('feed-1')).toEqual([]);
 expect(measured.reduce((n,m)=>n+m.rows,0),JSON.stringify(measured)).toBeLessThan(10);
 }finally{await ctx.dispose()}
});
