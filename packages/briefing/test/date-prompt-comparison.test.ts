import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import fixture from './fixtures/v3-date-prompt-comparison.json';
import {scoreVerifierCases} from '../eval/factual-reliability';

const record=(name:string)=>fixture.records.find(r=>r.name===name)!;

it('compares identical held-out evidence and decoding parameters, changing only the verifier system prompt',()=>{
  for(const group of ['good','bad']){
    const baseline=record(`baseline-heldout-${group}`),candidate=record(`candidate-heldout-${group}`);
    expect(candidate.request.system).not.toBe(baseline.request.system);
    expect({...candidate.request,system:baseline.request.system}).toEqual(baseline.request);
    expect(candidate.cases).toEqual(baseline.cases);
  }
  for(const r of fixture.records){
    expect(createHash('sha256').update(JSON.stringify(r.request)).digest('hex')).toBe(r.requestSha256);
    expect(r.usage.cost).toBeGreaterThan(0);
  }
});

it('records why the date-checking candidate was rejected despite catching more incorrect dates',()=>{
  const score=(name:string)=>{const r=record(name);return scoreVerifierCases(r.response,r.cases)};
  expect(score('baseline-heldout-bad')).toMatchObject({falseApprovals:1,invalidOrMissing:0});
  expect(score('candidate-heldout-bad')).toMatchObject({falseApprovals:0,invalidOrMissing:0});
  expect(score('baseline-heldout-good')).toMatchObject({falseRejections:1,invalidOrMissing:0});
  const candidate=score('candidate-heldout-good');
  expect(candidate).toMatchObject({falseRejections:2,invalidOrMissing:0});
  // Omitting an explicitly undisclosed approval date does not make this report inaccurate.
  expect(record('candidate-heldout-good').cases.find(c=>c.id==='R3-good')?.body)
    .toBe('Cobalt has obtained a construction permit, with work expected to begin in December.');
  expect(candidate.rows.find(r=>r.id==='R3-good')?.falseRejection).toBe(true);
});

it('records the separate evidence-layout comparison without attributing it to a system-prompt change',()=>{
  for(const group of ['good','bad']){
    const baseline=record(`baseline-heldout-${group}`),presentation=record(`presentation-heldout-${group}`);
    expect(presentation.request.system).toBe(baseline.request.system);
    expect(presentation.request.user).not.toBe(baseline.request.user);
    expect(presentation.request.user).toContain('ARTICLE METADATA (publication timing, not event timing):');
    expect(presentation.request.user).toContain('ARTICLE TEXT:');
    expect(presentation.cases).toEqual(baseline.cases);
    const score=scoreVerifierCases(presentation.response,presentation.cases);
    expect(score).toMatchObject({invalidOrMissing:0,falseApprovals:0,falseRejections:group==='good'?1:0});
  }
});
