import {expect,it} from 'vitest';
import {assessSelfContainment,leadingReference} from './self-contained';
import {fallbackEditorialPlan} from './editorial-plan';
const ev=(id:string,title:string,language='en')=>({id,title,language});
it('detects unresolved leading references without flagging named subjects',()=>{
 expect(leadingReference('The ads could have violated US law.')?.kind).toBe('ANAPHORIC_NOUN');
 expect(leadingReference('His success may show a regional shift.')?.kind).toBe('PRONOUN');
 expect(leadingReference('The incident was probably caused by a gas leak.')?.head).toBe('incident');
 expect(leadingReference('Police suspect a gas leak caused the explosion.')).toBeUndefined();
 expect(leadingReference('The president signed the bill.')).toBeUndefined();
});
it('resolves only from the supporting revision title and never invents an antecedent',()=>{
 const resolved=assessSelfContainment('The incident was probably caused by a gas leak.',[ev('r1','Explosion at Indonesian sneaker shop kills two: incident under investigation')]);
 expect(resolved).toEqual({status:'RESOLVED_BY_CONTEXT',context:{evidenceRevisionId:'r1',field:'title',text:'Explosion at Indonesian sneaker shop kills two: incident under investigation'}});
 expect(assessSelfContainment('The incident was probably caused by a gas leak.',[ev('r1','Local news roundup')]).status).toBe('UNRESOLVED');
 expect(assessSelfContainment('The ads could have violated law.',[ev('r1','')]).status).toBe('UNRESOLVED');
 expect(assessSelfContainment('His success may show a shift.',[ev('r2','Flávio Bolsonaro wins first round')]).status).toBe('RESOLVED_BY_CONTEXT');
});
it('does not claim to assess other languages',()=>{
 expect(assessSelfContainment('Il incidente è stato causato da una fuga di gas.',[ev('r1','Esplosione','it')]).status).toBe('UNASSESSED');
});
it('fallback plan defers a non-protected story whose only facts are unresolved and drops unresolved facts beside resolved ones',()=>{
 const base=(facts:any[])=>({candidates:[{targetType:'EVENT',targetVersionId:'v1',stableTargetId:'e1',eventVersionIds:['v1'],evidenceRevisionIds:['r1'],facts,stateSlotIds:[],effects:[],flags:[],protectedReasons:[],correctionObligationIds:[],priority:.6,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:facts.map(f=>({text:f.text,evidenceRevisionIds:f.evidenceRevisionIds})),treatment:'BRIEF'}}],ledger:[],obligations:[]}) as any;
 const bad={id:'f1',text:'The incident was blamed on a gas leak.',evidenceRevisionIds:['r1'],claimMentionIds:[],selfContained:'UNRESOLVED'},good={id:'f2',text:'Three people were hurt in the blast.',evidenceRevisionIds:['r1'],claimMentionIds:[],selfContained:'YES'};
 const only=fallbackEditorialPlan(base([bad])).stories[0];expect(only.decision).toBe('DEFER');expect(only.treatment).toBe('OMIT');expect(only.mustIncludeFactIds).toEqual([]);
 const mixed=fallbackEditorialPlan(base([bad,good])).stories[0];expect(mixed.decision).toBe('SELECT');expect(mixed.mustIncludeFactIds).toEqual(['f2']);
});
