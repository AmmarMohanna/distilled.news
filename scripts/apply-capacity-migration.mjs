import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
// Same query and migration-name append used by Wrangler migrations apply.
// Skip its CREATE TABLE IF NOT EXISTS d1_migrations: the ledger already exists
// and that redundant DDL returned D1 CPU resets on this staging database.
const run=sql=>JSON.parse(execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','apps/worker/wrangler.staging.toml','--json','--command='+sql],{encoding:'utf8',timeout:60000,maxBuffer:3_000_000}));
const migration='0088_model_active_capacity.sql';
const state=run("SELECT name FROM d1_migrations WHERE name IN ('0087_schedule_observation_predecessor.sql','0088_model_active_capacity.sql'); SELECT name FROM sqlite_master WHERE name='v1_model_active_operations'");
if(state[0].results.some(r=>r.name===migration)){console.log('Migration already recorded');process.exit(0)}
if(state[1].results.length)throw Error('Partial schema requires inspection');
const sql=readFileSync('apps/worker/migrations/'+migration,'utf8')+"\nINSERT INTO d1_migrations(name) VALUES('"+migration+"');";
const result=run(sql);
console.log(JSON.stringify(result.map(r=>({success:r.success,meta:r.meta})),null,2));
