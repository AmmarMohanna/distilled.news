import {it,expect} from 'vitest';
import {checkReaderFidelity} from './fidelity';
import persisted from './fixtures/staging-anthropic-report-date.json';
const fact=(text:string,id='f')=>({id,text,evidenceRevisionIds:['r']});
const check=(text:string,sources:string[])=>{const facts=sources.map((s,i)=>fact(s,String(i)));return checkReaderFidelity([text],facts,facts,true,{checks:facts.map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Independent permissive verifier.'}))});};
it('rejects the persisted cross-clause prohibition separately from its date error',()=>{
 expect(persisted.persistedVerification.claimEntailment[0].fullyEntailed).toBe(true);
 const result=checkReaderFidelity([persisted.claim.replace('On October 8, 2026, ','')],persisted.facts,persisted.facts,true,{checks:persisted.persistedVerification.semanticChecks.map(({readerNovelty,...check})=>check)});
 expect(result.failures.some(f=>f.code==='UNSUPPORTED_ACTION_STRENGTH')).toBe(true);
 expect(result.failures.some(f=>f.value?.includes('surveillance'))).toBe(true);
});
it.each([
 ['The policy prohibits surveillance.','The policy addresses surveillance.'],
 ['The policy mandates identity checks.','The policy discusses identity checks.'],
 ['The board approves expansion.','The board considers expansion.'],
 ['The agency implements restrictions.','The agency proposes restrictions.'],
 ['The company completes deployment.','The company plans deployment.'],
 ['The policy affects access.','The policy may affect access.'],
 ['The policy prohibits surveillance.','The policy does not prohibit surveillance.'],
 ['The board approved expansion.','The board reportedly approved expansion.'],
])('cannot strengthen an aligned action despite semantic approval: %s', (output,source)=>expect(check(output,[source]).passed).toBe(false));
it.each([
 ['The policy addresses surveillance.','The policy addresses surveillance.'],
 ['The policy bans surveillance.','The policy prohibits surveillance.'],
 ['The policy may ban surveillance.','The policy might prohibit surveillance.'],
 ['The policy does not ban surveillance.','The policy does not prohibit surveillance.'],
 ['Surveillance is banned.','Surveillance is prohibited.'],
 ['The policy prohibits surveillance.','Surveillance is prohibited.'],
 ['The board approved expansion.','The board approved expansion.'],
])('allows equivalent action meaning: %s',(output,source)=>expect(check(output,[source]).passed).toBe(true));
it('does not transfer prohibition support between coordinated objects',()=>{
 const sources=['The policy prohibits facial recognition.','The policy addresses facial recognition and location tracking.'];
 expect(check('The policy prohibits facial recognition and location tracking.',sources).passed).toBe(false);
 expect(check('The policy bans facial recognition and addresses location tracking.',sources).passed).toBe(true);
 expect(check('The policy bans facial recognition and location tracking.',[...sources,'The policy prohibits location tracking.']).passed).toBe(true);
});
it('does not pretend that unmatched contextual language is a deterministic entailment proof',()=>{
 expect(check('The board approves expansion.', ['The board considers whether to permit expansion.']).failures.filter(f=>f.code==='UNSUPPORTED_ACTION_STRENGTH')).toEqual([]);
 expect(check('The policy bans surveillance.', ['The policy addresses surveillance.','Surveillance has been outlawed.']).failures.filter(f=>f.code==='UNSUPPORTED_ACTION_STRENGTH')).toEqual([]);
});
it('keeps uncertainty and negation attached to the particular coordinated object',()=>{
 expect(check('The policy bans tracking and surveillance.', ['The policy may prohibit tracking and prohibits surveillance.']).passed).toBe(false);
 expect(check('The policy may ban tracking and bans surveillance.', ['The policy may prohibit tracking and prohibits surveillance.']).passed).toBe(true);
 expect(check('The policy bans tracking and surveillance.', ['The policy prohibits tracking but does not prohibit surveillance.']).passed).toBe(false);
});
