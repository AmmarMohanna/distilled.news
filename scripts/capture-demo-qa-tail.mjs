import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
const out=createWriteStream((process.env.DATASET_REPORT_DIR??'.local-reports/demo-platform-20261021')+'/worker-tail.jsonl');
const p=spawn(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','tail','distilled-news-sources-qa','--format','json'],{windowsHide:true});
p.stdout.pipe(out);p.stderr.pipe(out);
const timer=setTimeout(()=>p.kill(),45000);
await new Promise(resolve=>p.on('exit',resolve));clearTimeout(timer);await new Promise(resolve=>out.end(resolve));
console.log('QA_TAIL_CAPTURE_COMPLETE');
