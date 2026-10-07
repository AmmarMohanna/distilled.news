import {it,expect} from 'vitest';
import {nonFactRole} from './claims';
import {revisionChangesMeaning} from './correction-materiality';
const before='In 6 days, 10,000+ people will attend the conference. If you\u2019re planning to be one of them, don\u2019t wait to register your ticket before prices increase at the door. Save up to $100 on your pass.';
const after='In 6 days, 10,000+ people will attend the conference. If you\u2019re planning to be one of them, register for your ticket before prices increase at the door. Save up to $100 on your pass.';
it('a revision to an imperative registration instruction is not a factual correction',()=>{
 expect(nonFactRole('If you\u2019re planning to attend, don\u2019t wait to register your ticket.')).toBe('CALL_TO_ACTION');
 expect(revisionChangesMeaning(before,after)).toBe(false);
 expect(revisionChangesMeaning(before,after.replace('10,000+','12,000+'))).toBe(true);
});
it('conditional factual reporting is preserved',()=>{
 expect(nonFactRole('If you register a company, regulators require a filing.')).toBeUndefined();
 expect(nonFactRole('Officials registered 100 new companies this month.')).toBeUndefined();
});
