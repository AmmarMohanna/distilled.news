import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualityD1,QUALITY_EVALUATION_D1} from '../benchmarks/quality-focus/ledger.mjs';
test('quality trial ledger uses only the dedicated QA database and preserves atomic batches',async()=>{
 const seen=[];const db=qualityD1('OFFLINE_NON_CREDENTIAL',async(url,options)=>{seen.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({success:true,result:[{success:true,results:[{n:1}]}]})}});
 assert.equal(await db.prepare('SELECT 1 AS n').first('n'),1);await db.batch([db.prepare('guard').bind(),db.prepare('reservation').bind(),db.prepare('cleanup').bind()]);
 assert.ok(seen.every(r=>r.url===QUALITY_EVALUATION_D1));assert.match(QUALITY_EVALUATION_D1,/5ca750ba-dad8-413f-896e-bd62b1023ac2/);assert.ok(!QUALITY_EVALUATION_D1.includes('ab259bfe'));
 assert.deepEqual(seen[1].body.batch.map(s=>s.sql),['guard','reservation','cleanup']);
});
test('quality trial accounting refuses unsuccessful results without retry',async()=>{
 let calls=0;const db=qualityD1('OFFLINE_NON_CREDENTIAL',async()=>{calls++;return {ok:false,json:async()=>({success:false,errors:[{code:1}]})}});
 await assert.rejects(db.prepare('SELECT 1').all(),/EVALUATION_D1_QUERY_FAILED/);assert.equal(calls,1);
});
