import {test} from 'node:test';import assert from 'node:assert/strict';import {configuration} from './config.js';
test('local bounded defaults and remote campaigns denied without explicit authorization',()=>{
 const c=configuration('smoke',{});assert.equal(c.origin,'http://127.0.0.1:8789');assert.equal(c.options.scenarios.measured.iterations,10);
 for(const origin of ['https://distilled.news','https://lownoise.news','http://example.org','http://127.0.0.1.evil.test','http://user:pass@127.0.0.1','http://127.0.0.1:8789/path'])assert.throws(()=>configuration('smoke',{BASE_URL:origin}));
 assert.throws(()=>configuration('stress',{}),/CAMPAIGN/);
 assert.throws(()=>configuration('soak',{ENABLE_CAMPAIGN:'yes',BASE_URL:'https://staging.example.test'}));
 assert.throws(()=>configuration('load',{FEED_USER:'../admin'}));
});
test('only explicit isolated remote origin and fixed known profile accepted',()=>{
 const e={BASE_URL:'https://isolated.example.test',AUTHORIZED_ORIGIN:'https://isolated.example.test',ALLOW_REMOTE_READ_LOAD:'I_HAVE_AUTHORIZATION',TARGET_ENV:'isolated'};
 assert.equal(configuration('load',e).origin,e.BASE_URL);assert.throws(()=>configuration('unknown',{}));
 assert.throws(()=>configuration('fault',{...e,ENABLE_CAMPAIGN:'yes'}),/LOCAL/);
 assert.equal(configuration('soak',{ENABLE_CAMPAIGN:'yes'}).options.scenarios.measured.duration,'5m');
});
