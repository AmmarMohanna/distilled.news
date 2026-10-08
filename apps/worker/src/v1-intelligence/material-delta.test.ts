import {it,expect} from 'vitest';
import persisted from './fixtures/overnight-hermes-plan.json';
import {provenMaterialDelta,provenSlotValueDelta} from './material-delta';
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
