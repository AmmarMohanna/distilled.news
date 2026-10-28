import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {applyTestMigration} from '../test-migrations';
import {V1FeedStore} from './store';
it('headers and selected hydration preserve exact current evidence and fail if source ownership changes',async()=>{const ctx=await createIntakeDatabase();try{
 const intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);await seedCurrentEvidence(intake,'Full immutable article body with attribution and uncertainty.');const store=new V1FeedStore(ctx.db),old=await store.currentEvidence('feed-1');
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0077_active_evidence_revision_lookup.sql',import.meta.url),'utf8'));
 const headers=await store.currentEvidenceHeaders('feed-1');expect(headers.map(h=>h.revision.id)).toEqual(old.map(e=>e.revision.id));expect(JSON.stringify(headers)).not.toContain('Full immutable article');
 expect(await store.currentEvidenceByIds('feed-1',headers.map(h=>h.revision.id))).toEqual(old);expect(await store.currentEvidenceByIds('feed-1',[])).toEqual([]);
 const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM v1_evidence WHERE feed_source_id=? AND json_extract(json,'$.currentRevisionId')=? AND json_extract(json,'$.state')='ACTIVE'").bind('feed-source-1',old[0].revision.id).all<{detail:string}>();expect(plan.results.map(r=>r.detail).join(' ')).toContain('v1_evidence_active_revision_lookup');
 await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',json('false')),epoch=epoch+1 WHERE id=?").bind('feed-source-1').run();await expect(store.currentEvidenceByIds('feed-1',headers.map(h=>h.revision.id))).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 }finally{await ctx.dispose()}});
