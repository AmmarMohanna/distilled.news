import {readFileSync} from 'node:fs';
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';
import {privateDirectory, writePrivate} from './client.mjs';
import {digest, preflight as manifestPreflight, validateManifest} from './manifest.mjs';
import {createNativeAdapter} from './native-adapter.mjs';

/**
 * Builds the protected-run bundle inside the approved GitHub job instead of
 * asking an operator to paste a short-lived CAMPAIGN_PRIVATE_BUNDLE secret.
 *
 * Human authorization is the GitHub environment's required reviewer, who
 * approves the job before any of this runs. The spending ceiling is the
 * CAMPAIGN_MAX_USD variable that repository admins set. Every readiness fact is
 * either measured live here or listed under `declared` in the private
 * evidence file. Nothing in this file creates grants, accounts or schedules.
 */

export const AUTO_PROFILES = ['load', 'spike', 'stress', 'soak'];
const HARD_MAX_USD = 50;
const APPROVAL_HOURS = 6;

// Capacity facts the run cannot measure before it starts. Values are the ones
// the November pilot used; override with CAMPAIGN_CAPACITY_JSON when they change.
export const DEFAULT_CAPACITY = Object.freeze({
  workersPlan: 'Paid',
  grafanaWillNotUpgrade: true,
  workerCpuBudgetMs: 2_000_000,
  cpuCeilingMsPerRequest: 500,
  d1ReadBudget: 10_000_000,
  estimatedRowsRead: 1_000_000,
  d1WriteBudget: 1_000_000,
  estimatedRowsWritten: 100_000
});

const fail = code => { throw Error(code); };

function positiveNumber(value, code) {
  const n = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(n) || n <= 0) fail(code);
  return n;
}

export function capacityFrom(env) {
  if (!env.CAMPAIGN_CAPACITY_JSON) return {...DEFAULT_CAPACITY};
  let parsed;
  try { parsed = JSON.parse(env.CAMPAIGN_CAPACITY_JSON); } catch { fail('CAMPAIGN_CAPACITY_JSON_INVALID'); }
  const out = {...DEFAULT_CAPACITY};
  for (const key of Object.keys(DEFAULT_CAPACITY)) if (Object.hasOwn(parsed, key)) out[key] = parsed[key];
  return out;
}

export function runIdFor(env) {
  const explicit = env.CAMPAIGN_RUN_ID;
  const id = explicit || ('gh' + (env.GITHUB_RUN_ID ?? '') + 'a' + (env.GITHUB_RUN_ATTEMPT ?? '1')).toLowerCase();
  if (!/^[a-z0-9]{8,24}$/.test(id)) fail('CAMPAIGN_RUN_ID_INVALID');
  return id;
}

/** Fill a reviewed draft with this run's identity, commit and budget. */
export function buildManifest(draft, env) {
  const profile = env.CAMPAIGN_PROFILE || 'load';
  if (!AUTO_PROFILES.includes(profile) || draft.profile !== profile) fail('AUTO_BUNDLE_PROFILE_UNSUPPORTED');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) fail('EXACT_WORKFLOW_REVISION_REQUIRED');
  const worker = env.CAMPAIGN_PILOT_WORKER;
  if (!/^distilled-news-staging-campaign-[a-z0-9-]+$/.test(worker ?? '')) fail('ISOLATED_PILOT_WORKER_REQUIRED');
  const totalUsd = positiveNumber(env.CAMPAIGN_MAX_USD, 'CAMPAIGN_MAX_USD_REQUIRED');
  if (totalUsd > HARD_MAX_USD) fail('CAMPAIGN_MAX_USD_ABOVE_HARD_LIMIT');
  const cloudUsd = env.CAMPAIGN_CLOUD_USD ? positiveNumber(env.CAMPAIGN_CLOUD_USD, 'CAMPAIGN_CLOUD_USD_INVALID') : 0.2;
  const drainUsd = draft.budget.drainUsd;
  if (!(totalUsd - cloudUsd - drainUsd > 0)) fail('CAMPAIGN_MAX_USD_TOO_SMALL_FOR_CLOUD_AND_DRAIN');
  const maxModelCalls = Number(env.CAMPAIGN_MAX_MODEL_OPERATIONS);
  if (!Number.isSafeInteger(maxModelCalls) || maxModelCalls < 1) fail('BOUNDED_MODEL_OPERATION_LIMIT_REQUIRED');
  const sourceAuthorization = (env.CAMPAIGN_SOURCE_AUTHORIZATION ?? '').trim();
  if (!sourceAuthorization || sourceAuthorization.startsWith('DRAFT')) fail('CAMPAIGN_SOURCE_AUTHORIZATION_REQUIRED');
  return validateManifest({
    ...structuredClone(draft),
    runId: runIdFor(env),
    origin: `https://${worker}.distillednews-platform.workers.dev`,
    revision: env.GITHUB_SHA,
    budget: {totalUsd, cloudUsd, drainUsd, maxModelCalls},
    sourceAuthorization: {evidenceId: sourceAuthorization}
  });
}

