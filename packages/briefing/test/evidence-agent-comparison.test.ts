import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareComparison, CASES } from '../../../benchmarks/evidence-agent/comparison';
import { createEvidenceTools } from '../src/evidence-tools';
import { prepareArticles } from '../src/prepare';
const corpus = JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-distillation/corpus.json', import.meta.url), 'utf8'));
it('freezes identical original evidence and histories for V4, V7 and the candidate without any provider I/O', async () => {
    const plan = await prepareComparison(corpus);
    expect(plan.rows).toHaveLength(6);
    for (const row of plan.rows) {
        expect(row.requests).toHaveLength(3);
        const agent = JSON.parse(row.requests[2].request.user);
        expect(agent.tools.sources).toHaveLength(row.input.articles.length);
        for (const [i, a] of row.input.articles.entries())
            expect(agent.tools.sources[i].passages.filter((p: any) => p.field === 'body').map((p: any) => p.text).join('')).toBe(a.text);
        expect(agent.tools.previousCoverage).toEqual(row.input.prior);
        expect(row.requests.map(r => r.request.model)).toEqual(['openai/gpt-4.1', 'openai/gpt-4.1', 'openai/gpt-4.1']);
    }
    expect(plan.comparison.actualCostUsd).toBe(0);
    if (process.env.FREEZE_EVIDENCE_AGENT === '1')
        writeFileSync(new URL('../../../benchmarks/evidence-agent/offline-plan.json', import.meta.url), JSON.stringify(plan, null, 2) + '\n');
});
it('finds the retained silent S13 omission input and evolving conflicting multi-source cases without inventing fresh evidence', () => {
    const lebanon = corpus.cases.find((c: any) => c.id === CASES[0]);
    expect(lebanon.articleIds).toContain('d54d92e1-3175-4465-8f47-09031a4de464');
    for (const id of ['casualty-update-en', 'casualty-update-ar']) {
        const c = corpus.cases.find((c: any) => c.id === id);
        expect(c.articleIds).toHaveLength(3);
        expect(c.prior).not.toHaveLength(0);
        expect(c.expected.important[0].necessary.join(' ')).toContain('retain attribution');
    }
});
it('demonstrates same-URL revision folding mechanically without claiming it happened for every production feed', async () => { const base = corpus.sources.find((s: any) => s.article.text.length > 100).article; const a = { ...base, id: 'revision-1', source: 'Synthetic isolated revision regression', url: 'https://synthetic.invalid/revision', title: 'Synthetic revision', text: 'The proposed measure remains subject to shareholder approval.' }, b = { ...a, id: 'revision-2', text: 'The proposed measure was rejected by shareholders yesterday.' }; const legacy = prepareArticles([a, b], { minChars: 1, nearDuplicate: 1.01 }); expect(legacy.prepared).toHaveLength(1); const tools = await createEvidenceTools({ feed: corpus.cases[0].feed, articles: [a, b], windowStart: corpus.cases[0].windowStart, windowEnd: corpus.cases[0].windowEnd }); expect(tools.sources()).toHaveLength(2); expect(tools.sources().map(s => s.passages.map(p => p.text).join(''))).toEqual(expect.arrayContaining([expect.stringContaining('rejected')])); });
it('keeps retained factual failures and valid concise controls source-linked without pretending offline tests judge meaning', () => {
    const cases = JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-distillation/v7-qualification-controls.json', import.meta.url), 'utf8')).cases;
    for (const c of cases)
        expect(c.sourceIds.some((id: string) => corpus.sources.find((s: any) => s.article.id === id)?.article.text.includes(c.essentialEvidence))).toBe(true);
    expect(cases.some((c: any) => c.id === 'retained-fund-ar' && c.expected !== 'ok')).toBe(true);
    expect(cases.some((c: any) => c.id === 'retained-metr-ar' && c.expected !== 'ok')).toBe(true);
});
