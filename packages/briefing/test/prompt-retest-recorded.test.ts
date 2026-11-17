import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const load=(file:string)=>JSON.parse(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
const inputs=load('benchmarks/results/v3-prompt-retest/inputs.json');
const evidence=load('benchmarks/results/v3-prompt-retest/results.json');
const result=(name:string)=>evidence.results.find((r:{name:string})=>r.name===name);
it('holds source/history bytes constant in baseline versus shorter-editor comparisons',()=>{
 for(const language of ['en','ar']){
  const job=(name:string)=>inputs.jobs.find((j:{name:string})=>j.name===name);
  expect(job('fresh-window-baseline-'+language).userSha256).toBe(job('fresh-window-compact-'+language).userSha256);
 }
 const hash=createHash('sha256').update(JSON.stringify(inputs.finalUnusedWindow.input)).digest('hex');
 expect(hash).toBe(inputs.finalUnusedWindow.sha256);
});
it('records within-article recall independently of a supported selected-item verification',()=>{
 expect(inputs.finalUnusedWindow.input.articles[0].text).toContain('كفرتبنيت');
 expect(result('final-unseen-en').output.items).toHaveLength(1);
 expect(result('multi-development-targeted').output.items).toHaveLength(2);
 expect(result('multi-development-targeted').output.items[1].headline).toContain('Kfar Tibnit');
 expect(result('final-unseen-normal-verifier').output.results).toEqual([{i:0,verdict:'ok',issues:[]}]);
 expect(inputs.multiDevelopmentCandidate.status).toContain('not held out');
});
it('distinguishes a retained preprocessing skip from a model-visible omission',()=>{
 const preparation=inputs.finalUnusedWindow.preparation;
 expect(preparation.skipped).toHaveLength(1);
 const source=inputs.finalUnusedWindow.input.articles.find((a:{id:string})=>a.id===preparation.skipped[0].id);
 expect(source.text.length).toBeLessThan(40);
 expect(preparation.prepared.some((a:{id:string})=>a.id===source.id)).toBe(false);
});
it('preserves negative results and settled accounting without promoting an unqualified prompt',()=>{
 const ledger=load('benchmarks/results/v3-prompt-retest/ledger-summary.json');
 const candidate=load('benchmarks/prompts/v3-v2-candidate.json');
 expect(ledger.settledCalls).toBe(evidence.cumulativeCalls);
 expect(ledger.actualUsd).toBeCloseTo(evidence.cumulativeActualUsd,10);
 expect(ledger.outstandingReservedUsd).toBe(0);
 expect(evidence.retainedRuntimeChanges).toEqual([]);
 expect(candidate.status).toBe('EXPERIMENTAL_NOT_ACTIVE');
 expect(candidate.editorChars).toBeLessThan(candidate.baselineEditorChars/2);
 expect(result('compact-consolidation').output.items).toHaveLength(4);
 expect(result('short-main-idea-ar').output.items[1].body).toContain('دون تفاصيل');
});
