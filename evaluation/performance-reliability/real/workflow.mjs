import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {privateDirectory,writePrivate} from './client.mjs';
import {validateManifest,admit,assertStartupFresh} from './manifest.mjs';
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';

export function adapterFor(kind) {
  if (!kind || kind === 'bridge') return 'adapter.mjs';
  if (kind === 'native') return 'native-adapter.mjs';
  throw Error('UNKNOWN_CAMPAIGN_ADAPTER_KIND');
}

export async function runCampaignPhases(phases, run, schedule) {
  let code = 0;
  try {
    for (const phase of phases) {
      if (phase === 'campaign' && schedule) {
        try {
          await schedule.startSchedule();
          code = await run(phase);
        } finally {
          await schedule.stopSchedule();
        }
      } else {
        code = await run(phase);
      }
      if (code !== 0) break;
    }
  } catch {
    console.error('Campaign phase or schedule control failed. Check the private run journal.');
    if (code === 0) code = 1;
  } finally {
    // Preserve the original failure code when cleanup also fails.
    if (!phases.includes('cleanup')) {
      try { const cleanup = await run('cleanup'); if (code === 0) code = cleanup; }
      catch { if (code === 0) code = 1; }
    }
  }
  return code;
}

async function main(env) {
  const file = adapterFor(env.CAMPAIGN_ADAPTER_KIND);
  const native = file === 'native-adapter.mjs';
  if (!/^[a-f0-9]{64}$/i.test(env.CAMPAIGN_ARTIFACT_KEY ?? '')) throw Error('DURABLE_PRIVATE_ARTIFACT_STORAGE_REQUIRED');
  // Native runs build their bundle inside the approved job unless an operator
  // explicitly supplies one. The required environment reviewer is the sign-off.
  const bundle = env.CAMPAIGN_PRIVATE_BUNDLE
    ? JSON.parse(env.CAMPAIGN_PRIVATE_BUNDLE)
    : native ? await (await import('./auto-bundle.mjs')).buildAutoBundle(env) : null;
  if (!bundle || !['run', 'setup', 'plan', 'campaign', 'cleanup'].includes(bundle.phase)) throw Error('REVIEWED_PRIVATE_WORKFLOW_BUNDLE_REQUIRED');
  const manifest = validateManifest(bundle.manifest);
  if (manifest.revision !== env.GITHUB_SHA) throw Error('EXACT_WORKFLOW_REVISION_REQUIRED');
  if (native && bundle.phase === 'campaign') throw Error('NATIVE_CAMPAIGN_REQUIRES_FULL_RUN');
  const phases = bundle.phase === 'run' ? ['setup', 'plan', 'campaign'] : [bundle.phase];
  const approve = phase => admit(manifest, bundle.preflight, bundle.approval, phase);
  for (const phase of new Set([...phases, 'cleanup'])) approve(phase);
  if (native && phases.includes('campaign')) {
    for (const phase of ['observe', 'traffic', 'telemetry', ...(manifest.faults.length ? ['faults'] : [])]) approve(phase);
    const resources = bundle.files?.['resources.private.json'];
    const endpointPath = new URL(QUALITY_EVALUATION_D1).pathname.split('/');
    if (!resources || resources.isolated !== true || resources.runId !== manifest.runId ||
        resources.worker !== env.CAMPAIGN_PILOT_WORKER || resources.accountId !== endpointPath[4] ||
        resources.databaseId !== endpointPath.at(-2) || !Array.isArray(resources.queueIds) ||
        resources.queueIds.length < 1 || resources.queueIds.length > 5 ||
        resources.queueIds.some(id => !/^[a-f0-9]{32}$/.test(id))) throw Error('ISOLATED_RESOURCE_BINDING');
  }
  const dir = privateDirectory(manifest.runId);
  for (const [name, data] of Object.entries(bundle.files ?? {})) {
    if (!['registry.private.json', 'plan.private.json', 'resources.private.json'].includes(name)) throw Error('BUNDLE_FILE_NOT_ALLOWED');
    writePrivate(dir, name, data);
  }
  for (const [name, data] of [['manifest.private.json', manifest], ['preflight.private.json', bundle.preflight],
    ['approval.private.json', bundle.approval]]) writePrivate(dir, name, data);
  let schedule;
  if (native && phases.includes('campaign')) {
    const adapter = await import('./native-adapter.mjs');
    adapter.configure(manifest, dir);
    schedule = {
      startSchedule() {
        assertStartupFresh(bundle.preflight, 'campaign');
        approve('campaign');
        approve('cleanup');
        const requiredTime = manifest.cleanupReserveRequests * 15_000 + manifest.observeSeconds * 1000;
        if (Date.parse(bundle.approval.expiresAt) - Date.now() < requiredTime) throw Error('SCOPE_MUST_COVER_WORK_AND_CLEANUP');
        return adapter.startSchedule();
      },
      stopSchedule: adapter.stopSchedule
    };
  }
  const run = phase => new Promise(resolveExit => {
    const child = spawn(process.execPath, ['evaluation/performance-reliability/real/run.mjs', phase,
      resolve(dir, 'manifest.private.json'), resolve(dir, 'preflight.private.json'), resolve(dir, 'approval.private.json')], {
      env: {...env, CAMPAIGN_ADAPTER: resolve('evaluation/performance-reliability/real', file),
        CAMPAIGN_EXPORT_METRICS: native ? 'true' : env.CAMPAIGN_EXPORT_METRICS,
        CAMPAIGN_WORKFLOW_OWNS_CLEANUP: schedule ? 'true' : 'false',
        K6_NO_USAGE_REPORT: 'true', K6_AUTO_EXTENSION_RESOLUTION: 'false'},
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    child.stderr.resume();
    child.once('error', () => resolveExit(1));
    child.once('exit', code => { console.log(`Campaign phase ${phase} exited with code ${code ?? 1}`); resolveExit(code ?? 1); });
  });
  const code = await runCampaignPhases(phases, run, schedule);
  if (code !== 0) printStopReasons(dir);
  return code;
}

/** Phase output stays private; only the journal's sanitized stop codes are printed. */
export function printStopReasons(dir) {
  let lines = [];
  try { lines = readFileSync(resolve(dir, 'journal.jsonl'), 'utf8').trim().split('\n'); } catch { return; }
  const code = value => String(value ?? '').replace(/[^A-Z0-9_]/gi, '_').slice(0, 160);
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (['phase-stopped', 'cleanup-required', 'URGENT_MANUAL_ROLLBACK_REQUIRED'].includes(event.category))
      console.error(`Campaign ${code(event.category)}: phase=${code(event.phase)} reason=${code(event.reason)}`);
    if (event.category === 'setup-result' && Array.isArray(event.users))
      for (const user of event.users) if (user?.status === 'rejected')
        console.error(`Campaign setup user ${Number(user.slot)}: stopped at ${code(user.state)} reason=${code(user.reason)}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(process.env); }
  catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CAMPAIGN_WORKFLOW_FAILED';
    console.error(code);
    process.exitCode = 1;
  }
}
