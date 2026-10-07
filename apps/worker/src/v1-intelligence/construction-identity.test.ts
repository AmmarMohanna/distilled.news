import {it,expect} from 'vitest';
import fixture from './fixtures/construction-identity-20261007.json';
import {scopedConstructionWireSchema,parseConstruction} from './semantic-construction';
import type {ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
const mentions=fixture.claimMentions.map(m=>({...m,sourceText:m.text,reportingRole:m.reportingRoleHint})) as unknown as ClaimMention[];
const input={candidates:fixture.events,storylineIds:fixture.storylines.map(s=>s.id)} as unknown as EventMatchInput;
it('the exact scheduled rejection used a revision as Event identity and claimed Storyline continuity without choosing an offered Storyline',()=>{
 expect(fixture.response.groups[0].eventId).toBe(fixture.source.id);
 expect(fixture.storylines.length).toBeGreaterThan(0);expect(fixture.response.groups[0].storylineId).toBeNull();expect(fixture.response.groups[0].structuralRelation).toBe('NEW_EVENT_EXISTING_STORYLINE');
 expect(()=>parseConstruction(fixture.response,mentions,input,{scorer:'GPT',policyVersion:'test'})).toThrow();
 const group=(scopedConstructionWireSchema(mentions,input).properties.groups as any).items.properties as Record<string,any>;
 expect(group.eventId.enum).not.toContain(fixture.source.id);
 expect(group.storylineId.enum).toEqual([null,...fixture.storylines.map(s=>s.id)]);
 expect(group.claimMentionIds.items.enum).toEqual(mentions.map(m=>m.id));
});
it('offered Event and Storyline identities stay available without inventing model confidence',()=>{
 const offered={candidates:[{id:'event'}],storylineIds:['story']} as unknown as EventMatchInput;
 const group=(scopedConstructionWireSchema(mentions,offered).properties.groups as any).items.properties as Record<string,any>;
 expect(group.eventId.enum).toEqual([null,'event']);expect(group.storylineId.enum).toEqual([null,'story']);
 expect(group.structuralRelation.enum).toContain('NEW_EVENT_EXISTING_STORYLINE');
 const schema=scopedConstructionWireSchema(mentions,offered);
 expect(schema.properties.confidence).toEqual({type:'number',minimum:0,maximum:1});
});

it('when no semantic identities are offered, only new or deferred construction is legal',()=>{
 const group=(scopedConstructionWireSchema(mentions,{candidates:[],storylineIds:[]}).properties.groups as any).items.properties;
 expect(group.eventId.enum).toEqual([null]);expect(group.storylineId.enum).toEqual([null]);expect(group.structuralRelation.enum).toEqual(['NEW_STORYLINE','DEFER']);
});
