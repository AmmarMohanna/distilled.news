import {it,expect} from 'vitest';
import {developmentReconciliationSchema,reconstructDevelopments,developmentCandidates} from './development-reconciliation';
const mentions:any=[{id:'m1',sourceText:'The council approved the plan.',reportingRole:'REPORTED_DEVELOPMENT',quantities:[],certainty:{hedges:[]},qualifiers:[]},{id:'m2',sourceText:'Officials corrected the date.',reportingRole:'REPORTED_DEVELOPMENT',quantities:[],certainty:{hedges:[]},qualifiers:[]}];
const g=(ids:string[],effects:string[]=[])=>({claimMentionIds:ids,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:effects,entities:[],slots:[]});
const packets:any=[{groups:[g(['m1'])],backgroundMentionIds:[],provenance:{}},{groups:[g(['m2'],['CORRECTS'])],backgroundMentionIds:[],provenance:{}}];
const input:any={candidates:[],storylineIds:[]};
const output=(ids=['p0d0','p1d0'])=>({confidence:.9,groups:[{developmentIds:ids,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:['CORRECTS'],relationship:'SAME_OCCURRENCE',relatedDevelopmentIds:[]}]});
it('mechanically preserves exact memberships and correction evidence without regenerated claims',()=>{
 const result=reconstructDevelopments(output(),packets,mentions,input,{scorer:'GPT',policyVersion:'test'});
 expect(result.groups[0].claimMentionIds).toEqual(['m1','m2']);expect(result.groups[0].epistemicEffects).toContain('CORRECTS');
 expect(JSON.stringify(developmentReconciliationSchema)).not.toContain('claimMentionIds');
 expect(developmentCandidates(packets,mentions)[1].evidence[0].sourceText).toBe(mentions[1].sourceText);
});
it('rejects missing, duplicate and invented development references',()=>{
 for(const ids of [['p0d0'],['p0d0','p0d0','p1d0'],['p0d0','invented']])expect(()=>reconstructDevelopments(output(ids),packets,mentions,input,{scorer:'GPT',policyVersion:'test'})).toThrow();
});
it('preserves legitimate shared ClaimMentions across independent developments',()=>{
 const shared:any=[{...packets[0],groups:[g(['m1']),g(['m1','m2'])]}];
 const raw:any={confidence:.9,groups:['p0d0','p0d1'].map(id=>({...output().groups[0],developmentIds:[id],relationship:'INDEPENDENT',epistemicEffects:[]}))};
 expect(reconstructDevelopments(raw,shared,mentions,input,{scorer:'GPT',policyVersion:'test'}).groups.map(g=>g.claimMentionIds)).toEqual([['m1'],['m1','m2']]);
});
it('rejects incompatible canonical ownership and missing relationship witnesses',()=>{
 const conflicting:any=[{...packets[0],groups:[{...g(['m1']),structuralRelation:'SAME_EVENT',eventId:'e1'}]},{...packets[1],groups:[{...g(['m2']),structuralRelation:'SAME_EVENT',eventId:'e2'}]}];
 expect(()=>reconstructDevelopments(output(),conflicting,mentions,input,{scorer:'GPT',policyVersion:'test'})).toThrow();
 const raw=output();raw.groups[0].relationship='CORRECTION';expect(()=>reconstructDevelopments(raw,packets,mentions,input,{scorer:'GPT',policyVersion:'test'})).toThrow();
});

it('retains correction links and corresponding canonical effects',()=>{
 const raw:any={confidence:.9,groups:[{...output().groups[0],developmentIds:['p0d0'],epistemicEffects:[],relationship:'INDEPENDENT'},{...output().groups[0],developmentIds:['p1d0'],epistemicEffects:[],relationship:'CORRECTION',relatedDevelopmentIds:['p0d0']}]};
 const result=reconstructDevelopments(raw,packets,mentions,input,{scorer:'GPT',policyVersion:'test'});
 expect(result.developmentRelations).toEqual([{fromGroup:1,toGroup:0,relationship:'CORRECTION'}]);expect(result.groups[1].epistemicEffects).toContain('CORRECTS');
});
