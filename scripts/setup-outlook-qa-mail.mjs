// Explicitly targeted interactive Outlook setup. Existing secrets and token rows are never reset.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import {selectMailTarget, verifyDeployedTarget, verifySecretBase, planMailSetup, installMailSecrets} from './outlook-mail-target.mjs';
import { requestMicrosoft } from './outlook-qa-request.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'apps/worker');
const {values}=parseArgs({options:{config:{type:'string'},env:{type:'string'},account:{type:'string'},worker:{type:'string'},database:{type:'string'},origin:{type:'string'},'client-id':{type:'string'},authorize:{type:'boolean',default:false}},allowPositionals:false});
if(!values.config)throw new Error('EXPLICIT_CONFIG_REQUIRED');
const config=resolve(root,values.config),wrangler=resolve(workerDir,'node_modules/wrangler/bin/wrangler.js');
const require=createRequire(import.meta.url),{unstable_readConfig,experimental_readRawConfig}=require(resolve(workerDir,'node_modules/wrangler'));
if(values.env&&!experimental_readRawConfig({config}).rawConfig.env?.[values.env])throw new Error('UNKNOWN_WRANGLER_ENVIRONMENT');
const selected=unstable_readConfig({config,...(values.env?{env:values.env}:{})});
const target=selectMailTarget(selected,{account:values.account,worker:values.worker,database:values.database,origin:values.origin});
const clientId=values['client-id']?.trim();
if(!clientId||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId))throw new Error('MICROSOFT_CLIENT_ID_REQUIRED');
function run(args,options={}){return spawnSync(process.execPath,[wrangler,...args],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'},...options});}
function jsonCommand(args){const result=run([...args,'--config',config,...(values.env?['--env',values.env]:[]),...(args[0]==='secret'?[]:['--json'])]);if(result.error||result.status!==0)throw new Error('TARGET_READ_FAILED: verify Cloudflare access and selected environment');try{return JSON.parse(result.stdout)}catch{throw new Error('INVALID_TARGET_METADATA')}}
function inspectTarget(){
  const deployments=jsonCommand(['deployments','list']).sort((a,b)=>b.created_on.localeCompare(a.created_on)),deployment=deployments[0];
  if(!deployment||deployment.versions.length!==1||deployment.versions[0].percentage!==100)throw new Error('AMBIGUOUS_DEPLOYMENT');
  const version=jsonCommand(['versions','view',deployment.versions[0].version_id]);verifyDeployedTarget(target,version);
  const versions=jsonCommand(['versions','list']).sort((a,b)=>b.metadata.created_on.localeCompare(a.metadata.created_on)),latest=jsonCommand(['versions','view',versions[0].id]);verifySecretBase(version,latest);
  const secrets=[...new Set([...jsonCommand(['secret','list']).map(s=>s.name),...latest.resources.bindings.filter(b=>b.type==='secret_text').map(b=>b.name)])];
  const schema=jsonCommand(['d1','execute','DB','--remote','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='mail_oauth_tokens'; SELECT name FROM d1_migrations WHERE name='0047_mail_oauth_tokens.sql';"]);
  const tableExists=schema[0].results.length===1&&schema[1].results.length===1;
  const rows=tableExists?jsonCommand(['d1','execute','DB','--remote','--command',"SELECT COUNT(*) AS count FROM mail_oauth_tokens WHERE provider='outlook';"])[0].results[0].count:0;
  planMailSetup({tableExists,rowCount:rows,secrets});return {deployed:deployment.versions[0].version_id,latest:latest.id};
}
const beforeVersion=inspectTarget();
const front=await fetch(target.origin,{redirect:'error',signal:AbortSignal.timeout(15000)});
if(!front.ok||!front.headers.get('content-type')?.includes('text/html'))throw new Error('FRONTEND_ORIGIN_NOT_AVAILABLE');
console.log(JSON.stringify({target,environment:values.env??'top-level',rollbackVersion:beforeVersion.deployed,tokenStore:'EMPTY',outlookSecrets:'ABSENT'}));
if(!values.authorize){console.log('Read-only checks passed. Add --authorize for the mailbox owner device-consent flow.');process.exit(0);}

const authority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scopes = 'offline_access Mail.Send User.Read';
const deviceResponse = await requestMicrosoft(`${authority}/devicecode`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, scope: scopes })
});
const device = await deviceResponse.json();
if (!deviceResponse.ok || !device.device_code || !device.user_code) {
  throw new Error(`Microsoft device authorization failed (${deviceResponse.status}, ${device.error || 'unknown'})`);
}
if(!['https://microsoft.com/devicelogin','https://www.microsoft.com/link'].includes(device.verification_uri))throw new Error('UNEXPECTED_MICROSOFT_AUTHORIZATION_URI');
console.log(`Open ${device.verification_uri} and enter code ${device.user_code}`);
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

// Recheck immediately before writes: another setup must not have installed a key or token.
if(JSON.stringify(inspectTarget())!==JSON.stringify(beforeVersion))throw new Error('DEPLOYMENT_CHANGED: stop without installing credentials');
const secretVersion=installMailSecrets({run,config,env:values.env,clientId,refreshToken:tokens.refresh_token,encryptionKey:randomBytes(48).toString('base64url')});
tokens=undefined;
console.log(JSON.stringify({outlookSecretVersion:secretVersion,target:target.worker,status:'UPLOADED_NOT_DEPLOYED'}));
console.log('Secret bindings uploaded without deployment or token-row changes. Explicitly deploy this verified version before the merged Worker, then check actual inbox delivery.');
