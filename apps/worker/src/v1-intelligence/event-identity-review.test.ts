import {it,expect} from 'vitest';
import {identityReviewRequest,applyIdentityReview} from './event-identity-review';
const construction:any={groups:[{claimMentionIds:['mention'],structuralRelation:'SAME_EVENT',eventId:'replit',storylineId:null,epistemicEffects:['ADDS_DETAIL'],entities:[],slots:[]}],backgroundMentionIds:[],provenance:{scorer:'GPT',policyVersion:'test'}};
const input:any={revision:{id:'fund',title:'Anthropic fund',body:'Anthropic commits shares to a benefit fund.'},candidates:[{id:'replit',version:{id:'v1',state:'Replit changes its default coding model.'},evidenceRevisionIds:['replit-source']}],storylineIds:[]};
const mentions:any=[{id:'mention',sourceText:input.revision.body}];
it('reviews exact group evidence against full candidate evidence without offering the first match as an answer',()=>{
 const r=identityReviewRequest(construction,mentions,input,[{revision:{id:'replit-source',body:'Replit changes its default coding model.'}}] as any);
 expect(r.state.groups.group_1.claims[0].text).toContain('benefit fund');
 expect(r.state.events[0].evidence[0].body).toContain('default coding model');
 expect(JSON.stringify(r.state.groups)).not.toContain('SAME_EVENT');
});
it('replaces a false same-topic merge only with an explicit independent distinct-occurrence verdict',()=>{
 const result=applyIdentityReview(construction,{groups:{group_1:{structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],reason:'Fund creation is distinct from coding-model selection.',sourceWitness:null,targetWitness:null}}},input,'review-op');
 expect(result.groups[0].eventId).toBeNull();expect(result.groups[0].structuralRelation).toBe('NEW_STORYLINE');expect(result.groups[0].claimMentionIds).toEqual(['mention']);expect(construction.groups[0].eventId).toBe('replit');
});
it.each(['missing','foreign','uncertain'])('does not commit an unconfirmed relationship: %s',mode=>{
 const verdict:any={groups:{group_1:{structuralRelation:mode==='uncertain'?'DEFER':'SAME_EVENT',eventId:mode==='foreign'?'laplace':mode==='uncertain'?null:'replit',storylineId:null,epistemicEffects:[],reason:'Review',sourceWitness:null,targetWitness:null}}};if(mode==='missing')delete verdict.groups.group_1;
 if(mode==='uncertain')expect(applyIdentityReview(construction,verdict,input,'op').groups[0].structuralRelation).toBe('DEFER');else expect(()=>applyIdentityReview(construction,verdict,input,'op')).toThrow();
});

it('requires source-owned identity witnesses for a confirmed same-occurrence decision',()=>{
 const raw:any={groups:{group_1:{structuralRelation:'SAME_EVENT',eventId:'replit',storylineId:null,epistemicEffects:['CORROBORATES'],reason:'Similar AI story'}}};
 expect(()=>applyIdentityReview(construction,raw,input,'op')).toThrow();
});

it('accepts a source-owned reviewed identity and rejects witnesses borrowed from another group',()=>{
 const sameInput:any={...input,revision:{...input.revision,body:'Replit changes its default coding model.'}};
 const sameMentions=[{id:'mention',sourceText:sameInput.revision.body}];
 const raw:any={groups:{group_1:{structuralRelation:'SAME_EVENT',eventId:'replit',storylineId:null,epistemicEffects:['CORROBORATES'],reason:'Same actor action and object.',sourceWitness:'Replit changes its default coding model.',targetWitness:'Replit changes its default coding model.'}}};
 expect(applyIdentityReview(construction,raw,sameInput,'review',[],sameMentions).groups[0].eventId).toBe('replit');
 expect(()=>applyIdentityReview(construction,raw,sameInput,'review',[],[{id:'other',sourceText:sameInput.revision.body}])).toThrow('IDENTITY_REVIEW_WITNESS_OWNERSHIP');
 raw.groups.group_1.targetWitness='A fund was created.';
 expect(()=>applyIdentityReview(construction,raw,sameInput,'review',[],sameMentions)).toThrow('IDENTITY_REVIEW_WITNESS_OWNERSHIP');
});
