import {expect,it} from 'vitest';
import {escalationReasons,preparedMatchers} from './semantic-routing';
import type {EventMatchInput} from './matchers';
it('fences a prepared new storyline against changed Feed configuration and new roots',()=>{
 const prepared={feedRevision:1,knownEventIds:[],knownEventVersions:{},revisionId:'r',candidateVersions:{},storylineVersions:{},decision:{structuralRelation:'NEW_STORYLINE' as const,epistemicEffects:[],confidence:.9,provenance:{scorer:'GPT',policyVersion:'test'}}};
 const matcher=preparedMatchers(prepared),input={feedRevision:1,revision:{id:'r'},role:'NEWS',candidates:[],storylineIds:[],storylineVersions:{}} as unknown as EventMatchInput;
 expect(matcher.event.match(input).structuralRelation).toBe('NEW_STORYLINE');
 expect(matcher.event.match({...input,feedRevision:2}).provenance.fallbackReason).toBe('STALE_PREPARED_MEMORY');
 expect(matcher.event.match({...input,storylineVersions:{new:'v1'}}).provenance.fallbackReason).toBe('STALE_PREPARED_MEMORY');
});
it('escalates uncertainty, asymmetric entailment, protected epistemic effects and construction',()=>{
 const base={structuralRelation:'SAME_EVENT' as const,eventId:'event',confidence:.9,epistemicEffects:['CORROBORATES' as const],provenance:{scorer:'JEV',policyVersion:'test'}};
 expect(escalationReasons(base,{forwardEntailment:.9,reverseEntailment:.9})).toEqual([]);
 expect(escalationReasons({...base,confidence:.4},{forwardEntailment:.9,reverseEntailment:.1})).toEqual(['UNCERTAIN','ASYMMETRIC_ENTAILMENT']);
 for(const effect of ['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'] as const)expect(escalationReasons({...base,epistemicEffects:[effect]},{})).toContain('HIGH_CONSEQUENCE');
 expect(escalationReasons({...base,structuralRelation:'NEW_STORYLINE',eventId:undefined},{})).toContain('CONSTRUCTION');
});
