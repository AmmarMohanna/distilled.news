import {defineConfig} from 'vitest/config';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const publication=root+'/apps/worker/src/v1-intelligence/publication.ts';
export default defineConfig({plugins:[{name:'offline-owned-input-baseline',enforce:'pre',
 resolveId(id){if(id==='virtual:baseline-publication')return publication+'?trusted-baseline'},
 load(id){if(id===publication+'?trusted-baseline')return execFileSync('git',['-c','safe.directory='+root,'show','2e46fa9:apps/worker/src/v1-intelligence/publication.ts'],{encoding:'utf8',cwd:root})+'\nexport {selectionInput as profileSelectionInput};';},
 transform(code,id){if(id.replaceAll('\\','/')===publication)return code+'\nexport {selectionInput as profileSelectionInput};';}
}],test:{include:['benchmarks/publication-input-profile.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
