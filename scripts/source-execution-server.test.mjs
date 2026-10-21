import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSourceExecutionServer} from './source-execution-server.mjs';
const token='test-only-credential-'.repeat(3);
async function server(t,execute,options={}){
  const instance=createSourceExecutionServer({token,execution:{execute},...options});
  await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{instance.closeAllConnections();instance.close(resolve);}));
  return `http://127.0.0.1:${instance.address().port}/v1/source-execution`;
}
test('rejects unauthenticated execution and unknown operations before spawning',async t=>{
  let calls=0;const url=await server(t,async()=>{calls++;});
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind:'shell',input:{}})})).status,400);
  assert.equal(calls,0);
});
test('executes authorized structured requests and sanitizes failures',async t=>{
  const url=await server(t,async(kind,input)=>{if(input.fail)throw new Error('secret details');assert.equal(kind,'extract');return {body:'article'};});
  const call=input=>fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind:'extract',input})});
  assert.deepEqual(await (await call({})).json(),{body:'article'});
  const failure=await call({fail:true});assert.equal(failure.status,502);assert.equal(await failure.text(),'{"error":"EXECUTION_FAILED"}');
});
test('passes only an authenticated Telegram username to private resolution',async t=>{
  const url=await server(t,async(kind,input)=>{assert.equal(kind,'telegram_resolve');assert.deepEqual(input,{username:'examplechannel'});return {channelId:'-1001234567890',username:'examplechannel'};});
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind:'telegram_resolve',input:{username:'examplechannel'}})});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{channelId:'-1001234567890',username:'examplechannel'});
});
test('serializes one Telegram session and reports retryable backpressure while allowing extraction',async t=>{
  let release,entered;
  const started=new Promise(resolve=>{entered=resolve});
  const url=await server(t,async kind=>{if(kind==='telethon'){entered();return new Promise(resolve=>{release=()=>resolve({records:[]})})}return {body:'article'};},{maxPending:0});
  const call=kind=>fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind,input:{}})});
  const first=call('telethon');await started;
  const busy=await call('telegram_resolve');assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'5');
  assert.equal((await call('extract')).status,200);
  release();assert.equal((await first).status,200);
});
test('queues bursts within capacity and preserves Telegram session exclusivity',async t=>{
 let release,entered;
 const started=new Promise(resolve=>{entered=resolve});let active=0,peak=0,calls=0;
 const url=await server(t,async()=>{calls++;active++;peak=Math.max(peak,active);if(calls===1){entered();await new Promise(resolve=>{release=resolve});}active--;return {records:[]};},{maxConcurrent:2,maxPending:2});
 const call=kind=>fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind,input:{}})});
 const first=call('telethon');await started;
 const second=call('telegram_resolve');
 // An unrelated extraction is allowed to use the otherwise idle second slot.
 assert.equal((await call('extract')).status,200);
 release();assert.equal((await first).status,200);assert.equal((await second).status,200);
 assert.equal(calls,3);assert.ok(peak<=2);
});
test('expires bounded queue waits without executing abandoned work',async t=>{
 let release,entered;const started=new Promise(resolve=>{entered=resolve});let calls=0;
 const url=await server(t,async()=>{calls++;entered();return new Promise(resolve=>{release=()=>resolve({body:'article'})});},{maxConcurrent:1,maxPending:1,queueTimeoutMs:30});
 const call=()=>fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({kind:'extract',input:{}})});
 const first=call();await started;
 assert.equal((await call()).status,503);assert.equal(calls,1);
 release();assert.equal((await first).status,200);
});
