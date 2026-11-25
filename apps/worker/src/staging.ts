import worker from './index';
import {stagingMission} from './staging-mission';
import {createStagingAssets} from './staging-assets';
import type {Env} from './types';

const releaseReadRoutes = new Set([
  '/', '/api/health/release', '/api/auth/session', '/api/explore/feeds',
  '/api/me/health', '/api/admin/accounts',
]);
const releaseAsset = /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/;

/** CI staging blocks side-effecting entry points before they reach the app. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const {pathname} = new URL(request.url);
    if (env.CI_STAGING_READ_ONLY === 'true') {
      if (request.method !== 'GET' || (!releaseReadRoutes.has(pathname) && !releaseAsset.test(pathname))) {
        return new Response('Not found', {status: 404});
      }
    } else if (pathname.startsWith('/__staging/mission/')) {
      return stagingMission(request, env);
    }
    return worker.fetch(request, env.ASSETS ? env : {
      ...env, ASSETS: createStagingAssets(env.RAW_ARCHIVE, env.STAGING_ASSETS_PREFIX ?? ''),
    }, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (env.CI_STAGING_READ_ONLY !== 'true') return worker.scheduled(controller, env, ctx);
  },
  async queue(batch: Parameters<typeof worker.queue>[0], env: Env) {
    if (env.CI_STAGING_READ_ONLY === 'true') {
      // CI also requires paused delivery. Preserve messages if delivery is resumed out of band.
      batch.retryAll();
      return;
    }
    await worker.queue(batch, env);
  },
};
