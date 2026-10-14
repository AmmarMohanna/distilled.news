import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

// Wrangler's --file import path returns an aggregate summary, not SELECT rows.
// Pass the read-only SQL as one structured argument to retain every snapshot.
const root=fileURLToPath(new URL('../',import.meta.url));
const config=join(root,'apps/worker/wrangler.sources-qa.toml');
const text=await readFile(config,'utf8');
if(!/^name\s*=\s*"distilled-news-sources-qa"$/m.test(text)||!/^account_id\s*=\s*"e32b564514d4f9b9e383b7dd30dbb026"$/m.test(text))throw Error('QA_TARGET_MISMATCH');
if(!process.argv.includes('--remote'))throw Error('EXPLICIT_REMOTE_QA_REQUIRED');
const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)??new Date().toISOString().replace(/[:.]/g,'-');
if(!/^[a-zA-Z0-9-]{1,80}$/.test(label))throw Error('INVALID_SNAPSHOT_LABEL');
const sql=(await readFile(new URL('./connector-scale-metrics.sql',import.meta.url),'utf8')).replace(/^\s*--[^\r\n]*$/gm,'').trim();
const result=spawnSync(process.execPath,[join(root,'apps/worker/node_modules/wrangler/bin/wrangler.js'),'d1','execute','distilled-news-sources-qa','--remote','--config',config,`--command=${sql}`,'--json'],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
if(result.error||result.status!==0)throw Error('QA_METRICS_QUERY_FAILED');
const queries=JSON.parse(result.stdout);
if(!Array.isArray(queries)||queries.length!==13||queries.some(q=>q.success!==true||!Array.isArray(q.results)))throw Error('INVALID_QA_METRICS_RESPONSE');
const snapshot={at:new Date().toISOString(),worker:'distilled-news-sources-qa',queries};
const directory=join(root,'.review-tmp');await mkdir(directory,{recursive:true});
const path=join(directory,`connector-scale-metrics-${label}.json`);
await writeFile(path,JSON.stringify(snapshot,null,2),{flag:'wx'});
console.log(JSON.stringify({at:snapshot.at,path,results:queries.map(q=>q.results),d1Bytes:queries.at(-1).meta.size_after}));
