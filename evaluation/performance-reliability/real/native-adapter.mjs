import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {QUALITY_EVALUATION_D1, qualityD1} from '../../../benchmarks/quality-focus/ledger.mjs';
import {reconcileAccounting} from './accounting.mjs';
import {journal, writePrivate} from './client.mjs';
import {reserveControlPlane} from './control-budget.mjs';
import {GmailMailbox} from './gmail-mailbox.mjs';
import {gmailAlias} from './gmail-oauth.mjs';
import {digest} from './manifest.mjs';
export {fault} from './faults.mjs';

const target = new URL(QUALITY_EVALUATION_D1);
const accountPath = target.pathname.split('/d1/')[0];
const databaseId = target.pathname.split('/').at(-2);
const workerPattern = /^distilled-news-staging-campaign-[a-z0-9-]+$/;
const maxRows = 500;
const hour = 3_600_000;
const cron = '* * * * *';
const forbiddenBindings = [
  'TURNSTILE_SECRET_KEY', 'VAPID_PRIVATE_KEY', 'APIFY_API_TOKEN',
  'TWITTERAPI_IO_API_KEY', 'CLOUDFLARE_IMAGE_API_TOKEN', 'ZYTE_API_KEY'
];

// Compile the current authoritative primitive. The archived pilot bundle
// contains its own command-line entry point and is never executed.
let authorityModule;
async function authorize(db, grant) {
  authorityModule ??= (async () => {
    const workerPath = new URL('../../../apps/worker/', import.meta.url);
    const workerRequire = createRequire(new URL('package.json', workerPath));
    const wranglerRequire = createRequire(workerRequire.resolve('wrangler/package.json'));
    const {build} = wranglerRequire('esbuild');
    const {outputFiles} = await build({
      entryPoints: [fileURLToPath(new URL('src/v1-intelligence/model-spending.ts', workerPath))],
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
    });
    return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
  })();
  return (await authorityModule).authorizeModelSpending(db, grant);
}