const target = new URL(QUALITY_EVALUATION_D1);
const accountId = target.pathname.split('/')[4];
const databaseId = target.pathname.split('/').at(-2);
const cloudflareAccount = 'https://api.cloudflare.com' + target.pathname.split('/d1/')[0];

async function json(fetcher, url, init, code) {
  const response = await fetcher(url, {redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init});
  if (!response.ok) fail(code);
  return response.json();
}

/** Isolated resource registry, read from the deployed Worker's bindings. */
export async function readResources(m, env, fetcher) {
  const auth = {authorization: 'Bearer ' + env.CAMPAIGN_CLOUDFLARE_TOKEN};
  const settings = await json(fetcher, `${cloudflareAccount}/workers/scripts/${env.CAMPAIGN_PILOT_WORKER}/settings`,
    {headers: auth}, 'WORKER_SETTINGS_UNAVAILABLE');
  const bindings = settings?.result?.bindings ?? [];
  const queueNames = bindings.filter(b => b.type === 'queue').map(b => b.queue_name);
  const queues = await json(fetcher, `${cloudflareAccount}/queues?per_page=100`, {headers: auth}, 'QUEUE_LIST_UNAVAILABLE');
  const byName = new Map((queues?.result ?? []).map(q => [q.queue_name, q.queue_id]));
  const queueIds = [...new Set(queueNames.map(name => byName.get(name)))];
  const bucket = bindings.find(b => b.type === 'r2_bucket');
  const facts = {
    isolatedQueues: queueNames.length >= 1 && queueNames.length <= 5 && queueNames.every(n => /campaign/.test(n ?? '')) &&
      queueIds.length === queueNames.length && queueIds.every(id => /^[a-f0-9]{32}$/.test(id ?? '')),
    isolatedBucket: Boolean(bucket && /campaign/.test(bucket.bucket_name ?? ''))
  };
  return {facts, resources: {runId: m.runId, isolated: true, accountId, worker: env.CAMPAIGN_PILOT_WORKER, databaseId, queueIds}};
}

/** Current public OpenRouter prices for exactly the manifest's models. */
export async function readPricing(m, fetcher) {
  try {
    const body = await json(fetcher, 'https://openrouter.ai/api/v1/models', {}, 'PRICING_UNAVAILABLE');
    const wanted = [...new Set(['editor', 'verifier', 'repair'].map(k => m.modelConfiguration[k]))].sort();
    const found = wanted.map(id => (body?.data ?? []).find(model => model.id === id));
    if (found.some(model => !model?.pricing)) return null;
    return Object.fromEntries(found.map(model => [model.id, model.pricing]));
  } catch { return null; }
}

/** The admin session the observer will use is real and still an admin. */
export async function adminSessionReady(m, env, fetcher) {
  if (!/^dn_session=/.test(env.CAMPAIGN_ADMIN_COOKIE ?? '')) return false;
  try {
    const body = await json(fetcher, m.origin + '/api/auth/session', {headers: {cookie: env.CAMPAIGN_ADMIN_COOKIE}}, 'SESSION_UNAVAILABLE');
    return body?.authenticated === true && body?.account?.role === 'admin';
  } catch { return false; }
}

/** Authenticated no-op OTLP write: proves the Grafana credential without adding series. */
export async function grafanaReady(env, fetcher) {
  try {
    const url = new URL(env.CAMPAIGN_GRAFANA_OTLP_URL);
    if (url.protocol !== 'https:' || !/^otlp-gateway-[a-z0-9-]+\.grafana\.net$/.test(url.hostname) ||
        url.pathname !== '/otlp/v1/metrics' || url.search || !env.CAMPAIGN_GRAFANA_AUTH) return false;
    const r = await fetcher(url, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: {authorization: env.CAMPAIGN_GRAFANA_AUTH, 'content-type': 'application/json'},
      body: JSON.stringify({resourceMetrics: []})});
    return r.ok;
  } catch { return false; }
}

