import {expect,it} from 'vitest';
import fixture from './fixtures/staging-editorial-timeout.json';
import {compactEditorialInput} from './editorial-transport';
import {fallbackEditorialPlan,validateEditorialPlan} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
const shortlist=fixture.shortlist as unknown as ShortlistRecord;
it('compacts the exact persisted timed-out staging input without changing approved fact text, context or report times',()=>{
 expect(fixture.latencyMs).toBeGreaterThanOrEqual(10000);
 const wire=compactEditorialInput(fixture.state as any),before=JSON.stringify(fixture.state).length,after=JSON.stringify(wire.state).length;
 expect(after).toBeLessThan(before*.7);
 for(let i=0;i<shortlist.candidates.length;i++)for(let j=0;j<shortlist.candidates[i].facts.length;j++){
  const f=shortlist.candidates[i].facts[j],sent=wire.state.candidates[i].facts[j];expect(sent.text).toBe(f.text);expect(sent.reportTime).toBe(f.reportTime);expect(sent.context?.text).toBe(f.context?.text);
 }
 const plan=fallbackEditorialPlan(shortlist),roundtrip=wire.decode(wire.encode(plan));expect(roundtrip).toEqual(plan);expect(validateEditorialPlan(roundtrip,shortlist)).toEqual(plan);
});
it('cannot decode invented capabilities or use a known fact from another target',()=>{
 const wire=compactEditorialInput(fixture.state as any),body=wire.encode(fallbackEditorialPlan(shortlist));body.stories[0].mustIncludeFactIds=['R999'];expect(()=>wire.decode(body)).toThrow();
 const again=wire.encode(fallbackEditorialPlan(shortlist));again.stories[0].mustIncludeFactIds=again.stories[1].mustIncludeFactIds;expect(()=>validateEditorialPlan(wire.decode(again),shortlist)).toThrow();
});
