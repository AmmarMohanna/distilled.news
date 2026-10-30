import {test} from 'node:test';import assert from 'node:assert/strict';import {fixtureServer} from './fixture-server.mjs';
test('fixture enforces GET allowlist and deterministic recovery without external calls',async()=>{
 const s=fixtureServer('transient');await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+s.address().port;
  assert.equal((await fetch(origin+'/api/admin/reset',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/unknown')).status,404);
  for(let i=0;i<3;i++)assert.equal((await fetch(origin+'/api/feed/fixture/news')).status,503);
  assert.equal((await fetch(origin+'/api/feed/fixture/news')).status,200);
 }finally{await new Promise(r=>s.close(r));}
});
