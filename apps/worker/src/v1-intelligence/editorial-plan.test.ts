import {expect,it} from 'vitest';
import {fallbackEditorialPlan,validateEditorialPlan} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
const shortlist={id:'s',feedId:'f',feedRevision:1,window:{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'},communicationFingerprint:'history',candidates:[{targetType:'EVENT',targetVersionId:'v',stableTargetId:'e',evidenceRevisionIds:['r'],eventVersionIds:['v'],facts:[{id:'fact',propositionId:'fact',text:'Officials confirmed 40 people affected.',evidenceRevisionIds:['r'],claimMentionIds:['m']}],stateSlotIds:[],effects:['CHANGES_STATE'],flags:[],protectedReasons:['CHANGES_STATE'],correctionObligationIds:[],priority:1,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[{text:'Officials confirmed 40 people affected.',evidenceRevisionIds:['r']}],previouslyCommunicated:[],treatment:'STANDARD'}}],overflow:[],obligations:[],ledger:[{id:'known',claimFacts:['Officials confirmed 12 people affected.']}],evidenceRevisionIds:['r']} as unknown as ShortlistRecord;
it('rejects unknown support and cannot suppress a protected changed count as repetition',()=>{
 const plan=fallbackEditorialPlan(shortlist);expect(plan.stories[0].mustIncludeFactIds).toEqual(['fact']);
 expect(()=>validateEditorialPlan({...plan,stories:[{...plan.stories[0],mustIncludeFactIds:['foreign-fact']}]},shortlist)).toThrow();
 expect(()=>validateEditorialPlan({...plan,stories:[{...plan.stories[0],decision:'SUPPRESS',deltaType:'REPEAT',mustIncludeFactIds:[]}]},shortlist)).toThrow();
});
it('requires explicit decisions for every candidate and preserves selected treatment and order',()=>{
 const plan=fallbackEditorialPlan(shortlist);expect(validateEditorialPlan(plan,shortlist)).toEqual(plan);
 expect(()=>validateEditorialPlan({...plan,stories:[]},shortlist)).toThrow();
});
