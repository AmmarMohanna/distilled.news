import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';

const require=createRequire(new URL('../apps/worker/package.json',import.meta.url));
const filename=require.resolve('miniflare');
const source=readFileSync(filename,'utf8');
const start=source.indexOf('var WORKER_SCRIPT = (',source.indexOf('// src/plugins/core/proxy/fetch-sync.ts'));
const end=source.indexOf('// src/plugins/core/proxy/types.ts',start);
assert(start>=0&&end>start,'Review/remove the pinned Miniflare compatibility patch when upgrading.');
const installed=source.slice(start,end);

// Execute the installed host AND worker code, replacing only undici's network
// transport. Before each later response, deliberately wake the previous wait
// without publishing a new response. Polling notify's return value makes this
// deterministic: the host must already be blocked when the stale wake arrives.
const transportStub=String.raw`const { Pool, fetch } = {
 Pool:class {},
 fetch:async(url)=>{
  if(!url.endsWith('/0'))await new Promise(resolve=>{
   function wake(){
    if(Atomics.notify(notifyHandle,0)===1)setTimeout(resolve,5);
    else setImmediate(wake);
   }
   wake();
  });
  return {status:200,headers:new Map(),arrayBuffer:async()=>new TextEncoder().encode(url).buffer};
 }
};`;

const harness=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const vm=require('node:vm');
const context={
 import_node_worker_threads:require('node:worker_threads'),
 import_node_assert14:{default:require('node:assert/strict')},
 import_undici5:{Headers},
 CoreHeaders:{OP_SYNC:'sync',OP_RESULT_TYPE:'result',ERROR_STACK:'stack'},
 __filename:workerData.filename,TextEncoder,TextDecoder
};
vm.runInNewContext(workerData.code,context);
if(!context.WORKER_SCRIPT.includes('const { Pool, fetch } = actualRequire("undici");'))throw Error('MINIFLARE_TRANSPORT_CHANGED');
context.WORKER_SCRIPT=context.WORKER_SCRIPT.replace('const { Pool, fetch } = actualRequire("undici");',workerData.transportStub);
const fetcher=new context.SynchronousFetcher();
(async()=>{
 try{
  const replies=[];
  for(let id=0;id<8;id++){
   const result=fetcher.fetch('https://test.invalid/'+id,{method:'GET',headers:{}});
   replies.push(new TextDecoder().decode(result.body));
  }
  parentPort.postMessage(replies);
 }finally{await fetcher.dispose();}
})().catch(error=>{setImmediate(()=>{throw error;});});
`;

async function run(code){
 const worker=new Worker(harness,{eval:true,workerData:{code,filename,transportStub}});
 let timer;
 try{return await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Miniflare response synchronization stalled')),15000);
  worker.once('message',resolve);worker.once('error',reject);
  worker.once('exit',code=>{if(code)reject(Error('Miniflare harness exited '+code));});
 });}finally{clearTimeout(timer);await worker.terminate();}
}

test('installed Miniflare ignores a stale notification until its own response is queued',async()=>{
 assert.deepEqual(await run(installed),Array.from({length:8},(_,id)=>'https://test.invalid/'+id));
});

test('the same deterministic stale notification reproduces the former synchronization failure',async()=>{
 const legacy=installed
  .replace('    const id = this.#nextId++;','    Atomics.store(this.#notifyHandle,0,0);\n    const id = this.#nextId++;')
  .replace(/    \/\/ An earlier request[\s\S]*?    const message =/,'    Atomics.wait(this.#notifyHandle,0,0);\n    const message =');
 assert.notEqual(legacy,installed);
 await assert.rejects(run(legacy),/message\?\.id === id/);
});
