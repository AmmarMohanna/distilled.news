import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {privateDirectory,writePrivate} from './client.mjs';
import {validateManifest,admit} from './manifest.mjs';
if(!/^[a-f0-9]{64}$/i.test(process.env.CAMPAIGN_ARTIFACT_KEY??''))throw Error('DURABLE_PRIVATE_ARTIFACT_STORAGE_REQUIRED');
const bundle=JSON.parse(process.env.CAMPAIGN_PRIVATE_BUNDLE??'null');
if(!bundle||!['run','setup','plan','campaign','cleanup'].includes(bundle.phase))throw Error('REVIEWED_PRIVATE_WORKFLOW_BUNDLE_REQUIRED');
const m=validateManifest(bundle.manifest);
if(m.revision!==process.env.GITHUB_SHA)throw Error('EXACT_WORKFLOW_REVISION_REQUIRED');
if(bundle.phase!=='run')admit(m,bundle.preflight,bundle.approval,bundle.phase);
const dir=privateDirectory(m.runId);
for(const [name,data]of Object.entries(bundle.files??{})){
 if(!['registry.private.json','plan.private.json','resources.private.json'].includes(name))throw Error('BUNDLE_FILE_NOT_ALLOWED');writePrivate(dir,name,data);
}
for(const [name,data]of [['manifest.private.json',m],['preflight.private.json',bundle.preflight],['approval.private.json',bundle.approval]])writePrivate(dir,name,data);
const phases=bundle.phase==='run'?['setup','plan','campaign']:[bundle.phase];
for(const phase of [...phases,'cleanup'])admit(m,bundle.preflight,bundle.approval,phase);
const run=phase=>new Promise(resolveExit=>{
 const child=spawn(process.execPath,['evaluation/performance-reliability/real/run.mjs',phase,resolve(dir,'manifest.private.json'),resolve(dir,'preflight.private.json'),resolve(dir,'approval.private.json')],{env:{...process.env,CAMPAIGN_ADAPTER:resolve('evaluation/performance-reliability/real/adapter.mjs')},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();child.once('error',()=>resolveExit(1));child.once('exit',code=>resolveExit(code??1));
});
let failed=false;for(const phase of phases){const code=await run(phase);if(code!==0){failed=true;break;}}
// Never leave a completed setup unattended when a protected phase exits.
if(bundle.phase!=='cleanup'&&await run('cleanup')!==0)failed=true;
process.exitCode=failed?1:0;
