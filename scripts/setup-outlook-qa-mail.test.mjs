import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectMailTarget, planMailSetup, installMailSecrets, verifyDeployedTarget, verifySecretBase} from './outlook-mail-target.mjs';
const expected={account:'account-1',worker:'test-staging',database:'database-1',origin:'https://staging.example.com'};
const config={name:expected.worker,account_id:expected.account,d1_databases:[{binding:'DB',database_id:expected.database}],vars:{PUBLIC_WEB_BASE_URL:expected.origin}};
test('requires every explicit target identity and refuses different account, Worker, D1 or frontend',()=>{
 assert.deepEqual(selectMailTarget(config,expected),expected);
 for(const key of Object.keys(expected))assert.throws(()=>selectMailTarget(config,{...expected,[key]:undefined}),/EXPLICIT_TARGET_REQUIRED/);
 for(const key of Object.keys(expected))assert.throws(()=>selectMailTarget(config,{...expected,[key]:'wrong'}),/TARGET_MISMATCH/);
 assert.throws(()=>selectMailTarget({...config,d1_databases:[...config.d1_databases,...config.d1_databases]},expected),/AMBIGUOUS_DATABASE/);
});
test('deployed bindings must belong to the selected database and frontend',()=>{
 const bindings=[{name:'DB',type:'d1',id:expected.database},{name:'PUBLIC_WEB_BASE_URL',type:'plain_text',text:expected.origin}];
 verifyDeployedTarget(expected,{resources:{bindings}});
 assert.throws(()=>verifyDeployedTarget(expected,{resources:{bindings:[{...bindings[0],id:'other'},bindings[1]]}}),/DEPLOYED_TARGET_MISMATCH/);
});
test('an existing encrypted row is never reset or rekeyed',()=>{
 assert.throws(()=>planMailSetup({tableExists:true,rowCount:1,secrets:['OUTLOOK_CLIENT_ID','OUTLOOK_REFRESH_TOKEN','OUTLOOK_TOKEN_ENCRYPTION_KEY']}),/EXISTING_TOKEN_KEY_VERIFICATION_REQUIRED/);
 assert.throws(()=>planMailSetup({tableExists:true,rowCount:1,secrets:[]}),/EXISTING_TOKEN_KEY_VERIFICATION_REQUIRED/);
});
test('missing schema and partial existing secrets refuse initialization',()=>{
 assert.throws(()=>planMailSetup({tableExists:false,rowCount:0,secrets:[]}),/MIGRATION_0047_REQUIRED/);
 assert.throws(()=>planMailSetup({tableExists:true,rowCount:0,secrets:['OUTLOOK_TOKEN_ENCRYPTION_KEY']}),/EXISTING_SECRETS_PRESERVED/);
 assert.equal(planMailSetup({tableExists:true,rowCount:0,secrets:[]}), 'INITIALIZE_EMPTY_STORE');
});
test('secret writes use stdin, explicitly selected environment, no logs and no reset',()=>{
 const commands=[];installMailSecrets({run:(args,options)=>{commands.push({args,options});return {status:0,stdout:'Success! Created version 11111111-1111-1111-1111-111111111111 with 3 secrets.'};},config:'/target/wrangler.toml',env:'staging',clientId:'client',refreshToken:'refresh-sensitive',encryptionKey:'key-sensitive'});
 assert.equal(commands.length,1);
 for(const {args,options} of commands){assert.deepEqual(args.slice(0,3),['versions','secret','bulk']);assert.ok(args.includes('/target/wrangler.toml'));assert.ok(args.includes('staging'));assert.equal(options.env.WRANGLER_WRITE_LOGS,'false');assert.equal(options.env.WRANGLER_SEND_METRICS,'false');assert.ok(!JSON.stringify(args).includes('sensitive'));assert.deepEqual(options.stdio,['pipe','pipe','pipe']);assert.ok(!args.includes('d1'));assert.deepEqual(JSON.parse(options.input),{OUTLOOK_CLIENT_ID:'client',OUTLOOK_REFRESH_TOKEN:'refresh-sensitive',OUTLOOK_TOKEN_ENCRYPTION_KEY:'key-sensitive'});}
});
test('installation stops on a failed write without printing credentials or retrying',()=>{
 let count=0;assert.throws(()=>installMailSecrets({run:()=>{count++;return {status:1,stderr:'secret-value'};},config:'/target',clientId:'client',refreshToken:'refresh',encryptionKey:'key'}),/SECRET_INSTALL_FAILED/);assert.equal(count,1);
});

test('version-safe secret upload refuses a different undeployed code or binding set',()=>{
 const resources={script:{etag:'same-code'},bindings:[{name:'DB',type:'d1',id:'database-1'}]};verifySecretBase({resources},{resources:structuredClone(resources)});
 assert.throws(()=>verifySecretBase({resources},{resources:{...resources,script:{etag:'different-code'}}}),/UNDEPLOYED_VERSION_DIFFERS/);
 assert.throws(()=>verifySecretBase({resources},{resources:{...resources,bindings:[]}}),/UNDEPLOYED_VERSION_DIFFERS/);
});
