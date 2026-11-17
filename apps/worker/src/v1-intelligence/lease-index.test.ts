import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {applyTestMigration} from '../test-migrations';
it('lease release seeks the owner token without reading historical lease JSON',async()=>{
 const ctx=await createIntakeDatabase();try{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0072_semantic_lease_owner_index.sql',import.meta.url),'utf8'));
 const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.token')=?").bind('feed','owner').all<{detail:string}>();
 expect(plan.results.map(r=>r.detail).join(' ')).toContain('v1_semantic_lease_owner');
 expect(plan.results.map(r=>r.detail).join(' ')).toContain('<expr>=?');
 }finally{await ctx.dispose()}
});

it('editorial recovery seeks the exact window instead of reading every intent body',async()=>{
 const ctx=await createIntakeDatabase();try{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0073_editorial_recovery_lookup.sql',import.meta.url),'utf8'));
 const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.kind')='COMPARATIVE_EDITORIAL_PLAN' AND json_extract(json,'$.input.budgetKey')=?").bind('feed','window').all<{detail:string}>();
 expect(plan.results.map(r=>r.detail).join(' ')).toContain('v1_editorial_recovery_window');
 }finally{await ctx.dispose()}
});