export function buildEvidence({manifest: m, live, resourceFacts, pricing, adminReady, grafana, capacity, now}) {
  const c = live.checks ?? {};
  const all = (...names) => names.every(n => c[n] === true);
  const isolated = all('WORKER_SETTINGS_READABLE', 'DEPLOYED_BUNDLE_MATCHES', 'ISOLATED_CAMPAIGN_FLAGS');
  const admission = all('RUN_GRANT_ABSENT', 'TRACKING_ONLY_DISABLED', 'PROVIDER_ACCOUNT_VERIFIED', 'NO_COMPETING_MODEL_GRANT');
  const ledgerClear = all('NO_OUTSTANDING_RESERVATIONS', 'EXTERNAL_OPERATION_LEDGER_CLEAR');
  const helperOnly = m.feeds.filter(f => f.sources.every(s => /^https:\/\/t\.me\//.test(s))).map(f => f.topic.slice(0, 60));
  const at = new Date(now).toISOString();
  return {
    observedAt: at,
    origin: m.origin,
    // The campaign Worker is pinned by its deployed bundle digest, not by this
    // harness commit. The revision is only asserted when that digest matched.
    revision: c.DEPLOYED_BUNDLE_MATCHES === true ? m.revision : null,
    deployedCodeVerifiedBy: 'CAMPAIGN_EXPECTED_BUNDLE_DIGEST',
    modelConfigurationHash: c.MODEL_CONFIGURATION === true ? digest(m.modelConfiguration) : null,
    providerPricingHash: pricing ? digest(pricing) : null,
    providerPricingObservedAt: pricing ? at : null,
    isolatedWorker: isolated && c.CAMPAIGN_ACCOUNTS_ONLY === true,
    isolatedDatabase: c.ISOLATED_DATABASE === true,
    isolatedQueues: resourceFacts.isolatedQueues,
    isolatedBucket: resourceFacts.isolatedBucket,
    notificationsDisabled: c.ABSENT_VAPID_PRIVATE_KEY === true,
    v3Enabled: c.MODEL_CONFIGURATION === true,
    sourceCollectorsReady: c.EXTERNAL_COST_CONFIGURATION === true && m.feeds.some(f => f.sources.some(s => !/^https:\/\/t\.me\//.test(s))),
    mailboxReady: c.GMAIL_READONLY_READY === true,
    authenticationReady: adminReady && c.ABSENT_TURNSTILE_SECRET_KEY === true,
    campaignObserverReady: adminReady && c.ISOLATED_CAMPAIGN_FLAGS === true,
    accountSpendingAdmissionReady: admission,
    grafanaReady: grafana,
    allStageCostCoverageReady: ledgerClear && c.EXTERNAL_COST_CONFIGURATION === true,
    authoritativeTaskBudgetReady: admission,
    workersPlan: capacity.workersPlan,
    grafanaWillNotUpgrade: capacity.grafanaWillNotUpgrade,
    ledgerUnknownUsd: ledgerClear ? 0 : null,
    // The native grant caps paid model exposure atomically on the server.
    providerWorstCaseUsd: m.budget.totalUsd - m.budget.cloudUsd - m.budget.drainUsd,
    modelCallCeiling: m.budget.maxModelCalls,
    remainingExecutionSlots: c.CRON_INACTIVE === true ? 3 : 0,
    workerCpuBudgetMs: capacity.workerCpuBudgetMs,
    cpuCeilingMsPerRequest: capacity.cpuCeilingMsPerRequest,
    d1ReadBudget: capacity.d1ReadBudget,
    estimatedRowsRead: capacity.estimatedRowsRead,
    d1WriteBudget: capacity.d1WriteBudget,
    estimatedRowsWritten: capacity.estimatedRowsWritten,
    estimatedCloudUsd: m.budget.cloudUsd,
    declared: ['workersPlan', 'grafanaWillNotUpgrade', 'workerCpuBudgetMs', 'cpuCeilingMsPerRequest',
      'd1ReadBudget', 'estimatedRowsRead', 'd1WriteBudget', 'estimatedRowsWritten', 'estimatedCloudUsd'],
    nativeChecks: c,
    limitations: [
      ...(helperOnly.length ? [`Feeds with Telegram-only sources stay quiet without the source helper: ${helperOnly.join(' | ')}`] : []),
      'Deployed application code is verified by bundle digest, not by the harness commit',
      'Capacity figures are declared; live resource reads continue during the run'
    ]
  };
}

export function buildApproval({manifest: m, preflight: pf, env, now}) {
  const phases = ['setup', 'plan', 'campaign', 'observe', 'traffic', 'telemetry', 'cleanup', ...(m.faults.length ? ['faults'] : [])];
  return {
    schemaVersion: 'distilled-real-approval.v1',
    manifestHash: digest(m),
    preflightHash: digest(pf),
    revision: m.revision,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + APPROVAL_HOURS * 3_600_000).toISOString(),
    phases,
    maximumUsd: m.budget.totalUsd,
    maximumRequests: m.requestBudget + m.controlPlaneRequestBudget,
    maximumModelCalls: m.budget.maxModelCalls,
    authorizedBy: {
      kind: 'github-environment-required-reviewer',
      environment: 'agentops-multiuser-staging-approval',
      repository: env.GITHUB_REPOSITORY ?? null,
      runId: env.GITHUB_RUN_ID ?? null,
      triggeredBy: env.GITHUB_ACTOR ?? null,
      budgetCeilingVariable: 'CAMPAIGN_MAX_USD'
    }
  };
}

export async function buildAutoBundle(env, {fetcher = fetch, now = Date.now, adapter, root} = {}) {
  const profile = env.CAMPAIGN_PROFILE || 'load';
  if (!AUTO_PROFILES.includes(profile)) fail('AUTO_BUNDLE_PROFILE_UNSUPPORTED');
  const draftPath = new URL(`./manifests/${profile}.draft.json`, import.meta.url);
  const manifest = buildManifest(JSON.parse(readFileSync(draftPath, 'utf8')), env);
  const dir = privateDirectory(manifest.runId, root);
  const native = adapter ?? createNativeAdapter({env, fetcher, now});
  native.configure(manifest, dir);
  const live = await native.preflight({manifest});
  const {facts: resourceFacts, resources} = await readResources(manifest, env, fetcher);
  const [pricing, adminReady, grafana] = await Promise.all([
    readPricing(manifest, fetcher), adminSessionReady(manifest, env, fetcher), grafanaReady(env, fetcher)]);
  const evidence = buildEvidence({manifest, live, resourceFacts, pricing, adminReady, grafana,
    capacity: capacityFrom(env), now: now()});
  const pf = manifestPreflight(manifest, evidence, now());
  writePrivate(dir, 'auto-preflight-evidence.private.json', evidence);
  if (pf.status !== 'READY' || !live.ready) {
    const blockers = [...new Set([...pf.blockers, ...(live.blockers ?? [])])];
    console.error('Campaign preflight blocked: ' + blockers.join(', '));
    // Root causes first: everything else in the list is derived from these.
    const failedLive = Object.entries(live.checks ?? {}).filter(([, ok]) => ok !== true).map(([name]) => name);
    console.error('Live checks failed: ' + (failedLive.join(', ') || 'none') +
      ` | admin session: ${adminReady ? 'ok' : 'NOT ADMIN OR EXPIRED (refresh CAMPAIGN_ADMIN_COOKIE)'}` +
      ` | Grafana: ${grafana ? 'ok' : 'REJECTED'} | pricing: ${pricing ? 'ok' : 'UNAVAILABLE'}` +
      ` | queues isolated: ${resourceFacts.isolatedQueues} | bucket isolated: ${resourceFacts.isolatedBucket}`);
    fail('AUTO_PREFLIGHT_BLOCKED');
  }
  const approval = buildApproval({manifest, preflight: pf, env, now: now()});
  console.log(JSON.stringify({autoBundle: 'READY', runId: manifest.runId, profile, revision: manifest.revision,
    maximumUsd: approval.maximumUsd, maximumModelCalls: approval.maximumModelCalls, expiresAt: approval.expiresAt}));
  return {phase: 'run', manifest, preflight: pf, approval, files: {'resources.private.json': resources}};
}
