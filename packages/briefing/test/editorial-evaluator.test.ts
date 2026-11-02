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
 const c=corpus.cases[0],input=evaluationInput(corpus,c.id,{baseline:{items:[]}}),source=JSON.parse(input.user).originalSources[0];
 const finding={kind:'omission',status:'unresolved',item:null,evidence:[{sourceId:source.id,quote:source.text.slice(0,30)}],priorIds:[],explanation:'Importance is uncertain.'};
 const review={outputs:[{label:'output-1',findings:[finding],coverage:c.expected.important.map((d:any)=>({developmentId:d.id,status:'unresolved',explanation:'Requires semantic review.'}))}],preference:'unresolved'};
 expect(auditEvaluation(review,input).semanticTruthValidated).toBe(false);expect(auditEvaluation(review,input).unresolved).toBeGreaterThan(0);
 for(const evidence of [[],[{sourceId:'invented',quote:'text'}],[{sourceId:source.id,quote:'invented quotation'}]])expect(()=>auditEvaluation({...review,outputs:[{...review.outputs[0],findings:[{...finding,evidence}]}]},input)).toThrow();
 expect(()=>auditEvaluation({...review,outputs:[]},input)).toThrow('OUTPUT_COVERAGE');
});
