// Fixed integration target. No caller-controlled Worker, environment, route, or schedule flags.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INTEGRATION_WORKER, INTEGRATION_ACCOUNT, validateIntegrationTarget, missingIntegrationSecrets } from './integration-deploy-target.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = resolve(root, 'apps/worker');
const configPath = resolve(worker, 'wrangler.integration.jsonc');
const wrangler = resolve(worker, 'node_modules/wrangler/bin/wrangler.js');
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, 'secrets-file': { type: 'string' } }, allowPositionals: false });
const require = createRequire(import.meta.url);
const { experimental_readRawConfig } = require(resolve(worker, 'node_modules/wrangler'));
const config = experimental_readRawConfig({ config: configPath }).rawConfig;
validateIntegrationTarget(config);
if (!existsSync(resolve(worker, config.assets.directory, 'index.html'))) throw new Error('BUILD_FRONTEND_FIRST: corepack pnpm --filter @distilled/web build');
const flags = ['--config', configPath, '--name', INTEGRATION_WORKER];
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: INTEGRATION_ACCOUNT, CLOUDFLARE_ENV: '', WRANGLER_CI_OVERRIDE_NAME: INTEGRATION_WORKER, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };
function run(args, stdio = 'inherit') {
  return spawnSync(process.execPath, [wrangler, ...args], { cwd: worker, env, encoding: 'utf8', stdio, windowsHide: true });
}
let supplied = {};
let secretsPath;
if (values['secrets-file']) {
  secretsPath = resolve(values['secrets-file']);
  try { supplied = JSON.parse(readFileSync(secretsPath, 'utf8')); }
  catch { throw new Error('INTEGRATION_SECRETS_FILE_MUST_BE_READABLE_JSON'); }
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('INTEGRATION_SECRETS_FILE_MUST_BE_JSON_OBJECT');
}
let missing = missingIntegrationSecrets(config.secrets.required, [], supplied);
if (!values['dry-run'] && missing.length) {
  const result = run(['secret', 'list', ...flags], 'pipe');
  if (result.error || result.status !== 0) throw new Error('CANNOT_READ_INTEGRATION_SECRET_NAMES: authenticate Wrangler, or provide all required secrets using --secrets-file');
  let installed;
  try { installed = JSON.parse(result.stdout).map(secret => secret.name); }
  catch { throw new Error('INVALID_INTEGRATION_SECRET_METADATA'); }
  missing = missingIntegrationSecrets(config.secrets.required, installed, supplied);
  if (missing.length) throw new Error('MISSING_INTEGRATION_SECRETS: ' + missing.join(', '));
}
console.log('Target: ' + INTEGRATION_WORKER + '; Cron, routes and queue consumers disabled. Shared staging data bindings remain writable.');
if (values['dry-run']) console.log('Dry run only: installed secret values and presence are not verified.');
const args = ['deploy', ...flags, '--message', 'Independent integration deployment from integration/backend-sources-ai-editorial-frontend'];
if (values['dry-run']) args.push('--dry-run', '--outdir', resolve(root, '.review-tmp/integration-deployment/bundle'));
if (secretsPath) args.push('--secrets-file', secretsPath);
const result = run(args);
if (result.error || result.status !== 0) process.exit(result.status || 1);
