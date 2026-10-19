import {defineConfig} from 'vitest/config';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const baseline=process.env.PUBLICATION_DAY_BASELINE==='dd88f5c';
export default defineConfig({plugins:baseline?[{name:'pinned-before-simplification',enforce:'pre',load(id){const path=id.replaceAll('\\','/').split('?')[0];if(path.startsWith(root+'/apps/worker/src/')&&path.endsWith('.ts'))return execFileSync('git',['-c','safe.directory='+root,'show','dd88f5c:'+path.slice(root.length+1)],{encoding:'utf8',cwd:root});}}]:[],test:{include:['apps/worker/src/v1-intelligence/publication-v2.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
