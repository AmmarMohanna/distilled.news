import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('../apps/worker/',import.meta.url));
const vitest=fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url));
const collection=process.argv.includes('--collect');
const result=spawnSync(process.execPath,[vitest,'run',collection?'src/connector-collection-load.test.ts':'src/connector-scale.test.ts'],{cwd:worker,stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,...(collection?{CONNECTOR_LOAD_COLLECTION:'true',CONNECTOR_LOAD_FEEDS:'1000'}:{})}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
