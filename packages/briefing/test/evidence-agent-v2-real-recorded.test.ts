import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runComparisonCase } from '../../../benchmarks/evidence-agent/comparison';
import { freezeCase, hash } from '../../../benchmarks/editorial-distillation/v7-comparison';
const read = (p: string) => JSON.parse(readFileSync(new URL('../../../' + p, import.meta.url), 'utf8'));
const result = read('benchmarks/evidence-agent/v2-real-results-2026-11-04.json'), review = read('benchmarks/evidence-agent/v2-real-review-2026-11-04.json'), corpus = read('benchmarks/editorial-distillation/corpus.json');
it('replays every real paired request and result without network access or new inference', async () => { for (const run of result.pipelines) {
    const records = result.records.filter((r: any) => r.caseId === run.caseId && r.variant === run.variant);
    let index = 0;
    const replay = await runComparisonCase(freezeCase(corpus, run.caseId), run.variant, { async complete(request) { expect(hash(request)).toBe(records[index].requestHash); return records[index++].response; } }, async () => { });
    expect(index).toBe(records.length);
    expect(replay.result.items).toEqual(run.result.items);
    expect(replay.result.usage).toEqual(run.result.usage);
} });
it('reconciles exactly four distinct settled generations and marks the remaining campaign unobserved', () => { expect(result.calls).toBe(4); expect(new Set(result.records.map((r: any) => r.generationId)).size).toBe(4); expect(result.ledgerRows.every((r: any) => r.reported === 1)).toBe(true); expect(result.records.reduce((n: number, r: any) => n + r.costUsd, 0)).toBeCloseTo(.0430896, 9); expect(result.actualUsd).toBeCloseTo(.0430896, 9); expect(result.heldUsd).toBe(0); expect(result.uncertainOperations).toBe(0); expect(result.completedPipelines).toBe(2); expect(result.unobservedPipelines).toBe(10); expect(result.unobservedCases).toHaveLength(5); expect(result.publication).toBe(false); expect(result.decision).toBe('DO_NOT_PROMOTE'); });
it('does not confuse a valid two-call contract with factual approval quality', () => { const run = result.pipelines.find((r: any) => r.variant === 'evidence-first-v2'); expect(run.result.usage.calls).toBe(2); expect(run.result.evidenceAgent.recordFailures).toEqual([]); const verdict = result.records.find((r: any) => r.variant === 'evidence-first-v2' && r.stage === 'verifier'); expect(JSON.parse(verdict.response.text).results.every((r: any) => r.verdict === 'ok')).toBe(true); const timing = review.findings.find((f: any) => f.id === 'fund-source-today-became-current'); expect(timing.item.body).toContain('\u0627\u0644\u064a\u0648\u0645'); expect(timing.sourcePublishedAt).toBe('2026-10-18T00:00:00Z'); expect(timing.reportingCutoff).toBe('2026-10-20T00:00:00Z'); });
it('retains source-linked critical findings and measured efficiency failure without inventing broad error rates', () => { for (const finding of review.findings.filter((f: any) => f.severity === 'critical')) {
    const source = corpus.sources.find((s: any) => s.article.id === finding.sourceId).article;
    expect(source.text.includes(finding.evidence)).toBe(true);
} const modality = review.findings.find((f: any) => f.id === 'replit-potential-spending-became-actual-usage'); expect(modality.evidence).toContain('could significantly reduce'); expect(modality.item.headline).toContain('\u0648\u062a\u062e\u0641\u0636'); expect(review.observations.costIncreaseFraction).toBeGreaterThan(.1); expect(review.observations.latencyIncreaseFraction).toBeGreaterThan(.1); });
