import {expect,it} from 'vitest';
import paid from './fixtures/editor-concision-paid-results.json';

it('records all six settled-model responses without claiming a successful fix',()=>{
  expect(paid.calls).toBe(6);
  expect(paid.totalCostUsd).toBeCloseTo(.0245536,10);
  expect(paid.decision).toBe('REJECT_CANDIDATE');
  expect(paid.publication).toBe(false);
  expect(paid.deployment).toBe(false);
});
it('preserves the English failure and complete factual-check approval',()=>{
  const edit=paid.runs.find(r=>r.name==='editor-en-candidate')!;
  const text=JSON.stringify(edit.output);
  expect(text).toContain('No details on casualties or damage were provided');
  const verify=paid.runs.find(r=>r.name==='verify-en-candidate')!;
  const results=(verify.output as {results:Array<{verdict:string}>}).results;
  expect(results).toHaveLength(2);
  expect(results.every(r=>r.verdict==='ok')).toBe(true);
});
it('retains the Arabic source commentary and mixed-language headline as observed defects',()=>{
  const text=JSON.stringify(paid.runs.find(r=>r.name==='editor-ar-candidate')!.output);
  expect(text).toContain('reported');
  expect(text).toContain('24');
  expect(paid.independentSourceReview.limitations).toHaveLength(4);
});
