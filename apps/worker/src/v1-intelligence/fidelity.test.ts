import {it,expect} from 'vitest';
import {checkReaderFidelity,verifiedCorrectionDelivery} from './fidelity';
const fact=(text:string)=>({id:'fact',text,evidenceRevisionIds:['r']});
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
