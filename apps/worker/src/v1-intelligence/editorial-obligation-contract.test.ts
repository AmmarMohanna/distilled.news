import {expect,it} from 'vitest';
import {compactEditorialInput} from './editorial-transport';
import {editorialPlanWireSchemaFor,keyedEditorialPlanWireSchemaFor,fallbackEditorialPlan,validateEditorialPlan} from './editorial-plan';
import {expandedSchema} from './schema-test-utils';
import {inspectProviderSchema} from '../provider-schema';
import type {ShortlistRecord} from './shortlist';

// October 15 11:00: SOURCE_REVISED obligations had reader-history witnesses,
// but none of the 35 candidates owned them. The model nevertheless said ADDRESS.
function scope():ShortlistRecord {
 return {candidates:[{targetType:'EVENT',targetVersionId:'revenue',stableTargetId:'company-revenue',eventVersionIds:['revenue'],evidenceRevisionIds:['article'],facts:[{id:'growth',text:'The company reported higher revenue.',evidenceRevisionIds:['article'],claimMentionIds:['mention'],selfContained:'YES'}],flags:[],effects:[],protectedReasons:[],correctionObligationIds:[],priority:1,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[{text:'The company reported higher revenue.',evidenceRevisionIds:['article']}],previouslyCommunicated:[],treatment:'STANDARD'}}],ledger:[{id:'prior',eventIds:[],storylineIds:[],claimFacts:['The company reported revenue.'],evidenceRevisionIds:['old-article']}],obligations:[{id:'revision',ledgerEntryId:'prior',kind:'SOURCE_REVISED',state:'OPEN'}]} as unknown as ShortlistRecord;
}
function obligationBranches(state:ShortlistRecord){
 const wire=compactEditorialInput(state),schema=expandedSchema(keyedEditorialPlanWireSchemaFor(wire.state));
 return {schema,branches:(schema.properties.obligations.properties as any)[wire.state.obligations[0].id].anyOf as any[]};
}
it('does not offer ADDRESS for an obligation that no candidate owns, even with reader history',()=>{
 const state=scope(),{schema,branches}=obligationBranches(state);
 expect(branches.flatMap(b=>b.properties.handling.enum)).toEqual(['DEFER']);
 const legacy=editorialPlanWireSchemaFor(compactEditorialInput(state).state);
 expect((legacy.properties.obligations.items as any).anyOf[0].properties.handling.enum).toEqual(['DEFER']);
 expect(inspectProviderSchema('openai/gpt-4.1-mini',schema).fits).toBe(true);
 expect(state.candidates[0].correctionObligationIds).toEqual([]);
});
it('keeps the validator authoritative: ordinary publication cannot resolve an unowned obligation',()=>{
 const state=scope(),body=fallbackEditorialPlan(state);
 expect(validateEditorialPlan(body,state)).toEqual(body);
 body.obligations[0]={obligationId:'revision',handling:'ADDRESS',targetVersionId:'revenue',reason:'Correct the prior revenue report.'};
 body.stories[0].previousLedgerEntryIds=['prior'];body.stories[0].deltaType='CORRECTION';
 expect(()=>validateEditorialPlan(body,state)).toThrow('SCOPE_DENIED');
});
it('retains ADDRESS for an owned source correction without requiring a withdrawal',()=>{
 const state=scope();state.candidates[0].correctionObligationIds=['revision'];
 const {branches}=obligationBranches(state);
 expect(branches.flatMap(b=>b.properties.handling.enum)).toContain('ADDRESS');
 const body=fallbackEditorialPlan(state);Object.assign(body.stories[0],{decision:'SELECT',treatment:'STANDARD',deltaType:'CORRECTION',newUnderstandingFactIds:['growth'],mustIncludeFactIds:['growth'],previousLedgerEntryIds:['prior']});
 body.obligations[0]={obligationId:'revision',handling:'ADDRESS',targetVersionId:'revenue',reason:'Communicate the changed supported revenue fact.'};
 expect(validateEditorialPlan(body,state)).toEqual(body);
});
it('keeps ready publication withdrawal corrections mandatory and source-bound',()=>{
 const state=scope();state.candidates[0].correctionObligationIds=['revision'];state.obligations[0].publicationWithdrawal={reason:'POLICY_REQUIRED'};
 const {branches}=obligationBranches(state);
 expect(branches.flatMap(b=>b.properties.handling.enum)).toEqual(['ADDRESS']);
 expect(branches[0].properties.targetVersionId.enum).toHaveLength(1);
});
