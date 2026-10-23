import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-warning-selection/summary.json';

it('preserves the frozen paid comparison and settled eight-call budget, changing only one system instruction',()=>{
  expect(evidence.totals).toMatchObject({calls:8,allSettled:true,outstandingReservations:0});
  expect(evidence.totals.actualCostUsd).toBeCloseTo(.0578,8);
  expect(evidence.totals.reservedExposureUsd).toBeLessThanOrEqual(.30);
  for(const r of evidence.results){
    expect(createHash('sha256').update(JSON.stringify(r.request)).digest('hex')).toBe(r.requestSha256);
    expect(r.finishReason).toBe('stop');
    expect(r.usage.cost).toBeLessThanOrEqual(r.reservedUsd);
    if(r.variant!=='baseline')continue;
    const candidate=evidence.results.find(c=>c.group===r.group&&c.language===r.language&&c.variant==='candidate')!;
    expect(candidate.request.messages[0].content).not.toBe(r.request.messages[0].content);
    expect({...candidate.request,messages:[r.request.messages[0],candidate.request.messages[1]]}).toEqual(r.request);
  }
});

it('records equal real-corpus selection, not proof that the new instruction caused improvement',()=>{
  for(const r of evidence.results.filter(r=>r.group==='real')){
    expect(r.output.items.flatMap(i=>i.sources).sort()).toEqual(['S3','S4']);
    expect(r.output.left_out.flatMap(i=>i.sources).sort()).toEqual(['S1','S2']);
  }
});

it('records preserved control warning/correction selection plus unresolved actionable-deadline omissions',()=>{
  for(const r of evidence.results.filter(r=>r.group==='controls')){
    expect(r.output.items.flatMap(i=>i.sources).sort()).toEqual(['S1','S3']);
    expect(r.output.left_out.flatMap(i=>i.sources).sort()).toEqual(['S2','S4','S5','S6']);
    const body=r.output.items.map(i=>i.body).join(' ');
    // All four dropped the only source stating the actionable midnight deadline.
    expect(body).not.toMatch(/midnight|منتصف الليل/);
    if(r.language==='ar')expect(body).toContain('محطة القطار');
  }
});
