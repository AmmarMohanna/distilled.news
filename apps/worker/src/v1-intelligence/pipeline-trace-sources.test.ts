import { it, expect } from 'vitest';
import { createIntakeDatabase, seedIntakeScope } from '../v1-intake/test-utils';
import { V1IntakeStore } from '../v1-intake/store';
import { traceSourceCollection } from './pipeline-trace-sources';
import { SOURCE_STORAGE_SCHEMA } from '@distilled/connectors';
it('reads real RSS batch identities without exposing another Feed collection', async () => {
    const ctx = await createIntakeDatabase();
    try {
        await seedIntakeScope(new V1IntakeStore(ctx.db));
        await ctx.db.exec(SOURCE_STORAGE_SCHEMA.replace(/\r?\n/g, ' '));
        for (const [feed, id] of [['feed-1', 'rss-batch'], ['feed-2', 'private-batch']]) {
            await ctx.db.prepare('INSERT INTO connector_batches(feed_id,feed_source_id,handoff_id,data) VALUES(?,?,?,?)').bind(feed, 'feed-source-1', id, JSON.stringify({request:{coverage:{fetchStartSequence:1},observations:[{id:'article'}]}})).run();
        }
        const r = await traceSourceCollection(ctx.db, 'feed-1', 'feed-source-1', new Set(['connector_batches']));
        expect(r.lastBatches).toEqual([expect.objectContaining({id:'rss-batch',observations:1,accepted:0})]);
        expect(r.lastConfirmedStage).toBe('OBSERVATIONS_SAVED');
        expect(JSON.stringify(r)).not.toContain('private-batch');
    } finally { await ctx.dispose(); }
}, 20000);
it('saved provider order, attempt and partial coverage are diagnostic evidence, never successful content acquisition', async () => {
    const ctx = await createIntakeDatabase();
    try {
        await seedIntakeScope(new V1IntakeStore(ctx.db));
        await ctx.db.exec("CREATE TABLE connector_provider_poll_jobs(job_id TEXT PRIMARY KEY,request TEXT,state TEXT,due_at TEXT,lease_until TEXT,attempts INTEGER,last_error TEXT,provider_order TEXT); CREATE TABLE connector_provider_batches(feed_id TEXT,feed_source_id TEXT,batch_key TEXT,data TEXT,receipts TEXT); CREATE TABLE connector_provider_attempts(feed_id TEXT,feed_source_id TEXT,run_id TEXT,data TEXT); CREATE TABLE connector_fetch_runs(feed_id TEXT,feed_source_id TEXT,run_id TEXT,started_at TEXT,sequence INTEGER);");
        await ctx.db.prepare('INSERT INTO connector_provider_poll_jobs VALUES(?,?,?,?,?,?,?,?)').bind('poll', JSON.stringify({ scope: { feedId: 'feed-1', feedSourceId: 'feed-source-1' } }), 'PENDING', '2026-10-03T12:00:00Z', null, 2, 'AUTH_REQUIRED', '["telegram_telethon","telegram_public"]').run();
        await ctx.db.prepare('INSERT INTO connector_provider_batches VALUES(?,?,?,?,?)').bind('feed-1', 'feed-source-1', 'batch', JSON.stringify({ providerId: 'telegram_public', request: { coverage: { status: 'PARTIAL', fetchStartSequence: 1 }, observations: [], proposals: [] } }), null).run();
        await ctx.db.prepare('INSERT INTO connector_fetch_runs VALUES(?,?,?,?,?)').bind('feed-1','feed-source-1','poll','2026-10-03T12:00:00Z',1).run();
        const before = await ctx.db.prepare('SELECT * FROM connector_provider_poll_jobs').all();
        const r = await traceSourceCollection(ctx.db, 'feed-1', 'feed-source-1', new Set(['connector_provider_poll_jobs', 'connector_provider_batches','connector_fetch_runs']));
        expect(r.lastPollJobs[0]).toMatchObject({ id: 'poll', attempts: 2, lastError: 'AUTH_REQUIRED', providerOrder: '["telegram_telethon","telegram_public"]' });
        expect(r.lastBatches[0]).toMatchObject({ coverage: { status: 'PARTIAL' }, accepted: 0 });
        expect(r.pollingState).not.toBe('SUCCESS');
        expect((await ctx.db.prepare('SELECT * FROM connector_provider_poll_jobs').all()).results).toEqual(before.results);
    }
    finally {
        await ctx.dispose();
    }
}, 20000);
