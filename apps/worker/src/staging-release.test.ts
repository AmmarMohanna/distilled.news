import {beforeEach, expect, it, vi} from 'vitest';
import staging from './staging';
import worker from './index';
import {stagingMission} from './staging-mission';
import type {Env} from './types';

vi.mock('./index', () => ({
  default: {
    fetch: vi.fn(() => new Response('app')),
    scheduled: vi.fn(),
    queue: vi.fn(),
  },
}));
vi.mock('./staging-mission', () => ({
  stagingMission: vi.fn(() => new Response('mission')),
}));

const ctx = {} as ExecutionContext;
const controller = {} as ScheduledController;
const env = {ASSETS: {}} as Env;
const ciEnv = {...env, CI_STAGING_READ_ONLY: 'true'};

beforeEach(() => vi.clearAllMocks());

it('permits the read-only probes and blocks staging missions and app writes', async () => {
  for (const [path, method] of [
    ['/api/auth/session', 'POST'],
    ['/api/auth/setup', 'POST'],
    ['/api/me/catch-up', 'GET'],
    ['/__staging/mission/status', 'GET'],
  ]) {
    const request = new Request('https://staging.example' + path, {method});
    expect((await staging.fetch(request, ciEnv, ctx)).status).toBe(404);
  }
  expect(worker.fetch).not.toHaveBeenCalled();
  expect(stagingMission).not.toHaveBeenCalled();

  for (const path of ['/', '/assets/index-123.js', '/api/auth/session', '/api/admin/accounts']) {
    const request = new Request('https://staging.example' + path);
    expect(await (await staging.fetch(request, ciEnv, ctx)).text()).toBe('app');
  }
  expect(worker.fetch).toHaveBeenCalledTimes(4);
});

it('never invokes cron or queue processing on CI staging and retains ordinary staging behavior', async () => {
  const retryAll = vi.fn();
  const batch = {retryAll} as unknown as Parameters<typeof staging.queue>[0];
  await staging.scheduled(controller, ciEnv, ctx);
  await staging.queue(batch, ciEnv);
  expect(retryAll).toHaveBeenCalledOnce();
  expect(worker.scheduled).not.toHaveBeenCalled();
  expect(worker.queue).not.toHaveBeenCalled();

  await staging.scheduled(controller, env, ctx);
  await staging.queue(batch, env);
  expect(worker.scheduled).toHaveBeenCalledOnce();
  expect(worker.queue).toHaveBeenCalledOnce();
  const request = new Request('https://staging.example/__staging/mission/status');
  expect(await (await staging.fetch(request, env, ctx)).text()).toBe('mission');
});
