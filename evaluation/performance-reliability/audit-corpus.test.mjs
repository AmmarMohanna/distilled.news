import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {auditDataset} from './audit-corpus.mjs';

// Entirely synthetic contract fixtures. These are not news or evaluation gold.
const sha=value=>createHash('sha256').update(value).digest('hex');
const start='2026-10-24T00:00:00.000Z',middle='2026-10-24T00:30:00.000Z',end='2026-10-24T01:00:00.000Z';
const frozenAt='2026-10-24T03:00:00.000Z';
function fixture(id,windowStart,windowEnd,index,trackId='track',text='Synthetic fixture text.') {
  return {feedId:'fixture-feed',language:'en',windowStart,windowEnd,intervalMinutes:30,
    provenance:{trackId,sequenceIndex:index,freezeAt:frozenAt},articles:[{id,sourceId:'fixture-source',sourceType:'rss_feed',
      url:'https://publisher.invalid/'+id,publishedAt:null,acquiredAt:windowStart,availableAt:windowStart,
      text,contentCompleteness:'UNKNOWN',provenance:{textSha256:sha(text)}}]};
}
async function withDataset(cases,run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'distilled-evaluation-audit-'));
  try {
    const files=[],tracks=new Map();
    for(const [i,c] of cases.entries()) {
      const file='case-'+i+'.json',bytes=JSON.stringify(c);await fs.writeFile(path.join(root,file),bytes);
      files.push({file,sha256:sha(bytes),articles:c.articles.length,feedId:c.feedId,trackId:c.provenance.trackId,
        sequenceIndex:c.provenance.sequenceIndex,windowStart:c.windowStart,windowEnd:c.windowEnd,intervalMinutes:30});
      tracks.set(c.provenance.trackId,{id:c.provenance.trackId,feedId:c.feedId,initialHistory:null});
    }
    const manifestPath=path.join(root,'manifest.json');
    await fs.writeFile(manifestPath,JSON.stringify({schemaVersion:1,frozenAt,files,tracks:[...tracks.values()]}));
    await run(manifestPath,root);
  } finally {
    const actual=await fs.realpath(root),parent=await fs.realpath(os.tmpdir());
    if(path.dirname(actual)!==parent||!path.basename(actual).startsWith('distilled-evaluation-audit-'))throw Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(actual,{recursive:true,force:true});
  }
}

test('audit verifies chronological cases and counts without presenting mechanical checks as quality labels',async()=>{
  await withDataset([fixture('a',start,middle,0),fixture('b',middle,end,1)],async manifest=>{
    const r=await auditDataset(manifest);
    assert.equal(r.summary.windows,2);assert.equal(r.summary.distinctAcquiredIds,2);
    assert.equal(r.summary.missingInitialHistoryTracks,1);
    assert.match(r.summary.splitQualification,/not established/);
    assert.ok(!JSON.stringify(r.summary).includes('Synthetic fixture text.'));
  });
});
test('modified case bytes cannot pass the frozen manifest hash',async()=>{
  await withDataset([fixture('a',start,middle,0)],async(manifest,root)=>{
    await fs.appendFile(path.join(root,'case-0.json'),' ');
    await assert.rejects(auditDataset(manifest),/CASE_HASH_MISMATCH/);
  });
});
test('half-open interval membership is checked even when case and manifest hashes agree',async()=>{
  const c=fixture('a',start,middle,0);c.articles[0].availableAt=middle;
  await withDataset([c],async manifest=>assert.rejects(auditDataset(manifest),/ARTICLE_OUTSIDE_WINDOW/));
  const future=fixture('future','2026-10-24T03:00:00.000Z','2026-10-24T03:30:00.000Z',0);
  await withDataset([future],async manifest=>assert.rejects(auditDataset(manifest),/CASE_FREEZE_MISMATCH/));
});
test('same acquired ID with different text cannot hide in overlapping duration tracks',async()=>{
  await withDataset([fixture('a',start,middle,0,'one'),fixture('a',start,middle,0,'two','Changed synthetic text.')],
    async manifest=>assert.rejects(auditDataset(manifest),/UNSTABLE_ACQUIRED_ID/));
});
test('chronological gaps are not silently joined into a continuous sequence',async()=>{
  await withDataset([fixture('a',start,middle,0),fixture('b',end,'2026-10-24T01:30:00.000Z',1)],
    async manifest=>assert.rejects(auditDataset(manifest),/BROKEN_CHRONOLOGICAL_TRACK/));
});
test('manifest path traversal is rejected before opening a case outside its dataset',async()=>{
  await withDataset([fixture('a',start,middle,0)],async manifest=>{
    const data=JSON.parse(await fs.readFile(manifest,'utf8'));data.files[0].file='../outside.json';
    await fs.writeFile(manifest,JSON.stringify(data));
    await assert.rejects(auditDataset(manifest),/CASE_OUTSIDE_DATASET/);
  });
});
