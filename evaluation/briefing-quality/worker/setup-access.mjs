/** Generate this evaluator's NEW access tokens; never inspect existing credentials. */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(worker,'../../..');
const file=path.resolve(worker,'../private/evaluator-access.json');
execFileSync('git',['check-ignore','--quiet',file],{cwd:repo});
fs.mkdirSync(path.dirname(file),{recursive:true});
if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({DASHBOARD_TOKEN:randomBytes(32).toString('hex'),METRICS_TOKEN:randomBytes(32).toString('hex')},null,2)+'\n',{flag:'wx',mode:0o600});
if(process.argv.includes('--apply'))execFileSync(process.execPath,[path.join(repo,'apps/worker/node_modules/wrangler/bin/wrangler.js'),'secret','bulk',file,'--config',path.join(worker,'wrangler.jsonc')],{cwd:repo,stdio:['ignore','pipe','pipe']});
console.log(JSON.stringify({accessFile:file,uploaded:process.argv.includes('--apply'),valuesPrinted:false}));