export function createNativeAdapter({
  env = process.env, fetcher = fetch, now = Date.now, authorizeGrant = authorize,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  let active;

  function configure(manifest, dir) {
    const worker = env.CAMPAIGN_PILOT_WORKER;
    if (!workerPattern.test(worker ?? '') ||
        manifest.origin !== `https://${worker}.distillednews-platform.workers.dev`) throw Error('ISOLATED_PILOT_WORKER_REQUIRED');
    if (!env.CAMPAIGN_CLOUDFLARE_TOKEN) throw Error('CAMPAIGN_CLOUDFLARE_TOKEN_REQUIRED');
    const provider = env.CAMPAIGN_PROVIDER_ACCOUNT_ID;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(provider ?? '')) throw Error('CAMPAIGN_PROVIDER_ACCOUNT_ID_REQUIRED');
    const limit = Number(env.CAMPAIGN_MAX_MODEL_OPERATIONS);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxRows ||
        limit > manifest.budget.maxModelCalls) throw Error('BOUNDED_MODEL_OPERATION_LIMIT_REQUIRED');
    if (!/^[a-z0-9]{8,24}$/.test(manifest.runId)) throw Error('CAMPAIGN_RUN_ID_INVALID');
    const endpoint = target.origin + accountPath + '/workers/scripts/' + worker;
    const record = kind => reserveControlPlane(manifest, dir, kind);
    const db = qualityD1(env.CAMPAIGN_CLOUDFLARE_TOKEN, (url, init) => {
      record('cloudflare-d1');
      return fetcher(url, {...init, redirect: 'error'});
    });
    const gmail = env.CAMPAIGN_GMAIL_DIRECTORY && env.CAMPAIGN_QA_GMAIL
      ? new GmailMailbox({directory: env.CAMPAIGN_GMAIL_DIRECTORY, email: env.CAMPAIGN_QA_GMAIL, fetcher, now, onRequest: record})
      : null;
    active = {manifest, dir, provider, limit, endpoint, record, gmail, db,
      id: 'campaign:' + manifest.runId, manifestHash: digest(manifest), ready: false, scheduleAttempted: false};
  }

  function context(manifest) {
    if (!active || manifest && digest(manifest) !== active.manifestHash) throw Error('NATIVE_ADAPTER_RUN_BINDING_REQUIRED');
    return active;
  }

  async function cloud(path, init = {}, kind = 'cloudflare-worker') {
    const ctx = context();
    if (kind !== 'reserved-cron-cleanup') ctx.record(kind);
    const response = await fetcher(ctx.endpoint + path, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: {authorization: 'Bearer ' + env.CAMPAIGN_CLOUDFLARE_TOKEN, ...init.headers}
    });
    if (!response.ok) throw Error('CAMPAIGN_WORKER_API_UNAVAILABLE');
    return response;
  }

  async function cloudResult(path, init, kind) {
    const result = await (await cloud(path, init, kind)).json();
    if (result?.success !== true || !Object.hasOwn(result, 'result')) throw Error('CAMPAIGN_WORKER_API_RESULT_REQUIRED');
    return result.result;
  }

  async function settings() {
    const {bindings} = await cloudResult('/settings');
    if (!Array.isArray(bindings)) throw Error('WORKER_SETTINGS_UNAVAILABLE');
    return new Map(bindings.map(binding => [binding.name, binding]));
  }

  function isolationChecks(bindings) {
    const text = name => bindings.get(name)?.text;
    const model = context().manifest.modelConfiguration;
    const gateway = text('DISTILLED_LLM_API_GATEWAY');
    const editor = text('BRIEFING_EDITOR_MODEL') ?? 'openai/gpt-4.1';
    const verifier = text('BRIEFING_SOURCE_BINDINGS_ENABLED') === 'true'
      ? text('BRIEFING_SOURCE_BINDINGS_MODEL') ?? 'openai/gpt-4.1'
      : text('BRIEFING_VERIFIER_MODEL') ?? 'openai/gpt-4.1-mini';
    return {
      ISOLATED_DATABASE: bindings.get('DB')?.type === 'd1' && bindings.get('DB')?.id === databaseId,
      ISOLATED_CAMPAIGN_FLAGS: text('ENVIRONMENT') === 'staging' && text('AGENTOPS_CAMPAIGN_ENABLED') === 'true' &&
        text('AGENTOPS_CAMPAIGN_ISOLATED') === 'true',
      MODEL_CONFIGURATION: text('BRIEFING_ENGINE') === 'v3' && model.provider === 'openrouter' &&
        (!gateway || gateway === 'openrouter') && model.editor === editor && model.repair === editor &&
        model.verifier === verifier && bindings.has('OPENROUTER_API_KEY') && Boolean(text('SOURCE_ASSESSMENT_MODEL')) &&
        // A V5 writer profile on the Worker must be declared, with its exact model, in the manifest.
        (text('BRIEFING_V5_GENERATION_PROFILE') ?? null) === (model.v5?.profile ?? null) &&
        text('BRIEFING_V5_STAGE_ROUTES_JSON') === undefined,
      EXTERNAL_COST_CONFIGURATION: text('DISTILLED_WEB_OPERATOR_ENABLED') !== 'true' &&
        text('V1_BROWSER_ACQUISITION_ENABLED') !== 'true' &&
        !(bindings.has('SOURCE_EXECUTION_URL') && bindings.has('SOURCE_EXECUTION_TOKEN')),
      ...Object.fromEntries(forbiddenBindings.map(name => [`ABSENT_${name}`, !bindings.has(name)]))
    };
  }

  async function bundleMatches() {
    const expected = env.CAMPAIGN_EXPECTED_BUNDLE_DIGEST;
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
    const modules = await (await cloud('')).formData();
    const deployed = modules.get('index.js');
    if (!deployed) return false;
    const buffer = typeof deployed === 'string' ? Buffer.from(deployed) : Buffer.from(await deployed.arrayBuffer());
    return digest(buffer.toString('base64')) === expected;
  }

  async function trackingOff() {
    return !await context().db.prepare("SELECT 1 AS present FROM settings WHERE key GLOB 'model-spending:tracking-only:*' LIMIT 1").first();
  }

  async function isolationInventory() {
    const {db} = context();
    const {results: users} = await db.prepare("SELECT username FROM accounts WHERE role<>'admin' LIMIT 501").all();
    if (users.length > maxRows) throw Error('NATIVE_D1_ROW_LIMIT');
    const row = await db.prepare(`SELECT
      EXISTS(SELECT 1 FROM briefings WHERE COALESCE(paused,0)=0) AS activeFeeds,
      EXISTS(SELECT 1 FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
        WHERE COALESCE(s.reported,0)=0) AS outstanding`).first();
    return row && {...row, foreignAccounts: Number(users.some(user => !/^qa[a-z0-9]{8,24}u(?:0|[1-9]|1[0-9])$/.test(user.username)))};
  }

  async function providerProven() {
    const {db, provider} = context();
    return Boolean(await db.prepare(
      `SELECT account_id FROM v1_model_spending_authorizations WHERE account_id=?
       UNION ALL SELECT account_id FROM v1_model_spending_reservations WHERE account_id=? LIMIT 1`
    ).bind(provider, provider).first());
  }

  async function noCompetingGrant(modelIds, from, until, idToIgnore = '') {
    const {db} = context();
    const other = (await db.prepare(
      'SELECT json FROM v1_model_spending_authorizations WHERE valid_from<? AND valid_until>? AND id<>? LIMIT 501'
    ).bind(until, from, idToIgnore).all()).results;
    if (other.length > maxRows) throw Error('NATIVE_D1_ROW_LIMIT');
    return other.every(row => {
      const grant = JSON.parse(row.json);
      return Array.isArray(grant.modelIds) && grant.modelIds.every(model => model !== '*' && !modelIds.includes(model));
    });
  }

  function requestedGrant(bindings, validFrom) {
    const ctx = context();
    const {editor, verifier, repair} = ctx.manifest.modelConfiguration;
    const assessment = bindings.get('SOURCE_ASSESSMENT_MODEL')?.text;
    const modelIds = [...new Set([editor, verifier, repair, assessment, ctx.manifest.modelConfiguration.v5?.writer].filter(model => model !== undefined))].sort();
    if (modelIds.some(model => !model || model.includes('*'))) throw Error('CAMPAIGN_MODEL_IDS_REQUIRED');
    const {totalUsd, cloudUsd, drainUsd} = ctx.manifest.budget;
    return {id: ctx.id, accountId: ctx.provider, modelIds, maxExposureUsd: totalUsd - cloudUsd - drainUsd,
      maxOperations: ctx.limit, maxConcurrentOperations: 3, validFrom,
      validUntil: new Date(Date.parse(validFrom) + 6 * hour).toISOString(), campaignManifestHash: ctx.manifestHash};
  }

  async function grantRecord() {
    const {db, id} = context();
    const row = await db.prepare('SELECT account_id,valid_from,valid_until,json FROM v1_model_spending_authorizations WHERE id=?').bind(id).first();
    if (!row) return null;
    const grant = JSON.parse(row.json);
    if (grant.accountId !== row.account_id || Date.parse(grant.validFrom) !== Date.parse(row.valid_from) ||
        Date.parse(grant.validUntil) !== Date.parse(row.valid_until)) throw Error('CAMPAIGN_GRANT_IDENTITY_CONFLICT');
    return grant;
  }

  async function externalInventory() {
    const row = await context().db.prepare(`SELECT
      EXISTS(SELECT 1 FROM connector_provider_operations) AS externalOperations,
      EXISTS(SELECT 1 FROM browser_use_discovery_runs) AS browserRuns`).first();
    if (!row || row.externalOperations || row.browserRuns) throw Error('UNRECONCILED_EXTERNAL_OPERATION');
    return row;
  }

  async function preflight({manifest}) {
    const ctx = context(manifest);
    ctx.ready = false;
    const checks = {};
    const check = async (name, read) => {
      try { checks[name] = Boolean(await read()); } catch { checks[name] = false; }
    };
    let bindings;
    await check('WORKER_SETTINGS_READABLE', async () => Boolean(bindings = await settings()));
    if (bindings) Object.assign(checks, isolationChecks(bindings));
    await check('DEPLOYED_BUNDLE_MATCHES', bundleMatches);
    await check('RUN_GRANT_ABSENT', async () => !await grantRecord());
    await check('TRACKING_ONLY_DISABLED', trackingOff);
    await check('PROVIDER_ACCOUNT_VERIFIED', providerProven);
    let inventory;
    await check('ISOLATION_INVENTORY_READABLE', async () => Boolean(inventory = await isolationInventory()));
    checks.CAMPAIGN_ACCOUNTS_ONLY = Boolean(inventory && inventory.foreignAccounts === 0);
    checks.NO_ACTIVE_FEEDS = Boolean(inventory && inventory.activeFeeds === 0);
    checks.NO_OUTSTANDING_RESERVATIONS = Boolean(inventory && inventory.outstanding === 0);
    await check('EXTERNAL_OPERATION_LEDGER_CLEAR', async () => Boolean(await externalInventory()));
    await check('NO_COMPETING_MODEL_GRANT', async () => {
      if (!checks.MODEL_CONFIGURATION) return false;
      const grant = requestedGrant(bindings, new Date(now()).toISOString());
      return noCompetingGrant(grant.modelIds, grant.validFrom, grant.validUntil);
    });
    await check('GMAIL_READONLY_READY', async () => {
      if (!ctx.gmail) return false;
      const profile = await ctx.gmail.get('profile?fields=emailAddress', 'gmail-profile');
      return profile.emailAddress?.toLowerCase() === ctx.gmail.email;
    });
    await check('CRON_INACTIVE', async () => (await schedules()).length === 0);
    const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    ctx.ready = blockers.length === 0;
    if (ctx.ready) ctx.bindings = bindings;
    writePrivate(ctx.dir, 'native-preflight.private.json', {ready: ctx.ready, checks, blockers});
    return {ready: ctx.ready, checks, blockers};
  }

  function challenge(user, action) {
    const ctx = context();
    if (!ctx.ready) throw Error('TURNSTILE_ABSENCE_NOT_VERIFIED');
    if (!['register', 'login'].includes(action) || !Number.isSafeInteger(user?.slot) ||
        user.username !== `qa${ctx.manifest.runId}u${user.slot}` ||
        user.email !== gmailAlias(ctx.gmail.email, ctx.manifest.runId, user.slot)) throw Error('CAMPAIGN_USER_SCOPE_DENIED');
    return 'XXXX.DUMMY.TOKEN.XXXX';
  }

  async function mailbox({email, runId, registeredAt}) {
    const ctx = context();
    if (!ctx.gmail) throw Error('CAMPAIGN_GMAIL_CONFIGURATION_REQUIRED');
    if (runId !== ctx.manifest.runId) throw Error('MAILBOX_BINDING');
    for (let attempt = 0; attempt < 12; attempt++) {
      const found = await ctx.gmail.find({email, runId, registeredAt, origin: ctx.manifest.origin});
      if (found) {
        writePrivate(ctx.dir, 'mail-receipt-' + digest(email).slice(0, 12) + '.json', found.receipt);
        return found.token;
      }
      if (attempt < 11) await sleep(5000);
    }
    throw Error('VERIFICATION_EMAIL_NOT_YET_RECEIVED_NO_REREGISTRATION');
  }

  async function ownedUser(ctx, user) {
    if (!user?.id || !Number.isSafeInteger(user.slot) || user.slot < 0 || user.slot >= ctx.manifest.users ||
        user.username !== `qa${ctx.manifest.runId}u${user.slot}`) throw Error('CAMPAIGN_USER_SCOPE_DENIED');
    const account = await ctx.db.prepare(
      "SELECT username FROM accounts WHERE id=? AND role='user' AND email_verified_at IS NOT NULL AND disabled_at IS NULL"
    ).bind(user.id).first();
    if (account?.username !== user.username) throw Error('CAMPAIGN_USER_SCOPE_DENIED');
  }

  async function authorizeAccount({manifest, user}) {
    const ctx = context(manifest);
    if (!ctx.ready) throw Error('NATIVE_PREFLIGHT_REQUIRED');
    await ownedUser(ctx, user);
    if (!await trackingOff()) throw Error('TRACKING_ONLY_NOT_ALLOWED');
    let stored = await grantRecord();
    if (!stored) {
      const inventory = await isolationInventory();
      if (!inventory || inventory.foreignAccounts || inventory.activeFeeds || inventory.outstanding) throw Error('CAMPAIGN_GRANT_ISOLATION_LOST');
      const grant = requestedGrant(ctx.bindings, new Date(now()).toISOString());
      if (!await noCompetingGrant(grant.modelIds, grant.validFrom, grant.validUntil, ctx.id)) throw Error('COMPETING_MODEL_GRANT');
      try { await authorizeGrant(ctx.db, grant); } catch {
        // The atomic ledger also refuses overlap. An identical concurrent
        // insert can be recovered only by verifying the authoritative row.
      }
      stored = await grantRecord();
      if (!stored) throw Error('CAMPAIGN_GRANT_NOT_CREATED');
    }
    const expected = requestedGrant(ctx.bindings, stored.validFrom);
    if (digest(stored) !== digest(expected) || Date.parse(stored.validUntil) <= now()) throw Error('CAMPAIGN_GRANT_IDENTITY_CONFLICT');
    return {runId: manifest.runId, accountId: user.id, authoritative: true, maximumUsd: stored.maxExposureUsd / manifest.users,
      evidenceHash: digest({grant: stored, manifestHash: ctx.manifestHash, accountId: user.id})};
  }

  async function costs({manifest} = {}) {
    const ctx = context(manifest);
    const bindings = await settings();
    if (!Object.values(isolationChecks(bindings)).every(Boolean)) throw Error('UNRECONCILED_EXTERNAL_OPERATION');
    const inventory = await externalInventory();
    if (!await trackingOff()) throw Error('TRACKING_ONLY_NOT_ALLOWED');
    const grant = await grantRecord();
    if (!grant || digest(grant) !== digest(requestedGrant(bindings, grant.validFrom))) throw Error('CAMPAIGN_GRANT_IDENTITY_CONFLICT');
    const rows = (await ctx.db.prepare(`SELECT r.id,r.authorization_id AS authorizationId,
      r.reserved_cost_usd AS reservedUsd,r.lease_until AS leaseUntil,s.cost_usd AS settledUsd,s.reported
      FROM v1_model_spending_reservations r INDEXED BY v1_model_spending_reservation_account
      LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? AND r.created_at>=?
      ORDER BY r.created_at,r.id LIMIT ?`).bind(ctx.provider, grant.validFrom, grant.maxOperations + 1).all()).results;
    if (rows.length > grant.maxOperations || rows.length > maxRows) throw Error('OPERATION_LIMIT_VIOLATION');
    if (rows.some(row => row.authorizationId !== grant.id)) throw Error('UNSCOPED_LEDGER_OPERATION');
    const observedAt = now();
    const modelLedger = rows.map(row => ({
      id: row.id, reservedUsd: row.reservedUsd, settledUsd: row.settledUsd, reported: row.reported === 1,
      calls: row.reported === 1 ? 1 : 0,
      outcome: row.reported === 1 ? 'SETTLED' : row.leaseUntil <= observedAt ? 'UNCERTAIN' : 'IN_FLIGHT'
    }));
    const evidenceHash = digest({inventory, ledgerIds: rows.map(row => row.id),
      bindingChecks: isolationChecks(bindings), grant: grant.id});
    const external = ['source-assessment', 'artwork', 'browser-tools', 'external-collectors'].map(kind => ({
      kind, evidenceHash, coverage: 'COMPLETE', includedInModelLedger: kind === 'source-assessment',
      settledUsd: 0, heldUsd: 0, uncertainOperations: 0
    }));
    return reconcileAccounting({modelLedger, external, observedAt: new Date(observedAt).toISOString()}, observedAt);
  }

  async function browserEvidence({manifest, user}) {
    const ctx = context(manifest);
    await ownedUser(ctx, user);
    const {results: runs} = await ctx.db.prepare(`SELECT a.run_id AS runId,a.tenant_id AS ownerId,a.state,
      (SELECT MIN(started_at) FROM agent_run_attempts WHERE run_id=a.run_id) AS startedAt,
      (SELECT COUNT(*) FROM agent_tool_calls WHERE run_id=a.run_id) AS toolCalls
      FROM agent_runs a WHERE a.tenant_id=? ORDER BY a.created_at DESC,a.run_id LIMIT 50`).bind(user.id).all();
    return {runId: manifest.runId, runs};
  }

  async function schedules(kind = 'cloudflare-cron') {
    const {schedules: result} = await cloudResult('/schedules', undefined, kind);
    if (!Array.isArray(result) || result.some(item => typeof item?.cron !== 'string')) throw Error('CAMPAIGN_CRON_STATE_UNKNOWN');
    return result.map(item => item.cron);
  }

  async function setSchedule(enabled, kind) {
    const ctx = context();
    journal(ctx.dir, {category: 'isolated-cron', state: 'REQUESTED', enabled});
    await cloudResult('/schedules', {
      method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify(enabled ? [{cron}] : [])
    }, kind);
    const state = await schedules(kind);
    if (digest(state) !== digest(enabled ? [cron] : [])) throw Error('CAMPAIGN_CRON_READBACK_MISMATCH');
    journal(ctx.dir, {category: 'isolated-cron', state: 'VERIFIED', enabled});
  }

  async function startSchedule() {
    const ctx = context();
    const bindings = await settings();
    if (!Object.values(isolationChecks(bindings)).every(Boolean) || !await bundleMatches()) throw Error('CAMPAIGN_CRON_ISOLATION_UNVERIFIED');
    const grant = await grantRecord();
    if (!grant || digest(grant) !== digest(requestedGrant(bindings, grant.validFrom)) ||
        Date.parse(grant.validUntil) <= now()) throw Error('CAMPAIGN_CRON_GRANT_REQUIRED');
    if ((await schedules()).length) throw Error('CAMPAIGN_CRON_ALREADY_CONFIGURED');
    // Reserve shutdown's read, write, and read-back before a schedule can start.
    for (let i = 0; i < 3; i++) ctx.record('cloudflare-cron-cleanup-reserve');
    // A timed-out PUT can still take effect. Arm cleanup before sending it.
    ctx.scheduleAttempted = true;
    await setSchedule(true, 'cloudflare-cron');
  }

  async function stopSchedule() {
    const ctx = context();
    if (!ctx.scheduleAttempted) return;
    const current = await schedules('reserved-cron-cleanup');
    if (current.length && (current.length !== 1 || current[0] !== cron)) throw Error('CAMPAIGN_CRON_CHANGED_EXTERNALLY');
    if (current.length) await setSchedule(false, 'reserved-cron-cleanup');
    ctx.scheduleAttempted = false;
  }

  return {configure, challenge, mailbox, authorizeAccount, preflight, costs, browserEvidence, startSchedule, stopSchedule};
}

const native = createNativeAdapter();
export const {configure, challenge, mailbox, authorizeAccount, preflight, costs, browserEvidence, startSchedule, stopSchedule} = native;
