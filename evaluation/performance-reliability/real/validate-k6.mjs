import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(resolve(tmpdir(),'k6-inspect-'));
try{
 const manifest=JSON.parse(readFileSync('evaluation/performance-reliability/real/manifests/load.draft.json','utf8'));
 const registry={runId:manifest.runId,origin:manifest.origin,users:[{id:'offline-only-1',cookie:'dn_session=OFFLINE_ONLY_NOT_AUTHENTICATED',username:'offline1',feeds:[{config:{slug:'offline',publicFeedEnabled:true}}]},{id:'offline-only-2',cookie:'dn_session=OFFLINE_ONLY_NOT_AUTHENTICATED',username:'offline2',feeds:[{config:{slug:'private',publicFeedEnabled:false}}]}]};
 writeFileSync(resolve(dir,'k6.json'),'{}');
 writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest));writeFileSync(resolve(dir,'registry.json'),JSON.stringify(registry));
 const r=spawnSync(process.env.K6_BIN??'k6',['inspect','--config',resolve(dir,'k6.json'),'-e','CAMPAIGN_MANIFEST='+resolve(dir,'manifest.json'),'-e','CAMPAIGN_REGISTRY='+resolve(dir,'registry.json'),'evaluation/performance-reliability/real/users.k6.js'],{env:{...process.env,CAMPAIGN_MANIFEST:resolve(dir,'manifest.json'),CAMPAIGN_REGISTRY:resolve(dir,'registry.json')},encoding:'utf8'});
 if(r.status!==0){process.stderr.write(r.stderr??'');throw Error('K6_CONFIGURATION_INSPECTION_FAILED');}console.log('k6 configuration inspection passed; zero traffic requests.');
}finally{rmSync(dir,{recursive:true,force:true});}
