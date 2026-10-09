import {expect,it} from 'vitest';
import fixture from './fixtures/staging-0200-oversized-editorial.json';
import midnight from './fixtures/staging-midnight-missing-required.json';
import {compactEditorialInput} from './editorial-transport';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import {conservativeStoryCapacity,planningCapacity} from './planning-capacity';
import {canonicalJson} from '../v1-intake/canonical';
import type {ShortlistRecord} from './shortlist';
const bytes=(v:unknown)=>new TextEncoder().encode(canonicalJson(v)).length;
it('fits the exact 02:00 corpus by removing only duplicate ranking audit fields',()=>{
 const shortlist=structuredClone(fixture.shortlist) as unknown as ShortlistRecord,original=structuredClone(shortlist),maxStories=conservativeStoryCapacity(shortlist.candidates,DEFAULT_BRIEFING_BUDGET);
 const state={instruction:fixture.instruction,feed:fixture.feed,window:shortlist.window,bootstrap:shortlist.bootstrap,budget:{...DEFAULT_BRIEFING_BUDGET,maxStories},communicationCapacity:{...planningCapacity(DEFAULT_BRIEFING_BUDGET),maxStories},ledger:shortlist.ledger,candidates:shortlist.candidates,obligations:shortlist.obligations};
 const wire=compactEditorialInput(state);
 console.log(JSON.stringify({originalBytes:wire.state.inputCompaction?.originalBytes,compactedBytes:bytes(wire.state)}));
 expect(wire.state.inputCompaction?.originalBytes).toBeGreaterThan(48000);expect(bytes(wire.state)).toBeLessThanOrEqual(48000);
 expect(wire.state.candidates).toHaveLength(shortlist.candidates.length);expect(wire.state.ledger).toHaveLength(shortlist.ledger.length);expect(shortlist).toEqual(original);
 for(const [i,c] of wire.state.candidates.entries()){expect(c.facts.map(f=>f.text)).toEqual(shortlist.candidates[i].facts.map(f=>f.text));expect(c.ranking).toEqual(Object.fromEntries(Object.entries(shortlist.candidates[i].ranking!).filter(([k])=>!['semanticKey','operationId'].includes(k))));}
});
it('keeps smaller transport byte-identical including its original ranking audit fields',()=>{
 const shortlist=midnight.shortlist as unknown as ShortlistRecord,wire=compactEditorialInput(shortlist);
 expect(wire.state.inputCompaction).toBeUndefined();
 wire.state.candidates.forEach((c,i)=>expect(c.ranking).toEqual(shortlist.candidates[i].ranking));
 const expected={...wire.state};delete expected.inputCompaction;expect(canonicalJson(wire.state)).toBe(canonicalJson(expected));
});
