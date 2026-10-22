import {defineConfig} from 'vitest/config';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const revision=process.env.VALIDATION_TIMING_BASELINE;
if(revision&&revision!=='2e46fa9')throw Error('UNREVIEWED_TIMING_BASELINE');
export default defineConfig({plugins:revision?[{name:'immutable-timing-baseline',enforce:'pre',load(id){
 const path=id.replaceAll('\\','/').split('?')[0];
 if(path.startsWith(root+'/apps/worker/src/')&&path.endsWith('.ts')||path===root+'/scripts/validate-validation-labels.mjs'||path===root+'/benchmarks/validation-contract-evaluation.test.ts')return execFileSync('git',['-c','safe.directory='+root,'show',revision+':'+path.slice(root.length+1)],{cwd:root,encoding:'utf8'});
}}]:[],test:{include:['apps/worker/src/v1-intelligence/publication.test.ts','apps/worker/src/v1-intelligence/store.test.ts','benchmarks/validation-contract-evaluation.test.ts','benchmarks/publication-path-profile.test.ts'],environment:'node',globals:true,pool:'forks',maxWorkers:1}});
