import {expect,it} from 'vitest';
import {constructionFailureClass} from './semantic-construction-repair';
import {extractClaimMentions} from './claims';
it('distinguishes schema, identity and coverage failures without inventing semantic judgments',async()=>{
 const revision={id:'r',feedId:'f',body:'Officials may approve 40 measures. Parliament rejected the proposal.',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z'} as any;
 const {mentions}=await extractClaimMentions(revision),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[],storylineIds:[]};
 const group={claimMentionIds:mentions.map(m=>m.id),eventId:null,storylineId:null};
 const failure=(groups:any[],stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='CONSTRUCTION_BINDING')=>({validationDiagnostic:{stage,response:{groups,backgroundMentionIds:[]},rejection:{name:'scope'} }} as any);
 expect(constructionFailureClass(failure([group],'OUTPUT_SCHEMA'),mentions,input)).toBe('INVALID_STRUCTURED_OUTPUT');
 expect(constructionFailureClass(failure([{...group,eventId:'invented'}]),mentions,input)).toBe('INVALID_EVENT_OR_STORYLINE_REFERENCE');
 expect(constructionFailureClass(failure([{...group,storylineId:'invented'}]),mentions,input)).toBe('INVALID_EVENT_OR_STORYLINE_REFERENCE');
 expect(constructionFailureClass(failure([{...group,claimMentionIds:[mentions[0].id]}]),mentions,input)).toBe('INCOMPLETE_MENTION_COVERAGE');
 expect(constructionFailureClass(failure([{...group,claimMentionIds:['invented']}]),mentions,input)).toBe('INVALID_MENTION_REFERENCE');
 // Complete IDs alone do not prove source grounding or semantic correctness.
 expect(constructionFailureClass(failure([group]),mentions,input)).toBe('INVALID_SOURCE_OR_IDENTITY_BINDING');
});
