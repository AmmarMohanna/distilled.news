/** Setup guards only: authentication and encrypted token storage remain in the Worker mailer. */
export function selectMailTarget(config, expected) {
  if (!['account','worker','database','origin'].every(k=>typeof expected[k]==='string'&&expected[k])) throw new Error('EXPLICIT_TARGET_REQUIRED');
  const databases=(config.d1_databases??[]).filter(d=>d.binding==='DB');
  if(databases.length!==1)throw new Error('AMBIGUOUS_DATABASE');
  const actual={account:config.account_id,worker:config.name,database:databases[0].database_id,origin:config.vars?.PUBLIC_WEB_BASE_URL};
  if(Object.keys(actual).some(k=>actual[k]!==expected[k]))throw new Error('TARGET_MISMATCH');
  const url=new URL(actual.origin);if(url.protocol!=='https:'||url.origin!==actual.origin)throw new Error('TARGET_MISMATCH');
  return actual;
}
export function verifyDeployedTarget(target, version) {
  const bindings=version.resources?.bindings??[];
  const db=bindings.filter(b=>b.name==='DB'&&b.type==='d1');
  const origin=bindings.find(b=>b.name==='PUBLIC_WEB_BASE_URL'&&b.type==='plain_text');
  if(db.length!==1||(db[0].database_id??db[0].id)!==target.database||origin?.text!==target.origin)throw new Error('DEPLOYED_TARGET_MISMATCH');
}
export function verifySecretBase(deployed, latest) {
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
  if(JSON.stringify(stable(deployed.resources))!==JSON.stringify(stable(latest.resources)))throw new Error('UNDEPLOYED_VERSION_DIFFERS: inspect and explicitly deploy the intended code/configuration before authorizing mail');
}
export function planMailSetup({tableExists,rowCount,secrets}) {
  if(!tableExists)throw new Error('MIGRATION_0047_REQUIRED');
  if(rowCount!==0)throw new Error('EXISTING_TOKEN_KEY_VERIFICATION_REQUIRED: existing encrypted tokens preserved; verify the installed key through the existing mailer or recover the original key before any separately approved rotation');
  if(secrets.some(name=>['OUTLOOK_CLIENT_ID','OUTLOOK_REFRESH_TOKEN','OUTLOOK_TOKEN_ENCRYPTION_KEY'].includes(name)))throw new Error('EXISTING_SECRETS_PRESERVED: initialization refused; no key or token replacement permitted');
  return 'INITIALIZE_EMPTY_STORE';
}
export function installMailSecrets({run,config,env,clientId,refreshToken,encryptionKey,activate=false}) {
  if(!clientId||!refreshToken||!encryptionKey)throw new Error('INCOMPLETE_CREDENTIALS');
  const secrets={OUTLOOK_CLIENT_ID:clientId,OUTLOOK_REFRESH_TOKEN:refreshToken,OUTLOOK_TOKEN_ENCRYPTION_KEY:encryptionKey};
  // One complete binding update; no plaintext file, argv credentials or Wrangler logs.
  // Direct activation uses Wrangler's small atomic secrets-bulk request. The
  // version-only default copies the Worker bundle and leaves activation separate.
  const command=activate?['secret','bulk']:['versions','secret','bulk','--tag','outlook-mail-initialization'];
  const result=run([...command,'--config',config,...(env?['--env',env]:[])],{input:JSON.stringify(secrets),stdio:['pipe','pipe','pipe'],env:{...process.env,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'log'},windowsHide:true});
  if(result.error||result.status!==0){
    let diagnostic=String(result.error?.code??result.stderr??'unknown CLI failure');
    for(const value of Object.values(secrets))diagnostic=diagnostic.replaceAll(value,'[REDACTED]').replaceAll(encodeURIComponent(value),'[REDACTED]');
    // Expose only the CLI error block, never raw request/debug bodies.
    const block=diagnostic.replace(/\x1b\[[0-9;]*m/g,'').match(/\[ERROR\]\s+([^\n]+(?:\n\s*\n\s*[^\n]+)?)/)?.[1];
    throw new Error(`SECRET_INSTALL_FAILED: ${block??result.error?.code??'Cloudflare rejected the binding update'}; stop and inspect secret presence before recovery; do not reset token rows`);
  }
  if(activate)return null;
  const id=String(result.stdout??'').match(/Created version ([0-9a-f-]{36})/i)?.[1];
  if(!id)throw new Error('SECRET_VERSION_RECEIPT_MISSING: inspect uploaded versions; never rerun initialization blindly');
  return id;
}
