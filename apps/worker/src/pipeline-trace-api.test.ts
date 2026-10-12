import { it, expect } from 'vitest';
import { createApp } from './app';
import { InMemoryRepository } from './repository';
import { createSession } from './auth';
import type { Env } from './types';
it('operator trace denies anonymous and other tenant user sessions before touching D1', async () => {
    const repo = new InMemoryRepository(), app = createApp({ repository: repo });
    let reads = 0;
    const db = { prepare: () => { reads++; throw Error('No database access before operator authorization'); } };
    const env = { ADMIN_SESSION_SECRET: 'trace-test-only', DB: db } as unknown as Env;
    const path = '/api/admin/briefings/private-feed/pipeline-trace';
    expect((await app.request(path, {}, env)).status).toBe(401);
    const user = await repo.createAccount({ email: 'tenant@test.invalid', username: 'tenant', role: 'user', passwordHash: 'test-only' }), cookie = 'dn_session=' + await createSession(env.ADMIN_SESSION_SECRET!, user);
    expect((await app.request(path, { headers: { cookie } }, env)).status).toBe(401);
    expect(reads).toBe(0);
});
it('operator trace has no public Feed alias', async () => { const app = createApp({ repository: new InMemoryRepository() }); expect((await app.request('/api/feed/someone/private-feed/pipeline-trace', {}, {} as Env)).status).toBe(404); });
it('signed-in operators can inspect an existing Feed without exposing data on public routes', async () => {
    const { createIntakeDatabase } = await import('./v1-intake/test-utils'), { V1FeedStore } = await import('./v1-intelligence/store'), { feedFixture } = await import('./v1-intelligence/test-utils');
    const ctx = await createIntakeDatabase();
    try {
        await new V1FeedStore(ctx.db).registerFeed(feedFixture);
        const repo = new InMemoryRepository(), app = createApp({ repository: repo });
        const admin = await repo.createAccount({ email: 'operator@test.invalid', username: 'operator', role: 'admin', passwordHash: 'test-only' }), env = { ADMIN_SESSION_SECRET: 'trace-test-only', DB: ctx.db } as Env, cookie = 'dn_session=' + await createSession(env.ADMIN_SESSION_SECRET!, admin);
        const response = await app.request('/api/admin/briefings/feed-1/pipeline-trace', { headers: { cookie } }, env);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(await response.json()).toMatchObject({ schemaVersion: 'pipeline-trace-v1', feed: { id: 'feed-1' } });
    }
    finally {
        await ctx.dispose();
    }
}, 20000);
