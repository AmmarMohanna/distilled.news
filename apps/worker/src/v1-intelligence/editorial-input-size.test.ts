import type {ShortlistRecord} from './shortlist';
import {admitModelOperation,modelCapability} from './model-capacity';
import {expect,it} from 'vitest';
import fixture from './fixtures/staging-2000-oversized-input.json';
import {compactEditorialInput,keyedEditorialState,expandEditorialInput,boundedEditorialInput,compactEditorialRepair} from './editorial-transport';
import {canonicalJson} from '../v1-intake/canonical';
const state=fixture.state as any,bytes=(v:unknown)=>new TextEncoder().encode(canonicalJson(v)).length;
it('fits the exact 20:00 protected-correction shortlist without losing a field or value',()=>{
 const wire=compactEditorialInput(state),before=keyedEditorialState(wire.state,{compact:false}),after=keyedEditorialState(wire.state);
 expect(bytes(before)).toBe(49701);expect(bytes(after)).toBeLessThanOrEqual(48000);
 expect(expandEditorialInput(after)).toEqual(before);
 expect(before.candidates).toHaveLength(21);
 const protectedHistory=before.ledger.find(e=>e.id===before.obligations[0].ledgerEntryId)!;
 expect(protectedHistory.claimText).toContain('prohibits');expect(protectedHistory.claimFacts.length).toBeGreaterThan(0);
});
it('does not change an already-small keyed input or mutate the retained corpus',()=>{
 const copy=structuredClone(state);const small={...state,candidates:state.candidates.slice(0,2),ledger:state.ledger.slice(0,1),obligations:[]};
 const wire=compactEditorialInput(small);expect(keyedEditorialState(wire.state)).toEqual(keyedEditorialState(wire.state,{compact:false}));expect(state).toEqual(copy);
});
it.each([20,30,40])('bounds %i candidates and increasing history while retaining every protected obligation and fact',n=>{
 const growth=structuredClone(state);growth.candidates=[];
 for(let i=0;i<n;i++){const c=structuredClone(state.candidates[i%state.candidates.length]);if(i>=state.candidates.length){c.targetVersionId+=':growth:'+i;c.stableTargetId+=':growth:'+i;c.storylineId+=':growth:'+i;for(const f of c.facts)f.id+=':growth:'+i;c.correctionObligationIds=[];c.protectedReasons=[];}growth.candidates.push(c)}
 growth.ledger=[...state.ledger,...Array.from({length:n-20},(_,i)=>({...structuredClone(state.ledger[i%state.ledger.length]),id:state.ledger[i%state.ledger.length].id+':history:'+i}))];
 const result=boundedEditorialInput(growth),expanded=expandEditorialInput(result.inputState);
 expect(bytes(result.inputState)).toBeLessThanOrEqual(48000);expect(result.overflowIds.length+expanded.candidates.length).toBe(n);
 expect(expanded.obligations).toEqual(keyedEditorialState(compactEditorialInput({...growth,candidates:result.offeredCandidates}).state,{compact:false}).obligations);
 for(const c of growth.candidates.filter((c:any)=>c.protectedReasons.length||c.correctionObligationIds.length))expect(result.offeredCandidates.some((o:any)=>o.targetVersionId===c.targetVersionId)).toBe(true);
 expect(result.offeredCandidates.every((c:any)=>growth.candidates.some((old:any)=>canonicalJson(c)===canonicalJson(old)))).toBe(true);
 expect(result.inputState).toEqual(boundedEditorialInput(growth).inputState);
});
it('never substitutes ordinary news when protected input alone cannot fit',()=>{
 const growth=structuredClone(state);growth.candidates[0].facts[0].text='supported correction '.repeat(4000);
 const result=boundedEditorialInput(growth);expect(result.failure).toBe('PROTECTED_EDITORIAL_INPUT_TOO_LARGE');expect(result.offeredCandidates).toContainEqual(growth.candidates[0]);
});

it('losslessly compacts repair metadata alongside all facts, history and protected obligations',()=>{
 const wire=compactEditorialInput(state as ShortlistRecord),initial=keyedEditorialState(wire.state);
 const repair={...initial,previousProposal:{stories:Object.fromEntries(wire.state.candidates.map(c=>[c.targetVersionId,{decision:'SELECT',newUnderstandingFactIds:c.facts.map(f=>f.id),mustIncludeFactIds:c.facts.map(f=>f.id),rationale:'A retained supported reader-new development.'.repeat(10)}])),obligations:wire.state.obligations},feasibilityFeedback:{violations:wire.state.candidates.map(c=>({targetVersionId:c.targetVersionId,reason:'INPUT_CAPACITY'})),instruction:'Reconcile existing supported decisions without changing ownership.'}};
 const before=structuredClone(repair),after=compactEditorialRepair(repair);
 expect(bytes(before)).toBeGreaterThan(48000);expect(bytes(after)).toBeLessThan(bytes(before));
 expect(expandEditorialInput(after)).toEqual(expandEditorialInput(before));expect(repair).toEqual(before);
 expect(compactEditorialRepair(before)).toEqual(after);
 const small={candidates:[],ledger:[],obligations:[],previousProposal:{stories:{}},feasibilityFeedback:{violations:[]}};
 expect(compactEditorialRepair(small)).toBe(small);
});

it('uses actual model admission to retain a complete large comparison rather than the historical byte cutoff',()=>{
 const growth=structuredClone(state);growth.candidates=[];
 for(let i=0;i<40;i++){const c=structuredClone(state.candidates[i%state.candidates.length]);c.targetVersionId+=':growth:'+i;c.stableTargetId+=':growth:'+i;for(const f of c.facts)f.id+=':growth:'+i;c.correctionObligationIds=[];c.protectedReasons=[];growth.candidates.push(c)}
 const capability=modelCapability('openai/gpt-4.1-mini');
 const result=boundedEditorialInput(growth,{fits:input=>admitModelOperation('openai/gpt-4.1-mini',input,{},capability).fits});
 expect(result.failure).toBeUndefined();expect(result.overflowIds).toEqual([]);expect(result.offeredCandidates).toHaveLength(40);
 expect(result.offeredCandidates.flatMap(c=>c.facts)).toEqual(growth.candidates.flatMap((c:any)=>c.facts));
 expect(bytes(result.inputState)).toBeGreaterThan(48000);
});
