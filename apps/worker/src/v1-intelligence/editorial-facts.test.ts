import {expect,it} from 'vitest';
import {equivalentFact} from './editorial';
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
