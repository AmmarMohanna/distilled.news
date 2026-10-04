import {expect,it} from 'vitest';
import {escalationReasons} from './semantic-routing';
it('escalates uncertainty, asymmetric entailment, protected epistemic effects and construction',()=>{
 const base={structuralRelation:'SAME_EVENT' as const,eventId:'event',confidence:.9,epistemicEffects:['CORROBORATES' as const],provenance:{scorer:'JEV',policyVersion:'test'}};
 expect(escalationReasons(base,{forwardEntailment:.9,reverseEntailment:.9})).toEqual([]);
 expect(escalationReasons({...base,confidence:.4},{forwardEntailment:.9,reverseEntailment:.1})).toEqual(['UNCERTAIN','ASYMMETRIC_ENTAILMENT']);
 for(const effect of ['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'] as const)expect(escalationReasons({...base,epistemicEffects:[effect]},{})).toContain('HIGH_CONSEQUENCE');
 expect(escalationReasons({...base,structuralRelation:'NEW_STORYLINE',eventId:undefined},{})).toContain('CONSTRUCTION');
});
