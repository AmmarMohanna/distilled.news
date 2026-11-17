import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateBriefing } from '../src/engine';
import { freezeCase, hash, MODELS } from '../../../benchmarks/editorial-distillation/v7-comparison';
const read = (p: string) => JSON.parse(readFileSync(new URL('../../../' + p, import.meta.url), 'utf8'));
const corpus = read('benchmarks/editorial-distillation/corpus.json'), trial = read('benchmarks/evidence-agent/trial-results-2026-11-04.json');
it('migrates retained responses as explicitly modified fixtures without altering prose or inferring null prior targets', async () => {
    const rows = [];
    for (const original of trial.records.filter((r: any) => r.variant === 'evidence-first-v1' && r.stage === 'editor')) {
        const frozen = freezeCase(corpus, original.caseId), raw = JSON.parse(original.response.text), fixture = structuredClone(raw);
        for (const record of fixture.developments) {
            if (record.updates !== null) {
                const index = (frozen.input.prior ?? []).findIndex(p => p.id === record.updates);
                if (index >= 0)
                    record.updates = 'P' + (index + 1);
            }
            for (const claim of record.essentialClaims)
                for (const evidence of claim.evidence)
                    delete evidence.quote;
        }
        expect(fixture.items).toEqual(raw.items);
        expect(fixture.developments.map((d: any) => d.essentialClaims.map((c: any) => c.statement))).toEqual(raw.developments.map((d: any) => d.essentialClaims.map((c: any) => c.statement)));
        const requests: any[] = [];
        const result = await generateBriefing(frozen.input, { async complete(request) { requests.push(request); const payload = JSON.parse(request.user); const response = requests.length === 1 ? fixture : { results: payload.items.map((item: any) => ({ i: item.i, verdict: 'ok', issues: [] })), coverage: { status: 'complete', issues: [] } }; return { text: JSON.stringify(response), inputTokens: 0, outputTokens: 0 }; } }, MODELS, { architecture: 'evidence-first-v2', now: () => new Date(frozen.input.windowEnd) });
        const context = JSON.parse(requests[0].user);
        for (const [i, article] of frozen.input.articles.entries())
            expect(context.tools.sources[i].passages.filter((p: any) => p.field === 'body').map((p: any) => p.text).join('')).toBe(article.text);
        expect(result.evidenceAgent?.semanticTruthEstablished).toBe(false);
        if (original.caseId === 'casualty-update-ar') {
            expect(result.items).toHaveLength(0);
            expect(result.evidenceAgent?.recordFailures?.[0].reason).toBe('INVALID_PRIOR_RELATION');
            expect(fixture.developments[0].updates).toBeNull();
        }
        else {
            expect(requests).toHaveLength(2);
            expect(result.items.map(i => [i.headline, i.body])).toEqual(fixture.items.map((i: any) => [i.headline, i.body]));
        }
        rows.push({ caseId: original.caseId, evidenceHash: frozen.evidenceHash, originalResponseHash: hash(raw), fixtureHash: hash(fixture), originalCompactResponseChars: JSON.stringify(raw).length, modifiedFixtureChars: JSON.stringify(fixture).length, fixture, requestHashes: requests.map(hash), requestChars: requests.map(request => request.system.length + request.user.length), mockContractResult: { calls: requests.length, selectedItemCount: result.items.length, recordFailures: result.evidenceAgent?.recordFailures }, semanticQuality: null });
    }
    expect(rows).toHaveLength(6);
    const artifact = { schemaVersion: 1, status: 'OFFLINE_MODIFIED_FIXTURES_ONLY', architecture: 'evidence-first-v2', sourceTrial: 'trial-results-2026-11-04.json', sourceTrialHash: hash(trial), transformation: 'Remove copied source quotations; map only exact non-null canonical prior references to compact aliases. Preserve prose and factual statements; never infer null updates.', verifier: 'SCRIPTED_OK_NOT_A_REAL_MODEL_VERDICT', additionalPaidCalls: 0, actualModelCostUsd: null, realModelLatencyMs: null, modelQuality: null, rows };
    if (process.env.FREEZE_EVIDENCE_AGENT_V2 === '1')
        writeFileSync(new URL('../../../benchmarks/evidence-agent/v2-offline-controls.json', import.meta.url), JSON.stringify(artifact, null, 2) + '\n');
});
