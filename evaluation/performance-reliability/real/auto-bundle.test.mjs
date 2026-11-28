import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';
import {admit, digest} from './manifest.mjs';
import {buildAutoBundle, buildManifest} from './auto-bundle.mjs';

const worker = 'distilled-news-staging-campaign-pilot';
const origin = `https://${worker}.distillednews-platform.workers.dev`;
const sha = 'c39f982232fc245ba8b86e4168f3edead74d8555';
const now = Date.parse('2026-11-26T16:00:00.000Z');
const accountId = new URL(QUALITY_EVALUATION_D1).pathname.split('/')[4];
const databaseId = new URL(QUALITY_EVALUATION_D1).pathname.split('/').at(-2);
const queueId = n => String(n).repeat(32).slice(0, 32).replace(/[^a-f0-9]/g, 'a');

const passingChecks = {
  WORKER_SETTINGS_READABLE: true, ISOLATED_DATABASE: true, ISOLATED_CAMPAIGN_FLAGS: true, MODEL_CONFIGURATION: true,
  EXTERNAL_COST_CONFIGURATION: true, ABSENT_TURNSTILE_SECRET_KEY: true, ABSENT_VAPID_PRIVATE_KEY: true,
  DEPLOYED_BUNDLE_MATCHES: true, RUN_GRANT_ABSENT: true, TRACKING_ONLY_DISABLED: true, PROVIDER_ACCOUNT_VERIFIED: true,
  CAMPAIGN_ACCOUNTS_ONLY: true, NO_ACTIVE_FEEDS: true, NO_OUTSTANDING_RESERVATIONS: true,
  EXTERNAL_OPERATION_LEDGER_CLEAR: true, NO_COMPETING_MODEL_GRANT: true, GMAIL_READONLY_READY: true, CRON_INACTIVE: true
};

function env(overrides = {}) {
  return {
    CAMPAIGN_PILOT_WORKER: worker, CAMPAIGN_MAX_USD: '5', CAMPAIGN_MAX_MODEL_OPERATIONS: '40',
    CAMPAIGN_SOURCE_AUTHORIZATION: 'team-approved-2026-11-26', CAMPAIGN_CLOUDFLARE_TOKEN: 'cf-token',
    CAMPAIGN_ADMIN_COOKIE: 'dn_session=admin', CAMPAIGN_GRAFANA_AUTH: 'Basic abc',
    CAMPAIGN_GRAFANA_OTLP_URL: 'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/metrics',
    GITHUB_SHA: sha, GITHUB_RUN_ID: '41361141073', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'owner/repo', GITHUB_ACTOR: 'reviewer',
    ...overrides
  };
}

function fakeAdapter(checks = passingChecks) {
  const calls = [];
  return {
    calls,
    configure(manifest) { calls.push(['configure', manifest.runId]); },
    async preflight() {
      const blockers = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      calls.push(['preflight']);
      return {ready: blockers.length === 0, checks, blockers};
    }
  };
}

function fakeFetch({pricing = true, admin = true, grafana = true, queueName = 'dn-campaign-pilot-processing'} = {}) {
  const seen = [];
  const fetcher = async (url, init = {}) => {
    const u = String(url);
    seen.push({url: u, method: init.method ?? 'GET'});
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {status});
    if (u.endsWith(`/workers/scripts/${worker}/settings`)) return reply({success: true, result: {bindings: [
      {type: 'd1', name: 'DB', id: databaseId},
      {type: 'queue', name: 'PROCESSING_QUEUE', queue_name: queueName},
      {type: 'queue', name: 'V1_QUEUE', queue_name: 'dn-campaign-pilot-v1'},
      {type: 'r2_bucket', name: 'RAW', bucket_name: 'distilled-news-staging-campaign-pilot-raw'}]}});
    if (u.includes('/queues?')) return reply({success: true, result: [
      {queue_name: 'dn-campaign-pilot-processing', queue_id: queueId(1)},
      {queue_name: 'dn-campaign-pilot-v1', queue_id: queueId(2)},
      {queue_name: 'distilled-news-production-processing', queue_id: queueId(3)}]});
    if (u === 'https://openrouter.ai/api/v1/models') return pricing
      ? reply({data: [{id: 'openai/gpt-4.1', pricing: {prompt: '0.000002'}}, {id: 'openai/gpt-4.1-mini', pricing: {prompt: '0.0000004'}}, {id: 'deepseek/deepseek-v4.1-flash-1017', pricing: {prompt: '0.000000036'}}]})
      : reply({}, 503);
    if (u === origin + '/api/auth/session') return reply({authenticated: true, account: {role: admin ? 'admin' : 'user'}});
    if (u.startsWith('https://otlp-gateway-')) return new Response('', {status: grafana ? 200 : 401});
    throw Error('unexpected fetch ' + u);
  };
  return {fetcher, seen};
}

