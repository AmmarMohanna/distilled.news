import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-repair-context/summary.json';
import {editorUser,verifyUser} from '../src/prompts';
import {prepareArticles} from '../src/prepare';
import type {BriefingInput} from '../src/types';
const run=(name:string)=>evidence.results.find(r=>r.name===name)!;

it('retains all eight exact requests with settled charges below the approved ceiling',()=>{
 expect(evidence.totals).toMatchObject({calls:8,allSettled:true,outstanding:0});
 expect(evidence.totals.costUsd).toBeCloseTo(.0195164,9);
 expect(evidence.totals.reservedUsd).toBeLessThanOrEqual(.12);
 for(const r of evidence.results)expect(createHash('sha256').update(JSON.stringify(r.request)).digest('hex')).toBe(r.requestSha256);
 expect(evidence.ledger.every(r=>r.reported===1)).toBe(true);
});

it('uses exactly the paid baseline and candidate verifier layouts, including fallible earlier advice',()=>{
 for(const c of evidence.cases){
  expect(verifyUser(c)).toBe(run(`verify-${c.name}-baseline`).request.messages[1].content);
  expect(verifyUser({...c,previousReviews:c.contexts})).toBe(run(`verify-${c.name}-context`).request.messages[1].content);
 }
});

it('records the resolved real false rejection without hiding the limited size or synthetic nature of controls',()=>{
 expect(run('verify-real-correct-repair-baseline').output.results?.map(r=>r.verdict)).toEqual(['fix']);
 expect(run('verify-real-correct-repair-context').output.results?.map(r=>r.verdict)).toEqual(['ok']);
 for(const variant of ['baseline','context']){
  expect(run(`verify-heldout-invalid-repairs-${variant}`).output.results?.map(r=>r.verdict)).toEqual(['fix','fix']);
  expect(run(`verify-heldout-valid-repairs-${variant}`).output.results?.map(r=>r.verdict)).toEqual(['ok','ok']);
 }
});

it('matches paid history formatting and preserves identical parsed output with measured token reduction',()=>{
 const input=evidence.historyInput as BriefingInput;
 const articles=prepareArticles(input.articles,{minChars:1,maxArticleChars:Number.MAX_SAFE_INTEGER,nearDuplicate:1.01}).prepared;
 expect(editorUser({...input,prior:input.prior!,articles,promptVersion:1})).toBe(run('editor-history-baseline').request.messages[1].content);
 expect(editorUser({...input,prior:input.prior!,articles,promptVersion:2})).toBe(run('editor-history-deduplicated').request.messages[1].content);
 expect(run('editor-history-baseline').output).toEqual(run('editor-history-deduplicated').output);
 expect(evidence.history.savedTokens).toBe(749);
});
