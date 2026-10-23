import test from 'node:test';
import assert from 'node:assert/strict';
import {articleFromRecord,buildCase,toBriefingInput} from './export-acquired-benchmark.mjs';

const row=(id,at,decision='PROMOTED_NEW_REVISION')=>({feedSourceId:'source',sourceType:'rss_feed',
  acquired:{id,feedId:'feed',sourceId:'publisher',body:'  Original\ntext &amp; symbols.  ',
    acquiredAt:'2026-10-21T12:00:00Z',sourceObservationId:id+'-observation'},
  receipt:{decision,decidedAt:at,resultingRevisionId:'revision-'+id},
  input:{observation:{observedAt:'2026-10-21T11:00:00Z'}}});
const snapshot={frozenAt:'2026-10-21T15:00:00Z',records:[],runs:[],
  versions:[{feed_id:'feed',revision:1,value:{updatedAt:'2026-10-21T10:00:00Z',
    title:'Feed',interests:['Exact interests'],outputLanguage:'en'}}]};
const spec={feedId:'feed',windowStart:'2026-10-21T13:00:00Z',windowEnd:'2026-10-21T13:30:00Z'};

test('half-open assignment uses acceptance time and preserves repeated content and exact text',()=>{
  const records=[row('a',spec.windowStart),row('b','2026-10-21T13:15:00Z'),row('c',spec.windowEnd)];
  const value=buildCase({...snapshot,records},spec);
  assert.deepEqual(value.articles.map(a=>a.id),['a','b']);
  assert.equal(value.articles[0].text,records[0].acquired.body);
  assert.equal(value.articles[0].publishedAt,null);
  assert.equal(value.articles[0].acquiredAt,'2026-10-21T12:00:00Z');
});
test('quarantined content has unknown availability and is never backdated from acquisition',()=>{
  const r=row('q',spec.windowStart,'QUARANTINED_REVISION_CONFLICT');
  assert.equal(articleFromRecord(r).availableAt,null);
  assert.equal(buildCase({...snapshot,records:[r]},spec).articles.length,0);
});
test('adapter preserves generated history and full evidence at the model boundary',()=>{
  const value=buildCase({...snapshot,records:[row('a',spec.windowStart)]},spec);
  const prior=[{id:'previous',at:'2026-10-21T12:30:00Z',headline:'Published',body:'Actual reader text'}];
  const input=toBriefingInput(value,prior);
  assert.equal(input.prior,prior);
  assert.equal(input.articles[0].text,value.articles[0].text);
  assert.equal(input.feed.interest,'Exact interests');
});
