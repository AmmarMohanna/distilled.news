import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSourceExecutionServer} from './source-execution-server.mjs';
const token='test-only-credential-'.repeat(3);
async function server(t,execute){
  const instance=createSourceExecutionServer({token,execution:{execute}});
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
