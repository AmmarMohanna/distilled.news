import {expect,it} from 'vitest';
import retained from './fixtures/reporting-commentary-recurrence.json';
import paid from './fixtures/reporting-commentary-paid-results.json';
import {VERIFY_SYSTEM} from '../src/prompts';

// Recorded provider replies, not a mock-based claim of semantic improvement.
it('preserves the exact three retained editor failures and their original approvals',()=>{
  expect(retained.cases).toHaveLength(3);
  for(const c of retained.cases){
    expect(c.recordedVerdict).toBe('ok');
    expect(c.originalBody.startsWith(c.correctedBody)).toBe(true);
    expect(c.sources.every(s=>s.text.length>0 && s.url.startsWith('https://t.me/'))).toBe(true);
  }
});
it('records the failed paid candidate without keeping its product prompt',()=>{
  expect(paid.decision).toBe('REJECT_CANDIDATE');
  expect(paid.runs.find(r=>r.name==='baseline-original')).toMatchObject({missedCleanup:5,falseRejections:0});
  expect(paid.runs.find(r=>r.name==='candidate-original')).toMatchObject({missedCleanup:2,falseRejections:4});
  expect(paid.repairsRun).toBe(0);
  expect(paid.runs).toHaveLength(4);
  expect(paid.totalCostUsd).toBeCloseTo(.0041288,10);
  expect(VERIFY_SYSTEM).not.toContain('Also check for one narrow editorial defect');
});
it('preserves the observed batch sensitivity instead of reporting an unqualified win',()=>{
  const mixed=paid.runs.find(r=>r.name==='candidate-original')!;
  const corrected=paid.runs.find(r=>r.name==='candidate-corrected')!;
  for(const i of [4,5,6,8]){
    expect(mixed.verdicts.find(v=>v.i===i)?.verdict).toBe('fix');
    expect(corrected.verdicts.find(v=>v.i===i)?.verdict).toBe('ok');
  }
  expect(paid.runs.filter(r=>r.name.endsWith('corrected')).every(r=>r.falseRejections===0)).toBe(true);
});
