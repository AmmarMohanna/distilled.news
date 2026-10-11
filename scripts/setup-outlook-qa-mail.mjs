// One-time, interactive QA mailbox authorization. Never prints or writes OAuth tokens.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { requestMicrosoft } from './outlook-qa-request.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'apps/worker');
const config = resolve(workerDir, 'wrangler.sources-qa.toml');
const wrangler = resolve(workerDir, 'node_modules/wrangler/bin/wrangler.js');
const clientId = process.argv[2]?.trim();
if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
  console.error('Usage: node scripts/setup-outlook-qa-mail.mjs <Microsoft Application (client) ID>');
  process.exit(2);
}

const authority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scopes = 'offline_access Mail.Send User.Read';
const deviceResponse = await requestMicrosoft(`${authority}/devicecode`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, scope: scopes })
});
const device = await deviceResponse.json();
if (!deviceResponse.ok || !device.device_code || !device.user_code) {
  throw new Error(`Microsoft device authorization failed (${deviceResponse.status}, ${device.error || 'unknown'}, codes: ${JSON.stringify(device.error_codes || [])})`);
}
console.log(device.message || `Open ${device.verification_uri} and enter code ${device.user_code}`);
console.log('Authorize only the distilled.news@outlook.com account. Waiting for Microsoft...');

const end = Date.now() + Number(device.expires_in || 900) * 1000;
let interval = Math.max(5, Number(device.interval || 5));
let tokens;
while (Date.now() < end) {
  await new Promise(done => setTimeout(done, interval * 1000));
  let response;
  try {
    response = await requestMicrosoft(`${authority}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: device.device_code
    })
    });
  } catch {
    console.log('Temporary Microsoft connection failure; keeping this authorization session active.');
    continue;
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) continue;
  const result = await response.json();
  if (response.ok) { tokens = result; break; }
  if (result.error === 'authorization_pending') continue;
  if (result.error === 'slow_down') { interval += 5; continue; }
  throw new Error(`Microsoft authorization failed (${result.error || response.status})`);
}
if (!tokens?.access_token || !tokens?.refresh_token) throw new Error('Microsoft authorization expired or returned no refresh token');

const profileResponse = await requestMicrosoft('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
  headers: { authorization: `Bearer ${tokens.access_token}` }
});
if (!profileResponse.ok) throw new Error(`Outlook mailbox verification failed (${profileResponse.status})`);
const profile = await profileResponse.json();
const expectedSender = 'distilled.news@outlook.com';
if (![profile.mail, profile.userPrincipalName].some(value => value?.toLowerCase() === expectedSender)) {
  throw new Error('Authorized Microsoft account is not distilled.news@outlook.com; no secrets were installed');
}

function putSecret(name, value) {
  const result = spawnSync(process.execPath, [wrangler, 'secret', 'put', name, '--config', config], {
    cwd: workerDir,
    input: `${value}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Cloudflare could not save ${name}; rerun authorization after fixing Wrangler login`);
}

putSecret('OUTLOOK_CLIENT_ID', clientId);
putSecret('OUTLOOK_TOKEN_ENCRYPTION_KEY', randomBytes(48).toString('base64url'));
putSecret('OUTLOOK_REFRESH_TOKEN', tokens.refresh_token);
const reset = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--remote', '--config', config,
  '--command', "DELETE FROM mail_oauth_tokens WHERE provider = 'outlook'"], {
  cwd: workerDir,
  stdio: 'inherit',
  env: process.env
});
if (reset.error) throw reset.error;
if (reset.status !== 0) throw new Error('QA token row could not be reset after replacing the encryption key');
console.log('QA Outlook secrets installed and previous token state reset. Deploy the QA Worker before testing signup.');
