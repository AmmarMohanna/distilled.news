import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {exportTextfile} from './agentops-textfile.mjs';
test('atomically replaces fresh metrics and removes stale healthy values on failure',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentops-')),input=join(dir,'trace.json'),output=join(dir,'metrics.prom');
 const now=Date.parse('2026-10-30T00:00:00Z');const page={schemaVersion:'pipeline-trace-v1',observedAt:'2026-10-29T23:59:59Z',feed:{id:'private'},window:{start:'2026-10-29T00:00:00Z',end:'2026-10-29T01:00:00Z'},view:'overview',items:[],page:{total:0,nextCursor:null},summary:{publication:{briefingRequest:null}}};
 try{
  writeFileSync(input,JSON.stringify(page));exportTextfile([input],output,now);
  assert.match(readFileSync(output,'utf8'),/distilled_observer_up 1/);assert(!readFileSync(output,'utf8').includes('private'));
  assert.throws(()=>exportTextfile([input],output,now+600000),/STALE/);
  const failed=readFileSync(output,'utf8');assert.match(failed,/distilled_observer_up 0/);assert(!failed.includes('publication_'));
  assert.throws(()=>exportTextfile([input],input,now),/OUTPUT/);assert.equal(JSON.parse(readFileSync(input,'utf8')).feed.id,'private');
 }finally{assert(dir.startsWith(join(tmpdir(),'agentops-')));rmSync(dir,{recursive:true,force:true});}
});
