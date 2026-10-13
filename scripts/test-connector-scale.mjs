import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('../apps/worker/',import.meta.url));
const vitest=fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url));
const result=spawnSync(process.execPath,[vitest,'run','src/connector-scale.test.ts'],{cwd:worker,stdio:'inherit',shell:false,windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
