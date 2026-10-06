import {it,expect} from 'vitest';
import {checkReaderFidelity,verifiedCorrectionDelivery} from './fidelity';
import temporalFalsePass from './fixtures/staging-temporal-false-pass.json';
const fact=(text:string)=>({id:'fact',text,evidenceRevisionIds:['r']});
it('rejects the exact persisted Mangione false pass despite real verifier approval',()=>{
 const f=temporalFalsePass.fact;
 expect(f.timing.framingRequired).toBe(true);
 expect(checkReaderFidelity([temporalFalsePass.claim],[f],[f],true,{checks:temporalFalsePass.semanticChecks}).failures).toContainEqual({code:'TEMPORAL_FRAMING_REQUIRED',factId:f.id});
});
it('a positive verifier cannot confuse old reporting age with relative event sequence',()=>{
 const source='Bodycam footage shows an officer finding a gun, days after the killing.',approved={...fact(source),timing:{sourcePublishedAt:'2026-10-02T20:37:34Z',firstSeenByFeedAt:'2026-10-06T16:52:43Z',observedAt:'2026-10-06T16:52:43Z',framingRequired:true}};
 const checks=[{factId:'fact',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Permissive positive verdict.'}];
 expect(checkReaderFidelity([source],[approved],[approved],true,{checks}).failures).toContainEqual({code:'TEMPORAL_FRAMING_REQUIRED',factId:'fact'});
 expect(checkReaderFidelity(['A prior Distilled briefing that reported bodycam footage showing an officer finding a gun has been withdrawn. Bodycam footage shows an officer finding a gun, days after the killing.'],[approved],[approved],true,{checks}).failures).toContainEqual({code:'TEMPORAL_FRAMING_REQUIRED',factId:'fact'});
 expect(checkReaderFidelity(['An earlier report shows an officer finding a gun, days after the killing.'],[approved],[approved],true,{checks}).passed).toBe(true);
 expect(checkReaderFidelity([source],[{...approved,timing:{...approved.timing,framingRequired:false}}],[approved],true,{checks}).passed).toBe(true);
});
it('rejects invented quantities, magnitudes and dates even with a supplied supporting quote',()=>{
 for(const [source,text] of [['Officials reported 12 people affected.','Officials reported 40 people affected.'],['The cost is 12 million.','The cost is 12 billion.'],['The vote is on 2026-10-03.','The vote is on 2026-10-04.']])expect(checkReaderFidelity([text],[fact(source)],[fact(source)],true).passed).toBe(false);
 expect(checkReaderFidelity(['People were affected.'],[fact('Officials reported 40 people affected.')],[fact('Officials reported 40 people affected.')],true).passed).toBe(false);
 expect(checkReaderFidelity(['The cost is 12000000.'],[fact('The cost is 12 million.')],[fact('The cost is 12 million.')],true).passed).toBe(true);
});
it('preserves visible uncertainty, negation, temporal bounds and attributed disagreement',()=>{
 for(const [source,text] of [['The cabinet may approve the bill.','The cabinet approved the bill.'],['The court did not confirm the decision.','The court confirmed the decision.'],['Officials reported at least 40 people affected.','Officials reported 40 people affected.']])expect(checkReaderFidelity([text],[fact(source)],[fact(source)],true).passed).toBe(false);
 expect(checkReaderFidelity(['Police reported 12 people; hospitals reported 40 people.'],[fact('Police reported 12 people.'),{...fact('Hospitals reported 40 people.'),id:'other'}],[fact('Police reported 12 people.'),fact('Hospitals reported 40 people.')],true).passed).toBe(true);
});

it('correction resolution requires both actual verified delivery and visible corrective context',()=>{
 expect(verifiedCorrectionDelivery(['Officials confirmed 12 people.'],'o',[],true)).toBe(false);
 expect(verifiedCorrectionDelivery(['Officials confirmed 12 people.'],'o',['o'],true)).toBe(false);
 expect(verifiedCorrectionDelivery(['Earlier briefing reported 12; officials now report 40.'],'o',['o'],true)).toBe(true);
});
it('does not mistake URL identifiers for missing quantities or approved calendar dates',()=>{
 const source='The death toll rose to 40. https://example.invalid/report/2026-10-03/483';
 expect(checkReaderFidelity(['Forty people have now died.'],[fact(source)],[fact(source)],true).passed).toBe(true);
 expect(checkReaderFidelity(['Forty people died on 2026-10-03.'],[fact(source)],[fact(source)],true).passed).toBe(false);
});
it('allows equivalent exact ages but rejects newly invented numerical bounds even with a positive semantic verdict',()=>{
 const source='The watch is a hundred-year-old keepsake.',approved=fact(source),checks=[{factId:'fact',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Controlled positive verdict.'}];
 for(const text of ['The keepsake watch is a century old.','The watch is 100 years old.'])expect(checkReaderFidelity([text],[approved],[approved],true,{checks}).passed).toBe(true);
 for(const text of ['The watch is over a century old.','The watch is more than one hundred years old.','The watch is under 100 years old.'])expect(checkReaderFidelity([text],[approved],[approved],true,{checks}).passed).toBe(false);
 expect(checkReaderFidelity(['No fewer than forty people died.'],[fact('At least 40 people died.')],[fact('At least 40 people died.')],true).passed).toBe(true);
 expect(checkReaderFidelity(['The cost exceeded expectations at over 12000000.'],[fact('The cost is over 12 million.')],[fact('The cost is over 12 million.')],true).passed).toBe(true);
});
