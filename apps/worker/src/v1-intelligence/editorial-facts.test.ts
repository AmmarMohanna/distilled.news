import {expect,it} from 'vitest';
import {equivalentFact,boundedEditorialContext,type EditorialDecision} from './editorial';
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
it('recognizes conservative lexical equivalents',()=>{
 expect(equivalentFact('Lebanon Parliament approved banking legislation.','Lebanon Parliament passed banking law.')).toBe(true);
});
it('bounds model history without altering the persisted delta or complete decision',()=>{
 const previous={editionId:'edition',targetType:'EVENT' as const,targetVersionId:'event',claimIds:['claim'],facts:['x'.repeat(12000)],evidenceRevisionIds:['evidence']};
 const decision:EditorialDecision={policyVersion:'fixture',targetType:'EVENT',targetVersionId:'current',stableTargetId:'event',decision:'INCLUDE',reasonCodes:['MATERIAL_NEW_FACT'],previouslyCommunicated:Array.from({length:100},()=>previous),newUnderstanding:[{text:'A new fact.',evidenceRevisionIds:['new']}],repeatedFactCount:100,repeatPenalty:.9,contextNeed:'SMALL',treatment:'BRIEF'};
 const bounded=boundedEditorialContext(decision);
 expect(bounded.previouslyCommunicated).toHaveLength(1);expect(bounded.previouslyCommunicated[0].facts[0]).toHaveLength(400);
 expect(bounded.newUnderstanding).toEqual(decision.newUnderstanding);expect(decision.previouslyCommunicated).toHaveLength(100);
});
