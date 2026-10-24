import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-reader-copy/summary.json';
import {cleanReaderCopy} from '../src/reader-copy';

it('reproduces exact retained English/Arabic cleanup without model calls',()=>{
 expect(evidence.cleanupPairs).toHaveLength(6);
 for(const pair of evidence.cleanupPairs)expect(cleanReaderCopy(pair.before)).toBe(pair.after);
});
it('records the unchanged verifier accepting accurate controls and rejecting remaining factual errors',()=>{
 const check=evidence.finalVerifications.find(v=>v.name==='verify-reviewed-controls')!;
 const rows=check.verdicts as Array<{i:number;verdict:string}>;
 for(const [i,c] of evidence.independentSyntheticControls.entries()){
  expect(rows.find(v=>v.i===i)?.verdict).toBe(c.expected);
  expect(cleanReaderCopy(c.body)).toBe(c.cleanedBody);
  if(c.expected==='ok')expect(c.cleanedBody).toBe(c.body);
 }
 expect(rows.filter(r=>r.verdict==='fix')).toHaveLength(3);
});
it('records actual two-call clean engine output separately from remote publication',()=>{
 expect(evidence.selectedFullEngineReplay).toMatchObject({status:'published',usage:{calls:2},sourceReferencesPreserved:true});
 expect(evidence.modelsUnchanged).toEqual({editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'});
 expect(evidence.selectedFullEngineReplay.scope).toContain('not remote publication');
 for(const item of evidence.selectedFullEngineReplay.items){
  expect(item.body).toBe(cleanReaderCopy(item.body));
  expect(item.sourceIds.length).toBeGreaterThan(0);
 }
 expect(evidence.task).toMatchObject({providerCalls:30,settled:30,outstanding:0});
 expect(evidence.task.actualInferenceCostUsd).toBeCloseTo(.10338115,9);
 expect(evidence.task.actualInferenceCostUsd).toBeLessThan(evidence.task.approvedMaximumUsd);
});
