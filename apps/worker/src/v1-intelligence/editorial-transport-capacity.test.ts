import {expect,it} from 'vitest';
import fixture from './fixtures/staging-0200-oversized-editorial.json';
import midnight from './fixtures/staging-midnight-missing-required.json';
import evening from './fixtures/staging-1800-oversized-shortlist.json';
import {compactEditorialInput,keyedEditorialState} from './editorial-transport';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import {conservativeStoryCapacity,planningCapacity} from './planning-capacity';
import {canonicalJson} from '../v1-intake/canonical';
import type {ShortlistRecord} from './shortlist';
const bytes=(v:unknown)=>new TextEncoder().encode(canonicalJson(v)).length;
it('retained 18:00 overload fits by eliding only exactly duplicated ordinary history prose',()=>{
 const shortlist=evening as unknown as ShortlistRecord,maxStories=conservativeStoryCapacity(shortlist.candidates,DEFAULT_BRIEFING_BUDGET);
 const original=compactEditorialInput({...shortlist,instruction:fixture.instruction,feed:fixture.feed,budget:{...DEFAULT_BRIEFING_BUDGET,maxStories},communicationCapacity:{...planningCapacity(DEFAULT_BRIEFING_BUDGET),maxStories}});
 const before=structuredClone(original.state),after=keyedEditorialState(original.state);
 expect(bytes(before)).toBeGreaterThan(48000);expect(bytes(after)).toBeLessThanOrEqual(48000);
 expect(after.historyCompaction?.elidedLedgerIds.length).toBeGreaterThan(0);expect(original.state).toEqual(before);
 for(const entry of after.ledger){const previous=before.ledger.find(e=>e.id===entry.id)!;expect(entry.claimFacts).toEqual(previous.claimFacts);expect(entry.claimText??entry.claimFacts.join(' ')).toBe(previous.claimText)}
 expect(after.candidates).toEqual(before.candidates);expect(after.obligations).toEqual(before.obligations);
});
it('never elides non-identical history or history backing correction obligations',()=>{
 const state=compactEditorialInput({...midnight.shortlist as unknown as ShortlistRecord,instruction:''}).state;
 state.instruction='x'.repeat(49000);state.ledger=[{...state.ledger[0],id:'ordinary',claimText:'A changed report.',claimFacts:['A different report.']},{...state.ledger[0],id:'protected',claimText:'An earlier claim.',claimFacts:['An earlier claim.']}];
 state.obligations=[{id:'ob',ledgerEntryId:'protected'}] as any;
 const next=keyedEditorialState(state);expect(next.ledger).toEqual(state.ledger);
});
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
