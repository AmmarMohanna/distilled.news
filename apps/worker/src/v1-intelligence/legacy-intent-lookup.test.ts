import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';

it('legacy reassessment lookup skips retained V3 intent bodies while preserving exact legacy recovery',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
 const intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);await seedCurrentEvidence(intake);
 const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await store.registerFeed({...feedFixture,id:'foreign-feed'});
 const intent=JSON.stringify({input:{kind:'V3_EDITOR_VERIFIER',evidenceRevisionIds:Array(300).fill('revision-seed'),retainedContext:'x'.repeat(8000)}});
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<300)
 INSERT INTO v1_feed_documents(kind,id,feed_id,json)
 SELECT 'semantic_intents','v3-history-'||n,'feed-1',? FROM history`).bind(intent).run();
 let readRows=0;
 const db=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>{
   const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(s,k){
    if(k==='bind')return (...args:unknown[])=>wrap(s.bind(...args));
    if(k==='first'&&sql.includes('FROM v1_feed_documents d'))return async()=>{const result=await s.all();readRows+=result.meta.rows_read;return result.results[0]??null;};
    const value=Reflect.get(s,k);return typeof value==='function'?value.bind(s):value;
   }});
   return wrap(target.prepare(sql));
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const measured=new V1FeedStore(db);
 expect(await measured.hasLegacySemanticIntentForObservation('feed-1','seed-observation')).toBe(false);
 expect(readRows).toBeLessThan(10);
 console.info(JSON.stringify({legacyOnlyIntentLookupRows:readRows}));
 // A foreign feed and an unrelated revision reference do not claim this job.
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents','foreign-intent','foreign-feed',?)")
 .bind(JSON.stringify({input:{evidenceRevisionIds:['revision-seed']}})).run();
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents','unrelated-intent','feed-1',?)")
 .bind(JSON.stringify({input:{kind:'LEGACY_REVIEW',evidenceRevisionIds:['missing-revision']}})).run();
 expect(await measured.hasLegacySemanticIntentForObservation('feed-1','seed-observation')).toBe(false);
 // Retained legacy inputs may have no kind marker and remain authoritative.
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents','legacy-intent','feed-1',?)")
 .bind(JSON.stringify({input:{evidenceRevisionIds:['missing-revision','revision-seed']}})).run();
 expect(await measured.hasLegacySemanticIntentForObservation('feed-1','seed-observation')).toBe(true);
 expect(await measured.hasLegacySemanticIntentForObservation('feed-1','different-observation')).toBe(false);
 }finally{await ctx.dispose()}
});
