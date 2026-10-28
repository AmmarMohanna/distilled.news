import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {applyTestMigration} from '../test-migrations';
it('legacy window identity probes use matching indexes',async()=>{const ctx=await createIntakeDatabase();try{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0075_legacy_window_identity_lookup.sql',import.meta.url),'utf8'));
 for(const [sql,args,name] of [["SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=? LIMIT 1",['feed','key'],'v1_semantic_intent_budget'],["SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='editorial_plans' AND json_extract(json,'$.window.start')=? AND json_extract(json,'$.window.end')=? LIMIT 1",['feed','start','end'],'v1_editorial_plan_window']] as const){const plan=await ctx.db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all<{detail:string}>();expect(plan.results.map(r=>r.detail).join(' ')).toContain(name)}
 }finally{await ctx.dispose()}});
