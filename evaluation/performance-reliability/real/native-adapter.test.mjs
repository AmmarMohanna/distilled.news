import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';
import {GMAIL_READONLY, gmailAlias} from './gmail-oauth.mjs';
import {digest} from './manifest.mjs';
import {createNativeAdapter} from './native-adapter.mjs';
import {adapterFor, runCampaignPhases} from './workflow.mjs';

const worker = 'distilled-news-staging-campaign-pilot';
const origin = `https://${worker}.distillednews-platform.workers.dev`;
const now = Date.parse('2026-11-26T10:00:00.000Z');
const iso = time => new Date(time).toISOString();
const email = 'qa.inbox@gmail.com';
const provider = 'pilot-provider';
const runId = 'native001';
const moduleContents = 'export default {fetch(){return new Response("fixture")}}';
const users = [0, 1].map(slot => ({
  slot, id: 'owner-' + slot, username: `qa${runId}u${slot}`, email: gmailAlias(email, runId, slot)
}));
const manifest = {runId, origin, users: 2, controlPlaneRequestBudget: 500,
  observeSeconds: 5400, pollSeconds: 30, cleanupReserveRequests: 60,
  budget: {totalUsd: 5, cloudUsd: 0.5, drainUsd: 0.5, maxModelCalls: 3},
  modelConfiguration: {provider: 'openrouter', editor: 'openai/gpt-4.1', verifier: 'openai/gpt-4.1-mini', repair: 'openai/gpt-4.1'}};

