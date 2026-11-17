import {execFileSync} from 'node:child_process';
import {collectDeploymentSnapshot} from '../apps/agentops-collector/src/deployment.mjs';
const quote=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const db={prepare(sql){return {bind(...args){let i=0;const bound=sql.replaceAll('?',()=>quote(args[i++]));return {all:async()=>{const rows=JSON.parse(execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','apps/worker/wrangler.staging.toml','--json','--command',bound],{encoding:'utf8',timeout:45000,maxBuffer:2_000_000}));return rows[0]}}}}}};
console.log(JSON.stringify(await collectDeploymentSnapshot(db),null,2));
