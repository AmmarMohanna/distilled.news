import {expect,it} from 'vitest';
import {assessWriterDraft,compareDirectQuotations} from './publication-prechecks';
const fact={id:'f',text:'The service gained about a thousand users over the course of two days.',evidenceRevisionIds:['r']};
const input:any={feed:{outputLanguage:'en'},stories:[{candidate:{id:'c'},plan:{facts:[fact],mustIncludeFactIds:['f'],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',body:fact.text,language:'en'}]}]};
const draft=(text:string):any=>({language:'en',stories:[{candidateId:'c',claims:[{text,support:[{evidenceRevisionId:'r',quote:fact.text}]}]}]});
const spans=()=>[{evidenceRevisionId:'r',quote:fact.text}];
it('v2 runs no legacy factual wording scan; semantic judgments must decide numbers and coverage',()=>{const r=assessWriterDraft(input,draft('The service gained 40 users.'),spans,'EVIDENCE_GROUNDED_V2',true);expect(r.factualWarnings).toEqual([]);expect(r.decision).toBe('NEEDS_SEMANTIC');expect(r.blockingIssues).toEqual([]);});
it('routes an ambiguous valid duration to semantic verification without declaring approval',()=>{
 const r=assessWriterDraft(input,draft('The service gained about a thousand users over two days.'),spans,'EVIDENCE_GROUNDED_V2',true);
 expect(r.blockingIssues).toEqual([]);expect(r.requiresSemantic).toBe(true);expect(r.decision).toBe('NEEDS_SEMANTIC');
});
it('missing semantic capacity stays unresolved even for lexically clean writing',()=>{expect(assessWriterDraft(input,draft(fact.text),spans,'EVIDENCE_GROUNDED_V2',false).decision).toBe('UNRESOLVED');});
it('does not soften foreign support, unknown story or unapproved URL gates',()=>{
 const d=draft(fact.text);d.stories[0].claims[0].support[0].evidenceRevisionId='foreign';expect(assessWriterDraft(input,d,spans,'EVIDENCE_GROUNDED_V2',true).blockingIssues.some(i=>i.code==='INVALID_SUPPORT_QUOTE')).toBe(true);
 expect(assessWriterDraft(input,draft('See https://foreign.example.'),spans,'EVIDENCE_GROUNDED_V2',true).blockingIssues.some(i=>i.code==='UNAPPROVED_URL')).toBe(true);
});
it('permits only quote typography and terminal presentation punctuation',()=>{
 expect(compareDirectQuotations('She said “sexual violence.”',['She said "sexual violence".']).status).toBe('MATCH');
 expect(compareDirectQuotations('She said "we have approval".',['She said “we expect approval”.']).status).toBe('MISMATCH');
 expect(compareDirectQuotations('She said "yes.',['She said "yes".']).status).toBe('UNRESOLVED');
 expect(compareDirectQuotations('She said “he said \'yes\'”.',['She said “he said \'yes\'”.']).status).toBe('UNRESOLVED');
});
it('a complete same-story quotation is not invalidated by a different truncated source quotation',()=>{
 expect(compareDirectQuotations('She said "yes".',['She said “yes”. Later “unfinished']).status).toBe('MATCH');
});
it('does not interpret possessive apostrophes as quotation delimiters',()=>{
 expect(compareDirectQuotations("Users' devices receive alerts when retailers' prices drop.",["Devices belonging to users receive alerts when retailer prices drop."]).status).toBe('MATCH');
});
