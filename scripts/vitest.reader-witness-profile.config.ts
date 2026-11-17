import {defineConfig} from 'vitest/config';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const path=root+'/apps/worker/src/v1-intelligence/publication-validation.ts';
export default defineConfig({plugins:[{name:'trusted-verdict-reducer-baseline',enforce:'pre',resolveId(id){if(id==='virtual:baseline-validation')return path+'?trusted-baseline'},load(id){if(id===path+'?trusted-baseline')return execFileSync('git',['-c','safe.directory='+root,'show','2e46fa9:apps/worker/src/v1-intelligence/publication-validation.ts'],{encoding:'utf8',cwd:root});}}],test:{include:['benchmarks/reader-witness-profile.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
