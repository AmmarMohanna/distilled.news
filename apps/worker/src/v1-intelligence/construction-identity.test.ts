import {it,expect} from 'vitest';
import fixture from './fixtures/construction-identity-20261007.json';
import relationFixture from './fixtures/construction-relation-20261007.json';
import {scopedConstructionWireSchema,parseConstruction} from './semantic-construction';
import type {ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
const mentions=fixture.claimMentions.map(m=>({...m,sourceText:m.text,reportingRole:m.reportingRoleHint})) as unknown as ClaimMention[];
const input={candidates:fixture.events,storylineIds:fixture.storylines.map(s=>s.id)} as unknown as EventMatchInput;
it('the exact scheduled rejection used a revision as Event identity and claimed Storyline continuity without choosing an offered Storyline',()=>{
 expect(fixture.response.groups[0].eventId).toBe(fixture.source.id);
 expect(fixture.storylines.length).toBeGreaterThan(0);expect(fixture.response.groups[0].storylineId).toBeNull();expect(fixture.response.groups[0].structuralRelation).toBe('NEW_EVENT_EXISTING_STORYLINE');
 expect(()=>parseConstruction(fixture.response,mentions,input,{scorer:'GPT',policyVersion:'test'})).toThrow();
 const branches=(scopedConstructionWireSchema(mentions,input).properties.groups as any).items.anyOf;
 expect(branches.flatMap((b:any)=>b.properties.eventId.enum??[])).not.toContain(fixture.source.id);
 expect(branches.every((b:any)=>b.properties.claimMentionIds.items.enum.length===mentions.length)).toBe(true);
});
it('relation and identity combinations are scoped together',()=>{
 const offered={candidates:[{id:'event'}],storylineIds:['story']} as unknown as EventMatchInput;
 const schema=scopedConstructionWireSchema(mentions,offered),branches=(schema.properties.groups as any).items.anyOf;
 const continuing=branches.find((b:any)=>b.properties.structuralRelation.enum.includes('NEW_EVENT_EXISTING_STORYLINE')).properties;
 expect(continuing.eventId).toEqual({type:'null'});expect(continuing.storylineId).toEqual({type:'string',enum:['story']});
 const same=branches.find((b:any)=>b.properties.structuralRelation.enum.includes('SAME_EVENT')).properties;
 expect(same.eventId).toEqual({type:'string',enum:['event']});expect(same.storylineId.enum).toEqual([null,'story']);
 expect(schema.properties.confidence).toEqual({type:'number',minimum:0,maximum:1});
});
it('when no identities are offered, only new or deferred construction is legal',()=>{
 const branches=(scopedConstructionWireSchema(mentions,{candidates:[],storylineIds:[]}).properties.groups as any).items.anyOf;
 expect(branches).toHaveLength(1);expect(branches[0].properties.eventId).toEqual({type:'null'});expect(branches[0].properties.storylineId).toEqual({type:'null'});
 expect(branches[0].properties.structuralRelation.enum).toEqual(['NEW_STORYLINE','DEFER']);
});

it('the exact scheduled Muse relation cannot combine an Event with unbound Storyline continuity',()=>{
 const group=relationFixture.response.groups[0];
 expect(relationFixture.events.some(e=>e.id===group.eventId)).toBe(true);
 expect(group.structuralRelation).toBe('NEW_EVENT_EXISTING_STORYLINE');expect(group.storylineId).toBeNull();
 const branches=(scopedConstructionWireSchema(relationFixture.claimMentions,{candidates:relationFixture.events,storylineIds:relationFixture.storylines.map(s=>s.id)} as unknown as EventMatchInput).properties.groups as any).items.anyOf;
 const continuing=branches.find((b:any)=>b.properties.structuralRelation.enum.includes(group.structuralRelation)).properties;
 expect(continuing.eventId.type).toBe('null');expect(continuing.storylineId.enum).not.toContain(null);
 expect(relationFixture.response.confidence).toBe(0.39);
});
