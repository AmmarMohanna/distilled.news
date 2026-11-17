import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

// Operator-run interactive login only. Collection never sends login codes or
// starts an interactive session. No authentication material is printed.
const root=new URL('../',import.meta.url),config=parseEnv(await readFile(new URL('.env',root),'utf8'));
if(!/^\d+$/.test(config.TELEGRAM_API_ID??'')||!config.TELEGRAM_API_HASH?.trim())throw Error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.');
if(!process.stdin.isTTY)throw Error('Run this helper in your own interactive terminal. Do not send login codes through chat or unattended jobs.');
const folder=new URL('.review-tmp/telegram-source/',root);await mkdir(folder,{recursive:true});
const environment={};
for(const name of ['PATH','SystemRoot','SYSTEMROOT','TEMP','TMP','HOME','LANG'])if(process.env[name])environment[name]=process.env[name];
Object.assign(environment,{TELEGRAM_API_ID:config.TELEGRAM_API_ID,TELEGRAM_API_HASH:config.TELEGRAM_API_HASH,TELEGRAM_SESSION_PATH:fileURLToPath(new URL('collector.session',folder)),PYTHONIOENCODING:'utf-8'});
const child=spawn(config.SOURCE_EXECUTION_PYTHON??'python',[fileURLToPath(new URL('telegram-source-login.py',import.meta.url))],{env:environment,stdio:'inherit',shell:false,windowsHide:true});
child.on('error',()=>{console.error('Could not start Python. Set SOURCE_EXECUTION_PYTHON in .env to the source runtime interpreter.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
