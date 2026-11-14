import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('../../../benchmarks/editor-source-selection/qualification-2026-11-14.json',import.meta.url),'utf8'));
it('retains the measured real-source attribution and near-miss controls without claiming new model runs',()=>{
 for(const name of ['multi_outlet_new','cross_chunk_new','near_miss_new']){
  const r=fixture.results[name];expect(r.items).toHaveLength(1);
  expect(r.items[0].sourceIds.sort()).toEqual([...r.summary.positive].sort());
  expect(r.summary.unrelated).toEqual([]);expect(r.summary.missing).toEqual([]);expect(r.summary.sourceAuditCalls).toBe(0);
 }
 expect(fixture.results.cross_chunk_new.summary.usage.calls).toBeLessThan(fixture.results.cross_chunk_old.summary.usage.calls);
 expect(fixture.results.multi_outlet_new.summary.usage.calls).toBeLessThan(fixture.results.multi_outlet_old.summary.usage.calls);
 expect(fixture.evidence.every((a:any)=>/^[a-f0-9]{64}$/.test(a.sha256))).toBe(true);
});
