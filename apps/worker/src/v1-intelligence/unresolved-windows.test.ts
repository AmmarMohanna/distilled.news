import {readFileSync} from 'node:fs';
import {applyTestMigration} from '../test-migrations';
import {it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
it('selects the same unresolved windows while excluding terminal historical payloads',async()=>{
 const ctx=await createIntakeDatabase();try{
 const rows=[{state:'PENDING'},{state:'FAILED'},{state:'DONE',result:'DEFERRED'},{state:'DONE',result:'PUBLISHED'},{state:'DONE',result:'QUIET'},{result:'QUIET'}].map((v,i)=>({...v,id:String(i),window:{start:'2026-10-01T00:00:00Z',end:'2026-10-01T00:30:00Z',kind:'30M'},padding:'x'.repeat(10000)}));
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed',JSON.stringify({revision:1})).run();
 for(const row of rows)await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests',row.id,'feed',JSON.stringify(row)).run();
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0074_unresolved_publication_windows.sql',import.meta.url),'utf8'));
 const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED') ORDER BY id").bind('feed').all<{detail:string}>();
 expect(plan.results.map(r=>r.detail).join(' ')).toContain('v1_unresolved_publication_windows');
 const store=new V1FeedStore(ctx.db);
 const selected=await store.unresolvedPublicationWindows('feed');
 expect(selected).toEqual(rows.filter(r=>r.state!=='DONE'||r.result==='DEFERRED').map(r=>({window:r.window})));
 expect(await store.unresolvedPublicationWindows('other')).toEqual([]);
 }finally{await ctx.dispose()}
});
