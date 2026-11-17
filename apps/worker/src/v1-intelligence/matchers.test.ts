import {expect,it} from 'vitest';
import {validateEventMatch,validateStorylineMatch,LexicalEventMatcher,type EventMatchInput} from './matchers';
const input:EventMatchInput={revision:{id:'revision',feedId:'feed',title:'Parliament approved a law.',body:'Parliament approved a law.',publishedAt:'2026-10-04T00:00:00Z',acceptedAt:'2026-10-04T00:00:00Z'} as any,role:'REPORTED_DEVELOPMENT',candidates:[]};
const provenance={scorer:'PREPARED',policyVersion:'fixture'};
it('keeps structural relation separate from multiple epistemic effects',()=>{
 const decision=validateEventMatch({structuralRelation:'NEW_STORYLINE',epistemicEffects:['CORROBORATES','ADDS_DETAIL'],confidence:.9,provenance},input);
 expect(decision.epistemicEffects).toEqual(['CORROBORATES','ADDS_DETAIL']);expect(new LexicalEventMatcher().match(input).structuralRelation).toBe('NEW_STORYLINE');
});
it('rejects foreign Event and Storyline identities rather than trusting prepared outputs',()=>{
 expect(()=>validateEventMatch({structuralRelation:'SAME_EVENT',eventId:'foreign',epistemicEffects:[],confidence:.9,provenance},input)).toThrow('SCOPE_DENIED');
 expect(()=>validateEventMatch({structuralRelation:'NEW_EVENT_EXISTING_STORYLINE',storylineId:'foreign',epistemicEffects:[],confidence:.9,provenance},input)).toThrow('SCOPE_DENIED');
 expect(()=>validateStorylineMatch({relation:'CONTINUES',storylineId:'foreign',confidence:.9,provenance},{event:{} as any,candidates:[]})).toThrow('SCOPE_DENIED');
});
