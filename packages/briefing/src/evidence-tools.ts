import { auditEditorSourceAccounting } from './source-accounting';
import type { Article, BriefingInput, PriorItem } from './types';
/** Local evidence contract failure; never used to reinterpret provider/admission errors. */
export class EvidenceContractError extends Error {
    readonly name = 'EvidenceContractError';
}
export interface EvidencePassage {
    id: string;
    ref: string;
    field: 'title' | 'body';
    start: number;
    end: number;
    text: string;
}
export interface EvidenceSource {
    ref: string;
    id: string;
    source: string;
    url?: string;
    publishedAt: string;
    revision?: Article['revision'];
    digest: string;
    passages: EvidencePassage[];
}
export interface PassageSelection {
    passages: string[];
    quote?: never;
}
export interface PassageCitation {
    passages: string[];
    quote: string;
}
export interface EvidenceProof {
    ref: string;
    sourceId: string;
    field: 'title' | 'body';
    start: number;
    end: number;
    quote: string;
    digest: string;
}
export interface EvidenceTools {
    sources(): EvidenceSource[];
    source(ref: string): EvidenceSource;
    passage(id: string): EvidencePassage;
    resolve(citation: PassageCitation): EvidenceProof;
    resolvePassages(selection: PassageSelection): EvidenceProof;
    previous(ids?: string[]): PriorItem[];
    revisions(ref: string): {
        historyLimitedToInput: true;
        revisions: Array<{
            ref: string;
            id: string;
            revision?: Article['revision'];
        }>;
    };
    provenance(ref: string): Omit<EvidenceSource, 'passages'>;
    accounting(refs: string[]): {
        missing: string[];
        unknown: string[];
    };
    audit(): {
        reads: number;
        returnedChars: number;
    };
}
export async function createEvidenceTools(input: BriefingInput, limits: {
    maxReads?: number;
    maxReturnedChars?: number;
    passageChars?: number;
} = {}): Promise<EvidenceTools> {
    const maxReads = limits.maxReads ?? 1000, maxReturnedChars = limits.maxReturnedChars ?? 2000000, width = limits.passageChars ?? 2048;
    if (!Number.isSafeInteger(width) || width < 32 || !Number.isSafeInteger(maxReads) || maxReads < 1 || !Number.isSafeInteger(maxReturnedChars) || maxReturnedChars < 1)
        throw new EvidenceContractError('INVALID_EVIDENCE_TOOL_LIMIT');
    let reads = 0, returnedChars = 0;
    const give = <T>(value: T): T => {
        const copy = structuredClone(value), size = JSON.stringify(copy).length;
        if (reads + 1 > maxReads || returnedChars + size > maxReturnedChars)
            throw new EvidenceContractError('EVIDENCE_TOOL_BUDGET');
        reads++;
        returnedChars += size;
        return copy;
    };
    const ids = new Map<string, string>(), articles: Article[] = [];
    for (const a of input.articles) {
        if (!a.id || !a.source || typeof a.text !== 'string')
            throw new EvidenceContractError('INVALID_EVIDENCE_IDENTITY');
        const fingerprint = JSON.stringify([a.id, a.source, a.title, a.text, a.url, a.publishedAt, a.revision]);
        if (ids.has(a.id)) {
            if (ids.get(a.id) !== fingerprint)
                throw new EvidenceContractError('EVIDENCE_IDENTITY_CONFLICT');
            continue;
        }
        ids.set(a.id, fingerprint);
        articles.push(structuredClone(a));
    }
    const sources: EvidenceSource[] = [];
    for (const a of articles) {
        const ref = 'S' + (sources.length + 1), passages: EvidencePassage[] = [];
        for (const field of ['title', 'body'] as const) {
            const text = field === 'title' ? a.title ?? '' : a.text;
            for (let start = 0, n = 1; start < text.length; n++) {
                let end = Math.min(start + width, text.length);
                if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]))
                    end--;
                passages.push({ id: ref + '.' + (field === 'title' ? 'T' : 'B') + n, ref, field, start, end, text: text.slice(start, end) });
                start = end;
            }
        }
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([a.title ?? '', a.text])));
        const digest = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
        sources.push({ ref, id: a.id, source: a.source, url: a.url, publishedAt: a.publishedAt, revision: a.revision, digest, passages });
    }
    const byRef = new Map(sources.map(s => [s.ref, s])), byPassage = new Map(sources.flatMap(s => s.passages.map(p => [p.id, p] as const))), prior = structuredClone(input.prior ?? []);
    if (new Set(prior.map(p => p.id)).size !== prior.length)
        throw new EvidenceContractError('AMBIGUOUS_PRIOR_IDENTITY');
    const get = (ref: string) => {
        const s = byRef.get(ref);
        if (!s)
            throw new EvidenceContractError('UNKNOWN_EVIDENCE_SOURCE');
        return s;
    };
    return {
        sources: () => give(sources), source: ref => give(get(ref)), passage: id => {
            const p = byPassage.get(id);
            if (!p)
                throw new EvidenceContractError('UNKNOWN_EVIDENCE_PASSAGE');
            return give(p);
        },
        resolve(c) {
            if (!c || typeof c !== 'object' || !Array.isArray(c.passages) || !c.passages.length || c.passages.length > 8 || typeof c.quote !== 'string' || !c.quote.length)
                throw new EvidenceContractError('INVALID_PASSAGE_CITATION');
            const parts = c.passages.map(id => {
                const p = byPassage.get(id);
                if (!p)
                    throw new EvidenceContractError('UNKNOWN_EVIDENCE_PASSAGE');
                return p;
            });
            if (parts.some((p, i) => p.ref !== parts[0].ref || p.field !== parts[0].field || (i > 0 && parts[i - 1].end !== p.start)))
                throw new EvidenceContractError('NONCONTIGUOUS_EVIDENCE');
            const text = parts.map(p => p.text).join(''), offset = text.indexOf(c.quote);
            if (offset < 0)
                throw new EvidenceContractError('QUOTE_NOT_IN_SOURCE');
            if (text.indexOf(c.quote, offset + 1) >= 0)
                throw new EvidenceContractError('AMBIGUOUS_SOURCE_QUOTE');
            const s = get(parts[0].ref);
            return give({ ref: s.ref, sourceId: s.id, field: parts[0].field, start: parts[0].start + offset, end: parts[0].start + offset + c.quote.length, quote: c.quote, digest: s.digest });
        },
        resolvePassages(selection) {
            if (!selection || typeof selection !== 'object' || !Array.isArray(selection.passages) || !selection.passages.length || selection.passages.length > 8)
                throw new EvidenceContractError('INVALID_PASSAGE_SELECTION');
            if ('quote' in selection)
                throw new EvidenceContractError('UNEXPECTED_SOURCE_QUOTE');
            const parts = selection.passages.map(id => {
                const passage = byPassage.get(id);
                if (!passage)
                    throw new EvidenceContractError('UNKNOWN_EVIDENCE_PASSAGE');
                return passage;
            });
            if (parts.some((part, index) => part.ref !== parts[0].ref || part.field !== parts[0].field || index > 0 && parts[index - 1].end !== part.start))
                throw new EvidenceContractError('NONCONTIGUOUS_EVIDENCE');
            const source = get(parts[0].ref);
            return give({ ref: source.ref, sourceId: source.id, field: parts[0].field, start: parts[0].start, end: parts[parts.length - 1].end, quote: parts.map(part => part.text).join(''), digest: source.digest });
        },
        previous(selected) {
            if (!selected)
                return give(prior);
            if (selected.some(id => !prior.some(p => p.id === id)))
                throw new EvidenceContractError('UNKNOWN_PRIOR_COVERAGE');
            return give(prior.filter(p => selected.includes(p.id)));
        },
        revisions(ref) { const s = get(ref); return give({ historyLimitedToInput: true as const, revisions: sources.filter(r => r.id === s.id || Boolean(s.revision && r.revision?.evidenceId === s.revision.evidenceId && r.source === s.source)).map(r => ({ ref: r.ref, id: r.id, revision: r.revision })) }); },
        provenance(ref) { const { passages: _, ...p } = get(ref); return give(p); },
        accounting(refs) { const used = new Set(refs); return give({ missing: auditEditorSourceAccounting({ items: [{ sources: refs }] }, sources.map(s => ({ ref: s.ref, id: s.id, alsoIds: [] }))).map(s => s.ref), unknown: [...used].filter(ref => !byRef.has(ref)) }); },
        audit: () => ({ reads, returnedChars })
    };
}
