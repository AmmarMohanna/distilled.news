import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
it('checks only revisions referenced by same-feed semantic intents, preserving old recovery',async()=>{
 const ctx=await createIntakeDatabase();try{
 const intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);await seedCurrentEvidence(intake);
 let sql='';const db=new Proxy(ctx.db,{get(target,key){if(key==='prepare')return (query:string)=>{sql=query;return target.prepare(query)};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
 const store=new V1FeedStore(db);await store.registerFeed(feedFixture);expect(await store.hasSemanticIntentForObservation('feed-1','seed-observation')).toBe(false);
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('semantic_intents','intent-1','feed-1',JSON.stringify({input:{evidenceRevisionIds:['missing','revision-seed']}})).run();
 expect(await store.hasSemanticIntentForObservation('feed-1','seed-observation')).toBe(true);
 const previous="SELECT 1 FROM v1_feed_documents d JOIN v1_revisions r ON json_extract(r.json,'$.sourceObservationId')=? WHERE d.feed_id=? AND d.kind='semantic_intents' AND EXISTS(SELECT 1 FROM json_each(d.json,'$.input.evidenceRevisionIds') WHERE value=r.id) LIMIT 1";
 expect(Boolean(await ctx.db.prepare(previous).bind('seed-observation','feed-1').first())).toBe(true);
 const previousPlan=await ctx.db.prepare('EXPLAIN QUERY PLAN '+previous).bind('seed-observation','feed-1').all<{detail:string}>();expect(previousPlan.results.map(r=>r.detail).join(' ')).toMatch(/SCAN r\b/);
 expect(await store.hasSemanticIntentForObservation('feed-1','other-observation')).toBe(false);
 expect(await store.hasSemanticIntentForObservation('feed-2','seed-observation')).toBe(false);
 const plan=await ctx.db.prepare('EXPLAIN QUERY PLAN '+sql).bind('feed-1','seed-observation').all<{detail:string}>();const details=plan.results.map(r=>r.detail).join(' ');expect(details).toMatch(/SEARCH r USING INDEX sqlite_autoindex_v1_revisions_1/);expect(details).not.toMatch(/SCAN r\b/);
 }finally{await ctx.dispose()}
});
