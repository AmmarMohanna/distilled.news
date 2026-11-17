// Independent exact rebuild using the repository's read-only exporter.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {buildCase, articleFromRecord, hash} from '../../scripts/export-acquired-benchmark.mjs';
const dir = process.argv[2];
const snapshot = JSON.parse(await fs.readFile(`${dir}/snapshot.json`, 'utf8'));
const plan = JSON.parse(await fs.readFile(`${dir}/plan.json`, 'utf8'));
const manifest = JSON.parse(await fs.readFile(`${dir}/dataset/manifest.json`, 'utf8'));
let count = 0;
for (const track of plan.tracks) {
  const windows = [...track.windows].sort((a,b)=>Date.parse(a.windowStart)-Date.parse(b.windowStart));
  for (const [sequenceIndex, window] of windows.entries()) {
    const entry = manifest.files.find(f=>f.trackId===track.id && Date.parse(f.windowStart)===Date.parse(window.windowStart));
    assert.ok(entry, 'plan window missing from manifest');
    const bytes = await fs.readFile(`${dir}/dataset/${entry.file}`);
    assert.equal(hash(bytes), entry.sha256);
    assert.deepEqual(JSON.parse(bytes), buildCase(snapshot, {...window, trackId:track.id, feedId:track.feedId, sequenceIndex}));
    count++;
  }
}
assert.equal(count, manifest.files.length);
const unassigned = await fs.readFile(`${dir}/dataset/${manifest.unassigned.file}`);
assert.equal(hash(unassigned), manifest.unassigned.sha256);
assert.deepEqual(JSON.parse(unassigned), snapshot.records.filter(r=>articleFromRecord(r).availableAt===null));
console.log(JSON.stringify({exactRebuiltCases:count, unassigned:manifest.unassigned.records, fields:'all exported fields, historical profiles, source identities and provenance'}));