function fixture(t, overrides = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = mkdtempSync(join(tmpdir(), 'native-campaign-test-'));
  t.after(() => { db.close(); rmSync(dir, {recursive: true, force: true}); });
  db.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY, username TEXT, role TEXT, email_verified_at TEXT, disabled_at TEXT);
    CREATE TABLE briefings(id TEXT PRIMARY KEY, paused INTEGER);
    CREATE TABLE v1_feed_documents(kind TEXT, id TEXT);
    CREATE TABLE settings(key TEXT, value TEXT);
    CREATE TABLE connector_provider_operations(id TEXT);
    CREATE TABLE browser_use_discovery_runs(id TEXT);
    CREATE TABLE agent_runs(run_id TEXT, tenant_id TEXT, state TEXT, created_at TEXT);
    CREATE TABLE agent_run_attempts(run_id TEXT, started_at TEXT);
    CREATE TABLE agent_tool_calls(run_id TEXT);
  `);
  db.exec(readFileSync(new URL('../../../apps/worker/migrations/0051_model_spending_authority.sql', import.meta.url), 'utf8'));
  const prior = {id: 'prior', accountId: provider, modelIds: ['openai/gpt-4.1'], validFrom: iso(now - 7200_000), validUntil: iso(now - 3600_000),
    maxExposureUsd: 1, maxConcurrentOperations: 1, maxOperations: 1};
  const saveGrant = value => db.prepare('INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)')
    .run(value.id, value.accountId, value.validFrom, value.validUntil, JSON.stringify(value));
  saveGrant(prior);
  function createUsers() {
    for (const user of users) db.prepare("INSERT INTO accounts VALUES(?,?,'user',?,NULL)").run(user.id, user.username, iso(now));
  }
  writeFileSync(join(dir, 'gmail-client.json'), JSON.stringify({installed: {
    client_id: 'fixture-client', auth_uri: 'https://accounts.google.com/o/oauth2/auth', token_uri: 'https://oauth2.googleapis.com/token'
  }}));
  writeFileSync(join(dir, 'gmail-token.json'), JSON.stringify({
    email, scope: GMAIL_READONLY, refresh_token: 'fixture-refresh', access_token: 'fixture-access', expires_at: now + 120_000
  }));

  const state = {time: now, cron: [], writes: [], urls: [], gmailLists: 0, delivered: true, ambiguousStart: false};
  const binding = (name, text) => ({name, text, type: 'plain_text'});
  const bindings = [
    {name: 'DB', type: 'd1', id: new URL(QUALITY_EVALUATION_D1).pathname.split('/').at(-2)},
    binding('ENVIRONMENT', 'staging'), binding('AGENTOPS_CAMPAIGN_ENABLED', 'true'),
    binding('AGENTOPS_CAMPAIGN_ISOLATED', 'true'), binding('BRIEFING_ENGINE', 'v3'),
    binding('SOURCE_ASSESSMENT_MODEL', 'openai/gpt-4.1-mini'), {name: 'OPENROUTER_API_KEY', type: 'secret_text'}
  ];
  const env = {CAMPAIGN_PILOT_WORKER: worker, CAMPAIGN_PROVIDER_ACCOUNT_ID: provider, CAMPAIGN_MAX_MODEL_OPERATIONS: '3',
    CAMPAIGN_CLOUDFLARE_TOKEN: 'fixture-token', CAMPAIGN_QA_GMAIL: email, CAMPAIGN_GMAIL_DIRECTORY: dir,
    CAMPAIGN_EXPECTED_BUNDLE_DIGEST: digest(Buffer.from(moduleContents).toString('base64')), ...overrides};

  function statement({sql, params = []}) {
    const prepared = db.prepare(sql);
    const results = prepared.columns().length ? prepared.all(...params) : (prepared.run(...params), []);
    return {success: true, results};
  }
  function d1(body) {
    if (!body.batch) return [statement(body)];
    db.exec('BEGIN');
    try { const result = body.batch.map(statement); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const linkToken = 'abcdefghijklmnopqrstuvwxyz0123456789';
  async function fetcher(url, init) {
    state.urls.push(String(url));
    if (String(url) === QUALITY_EVALUATION_D1) {
      try { return Response.json({success: true, result: d1(JSON.parse(init.body))}); }
      catch { return Response.json({success: false, errors: [{code: 1}]}, {status: 400}); }
    }
    const target = new URL(url);
    if (target.host === 'gmail.googleapis.com') {
      if (target.pathname.endsWith('/profile')) return Response.json({emailAddress: email});
      if (target.pathname.endsWith('/messages')) {
        state.gmailLists++;
        assert.match(target.searchParams.get('q'), /to:qa\.inbox\+native001-u0@gmail\.com/);
        return Response.json(state.delivered ? {messages: [{id: 'fixture'}]} : {});
      }
      if (target.pathname.endsWith('/fixture')) return Response.json({internalDate: String(now - 1000), payload: {
        headers: [{name: 'To', value: users[0].email}], mimeType: 'text/plain',
        body: {data: Buffer.from(`${origin}/verify-email?token=${linkToken}`).toString('base64url')}
      }});
    }
    if (target.host === 'api.cloudflare.com') {
      assert(target.pathname.includes('/workers/scripts/' + worker));
      if (target.pathname.endsWith('/settings')) return Response.json({success: true, result: {bindings}});
      if (target.pathname.endsWith('/schedules')) {
        if (init.method === 'PUT') {
          state.cron = JSON.parse(init.body);
          state.writes.push(state.cron.map(item => item.cron));
          if (state.ambiguousStart && state.cron.length) throw Error('Simulated lost write response');
        }
        return Response.json({success: true, result: {schedules: state.cron}});
      }
      const form = new FormData();
      form.set('index.js', new Blob([moduleContents]), 'index.js');
      return new Response(form);
    }
    assert.fail('unexpected remote request');
  }
  const adapter = createNativeAdapter({env, fetcher, now: () => state.time, sleep: async () => {}});
  function saveReservation(id, {grant = 'campaign:' + runId, date = iso(now), settled = null, leaseUntil = now + 1000} = {}) {
    db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, provider, grant, id, 'openai/gpt-4.1', 'feed', 0.2, leaseUntil, date, '{}');
    if (settled !== null) db.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,?,?,1)').run(id, id, settled);
  }
  return {adapter, env, state, bindings, dir, db, saveGrant, saveReservation, createUsers, linkToken};
}

const approvalUntil = time => ({manifestHash: digest(manifest), expiresAt: iso(time)});
const approval = approvalUntil(now + 6 * 3600_000);

async function ready(f, scope = approval) {
  f.adapter.configure(manifest, f.dir, scope);
  const result = await f.adapter.preflight({manifest});
  assert.deepEqual(result.blockers, []);
  assert.equal(result.ready, true);
}

test('native configuration rejects mismatched origin and missing Cloudflare or ledger identifiers', t => {
  const f = fixture(t);
  assert.throws(() => f.adapter.configure({...manifest, origin: 'https://distilled.news'}, f.dir), /ISOLATED_PILOT_WORKER_REQUIRED/);
  for (const [key, error] of [
    ['CAMPAIGN_CLOUDFLARE_TOKEN', /TOKEN_REQUIRED/], ['CAMPAIGN_PILOT_WORKER', /PILOT_WORKER_REQUIRED/],
    ['CAMPAIGN_PROVIDER_ACCOUNT_ID', /ACCOUNT_ID_REQUIRED/], ['CAMPAIGN_MAX_MODEL_OPERATIONS', /OPERATION_LIMIT_REQUIRED/]
  ]) {
    const adapter = createNativeAdapter({env: {...f.env, [key]: undefined}});
    assert.throws(() => adapter.configure(manifest, f.dir), error);
  }
});

test('preflight fails closed on Turnstile, push keys, wrong flags, missing digest, and unrecognized accounts', async t => {
  const f = fixture(t, {CAMPAIGN_EXPECTED_BUNDLE_DIGEST: undefined});
  f.bindings.find(value => value.name === 'AGENTOPS_CAMPAIGN_ISOLATED').text = 'false';
  f.bindings.push({name: 'TURNSTILE_SECRET_KEY'}, {name: 'VAPID_PRIVATE_KEY'});
  f.db.prepare("INSERT INTO accounts VALUES('foreign','notacampaign','user',?,NULL)").run(iso(now));
  f.db.prepare("INSERT INTO briefings VALUES('existing-feed',0)").run();
  f.adapter.configure(manifest, f.dir);
  assert.throws(() => f.adapter.challenge(users[0], 'register'), /TURNSTILE_ABSENCE_NOT_VERIFIED/);
  const result = await f.adapter.preflight({manifest});
  assert.equal(result.ready, false);
  for (const blocker of ['ABSENT_TURNSTILE_SECRET_KEY', 'ABSENT_VAPID_PRIVATE_KEY', 'ISOLATED_CAMPAIGN_FLAGS',
    'DEPLOYED_BUNDLE_MATCHES', 'CAMPAIGN_ACCOUNTS_ONLY', 'NO_ACTIVE_FEEDS']) assert(result.blockers.includes(blocker));
  assert.throws(() => f.adapter.challenge(users[0], 'register'), /TURNSTILE_ABSENCE_NOT_VERIFIED/);
});

test('uses real Gmail reader with the campaign alias, and bounds an empty mailbox to twelve reads', async t => {
  const f = fixture(t);
  await ready(f);
  assert.equal(f.adapter.challenge(users[0], 'register'), 'XXXX.DUMMY.TOKEN.XXXX');
  assert.throws(() => f.adapter.challenge({...users[0], username: 'wrong'}, 'register'), /CAMPAIGN_USER_SCOPE_DENIED/);
  const input = {email: users[0].email, runId, registeredAt: iso(now - 60_000)};
  assert.equal(await f.adapter.mailbox(input), f.linkToken);
  f.state.delivered = false;
  await assert.rejects(f.adapter.mailbox(input), /NO_REREGISTRATION/);
  assert.equal(f.state.gmailLists, 13);
  assert(!readFileSync(join(f.dir, 'journal.jsonl'), 'utf8').includes(f.linkToken));
});

test('creates one real native grant across users and rejects out-of-scope, tracking-only and conflicting requests', async t => {
  const f = fixture(t);
  await ready(f);
  f.createUsers();
  const sample = user => f.adapter.authorizeAccount({manifest, user});
  const [first, second] = await Promise.all(users.map(sample));
  assert.equal(first.evidenceHash, (await sample(users[0])).evidenceHash);
  assert.notEqual(first.evidenceHash, second.evidenceHash);
  for (const [i, receipt] of [first, second].entries()) {
    assert.equal(receipt.runId, runId);
    assert.equal(receipt.accountId, users[i].id);
    assert.equal(receipt.authoritative, true);
    assert.equal(receipt.maximumUsd, (manifest.budget.totalUsd - manifest.budget.cloudUsd - manifest.budget.drainUsd) / manifest.users);
    assert.match(receipt.evidenceHash, /^[a-f0-9]{64}$/);
  }
  const [stored] = f.db.prepare("SELECT json FROM v1_model_spending_authorizations WHERE id LIKE 'campaign:%'").all();
  const grant = JSON.parse(stored.json);
  assert.equal(grant.id, 'campaign:' + runId);
  assert.equal(grant.accountId, provider);
  assert.equal(grant.feedIds, undefined);
  assert.equal(grant.maxOperations, 3);
  assert.equal(grant.maxConcurrentOperations, 3);
  assert.equal(grant.maxExposureUsd, 4);
  assert.equal(grant.validUntil, iso(now + 2.5 * 3600_000));
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM v1_model_spending_authorizations WHERE id LIKE 'campaign:%'").get().n, 1);
  await assert.rejects(sample({...users[0], username: 'not-a-campaign'}), /CAMPAIGN_USER_SCOPE_DENIED/);
  f.db.prepare("INSERT INTO settings VALUES(?, '{}')").run('model-spending:tracking-only:' + provider);
  await assert.rejects(sample(users[0]), /TRACKING_ONLY_NOT_ALLOWED/);
  const budget = JSON.parse(readFileSync(join(f.dir, 'control-plane-budget.private.json'), 'utf8'));
  assert.equal(budget.requests, f.state.urls.length);

  const conflict = fixture(t);
  await ready(conflict);
  conflict.createUsers();
  conflict.saveGrant({...grant, maxExposureUsd: 1});
  await assert.rejects(conflict.adapter.authorizeAccount({manifest, user: users[0]}), /GRANT_IDENTITY_CONFLICT/);
});

test('native grants require approval and leave time for observation and cleanup before starting Cron', async t => {
  const unapproved = fixture(t);
  unapproved.adapter.configure(manifest, unapproved.dir);
  assert.equal((await unapproved.adapter.preflight({manifest})).ready, true);
  unapproved.createUsers();
  await assert.rejects(unapproved.adapter.authorizeAccount({manifest, user: users[0]}), /CAMPAIGN_GRANT_APPROVAL_REQUIRED/);

  const short = fixture(t);
  await ready(short, approvalUntil(now + 3600_000));
  short.createUsers();
  await assert.rejects(short.adapter.authorizeAccount({manifest, user: users[0]}), /CAMPAIGN_GRANT_WINDOW_TOO_SHORT/);
  assert.equal(short.db.prepare("SELECT count(*) AS n FROM v1_model_spending_authorizations WHERE id LIKE 'campaign:%'").get().n, 0);

  const capped = fixture(t);
  const scope = approvalUntil(now + 2 * 3600_000);
  await ready(capped, scope);
  capped.createUsers();
  await capped.adapter.authorizeAccount({manifest, user: users[0]});
  const row = capped.db.prepare("SELECT json FROM v1_model_spending_authorizations WHERE id LIKE 'campaign:%'").get();
  assert.equal(JSON.parse(row.json).validUntil, scope.expiresAt);

  capped.adapter.configure(manifest, capped.dir, scope);
  assert.equal((await capped.adapter.costs({manifest})).complete, true);
  capped.state.time += 16 * 60_000;
  await assert.rejects(capped.adapter.startSchedule(), /CAMPAIGN_GRANT_WINDOW_TOO_SHORT/);
  assert.deepEqual(capped.state.cron, []);
});

test('reconciles a run-bound ledger and refuses uncovered categories and too many operations', async t => {
  const f = fixture(t);
  await ready(f);
  f.createUsers();
  await f.adapter.authorizeAccount({manifest, user: users[0]});
  f.saveReservation('prior-cost', {grant: 'prior', date: iso(now - 7200_000), settled: 1});
  f.saveReservation('paid', {settled: 0.1});
  f.saveReservation('in-flight');
  const totals = await f.adapter.costs({manifest});
  assert.equal(totals.complete, true);
  assert.equal(totals.settledUsd, 0.1);
  assert.equal(totals.outstandingReservedUsd, 0.2);
  assert.equal(totals.modelCalls, 1);
  assert.equal(totals.uncertainOperations, 0);
  f.state.time += 2000;
  assert.equal((await f.adapter.costs({manifest})).uncertainOperations, 1);
  f.bindings.push({name: 'CLOUDFLARE_IMAGE_API_TOKEN'});
  await assert.rejects(f.adapter.costs({manifest}), /UNRECONCILED_EXTERNAL_OPERATION/);
  f.bindings.pop();
  f.db.exec("INSERT INTO connector_provider_operations VALUES('paid-outside-ledger')");
  await assert.rejects(f.adapter.costs({manifest}), /UNRECONCILED_EXTERNAL_OPERATION/);
  f.db.exec('DELETE FROM connector_provider_operations');
  f.saveReservation('third');
  f.saveReservation('fourth');
  await assert.rejects(f.adapter.costs({manifest}), /OPERATION_LIMIT_VIOLATION/);
});

test('returns browser evidence only for the owned campaign user', async t => {
  const f = fixture(t);
  await ready(f);
  f.createUsers();
  const input = {manifest, user: users[0]};
  assert.deepEqual(await f.adapter.browserEvidence(input), {runId, runs: []});
  f.db.prepare("INSERT INTO agent_runs VALUES(?,?,'completed',?)").run('owned', users[0].id, iso(now));
  f.db.prepare("INSERT INTO agent_runs VALUES(?,?,'completed',?)").run('other', users[1].id, iso(now));
  f.db.prepare('INSERT INTO agent_run_attempts VALUES(?,?)').run('owned', iso(now));
  f.db.prepare('INSERT INTO agent_tool_calls VALUES(?)').run('owned');
  assert.deepEqual(await f.adapter.browserEvidence(input), {runId, runs: [{runId: 'owned',
    ownerId: users[0].id, state: 'completed', startedAt: iso(now), toolCalls: 1}]});
});

test('workflow rejects unknown adapters and stops Cron before cleanup on threshold and ambiguous start failures', async t => {
  assert.equal(adapterFor(undefined), 'adapter.mjs');
  assert.equal(adapterFor('native'), 'native-adapter.mjs');
  assert.throws(() => adapterFor('typo'), /UNKNOWN_CAMPAIGN_ADAPTER_KIND/);
  for (const ambiguousStart of [false, true]) {
    const f = fixture(t);
    await ready(f);
    f.createUsers();
    await f.adapter.authorizeAccount({manifest, user: users[0]});
    f.state.ambiguousStart = ambiguousStart;
    const visited = [];
    const result = await runCampaignPhases(['setup', 'plan', 'campaign'], async phase => {
      visited.push(phase);
      if (phase === 'campaign') { assert.equal(f.state.cron.length, 1); return 99; }
      if (phase === 'cleanup') assert.deepEqual(f.state.cron, []);
      return 0;
    }, f.adapter);
    assert.equal(result, ambiguousStart ? 1 : 99);
    assert.deepEqual(visited, ambiguousStart ? ['setup', 'plan', 'cleanup'] : ['setup', 'plan', 'campaign', 'cleanup']);
    assert.deepEqual(f.state.writes, [['* * * * *'], []]);
  }
});
