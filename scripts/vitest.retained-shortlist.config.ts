import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const repoRoot=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const baselineRef=process.env.V1_RETAINED_PROFILE_BASELINE_REF;
let baseline:string|undefined;
if(baselineRef){
 if(!/^[a-f0-9]{7,40}$/.test(baselineRef))throw Error('PROFILE_BASELINE_COMMIT_REQUIRED');
 baseline=execFileSync('git',['-c','safe.directory='+repoRoot,'show',baselineRef+':apps/worker/src/v1-intelligence/editorial.ts'],{cwd:repoRoot,encoding:'utf8'});
 if(baseline.includes('export function createFactEquivalence'))throw Error('PROFILE_BASELINE_ALREADY_USES_SIGNATURE_CACHE');
 baseline+='\nexport function createFactEquivalence(){return equivalentFact;}\nexport const RETAINED_PROFILE_BASELINE_REF='+JSON.stringify(baselineRef)+';\n';
}
export default defineConfig({plugins:baseline?[{name:'retained-trusted-baseline',enforce:'pre',transform(_code,id){if(id.split('?')[0].replaceAll('\\','/')===repoRoot+'/apps/worker/src/v1-intelligence/editorial.ts')return {code:baseline!,map:null}}}]:[],test:{include:[fileURLToPath(new URL('../benchmarks/retained-shortlist.test.ts',import.meta.url)).replaceAll('\\','/')],pool:'forks',maxWorkers:1}});
