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

it('requires declared new understanding in reader-visible MUST_INCLUDE coverage',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].protectedReasons=[];scope.candidates[0].facts.push({...scope.candidates[0].facts[0],id:'context',propositionId:'context',text:'Officials confirmed 12 people affected.'});
 const plan=fallbackEditorialPlan(scope);plan.stories[0].mustIncludeFactIds=['context'];plan.stories[0].newUnderstandingFactIds=['fact'];
 expect(()=>validateEditorialPlan(plan,scope)).toThrow();
});

it('cannot address a correction obligation by merely repeating the old claim',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].facts[0].text='Officials confirmed 12 people affected.';scope.candidates[0].correctionObligationIds=['ob'];scope.obligations=[{id:'ob',feedId:'f',ledgerEntryId:'known',editionId:'old',kind:'SOURCE_DELETED',triggerId:'deleted',state:'OPEN',createdAt:'2026-10-03T12:00:00Z',policyVersion:'test'}];
 const plan=fallbackEditorialPlan(scope);plan.stories[0].deltaType='CORRECTION';plan.stories[0].previousLedgerEntryIds=['known'];plan.obligations=[{obligationId:'ob',handling:'ADDRESS',targetVersionId:'v',reason:'Correction'}];
 expect(()=>validateEditorialPlan(plan,scope)).toThrow();
});
