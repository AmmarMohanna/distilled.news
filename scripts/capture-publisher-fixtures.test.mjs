import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturePath,upsertCapture,fetchListing} from './capture-publisher-fixtures.mjs';

test('names fixtures by host, date and listing path',()=>{
  assert.equal(fixturePath('https://www.alarabiya.net/aswaq/economy','2026-11-18T10:00:00Z'),'alarabiya.net/2026-11-18-aswaq-economy.html');
  assert.equal(fixturePath('https://nowlebanon.com/','2026-11-18T10:00:00Z'),'nowlebanon.com/2026-11-18-home.html');
});

test('replaces a capture with the same file and keeps the index sorted',()=>{
  const index={captures:[{file:'b.html',minArticles:1},{file:'a.html',minArticles:1}]};
  assert.deepEqual(upsertCapture(index,{file:'a.html',minArticles:5}).captures,[{file:'a.html',minArticles:5},{file:'b.html',minArticles:1}]);
});

test('follows same-site redirects and refuses cross-site ones',async()=>{
  const pages={'https://a.example/x':{status:301,location:'/y'},'https://a.example/y':{status:200,body:'<html></html>'},'https://a.example/z':{status:302,location:'https://b.example/'}};
  const fetcher=async url=>{const page=pages[url];return {status:page.status,headers:{get:()=>page.location},text:async()=>page.body};};
  assert.deepEqual(await fetchListing('https://a.example/x',fetcher),{html:'<html></html>',finalUrl:'https://a.example/y'});
  await assert.rejects(fetchListing('https://a.example/z',fetcher),/another site/);
  await assert.rejects(fetchListing('http://a.example/x',fetcher),/Only https/);
});
