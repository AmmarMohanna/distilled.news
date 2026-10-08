import {it,expect} from 'vitest';
import persisted from './fixtures/overnight-hermes-plan.json';
import {provenMaterialDelta,provenSlotValueDelta,provenSlotMeaningDelta,alignedSlotDelta} from './material-delta';
import {equivalentFact} from './editorial';
import {compactEditorialInput} from './editorial-transport';
import {validateEditorialPlan} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
it.each([
 ['Hermes agent developer raised $90 million.','Hermes Agent developer raised $90 million.',false],
 ['Hermes developer raised $90 million.','Hermes developer raised $120 million.',true],
 ['Hermes developer may raise $90 million.','Hermes developer raised $90 million.',true],
 ['Officials reported 12 deaths.','Officials reported 40 deaths.',true],
 ['Officials may launch the service.','Officials will launch the service.',true],
 ['The launch is planned.','The launch is cancelled.',true],
 ['The service is allowed.','The service is not allowed.',true],
 ['Hermes raised $90 million.','A different company raised $120 million.',false],
 ['Sentence.','Sentence',false],
 ['The developer raised $90 million.','The developer has successfully raised $90 million in a funding round.',false]
])('material change requires a supported same-proposition delta: %s -> %s', (a,b,expected)=>expect(provenMaterialDelta(a,b)).toBe(expected));
it('the exact overnight Meta/guardrail proposal fails with old fake protection and passes when protection is recomputed from meaning',()=>{
 const shortlist=structuredClone(persisted.shortlist) as unknown as ShortlistRecord;
 const decoded=compactEditorialInput(shortlist).decode(persisted.proposal.rawProposal as any);
 expect(()=>validateEditorialPlan(decoded,shortlist,{requirePublicationCorrection:true,correctionCapacity:2})).toThrowError(expect.objectContaining({code:'SCOPE_DENIED'}));
 const hermes=shortlist.candidates.find(c=>c.sourceTitles?.some(t=>t.includes('Nous Research')))!;
 const history=shortlist.ledger.filter(e=>e.storylineIds.includes(hermes.storylineId!)).flatMap(e=>e.claimFacts);
 expect(hermes.facts.every(f=>history.every(old=>!provenMaterialDelta(old,f.text)))).toBe(true);
 hermes.protectedReasons=[];
 expect(()=>validateEditorialPlan(decoded,shortlist,{requirePublicationCorrection:true,correctionCapacity:2})).not.toThrow();
 expect(equivalentFact('Hermes agent developer raised $90 million.','Hermes Agent developer raised $90 million.')).toBe(true);
});

it.each([['$90M','$90 million',false],['$90M','$120M',true],['12%','18%',true],['Hermes agent','Hermes Agent',false],['planned','cancelled',true],['John Smith','Smith, John',false]])('structured slot protection requires a proven value change: %s -> %s',(a,b,expected)=>expect(provenSlotValueDelta(a,b)).toBe(expected));

it('structured attribution surface changes cannot manufacture material protection',()=>{
 const previous={value:'$90M',certainty:{kind:'UNSPECIFIED' as const,hedges:[]},attribution:'Hermes agent developer'};
 expect(provenSlotMeaningDelta(previous,{...previous,attribution:'Hermes Agent developer.'})).toBe(false);
 expect(provenSlotMeaningDelta({...previous,attribution:undefined},{...previous,attribution:'BBC'})).toBe(false);
 expect(provenSlotMeaningDelta(previous,{...previous,value:'$120M'})).toBe(true);
 expect(provenSlotMeaningDelta(previous,{...previous,attribution:'Official confirmation',certainty:{kind:'CONFIRMED',hedges:[]}})).toBe(true);
});
it.each([
 ['Company A raised $90 million and Company B raised $120 million.','Company A raised $120 million and Company B raised $90 million.',true,'entities exchange values'],
 ['Company A raised $90M and Company B raised $120 million.','Company A raised $120 million and Company B raised $90M.',true,'exchange despite mixed notation'],
 ['Company A raised $90 million.','Company A raised $120 million.',true,'same entity amount changes'],
 ['Company A raised $90M.','Company A raised $90 million.',false,'formatting only'],
 ['Company A raised $90 million and Company B raised $120 million.','Company A raised $90M and Company B raised $120M.',false,'formatting only, several values'],
 ['Company A raised $90 million.','Company B raised $120 million.',false,'unrelated entities'],
 ['Revenue was $90 million and profit was $10 million.','Revenue was $90 million and profit was $12 million.',true,'one of several attributes changes'],
 ['Revenue was $90 million and profit was $10 million.','Revenue was $10 million and profit was $90 million.',true,'same values swap attributes'],
 ['Company A raised $90 million and Company B raised $90 million.','Company A raised $90 million and Company B raised $120 million.',true,'duplicate value diverges'],
 ['Company A raised $90 million and Company B raised $120 million.','Company B raised $120 million and Company A raised $90 million.',false,'reordered clauses are unaligned, left to semantic layer'],
])('numeric changes keep their entity/attribute association: %s -> %s (%s)',(a,b,expected)=>expect(provenMaterialDelta(a,b)).toBe(expected));
it('slot deltas require an unambiguous aligned slot and do not protect when an unchanged aligned value remains',()=>{
 const slot=(value:string)=>({value,certainty:{kind:'UNSPECIFIED' as const,hedges:[]},attribution:undefined});
 expect(alignedSlotDelta(slot('$90M'),[slot('$120M')])).toBe(true);
 expect(alignedSlotDelta(slot('$90M'),[slot('$90 million')])).toBe(false);
 expect(alignedSlotDelta(slot('$90M'),[slot('$90 million'),slot('$120M')])).toBe(false);
 expect(alignedSlotDelta(slot('$90M'),[slot('$100M'),slot('$120M')])).toBe(false);
 expect(alignedSlotDelta(slot('$90M'),[])).toBe(false);
});
