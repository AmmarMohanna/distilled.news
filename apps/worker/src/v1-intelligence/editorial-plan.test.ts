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

it('permits supported restatement only to correct a persisted publication withdrawal',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].facts[0].text='Officials confirmed 12 people affected.';scope.candidates[0].correctionObligationIds=['ob'];scope.obligations=[{id:'ob',feedId:'f',ledgerEntryId:'known',editionId:'old',kind:'RETRACTED',triggerId:'withdrawal',state:'OPEN',createdAt:'2026-10-03T12:00:00Z',policyVersion:'test',publicationWithdrawal:{reason:'POLICY_REQUIRED'}}];
 const plan=fallbackEditorialPlan(scope);Object.assign(plan.stories[0],{decision:'SELECT',treatment:'STANDARD',deltaType:'CORRECTION',mustIncludeFactIds:['fact'],newUnderstandingFactIds:[],previousLedgerEntryIds:['known']});plan.obligations=[{obligationId:'ob',handling:'ADDRESS',targetVersionId:'v',reason:'Explicitly correct the withdrawn prior communication.'}];
 plan.stories[0].feedFit='OUT_OF_SCOPE';expect(validateEditorialPlan(plan,scope)).toEqual(plan);
 delete scope.obligations[0].publicationWithdrawal;
 expect(()=>validateEditorialPlan(plan,scope)).toThrow();
});

it('overloaded publication corrections retain explicit pending obligations while filling correction capacity',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].facts[0].selfContained='YES';scope.candidates[0].correctionObligationIds=['ob'];scope.obligations=[{id:'ob',feedId:'f',ledgerEntryId:'known',editionId:'old',kind:'RETRACTED',triggerId:'withdrawal',state:'OPEN',createdAt:'2026-10-03T12:00:00Z',policyVersion:'test',publicationWithdrawal:{reason:'POLICY_REQUIRED'}}];
 const second=structuredClone(scope.candidates[0]);second.targetVersionId='v2';second.stableTargetId='e2';second.correctionObligationIds=['ob2'];scope.candidates.push(second);scope.obligations.push({...scope.obligations[0],id:'ob2'});
 const plan=fallbackEditorialPlan(scope);plan.stories=plan.stories.map((story,i)=>({...story,decision:i?'DEFER':'SELECT',treatment:i?'OMIT':'STANDARD',deltaType:'CORRECTION',mustIncludeFactIds:i?[]:['fact'],previousLedgerEntryIds:['known']}));plan.obligations=[{obligationId:'ob',handling:'ADDRESS',targetVersionId:'v',reason:'Correct withdrawn prose.'},{obligationId:'ob2',handling:'DEFER',targetVersionId:null,reason:'Pending until next capacity.'}];
 expect(validateEditorialPlan(plan,scope,{requirePublicationCorrection:true,correctionCapacity:1})).toEqual(plan);
 expect(()=>validateEditorialPlan({...plan,stories:plan.stories.map(s=>({...s,decision:'DEFER',treatment:'OMIT'}))},scope,{requirePublicationCorrection:true,correctionCapacity:1})).toThrow();
});

it('source refresh cannot relabel communicated corroboration as a new correction',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].protectedReasons=[];scope.candidates[0].facts[0].text='Officials confirmed 12 people affected';scope.ledger[0].eventIds=['e'];scope.ledger[0].storylineIds=[];
 const plan=fallbackEditorialPlan(scope);plan.stories[0].deltaType='CORRECTION';plan.stories[0].previousLedgerEntryIds=['known'];
 expect(()=>validateEditorialPlan(plan,scope)).toThrow();
 const deferred={...plan,stories:plan.stories.map(s=>({...s,decision:'DEFER' as const,treatment:'OMIT' as const}))};expect(validateEditorialPlan(deferred,scope)).toEqual(deferred);
});

it('uncommunicated ordinary work cannot be labeled REPEAT by a model',()=>{
 const scope=structuredClone(shortlist);scope.candidates[0].protectedReasons=[];const plan=fallbackEditorialPlan(scope);Object.assign(plan.stories[0],{decision:'SUPPRESS',treatment:'OMIT',deltaType:'REPEAT'});expect(()=>validateEditorialPlan(plan,scope)).toThrow();
});
