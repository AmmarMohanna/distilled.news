import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-haiku-controlled/summary.json';
import {controlledHaikuVerifierRequests} from '../eval/controlled-baseline';

it('reconstructs every Haiku request exactly without sending any paid inference',()=>{
  const jobs=controlledHaikuVerifierRequests();
  expect(jobs).toHaveLength(5);
  for(const job of jobs){
    expect(createHash('sha256').update(JSON.stringify(job.request)).digest('hex'))
      .toBe(evidence.runs.find(r=>r.name===job.name)!.requestSha256);
    expect(job.request).not.toHaveProperty('temperature');
  }
  expect(evidence.allSettled).toBe(true);
  expect(evidence.outstandingHolds).toBe(0);
  expect(evidence.actualCostUsd).toBeLessThan(evidence.authorizedMaximumUsd);
});

it('preserves the ordinary-batch false rejection and real temporal misses as failures, not qualification',()=>{
  const bad=evidence.runs.find(r=>r.name.startsWith('development-bad:'))!;
  expect(bad.rows.filter(r=>r.falseApproval).map(r=>r.id)).toEqual(['anthropic-retained-today','replit-retained-timing']);
  const ordinary=evidence.runs.find(r=>r.name.startsWith('heldout-ordinary:'))!;
  expect(ordinary.rows.filter(r=>r.falseRejection).map(r=>r.id)).toEqual(['condition-good']);
  const good=evidence.runs.find(r=>r.name.startsWith('heldout-good:'))!;
  expect(good.rows.find(r=>r.id==='condition-good')!.verdict).toBe('ok');
  expect(evidence.routingChanged).toBe(false);
});
