import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from './test-utils';
import {V1IntakeStore,itemId} from './store';
import {createCandidateIntakePort} from './intake';
import {acceptAcquiredContent} from './evidence';

it('promotes evidence without reading retained source revision bodies or scanning unrelated history',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
 const store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<2000)
 INSERT INTO v1_revisions(id,feed_source_id,item_key,json)
 SELECT 'retained-'||n,'feed-source-1','old-'||n,json_object('evidenceId','old-'||n,'revision',999,'body',replace(hex(zeroblob(500)),'0','x')) FROM history`).run();
 // Legacy rows may omit item_key, and tombstones may clear the current pointer.
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)')
 .bind('prior-target','feed-source-1',JSON.stringify({evidenceId:itemId('feed-source-1','guid-1'),revision:7,body:'retained target body'})).run();
 const accepted=await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture());
 let readRows=0,returnedBytes=0;
 const db=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>{
   const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(s,k){
    if(k==='bind')return (...args:unknown[])=>wrap(s.bind(...args));
    if(/\bFROM v1_revisions\b/i.test(sql)&&(k==='all'||k==='first'))return async(column?:string)=>{
     const result=await s.all();readRows+=result.meta.rows_read;returnedBytes+=JSON.stringify(result.results).length;
     return k==='all'?result:column?(result.results[0] as Record<string,unknown>)?.[column]:result.results[0]??null;
    };
    const value=Reflect.get(s,k);return typeof value==='function'?value.bind(s):value;
   }});
   return wrap(target.prepare(sql));
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const receipt=await acceptAcquiredContent(new V1IntakeStore(db),{id:'acquired-1',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'fresh evidence',acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'},testPolicy);
 expect(receipt.decision).toBe('PROMOTED_NEW_REVISION');
 expect((await store.read<{revision:number}>('revisions',receipt.resultingRevisionId!))?.value.revision).toBe(8);
 expect(readRows).toBeGreaterThan(0);expect(readRows).toBeLessThan(10);expect(returnedBytes).toBeLessThan(1000);
 console.info(JSON.stringify({promotionRevisionRows:readRows,promotionRevisionBytes:returnedBytes}));
 }finally{await ctx.dispose()}
});
