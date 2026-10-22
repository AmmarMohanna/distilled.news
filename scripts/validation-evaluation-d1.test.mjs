import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluationD1,STAGING_EVALUATION_D1} from './validation-evaluation-d1.mjs';
test('evaluation adapter keeps financial guard, reservation and cleanup in one staging batch',async()=>{
 const requests=[];
 const db=evaluationD1('TEST_NON_CREDENTIAL',async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({success:true,result:[{success:true,results:[{n:7}]}]})};});
 assert.equal(await db.prepare('SELECT ? AS n').bind(7).first('n'),7);
 await db.batch([db.prepare('guard ?').bind('g'),db.prepare('reserve ?').bind('r'),db.prepare('cleanup ?').bind('g')]);
 assert.equal(requests.length,2);assert.ok(requests.every(r=>r.url===STAGING_EVALUATION_D1));
 assert.deepEqual(requests[1].body,{batch:[{sql:'guard ?',params:['g']},{sql:'reserve ?',params:['r']},{sql:'cleanup ?',params:['g']}]});
});
test('failed accounting response has no automatic retry',async()=>{
 let calls=0;const db=evaluationD1('TEST_NON_CREDENTIAL',async()=>{calls++;return {ok:true,json:async()=>({success:false,errors:[{code:10000}]})};});
 await assert.rejects(db.prepare('SELECT 1').first(),/EVALUATION_D1_QUERY_FAILED/);assert.equal(calls,1);
});
