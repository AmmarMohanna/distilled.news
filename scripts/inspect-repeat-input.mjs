import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const id='ee17d002507cc27ad731a45a11e057f4bb03f9ccfc94a7d69ed55da74a1f07d4';
const sql=`SELECT json FROM v1_feed_documents WHERE kind='v3_window_inputs' AND id='${id}' AND feed_id='briefing_e69e607f-907b-43ec-a521-ccd61234c0ff'`;
const raw=execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','apps/worker/wrangler.staging.toml','--json','--command',sql],{encoding:'utf8',maxBuffer:10_000_000});
const result=JSON.parse(raw),snapshot=JSON.parse(result[0].results[0].json);
mkdirSync('.local-reports/novelty-repair',{recursive:true});
writeFileSync('.local-reports/novelty-repair/input.private.json',JSON.stringify(snapshot));
console.log(JSON.stringify({prior:snapshot.input.prior.length,articles:snapshot.input.articles.length}));