function root(t) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-bundle-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

test('builds a bundle the protected workflow admits for every native phase', async t => {
  const adapter = fakeAdapter();
  const {fetcher, seen} = fakeFetch();
  const bundle = await buildAutoBundle(env(), {fetcher, now: () => now, adapter, root: root(t)});
  const m = bundle.manifest;
  assert.equal(bundle.phase, 'run');
  assert.equal(m.revision, sha);
  assert.equal(m.runId, 'gh41361141073a1');
  assert.equal(m.origin, origin);
  assert.deepEqual(m.budget, {totalUsd: 5, cloudUsd: 0.2, drainUsd: 0.5, maxModelCalls: 40});
  assert.equal(bundle.preflight.status, 'READY');
  for (const phase of ['setup', 'plan', 'campaign', 'observe', 'traffic', 'telemetry', 'cleanup'])
    assert.equal(admit(m, bundle.preflight, bundle.approval, phase, now + 1000), true);
  assert.equal(bundle.approval.preflightHash, digest(bundle.preflight));
  assert.equal(bundle.approval.authorizedBy.kind, 'github-environment-required-reviewer');
  assert.ok(Date.parse(bundle.approval.expiresAt) - now >= m.cleanupReserveRequests * 15_000 + m.observeSeconds * 1000);
  const resources = bundle.files['resources.private.json'];
  assert.deepEqual(resources, {runId: m.runId, isolated: true, accountId, worker, databaseId, queueIds: [queueId(1), queueId(2)]});
  assert.deepEqual(adapter.calls, [['configure', m.runId], ['preflight']]);
  // The Grafana probe is an empty, authenticated write: no series are added.
  assert.ok(seen.some(s => s.url.startsWith('https://otlp-gateway-') && s.method === 'POST'));
});

test('refuses to build without the admin-set budget ceiling or source authorization', () => {
  const draft = {profile: 'load', budget: {drainUsd: 0.5}};
  assert.throws(() => buildManifest(draft, env({CAMPAIGN_MAX_USD: ''})), /CAMPAIGN_MAX_USD_REQUIRED/);
  assert.throws(() => buildManifest(draft, env({CAMPAIGN_MAX_USD: '51'})), /CAMPAIGN_MAX_USD_ABOVE_HARD_LIMIT/);
  assert.throws(() => buildManifest(draft, env({CAMPAIGN_MAX_USD: '0.6'})), /TOO_SMALL_FOR_CLOUD_AND_DRAIN/);
  assert.throws(() => buildManifest(draft, env({CAMPAIGN_SOURCE_AUTHORIZATION: ''})), /SOURCE_AUTHORIZATION_REQUIRED/);
  assert.throws(() => buildManifest(draft, env({CAMPAIGN_PROFILE: 'recovery'})), /PROFILE_UNSUPPORTED/);
  assert.throws(() => buildManifest(draft, env({GITHUB_SHA: 'main'})), /EXACT_WORKFLOW_REVISION_REQUIRED/);
});

test('blocks instead of inventing readiness when a live check fails', async t => {
  const cases = [
    {adapter: fakeAdapter({...passingChecks, DEPLOYED_BUNDLE_MATCHES: false}), fetch: {}},
    {adapter: fakeAdapter({...passingChecks, NO_OUTSTANDING_RESERVATIONS: false}), fetch: {}},
    {adapter: fakeAdapter(), fetch: {pricing: false}},
    {adapter: fakeAdapter(), fetch: {admin: false}},
    {adapter: fakeAdapter(), fetch: {grafana: false}},
    {adapter: fakeAdapter(), fetch: {queueName: 'distilled-news-production-processing'}}
  ];
  for (const c of cases) {
    const {fetcher} = fakeFetch(c.fetch);
    await assert.rejects(buildAutoBundle(env(), {fetcher, now: () => now, adapter: c.adapter, root: root(t)}), /AUTO_PREFLIGHT_BLOCKED/);
  }
});
