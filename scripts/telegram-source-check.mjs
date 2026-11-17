import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createSourceExecution} from './source-execution.mjs';

// Only public channel identity and counts are printed, never session/account data.
const root=new URL('../',import.meta.url);
const config=parseEnv(await readFile(new URL('.env',root),'utf8'));
const username=process.argv[2]??'telegram';
if(!/^[A-Za-z0-9_]{5,32}$/.test(username))throw Error('Pass a public channel username, without @ or a URL.');
const execution=createSourceExecution({python:config.SOURCE_EXECUTION_PYTHON??'python',environment:{
 TELEGRAM_API_ID:config.TELEGRAM_API_ID,TELEGRAM_API_HASH:config.TELEGRAM_API_HASH,
 TELEGRAM_SESSION_PATH:fileURLToPath(new URL('.review-tmp/telegram-source/collector.session',root))
}});
try{
 const identity=await execution.execute('telegram_resolve',{username});
 if(identity.error||!/^-[1-9]\d*$/.test(identity.channelId??'')||identity.username?.toLowerCase()!==username.toLowerCase())throw Error('IDENTITY_UNVERIFIED');
 const page=await execution.execute('telethon',{channelId:identity.channelId,afterId:0,limit:5});
 if(page.error||page.channelId!==identity.channelId||!Array.isArray(page.records))throw Error('POSTS_UNAVAILABLE');
 console.log(JSON.stringify({channel:identity.username,identityVerified:true,readablePosts:page.records.filter(item=>!item.deleted&&item.text?.trim()).length}));
}catch{
 console.error('Telegram check failed. Check the session, connectivity, or Telegram rate limits. No login was attempted.');
 process.exitCode=1;
}
