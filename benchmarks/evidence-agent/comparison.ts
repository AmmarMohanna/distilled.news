import { generateBriefing } from '../../packages/briefing/src/engine';
import { createEvidenceTools } from '../../packages/briefing/src/evidence-tools';
import { prepareArticles } from '../../packages/briefing/src/prepare';
import { freezeCase, hash, MODELS, type FrozenCase } from '../editorial-distillation/v7-comparison';
import type { ModelPort, ModelRequest } from '../../packages/briefing/src/model';
export const CASES = ['lebanon-roundup-en', 'lebanon-roundup-ar', 'ai-multisource-en', 'ai-multisource-ar', 'casualty-update-en', 'casualty-update-ar'];
export const VARIANTS = ['v4', 'v7', 'evidence-first-v1'] as const;
export type Variant = typeof VARIANTS[number];
const options = (variant: Variant) => ({ promptVersion: variant === 'v7' ? 7 as const : 4 as const, ...(variant === 'evidence-first-v1' ? { architecture: 'evidence-first-v1' as const } : {}), maxRepairs: 1 });
/** Pure offline preparation: captures first requests using a port that cannot perform I/O. */
export async function prepareComparison(corpus: any) {
    const rows = [];
    for (const id of CASES) {
        const frozen = freezeCase(corpus, id), tools = await createEvidenceTools(frozen.input), full = tools.sources();
        const requests = [];
        for (const variant of VARIANTS) {
            let request: ModelRequest | undefined;
            const sentinel = new Error('OFFLINE_CAPTURE');
            try {
                await generateBriefing(structuredClone(frozen.input), { async complete(r) { request = structuredClone(r); throw sentinel; } }, MODELS, options(variant));
            }
            catch (e) {
                if (e !== sentinel)
                    throw e;
            }
            if (!request)
                throw Error('MISSING_EDITOR_REQUEST');
            requests.push({ variant, request, requestHash: hash(request), requestChars: request.system.length + request.user.length, utf8Bytes: new TextEncoder().encode(request.system + request.user).length });
        }
        const legacy = prepareArticles(frozen.input.articles, { minChars: 1, maxArticleChars: Number.MAX_SAFE_INTEGER, nearDuplicate: 1.01 });
        rows.push({ id, input: frozen.input, evidenceHash: frozen.evidenceHash, provisionalExpectations: corpus.cases.find((c: any) => c.id === id).expected, sourceCount: full.length, fullSourceChars: full.reduce((n, s) => n + s.passages.reduce((m, p) => m + p.text.length, 0), 0), shortSources: full.filter(s => s.passages.filter(p => p.field === 'body').reduce((n, p) => n + p.text.length, 0) < 40).map(s => s.id), legacyWorkerPreparation: { count: legacy.prepared.length, skipped: legacy.skipped }, requests });
    }
    return { schemaVersion: 1, architecture: 'evidence-first-v1', status: 'OFFLINE_ONLY', labelAuthority: 'Provisional source-linked engineering expectations, not human gold or independent model findings.', variants: VARIANTS, models: MODELS, comparison: { pipelines: 18, normalCalls: 36, maxCalls: 72, maxCallsPerPipeline: 4, repairsPerPipeline: 1, paidJudgeCalls: 0, authorization: null, freshPricing: null, proposedExposureUsd: null, actualCostUsd: 0, realModelLatencyMs: null, qualityImprovement: null, persistence: false, approvalRequired: true }, rows };
}
/** Reuses caller-provided native admission/settlement; deliberately contains no network adapter or credentials.
 * Call only after a fresh approval and conservative price/exposure preflight. Budget is authoritative in admittedPort. */
export async function runComparisonCase(frozen: FrozenCase, variant: Variant, admittedPort: ModelPort, persist: (event: unknown) => Promise<void>) {
    if (!VARIANTS.includes(variant) || hash(frozen.input) !== frozen.evidenceHash)
        throw Error('INVALID_FROZEN_COMPARISON');
    let calls = 0;
    const events: unknown[] = [];
    const port: ModelPort = { async complete(request) {
            if (calls >= 4)
                throw Error('COMPARISON_CALL_LIMIT');
            calls++;
            await persist({ type: 'intent', variant, caseId: frozen.id, requestHash: hash(request), request });
            const at = performance.now();
            const response = await admittedPort.complete(request);
            const event = { type: 'response', variant, caseId: frozen.id, request, response, wallMs: performance.now() - at };
            await persist(event);
            events.push(event);
            return response;
        } };
    const start = performance.now(), result = await generateBriefing(structuredClone(frozen.input), port, MODELS, options(variant));
    const output = { variant, caseId: frozen.id, evidenceHash: frozen.evidenceHash, result, events, wallMs: performance.now() - start, actualPublication: false, semanticAssessment: null };
    await persist({ type: 'complete', ...output });
    return output;
}
