import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {applyTestMigration} from '../test-migrations';
it('unresolved window reads stay bounded as completed history grows',async()=>{
 const ctx=await createIntakeDatabase();try{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0074_unresolved_publication_windows.sql',import.meta.url),'utf8'));
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed',JSON.stringify({revision:1})).run();
 const window={start:'2026-10-01T00:00:00Z',end:'2026-10-01T00:30:00Z',kind:'30M'};
 await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','pending','feed',JSON.stringify({state:'PENDING',window})).run();
 const measurements=[];
 for(const history of [0,100,1000]){
  const current=await ctx.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='briefing_requests'").first<{n:number}>();
  for(let i=current!.n-1;i<history;i+=50)await ctx.db.batch(Array.from({length:Math.min(50,history-i)},(_,j)=>ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','terminal-'+(i+j),'feed',JSON.stringify({state:'DONE',result:'QUIET',window,padding:'x'.repeat(4096)}))));
  const old=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind=? ORDER BY id").bind('feed','briefing_requests').all<{json:string}>();
  const revised=await ctx.db.prepare("SELECT json_extract(json,'$.window') AS window_json FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED') ORDER BY id").bind('feed').all<{window_json:string}>();
  const baseline=old.results.map(r=>JSON.parse(r.json)).filter(r=>r.state!=='DONE'||r.result==='DEFERRED').map(r=>r.window);
  expect(revised.results.map(r=>JSON.parse(r.window_json))).toEqual(baseline);
  measurements.push({terminalHistory:history,baselineRowsRead:old.meta.rows_read,selectiveRowsRead:revised.meta.rows_read,baselineResponseBytes:Buffer.byteLength(JSON.stringify(old.results)),selectiveResponseBytes:Buffer.byteLength(JSON.stringify(revised.results)),baselineDurationMs:old.meta.duration,selectiveDurationMs:revised.meta.duration});
 }
 expect(measurements[2].selectiveRowsRead).toBeLessThanOrEqual(measurements[0].selectiveRowsRead+2);
 expect(measurements[2].baselineRowsRead).toBeGreaterThan(measurements[0].baselineRowsRead);
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='briefing_requests' AND id='pending'").run();
 const quiet=await ctx.db.prepare("SELECT json_extract(json,'$.window') AS window_json FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED') ORDER BY id").bind('feed').all();
 expect(quiet.results).toEqual([]);expect(quiet.meta.rows_read).toBeLessThanOrEqual(1);
 const dir=new URL('../../../../.local-reports/v3-selective-query-investigation/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('unresolved-scaling.json',dir),JSON.stringify({kind:'local Miniflare D1 synthetic metadata benchmark; no paid calls or live mutations',measurements,quiet:{rowsRead:quiet.meta.rows_read,returned:quiet.results.length}},null,2));
 }finally{await ctx.dispose()}
},30000);
