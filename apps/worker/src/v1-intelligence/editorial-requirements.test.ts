import {expect,it} from 'vitest';
import {validateEditorialRequirements,projectEditorialPropositions} from './editorial-requirements';
import {classifyNewsPropositionEligibility} from './news-proposition-eligibility';
import {fallbackEditorialPlan,normalizeEditorialPlan} from './editorial-plan';
const fact={id:'price',text:'Bee costs $74.99; a competitor costs $399.',evidenceRevisionIds:['r'],claimMentionIds:['m']};
const candidate:any={targetVersionId:'v',facts:[fact],protectedReasons:[],correctionObligationIds:[]};
const validation=()=>({policyVersion:'editorial-requirements-v2' as const,propositions:[{id:'own-price',parentFactId:'price',text:'Bee costs $74.99',start:0,end:16},{id:'comparison',parentFactId:'price',text:'a competitor costs $399.',start:18,end:fact.text.length}],dispositions:[{propositionId:'own-price',disposition:'REQUIRED' as const,reasonCode:'CORE_DEVELOPMENT' as const,justification:'Readers need the price of the new product.',obligationIds:[]},{propositionId:'comparison',disposition:'OPTIONAL_CONTEXT' as const,reasonCode:null,justification:'A competing price is nonessential background.',obligationIds:[]}]});
it('keeps required price and optional comparison separate without promoting novelty',()=>{
 const v=validation();v.propositions[1].end=fact.text.length;const checked=validateEditorialRequirements(v,candidate);const projected=projectEditorialPropositions(checked,candidate.facts);
 expect(projected.requiredIds).toEqual(['own-price']);expect(projected.facts.map(f=>f.id)).toEqual(['own-price','comparison']);expect(projected.facts[0].text).toBe('Bee costs $74.99');expect(projected.facts[0].evidenceRevisionIds).toEqual(['r']);
});
it('rejects foreign parents, missing disposition/reasons, invalid spans and protected demotion',()=>{
 for(const mutate of [(v:any)=>v.propositions[0].parentFactId='foreign',(v:any)=>v.dispositions.pop(),(v:any)=>v.dispositions[0].justification=' ',(v:any)=>v.propositions[0].end++]){const v=validation();v.propositions[1].end=fact.text.length;mutate(v);expect(()=>validateEditorialRequirements(v,candidate)).toThrow();}
 expect(()=>validateEditorialRequirements(validation(),{...candidate,protectedReasons:['CORRECTION']})).toThrow();
});
it('requires provenance to exclude navigation and leaves ambiguous flattened fragments unresolved',()=>{
 const revision:any={id:'r',contentHash:'hash',body:'Published: October 8\nThe company launched a product.'};
 const p={field:'body' as const,start:0,end:20};
 expect(classifyNewsPropositionEligibility(revision,p,[]).status).toBe('UNRESOLVED');
 const regions=[{revisionId:'r',contentHash:'hash',field:'body' as const,start:0,end:20,role:'NAVIGATION' as const,provenance:'PARSER_STRUCTURE' as const}];
 expect(classifyNewsPropositionEligibility(revision,p,regions).status).toBe('NOT_NEWS');
 expect(classifyNewsPropositionEligibility(revision,{field:'body',start:21,end:revision.body.length},regions).status).toBe('ELIGIBLE');
 expect(()=>classifyNewsPropositionEligibility(revision,p,[{...regions[0],contentHash:'stale'}])).toThrow();
 expect(revision.body).toBe('Published: October 8\nThe company launched a product.');
});
it('v2 normalization validates explicit requirements without promoting optional novelty',()=>{
 const c:any={...candidate,targetType:'EVENT',stableTargetId:'event',eventVersionIds:['v'],evidenceRevisionIds:['r'],flags:[],effects:[],fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[{text:fact.text}],treatment:'STANDARD'},priority:1};
 const shortlist:any={candidates:[c],obligations:[],ledger:[]};const body=fallbackEditorialPlan(shortlist);const story:any=body.stories[0];story.validation=validation();
 const result=normalizeEditorialPlan(body,shortlist,{contract:'EVIDENCE_GROUNDED_V2'});
 expect(result.normalization.added).toEqual([]);expect(result.value.stories[0].validation?.dispositions).toHaveLength(2);
});
it('deferring a protected target cannot demote its propositions to optional context',()=>{
 const v=validation();for(const d of v.dispositions){d.disposition='OPTIONAL_CONTEXT';d.reasonCode=null;}
 expect(()=>validateEditorialRequirements(v,{...candidate,protectedReasons:['CONTRADICTS']},false)).toThrow();
});

it('allows optional background within a disagreement but requires an explicit required disagreement',()=>{
 const v:any=validation();v.dispositions[0].reasonCode='DISAGREEMENT';const c={...candidate,protectedReasons:['CONTRADICTS']};expect(validateEditorialRequirements(v,c).dispositions[1].disposition).toBe('OPTIONAL_CONTEXT');v.dispositions[1].disposition='DEFERRED';expect(()=>validateEditorialRequirements(v,c)).toThrow('DISAGREEMENT_EVIDENCE_REMOVAL');v.dispositions[1].disposition='OPTIONAL_CONTEXT';v.dispositions[0].reasonCode='CORE_DEVELOPMENT';expect(()=>validateEditorialRequirements(v,c)).toThrow('DISAGREEMENT_REQUIREMENT_MISSING');
});
