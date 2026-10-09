import {expect,it} from 'vitest';
import fixture from './fixtures/staging-editorial-invalid-treatment.json';
import {editorialPlanWireSchema,planBodySchema,validateEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import type {ShortlistRecord} from './shortlist';
it('reproduces the real planner DEFER+BRIEF scope failure and constrains that response at the provider boundary',()=>{
 const shortlist=fixture.shortlist as unknown as ShortlistRecord,wire=compactEditorialInput(shortlist),invalid=planBodySchema.parse(fixture.value);
 expect(invalid.stories.find(s=>s.decision==='DEFER')?.treatment).toBe('BRIEF');
 expect(()=>validateEditorialPlan(wire.decode(invalid),shortlist)).toThrow();
 const branches=(editorialPlanWireSchema.properties.stories.items as unknown as {anyOf:{properties:{decision:{enum:string[]};treatment:{enum:string[]}}}[]}).anyOf;
 expect(branches.find(s=>s.properties.decision.enum.includes('DEFER'))?.properties.treatment.enum).toEqual(['OMIT']);
 expect(branches.find(s=>s.properties.decision.enum.includes('SELECT'))?.properties.treatment.enum).toEqual(['BRIEF','STANDARD','DETAILED']);
 const corrected=structuredClone(invalid);for(const s of corrected.stories)if(s.decision!=='SELECT')s.treatment='OMIT';expect(validateEditorialPlan(wire.decode(corrected),shortlist)).toEqual(wire.decode(corrected));
});
