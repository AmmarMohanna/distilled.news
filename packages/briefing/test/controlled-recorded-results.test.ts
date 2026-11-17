import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-controlled-reliability/summary.json';
import {controlledVerifierRequests} from '../eval/controlled-baseline';

it('reconstructs every paid request exactly from frozen sources and unchanged prompts without provider access',()=>{
  const jobs=controlledVerifierRequests();
  expect(jobs).toHaveLength(10);
  for(const job of jobs){
    const recorded=evidence.runs.find(r=>r.name===job.name)!;
    expect(createHash('sha256').update(JSON.stringify(job.request)).digest('hex')).toBe(recorded.requestSha256);
  }
});

it('does not mistake repeated batch cases for additional independently held-out cases or a model winner',()=>{
  for(const model of evidence.models){
    const unique=evidence.runs.filter(r=>r.model===model.model&&/^heldout-(bad|good):/.test(r.name)).flatMap(r=>r.rows);
    expect(new Set(unique.map(r=>r.id)).size).toBe(21);
    expect(unique.every(r=>r.pass)).toBe(true);
    const ordinary=evidence.runs.find(r=>r.model===model.model&&r.name.startsWith('heldout-ordinary:'))!;
    expect(ordinary.rows).toHaveLength(7);
    expect(ordinary.rows.every(r=>r.pass)).toBe(true);
  }
  expect(evidence.allSettled).toBe(true);
  expect(evidence.actualAdditionalUsd).toBeLessThan(evidence.authorizedMaximumUsd);
  expect(evidence.routingChanged).toBe(false);
});
