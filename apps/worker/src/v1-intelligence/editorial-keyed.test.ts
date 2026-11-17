import {expect,it} from 'vitest';
import fixture from './fixtures/staging-1600-duplicate-candidate.json';
import {compactEditorialInput} from './editorial-transport';
import {editorialPlanWireSchemaFor,keyedEditorialPlanWireSchemaFor,fallbackEditorialPlan,normalizeEditorialPlan,validateEditorialPlan,planCapacityFailures} from './editorial-plan';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import type {ShortlistRecord} from './shortlist';
const shortlist=fixture.shortlist as unknown as ShortlistRecord;
it('reproduces the exact billed 16:00 duplicate and missing decision without repairing editorial judgment',()=>{
 const wire=compactEditorialInput(shortlist),raw=fixture.rawProposal;
 expect(raw.stories).toHaveLength(19);expect(new Set(raw.stories.map(s=>s.targetVersionId)).size).toBe(18);
 expect(raw.stories.filter(s=>s.targetVersionId==='R16')).toHaveLength(2);
 expect(()=>normalizeEditorialPlan(wire.decode(raw as any),shortlist)).toThrow();
 // Matching array length was never sufficient provider-side coverage.
 expect(editorialPlanWireSchemaFor(wire.state).properties.stories).toMatchObject({minItems:raw.stories.length});
 expect(()=>wire.decodeKeyed(raw)).toThrow();
});
it('requires one decision slot per offered candidate with compact shared schema definitions',()=>{
 const wire=compactEditorialInput(shortlist),schema=keyedEditorialPlanWireSchemaFor(wire.state);
 expect(schema.properties.stories.type).toBe('object');
 expect(schema.properties.stories.additionalProperties).toBe(false);
 expect(schema.properties.stories.required).toEqual(wire.state.candidates.map(c=>c.targetVersionId));
 expect(Object.keys(schema.properties.stories.properties)).toEqual(schema.properties.stories.required);
 expect(JSON.stringify(schema).length).toBeLessThan(JSON.stringify(editorialPlanWireSchemaFor(wire.state)).length);
 const body=fallbackEditorialPlan(shortlist);for(const s of body.stories)Object.assign(s,{decision:'DEFER',treatment:'OMIT'});
 expect(validateEditorialPlan(wire.decodeKeyed(wire.encodeKeyed(body)),shortlist)).toEqual(body);
});
it.each(['missing','unknown','duplicate identity','foreign fact','invented fact'])('rejects %s without inventing a replacement decision',mode=>{
 const wire=compactEditorialInput(shortlist),body=fallbackEditorialPlan(shortlist);for(const s of body.stories)Object.assign(s,{decision:'DEFER',treatment:'OMIT'});
 const raw:any=wire.encodeKeyed(body),keys=Object.keys(raw.stories);
 if(mode==='missing')delete raw.stories[keys[0]];
 if(mode==='unknown')raw.stories.R999=raw.stories[keys[0]];
 if(mode==='duplicate identity')raw.stories[keys[0]].targetVersionId=keys[1];
 if(mode==='foreign fact')raw.stories[keys[0]].mustIncludeFactIds=[wire.state.candidates[1].facts[0].id];
 if(mode==='invented fact')raw.stories[keys[0]].mustIncludeFactIds=['R999'];
 expect(()=>normalizeEditorialPlan(wire.decodeKeyed(raw),shortlist)).toThrow();
});
it('keying cannot remove protected facts, select unresolved evidence or bypass capacity',()=>{
 const scope=structuredClone(shortlist),wire=compactEditorialInput(scope),candidate=scope.candidates.find(c=>!c.flags.includes('TITLE_EXTRACTION_PENDING')&&!c.flags.includes('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE')&&c.facts.length>1)!;
 candidate.protectedReasons=['CHANGES_STATE'];scope.ledger=[];
 const body=fallbackEditorialPlan(scope);for(const s of body.stories)Object.assign(s,{decision:'DEFER',treatment:'OMIT'});
 const s=body.stories.find(s=>s.targetVersionId===candidate.targetVersionId)!;Object.assign(s,{decision:'SELECT',treatment:'BRIEF',newUnderstandingFactIds:[candidate.facts[0].id],mustIncludeFactIds:[candidate.facts[0].id]});
 expect(()=>validateEditorialPlan(wire.decodeKeyed(wire.encodeKeyed(body)),scope)).toThrow();
 s.mustIncludeFactIds=candidate.facts.map(f=>f.id);
 expect(validateEditorialPlan(wire.decodeKeyed(wire.encodeKeyed(body)),scope)).toEqual(body);
 candidate.communicationCost={inputUnits:DEFAULT_BRIEFING_BUDGET.maxInputTokens+1,evidenceCount:1,briefWords:40,standardWords:100,detailedWords:180};
 expect(planCapacityFailures(body,scope,DEFAULT_BRIEFING_BUDGET)).toEqual([{targetVersionId:candidate.targetVersionId,reason:'INPUT_CAPACITY'}]);
 candidate.flags.push('TITLE_EXTRACTION_PENDING');expect(()=>validateEditorialPlan(wire.decodeKeyed(wire.encodeKeyed(body)),scope)).toThrow();
});
