import {expect,it} from 'vitest';
import {equivalentFact,boundedEditorialContext,priorContextEvidence,type EditorialDecision} from './editorial';
it('preserves actor and recipient ordering',()=>{
 expect(equivalentFact('Lebanon attacked Israel.','Israel attacked Lebanon.')).toBe(false);
 expect(equivalentFact('Lebanon supported Israel.','Lebanon was supported by Israel.')).toBe(false);
 expect(equivalentFact('The court, said the minister, approved reform.','The court said the minister approved reform.')).toBe(false);
});
it('preserves quantities, negation and future uncertainty',()=>{
 expect(equivalentFact('The bank signed agreements.','The bank will sign agreements.')).toBe(false);
 expect(equivalentFact('Parliament signing banking agreement.','Parliament signed banking agreement.')).toBe(false);
 expect(equivalentFact('The bank approved 20 payments.','The bank approved 30 payments.')).toBe(false);
 expect(equivalentFact('Bank approved 10% payments.','Bank approved 10 payments.')).toBe(false);
 expect(equivalentFact('Bank approved -10 payments.','Bank approved 10 payments.')).toBe(false);
 expect(equivalentFact('Bank approved >10 payments.','Bank approved <10 payments.')).toBe(false);
 expect(equivalentFact('Bank approved 10% deposits and 20 loans.','Bank approved 10 deposits and 20% loans.')).toBe(false);
 expect(equivalentFact('Balances are -10 and 20.','Balances are 10 and -20.')).toBe(false);
 expect(equivalentFact('Bank approved payments before court ruling.','Bank approved payments after court ruling.')).toBe(false);
 expect(equivalentFact('The bank approved payments.','The bank did not approve payments.')).toBe(false);
 expect(equivalentFact('The bank may approve payments.','The bank approved payments.')).toBe(false);
});
it('recognizes only inflectional/abbreviation equivalents, not synonyms',()=>{
 expect(equivalentFact('Lebanon Parliament approved banking legislation.','Lebanon Parliament passed banking law.')).toBe(false);
 expect(equivalentFact('Lebanon Parliament approved banking law.','The Lebanon Parliament approves banking laws.')).toBe(false);
 expect(equivalentFact('Lebanon Parliament approved banking law.','The Lebanon Parliament approved banking law.')).toBe(true);
});
it('bounds model history without altering the persisted delta or complete decision',()=>{
 const previous={editionId:'edition',targetType:'EVENT' as const,targetVersionId:'event',claimIds:['claim'],facts:['x'.repeat(12000)],evidenceRevisionIds:['evidence']};
 const decision:EditorialDecision={policyVersion:'fixture',targetType:'EVENT',targetVersionId:'current',stableTargetId:'event',decision:'INCLUDE',reasonCodes:['MATERIAL_NEW_FACT'],previouslyCommunicated:Array.from({length:100},()=>previous),newUnderstanding:[{text:'A new fact.',evidenceRevisionIds:['new']}],repeatedFactCount:100,repeatPenalty:.9,contextNeed:'SMALL',treatment:'BRIEF'};
 const bounded=boundedEditorialContext(decision);
 expect(bounded.previouslyCommunicated).toHaveLength(1);expect(bounded.previouslyCommunicated[0].facts[0]).toHaveLength(400);
 expect(bounded.newUnderstanding).toEqual(decision.newUnderstanding);expect(decision.previouslyCommunicated).toHaveLength(100);
});

it('bounds earlier count support to the latest two communicated facts rather than all historical estimates',()=>{
 const evidence=Array.from({length:20},(_,i)=>({id:`r${i}`,body:`The government reported ${i+1} depositors.`})) as import('@distilled/contracts').EvidenceRevision[];
 const previous=(i:number)=>({editionId:`edition${i}`,targetType:'EVENT' as const,targetVersionId:'event',claimIds:['claim'],facts:[evidence[i].body!],evidenceRevisionIds:[evidence[i].id]});
 const value:EditorialDecision={policyVersion:'fixture',targetType:'EVENT',targetVersionId:'current',stableTargetId:'event',decision:'INCLUDE',reasonCodes:['MATERIAL_NEW_FACT'],previouslyCommunicated:Array.from({length:20},(_,i)=>previous(19-i)),newUnderstanding:[{text:'The union reported 21 depositors.',evidenceRevisionIds:['new']}],repeatedFactCount:20,repeatPenalty:.9,contextNeed:'SMALL',treatment:'BRIEF'};
 expect(priorContextEvidence(value,evidence).map(e=>e.id)).toEqual(['r19']);
 value.previouslyCommunicated[0]={...previous(19),facts:[evidence[19].body!,evidence[18].body!,evidence[17].body!],evidenceRevisionIds:evidence.map(e=>e.id)};
 expect(priorContextEvidence(value,evidence).map(e=>e.id)).toEqual(['r19','r18']);
 expect(priorContextEvidence(value,evidence.slice(0,18))).toEqual([]);
 expect(priorContextEvidence({...value,decision:'SUPPRESS'},evidence)).toEqual([]);
});

it('retains exact grounded context references even when published prose paraphrases the source',()=>{
 const body='Lebanon banking reform affected 20 depositors according to the government.';
 const claim='The government counted 20 affected depositors.';
 expect(equivalentFact(body,claim)).toBe(false);
 const value:EditorialDecision={policyVersion:'fixture',targetType:'EVENT',targetVersionId:'current',stableTargetId:'event',decision:'INCLUDE',reasonCodes:['MATERIAL_NEW_FACT'],previouslyCommunicated:[{editionId:'edition',targetType:'EVENT',targetVersionId:'old',claimIds:['claim'],facts:[claim],evidenceRevisionIds:['government'],factEvidenceRevisionIds:[['government']]}],newUnderstanding:[{text:'The union reported over 100 depositors.',evidenceRevisionIds:['union']}],repeatedFactCount:1,repeatPenalty:.5,contextNeed:'MODERATE',treatment:'DETAILED'};
 const evidence=[{id:'government',body}] as import('@distilled/contracts').EvidenceRevision[];
 expect(priorContextEvidence(value,evidence).map(e=>e.id)).toEqual(['government']);
 expect(priorContextEvidence(value,[])).toEqual([]);
});
