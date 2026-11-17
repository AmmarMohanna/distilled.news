import {expect,it} from 'vitest';
import {EDITOR_SYSTEM,VERIFY_SYSTEM,REPAIR_SYSTEM} from '../src/prompts';
import {generateBriefing} from '../src/engine';
import type {ModelRequest} from '../src/model';
import {article,FEED,MODELS,scripted} from './helpers';

const window={windowStart:'2026-10-24T09:30:00Z',windowEnd:'2026-10-24T10:00:00Z'};
const source=article('notice','The authority announced today that inspections begin tomorrow. It has not set a reopening date.',{publishedAt:'2026-10-22T12:00:00Z'});
const item={headline:'Authority announces inspections',body:'The authority announced on October 22 that inspections would begin October 23; no reopening date has been set.',sources:['S1'],relation:'new',importance:1};

it('distinguishes source-relative dates from reader-facing briefing-relative dates',()=>{
 expect(EDITOR_SYSTEM).toContain("Relative dates in source text belong to that source's publication date");
 expect(REPAIR_SYSTEM).toContain('Keep source-relative dates anchored to the supplied publication date');
 expect(VERIFY_SYSTEM).toContain('Relative dates in SOURCE text');
 expect(VERIFY_SYSTEM).toContain('Relative dates in the reader-facing ITEM');
 expect(VERIFY_SYSTEM).not.toContain('Relative dates are read against the BRIEFING REPORTING CUTOFF, not against the source date');
});

it('sends the separate clocks and exact original evidence to the normal verifier call',async()=>{
 const mock=scripted({edit:[{items:[item]}],verify:[(request:ModelRequest)=>{
  expect(request.system).toBe(VERIFY_SYSTEM);
  expect(request.user).toContain('BRIEFING REPORTING CUTOFF: '+window.windowEnd);
  expect(request.user).toContain(source.publishedAt);
  expect(request.user).toContain(source.text);
  expect(request.user).toContain(item.body);
  return {results:[{i:0,verdict:'ok',issues:[]}]};
 }]});
 const result=await generateBriefing({feed:FEED,...window,articles:[source]},mock.port,MODELS);
 expect(result.items[0]).toMatchObject({body:item.body,sourceIds:['notice']});
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify']);
});

it.each([1,2] as const)('retains the previous verifier request for a frozen version %s window',async promptVersion=>{
 const mock=scripted({edit:[{items:[item]}],verify:[(request:ModelRequest)=>{
  expect(request.system).toContain('Relative dates are read against the BRIEFING REPORTING CUTOFF, not against the source date');
  return {results:[{i:0,verdict:'ok',issues:[]}]};
 }]});
 await generateBriefing({feed:FEED,...window,articles:[source]},mock.port,MODELS,{promptVersion});
 expect(mock.calls).toHaveLength(2);
});
