import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const load=(file:string)=>JSON.parse(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
const frozen=load('benchmarks/prompts/v3-v1.json');
const evidence=load('benchmarks/results/v3-prompt-tuning/results.json');
const inputs=load('benchmarks/results/v3-prompt-tuning/inputs.json');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
it('preserves an immutable named prompt baseline independently of product promptVersion',()=>{
 expect(hash(frozen.sourceModule)).toBe(frozen.sourceSha256);
 expect(frozen.sourceSha256).toBe('2c11ea4c9c73edc6fc941fbf5c6e4ad0ab84d42f0e745ca8a160276871e82f81');
 expect(frozen.note).toContain('not a rollback');
});
it('ties the unchanged real corpora to the recorded request and source identities',()=>{
 const corpus=load('packages/briefing/eval/corpus/anthropic-news.json');
 expect(hash(JSON.stringify(corpus))).toBe(inputs.sources[1].sha256);
 expect(hash(JSON.stringify(inputs.sources[0].inputs))).toBe(inputs.sources[0].sha256);
 expect(new Set(inputs.jobs.map((j:{requestSha256:string})=>j.requestSha256)).size).toBe(evidence.paidCalls);
 for(const result of evidence.results)expect(inputs.jobs.some((j:{requestSha256:string})=>j.requestSha256===result.requestSha256)).toBe(true);
});
it('accounts for settled calls without implying verifier qualification or publication',()=>{
 const ledger=load('benchmarks/results/v3-prompt-tuning/ledger-summary.json');
 expect(evidence.results.reduce((sum:number,r:{usage:{cost:number}})=>sum+r.usage.cost,0)).toBeCloseTo(ledger.actualUsd,10);
 expect(ledger.settledCalls).toBe(11);
 expect(ledger.outstandingReservedUsd).toBe(0);
 expect(evidence.actualUsd).toBeLessThan(evidence.authorizedMaximumUsd);
 expect(evidence.retainedPromptChanges).toEqual([]);
 expect(evidence.publication).toBe(false);
});
it('retains counterexamples rather than treating fewer items or words as automatic improvement',()=>{
 const result=(name:string)=>evidence.results.find((r:{name:string})=>r.name===name);
 expect(result('reading-main-idea-en').wordCount).toBeGreaterThan(result('reading-baseline-en').wordCount);
 expect(result('consolidation-global-ranking').output.items.some((i:{from:number[]})=>i.from.includes(0)&&i.from.includes(3))).toBe(true);
 expect(result('heldout-compression').output.items.some((i:{from:number[]})=>i.from.some(n=>n>=inputs.sources[2].drafts.length))).toBe(true);
 expect(evidence.limitations.join(' ')).toContain('NOT genuinely unseen-source');
});
