import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-expect-error Offline JavaScript utility.
import {evaluationInput,auditEvaluation} from '../../../benchmarks/editorial-distillation/evaluator.mjs';
const corpus=JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-distillation/corpus.json',import.meta.url),'utf8'));
it('blinds candidate identities while preserving full original sources and reader history',()=>{
 const c=corpus.cases[0],x=evaluationInput(corpus,c.id,{baseline:{items:[]},candidate:{items:[]}}),d=JSON.parse(x.user);
 expect(x.user).not.toContain('"baseline"');expect(d.prior).toEqual(c.prior);expect(d.originalSources.map((s:any)=>s.text)).toEqual(c.articleIds.map((id:string)=>corpus.sources.find((s:any)=>s.article.id===id).article.text));
 const reverse=evaluationInput(corpus,c.id,{baseline:{items:[]},candidate:{items:[]}},{reverse:true});expect(Object.values(reverse.mapping)).toEqual(Object.values(x.mapping).reverse());
});
it('requires source-specific exact evidence and preserves unresolved judgments without claiming truth',()=>{
 const c=corpus.cases[0],input=evaluationInput(corpus,c.id,{baseline:{items:[]}}),source=JSON.parse(input.user).originalSources.find((s:any)=>s.id===c.expected.important[0].sourceIds[0]);
 const finding={kind:'omission',status:'unresolved',item:null,developmentId:c.expected.important[0].id,evidence:[{sourceId:source.id,quote:source.text.slice(0,30)}],priorIds:[],explanation:'Importance is uncertain.'};
 const review={outputs:[{label:'output-1',findings:[finding],coverage:c.expected.important.map((d:any)=>({developmentId:d.id,status:'unresolved',explanation:'Requires semantic review.',evidence:[{sourceId:d.sourceIds[0],quote:JSON.parse(input.user).originalSources.find((s:any)=>s.id===d.sourceIds[0]).text.slice(0,30)}]}))}],preference:'unresolved'};
 expect(auditEvaluation(review,input).semanticTruthValidated).toBe(false);expect(auditEvaluation(review,input).unresolved).toBeGreaterThan(0);
 for(const evidence of [[],[{sourceId:'invented',quote:'text'}],[{sourceId:source.id,quote:'invented quotation'}]])expect(()=>auditEvaluation({...review,outputs:[{...review.outputs[0],findings:[{...finding,evidence}]}]},input)).toThrow();
 expect(()=>auditEvaluation({...review,outputs:[]},input)).toThrow('OUTPUT_COVERAGE');
});
it('rejects the retained coverage-only S13 omission without a supporting source quotation',()=>{
 const recorded=JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-distillation/v6-results-2026-11-03.json',import.meta.url),'utf8'));
 const r=recorded.reviews.find((r:any)=>r.caseId==='lebanon-roundup-ar');
 const outputs=Object.fromEntries(recorded.runs.filter((x:any)=>x.caseId===r.caseId).map((x:any)=>['v'+x.version,{status:x.result.status,items:x.result.items}]));
 const input=evaluationInput(corpus,r.caseId,outputs);
 expect(()=>auditEvaluation(r.review,input)).toThrow('COVERAGE_EVIDENCE_REQUIRED');
});
it('requires coverage evidence from that development, preserves ambiguity and rejects unsupported material findings',()=>{
 const c=corpus.cases[0],input=evaluationInput(corpus,c.id,{baseline:{items:[]}}),data=JSON.parse(input.user);
 const find=(id:string)=>data.originalSources.find((s:any)=>s.id===id);
 const coverage=c.expected.important.map((d:any)=>({developmentId:d.id,status:'unresolved',explanation:'Importance remains uncertain.',evidence:[{sourceId:d.sourceIds[0],quote:find(d.sourceIds[0]).text.slice(0,30)}]}));
 const review={outputs:[{label:'output-1',findings:[],coverage}],preference:'unresolved'};
 expect(auditEvaluation(review,input).unresolved).toBe(coverage.length);
 const unrelated=data.originalSources.find((s:any)=>!c.expected.important[0].sourceIds.includes(s.id));
 expect(()=>auditEvaluation({...review,outputs:[{...review.outputs[0],coverage:[{...coverage[0],evidence:[{sourceId:unrelated.id,quote:unrelated.text.slice(0,30)}]},...coverage.slice(1)]}]},input)).toThrow('COVERAGE_SOURCE_MISMATCH');
 for(const kind of ['factual','omission','merge','split','unsupported_synthesis','repetition','wasted_reading'])expect(()=>auditEvaluation({...review,outputs:[{...review.outputs[0],findings:[{kind,status:'problem',item:null,evidence:[],priorIds:[],explanation:'An unsupported finding.'}]}]},input)).toThrow('SOURCE_SPECIFIC_EVIDENCE_REQUIRED');
});

it('rejects an omission finding citing a real but unrelated article',()=>{
 const c=corpus.cases[0],input=evaluationInput(corpus,c.id,{baseline:{items:[]}}),data=JSON.parse(input.user),development=c.expected.important[0],other=data.originalSources.find((s:any)=>!development.sourceIds.includes(s.id));
 const review={outputs:[{label:'output-1',findings:[{kind:'omission',status:'problem',item:null,developmentId:development.id,evidence:[{sourceId:other.id,quote:other.text.slice(0,30)}],explanation:'Wrong source association.'}],coverage:c.expected.important.map((d:any)=>({developmentId:d.id,status:'included',explanation:'Listed.'}))}],preference:'unresolved'};
 expect(()=>auditEvaluation(review,input)).toThrow('FINDING_SOURCE_MISMATCH');
});
