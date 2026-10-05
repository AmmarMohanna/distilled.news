import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Private VPS execution binding for SourceExecutionPort. Not imported by Workers.
 * argv is fixed; source data goes to stdin, and secrets remain in the environment.
 * No API server, login flow, cron or production deployment is registered here. */
export function createSourceExecution({python, environment={}, timeoutMs=60000, maxOutputBytes=8000000,
  script=fileURLToPath(new URL('./source-execution.py',import.meta.url))}) {
  if(!python||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1)throw new Error('INVALID_EXECUTION_CONFIG');
  const env={};
  for(const name of ['PATH','SystemRoot','SYSTEMROOT','TEMP','TMP','HOME','LANG'])if(process.env[name])env[name]=process.env[name];
  for(const name of ['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION_PATH','SOURCE_BROWSER_EGRESS_CONFIRMED'])if(environment[name])env[name]=environment[name];
  env.PYTHONIOENCODING='utf-8';
  return {execute(kind,input){
    if(!['feedparser','telethon','extract','playwright'].includes(kind))return Promise.reject(new Error('INVALID_EXECUTION_KIND'));
    const payload=JSON.stringify({kind,input});
    if(Buffer.byteLength(payload)>8000000)return Promise.reject(new Error('EXECUTION_INPUT_TOO_LARGE'));
    return new Promise((resolve,reject)=>{
      const child=spawn(python,[script],{env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      let size=0,done=false;const output=[];
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error){
        try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill();}catch{}
        reject(error);
      }else resolve(value);};
      const timer=setTimeout(()=>finish(new Error('EXECUTION_TIMEOUT')),timeoutMs);
      child.on('error',()=>finish(new Error('EXECUTION_UNAVAILABLE')));
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxOutputBytes)finish(new Error('EXECUTION_OUTPUT_TOO_LARGE'));else output.push(chunk);});
      // Deliberately do not forward stderr; third-party exceptions may contain session details.
      child.stderr.resume();child.stdin.on('error',()=>{});
      child.on('close',code=>{if(code!==0)return finish(new Error('EXECUTION_FAILED'));try{finish(null,JSON.parse(Buffer.concat(output).toString('utf8')));}catch{finish(new Error('EXECUTION_INVALID_RESPONSE'));}});
      child.stdin.end(payload);
    });
  }};
}
