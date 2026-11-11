import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {EDITOR_SYSTEM_V4,VERIFY_SYSTEM,CONSOLIDATE_SYSTEM,REPAIR_SYSTEM} from '../src/prompts';
import {prepareArticles} from '../src/prepare';
// @ts-expect-error Plain-JS offline-only evaluation utility.
import {auditPair,pairedRequest,describeDraft} from '../../../benchmarks/editorial-distillation/comparison.mjs';
const load=(p:string)=>JSON.parse(readFileSync(new URL('../../../'+p,import.meta.url),'utf8'));
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const corpus=load('benchmarks/editorial-distillation/corpus.json');
const baseline=load('benchmarks/editorial-distillation/baseline-v4.json');
it('freezes the complete retained sources without rewriting evidence or reader memory',()=>{
 expect(hash(corpus)).toBe('e12c91d69c7bc9696379c7c5580107e35a3bf349c4347e9219cbbb3baf681e63');
 for(const f of corpus.sourceFiles)expect(hash(load(f.path))).toBe(f.sha256);
 for(const s of corpus.sources){expect(hash(s.article)).toBe(s.sha256);const original=load(s.origin.file);const list=Array.isArray(original)?original:original.inputs?.en?.articles??original.sources;const found=list.find((a:any)=>a.id===s.article.id);for(const key of Object.keys(s.article))expect(s.article[key]).toEqual(found[key]);}
 const history=load('benchmarks/results/v3-reader-notification/summary.json').inputs.en.prior;
 expect(corpus.cases.find((c:any)=>c.id==='lebanon-roundup-en').prior).toEqual(history);
});
it('keeps the deployed V4 editor, verifier, consolidation and repair snapshots unchanged',()=>{
 expect(baseline.promptVersion).toBe(4);expect(baseline.systems).toEqual({editor:EDITOR_SYSTEM_V4,verify:VERIFY_SYSTEM,consolidate:CONSOLIDATE_SYSTEM,repair:REPAIR_SYSTEM});
});
it('pairs English and Arabic cases and keeps provisional labels outside the model input',()=>{
 expect(corpus.cases).toHaveLength(12);const ids=new Set(corpus.sources.map((s:any)=>s.article.id));
 for(const c of corpus.cases){expect(corpus.cases.filter((x:any)=>x.family===c.family).map((x:any)=>x.feed.language).sort()).toEqual(['ar','en']);expect(c.feed.language).toBe(c.id.endsWith('-ar')?'ar':'en');for(const id of c.articleIds)expect(ids.has(id)).toBe(true);for(const e of c.expected.important)for(const id of e.sourceIds)expect(c.articleIds).toContain(id);}
 expect(corpus.limitations.join(' ')).toContain('not a genuinely unseen-source holdout');
});
it('rejects changes to input, model, output budget, temperature or other instructions',()=>{
 const request={system:baseline.systems.editor,user:'Identical evidence',model:'openai/gpt-4.1',temperature:0.1,maxTokens:4000,jsonMode:true,retries:0};
 const candidate=pairedRequest(request,'main-change');expect(auditPair(request,candidate,'main-change').onlyOneEditorialInstructionChanged).toBe(true);
 for(const edit of [{user:'changed'},{model:'other'},{maxTokens:4001},{temperature:0.2},{system:candidate.system+' extra'}])expect(()=>auditPair(request,{...candidate,...edit},'main-change')).toThrow('UNCONTROLLED_COMPARISON');
});
it('separates reference integrity and descriptive length from semantic quality',()=>{
 const {prepared}=prepareArticles([corpus.sources[0].article]);const d=describeDraft({items:[{headline:'A claim',body:'A claim',sources:['unknown']}]},prepared);
 expect(d.unknownReferences).toEqual([{index:0,ref:'unknown'}]);expect(d.repeatedHeadlineBodies).toEqual([0]);expect(d.factualSupport).toBeNull();expect(d.importantDevelopmentCoverage).toBeNull();expect(d.synthesisValue).toBeNull();
});
it('includes same-occurrence, separate-event, meaningful-update and valid-empty controls',()=>{
 expect(corpus.cases.find((c:any)=>c.id==='ai-multisource-en').expected.sameOccurrence[0]).toHaveLength(2);
 expect(corpus.cases.find((c:any)=>c.id==='lebanon-roundup-ar').expected.separateOccurrences).toHaveLength(1);
 expect(corpus.cases.find((c:any)=>c.id==='casualty-update-en').expected.important[0].necessary[0]).toContain('six killed');
 expect(corpus.cases.find((c:any)=>c.id==='quiet-repeat-ar').expected.validEmpty).toBe(true);
});
