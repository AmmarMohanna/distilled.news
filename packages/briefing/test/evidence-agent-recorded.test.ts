import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runComparisonCase } from '../../../benchmarks/evidence-agent/comparison';
import { freezeCase, hash } from '../../../benchmarks/editorial-distillation/v7-comparison';
const result = JSON.parse(readFileSync(new URL('../../../benchmarks/evidence-agent/trial-results-2026-11-04.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-distillation/corpus.json', import.meta.url), 'utf8'));
it('replays every exact paid response against identical frozen requests with zero network access', async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); try {
    for (const original of result.pipelines) {
        const calls = result.records.filter((r: any) => r.caseId === original.caseId && r.variant === original.variant);
        let i = 0;
        const replay = await runComparisonCase(freezeCase(corpus, original.caseId), original.variant, { async complete(request) { expect(hash(request)).toBe(calls[i].requestHash); return calls[i++].response; } }, async () => { });
        expect(i).toBe(calls.length);
        expect(replay.result.items).toEqual(original.result.items);
        expect(replay.result.dropped).toEqual(original.result.dropped);
        expect(replay.result.omitted).toEqual(original.result.omitted);
        expect(replay.result.usage).toEqual(original.result.usage);
    }
}
finally {
    vi.useRealTimers();
} });
it('reconciles all native reported receipts without uncertain holds or duplicated generations', () => { expect(result.calls).toBe(39); expect(result.ledgerRows).toHaveLength(39); expect(new Set(result.records.map((r: any) => r.generationId)).size).toBe(39); expect(result.ledgerRows.every((r: any) => r.reported === 1)).toBe(true); expect(result.actualUsd).toBeCloseTo(.2491448, 9); expect(result.records.reduce((n: number, r: any) => n + r.costUsd, 0)).toBeCloseTo(result.actualUsd, 9); expect(result.heldUsd).toBe(0); expect(result.uncertainOperations).toBe(0); expect(result.publication).toBe(false); });
it('does not misreport schema holds as successful semantic verification or a cost-saving win', () => { const candidate = result.pipelines.filter((r: any) => r.variant === 'evidence-first-v1'); expect(candidate.filter((r: any) => r.result.status === 'published')).toHaveLength(3); for (const id of ['ai-multisource-en', 'ai-multisource-ar']) {
    const r = candidate.find((r: any) => r.caseId === id);
    expect(r.result.evidenceAgent.diagnostics).toContain('QUOTE_NOT_IN_SOURCE');
    expect(r.result.usage.calls).toBe(1);
    expect(r.result.evidenceAgent.reviews).toHaveLength(0);
} expect(candidate.find((r: any) => r.caseId === 'casualty-update-ar').result.evidenceAgent.diagnostics).toContain('INVALID_PRIOR_RELATION'); expect(result.decision).toBe('REVISE_DO_NOT_PROMOTE'); });
it('retains the real supported-number false rejections and actual source passage rather than treating non-ok as accuracy', () => { const source = corpus.sources.find((s: any) => s.article.id === '78a8013d-f33c-4c96-a435-8776f78c5f57').article; expect(source.text).toContain('6 \u0642\u062a\u0644\u0649 \u064828 \u062c\u0631\u064a\u062d\u0627\u064b'); for (const v of ['v4', 'v7']) {
    const r = result.records.find((r: any) => r.caseId === 'casualty-update-en' && r.variant === v && r.stage === 'verifier');
    expect(r.response.text).toContain('28');
    expect(JSON.parse(r.response.text).results[0].verdict).toBe('fix');
} expect(result.pipelines.find((r: any) => r.caseId === 'casualty-update-en' && r.variant === 'evidence-first-v1').result.items[0].headline).toContain('28 injured'); });
it('keeps material semantic findings attached to actual original evidence, with ambiguous findings unresolved', () => { const review = JSON.parse(readFileSync(new URL('../../../benchmarks/evidence-agent/trial-review-2026-11-04.json', import.meta.url), 'utf8')); for (const f of review.findings) {
    expect(f.sourceIds.every((id: string) => corpus.sources.some((s: any) => s.article.id === id))).toBe(true);
    if (f.severity === 'material' || f.assessment === 'CONFIRMED_UNSUPPORTED_ATTRIBUTION') {
        expect(typeof f.evidence).toBe('string');
        expect(f.sourceIds.some((id: string) => corpus.sources.find((s: any) => s.article.id === id).article.text.includes(f.evidence))).toBe(true);
    }
} expect(review.findings.find((f: any) => f.id === 'candidate-casualty-attribution-scope').assessment).toBe('UNRESOLVED_CITATION_ATTRIBUTION_RISK'); });
