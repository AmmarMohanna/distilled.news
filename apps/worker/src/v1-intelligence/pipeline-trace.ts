import {executionCapacityDiagnostic} from './model-spending';
import { traceSourceCollection } from './pipeline-trace-sources';
import { HandoffError, sha256 } from '@distilled/contracts';
import { z } from 'zod';
import { canonicalJson } from '../v1-intake/canonical';
export const traceOptionsSchema = z.object({ view: z.enum(['overview', 'sources', 'articles', 'candidates', 'operations', 'records']).default('overview'), windowStart: z.string().datetime().optional(), windowEnd: z.string().datetime().optional(), editionId: z.string().min(1).optional(), sourceId: z.string().min(1).optional(), url: z.string().url().optional(), evidenceRevisionId: z.string().min(1).optional(), targetId: z.string().min(1).optional(), candidateId: z.string().min(1).optional(), recordId: z.string().min(1).optional(), kind: z.string().optional(), cursor: z.string().max(12000).optional(), pageSize: z.coerce.number().int().min(1).max(100).default(30) }).strict().refine(o => Boolean(o.windowStart) === Boolean(o.windowEnd), 'Supply both window boundaries').refine(o => !o.windowStart || Date.parse(o.windowStart) < Date.parse(o.windowEnd!), 'Invalid window');
export type TraceOptions = Partial<z.input<typeof traceOptionsSchema>>;
type Row = Record<string, any>;
const diagnosticKinds = ['briefing_requests', 'schedule_observations', 'shortlists', 'editorial_plans', 'editorial_proposals', 'editorial_processing_work', 'editorial_processing_progress', 'editorial_deferred_work', 'editorial_work_resolutions', 'candidates', 'selections', 'claim_mentions', 'source_documents', 'memberships', 'events', 'event_versions', 'storylines', 'storyline_versions', 'event_semantic_states', 'propositions', 'rematch_requests', 'rematch_attempts', 'publication_work', 'synthesis_jobs', 'drafts', 'verification_results', 'verification_feedback', 'grounding_results', 'fidelity_results', 'publication_reconciliations', 'editions', 'publication_status', 'ledger_entries', 'ledger_fact_bindings', 'ledger_projections', 'correction_obligations', 'correction_resolutions', 'delivery_jobs', 'browser_push_receipts', 'semantic_construction_work', 'semantic_construction_progress','model_spending_reconciliations', 'editorial_processing_waits', 'entities', 'state_slots', 'storyline_memories', 'semantic_resource_waits', 'semantic_intents', 'semantic_results', 'semantic_settlements', 'model_intents', 'model_executions', 'salience_intents', 'salience_results', 'salience_provenance'] as const;
const hidden = new Set(['token', 'leaseToken', 'passwordHash', 'cookie', 'cookies', 'headers', 'accessToken', 'refreshToken', 'apiKey', 'api_key', 'rawProposal', 'input', 'payload', 'authorizationScopes', 'request', 'rejectedResponse', 'rawResponse', 'response'].map(key => key.toLowerCase()));
/** Whitelisted diagnostic fields are projected below; recursive removal is an
 * additional safeguard for nested stored objects, never a substitute for scope. */
export function sanitizeTraceRecord(value: any): any { if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    try {
        const url = new URL(value);
        url.username = '';
        url.password = '';
        for (const key of [...url.searchParams.keys()])
            if (/token|key|auth|signature|password|secret/i.test(key))
                url.searchParams.set(key, 'REDACTED');
        return url.href;
    }
    catch {
        return value;
    }
} if (Array.isArray(value))
    return value.map(sanitizeTraceRecord); if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).filter(([k]) => !hidden.has(k.toLowerCase()) && !/(?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|leaseToken)/i.test(k)).map(([k, v]) => [k, sanitizeTraceRecord(v)])); return value; }
function state(value: Row | undefined): string { if (!value)
    return 'NOT_OBSERVABLE'; const reason = value.failure ?? value.failureCode ?? value.reason ?? ''; if (/UNKNOWN|UNCERTAIN_PAID/.test(reason) || value.usage?.reported === false)
    return 'UNKNOWN'; if (/AUTHORIZATION|RESOURCE_WAIT|BUDGET|CAPABILITY|CONTEXT_WAIT/.test(reason))
    return 'BLOCKED'; if (value.state === 'FAILED' || /REJECTED|VALIDATION_FAILED|_FAILED|KNOWN_.*FAILURE|INVALID_SCHEMA|SCOPE_DENIED/.test(reason))
    return 'FAILED'; if (value.status === 'SUCCEEDED' || value.state === 'DONE')
    return 'SUCCESS'; if (['PENDING', 'RUNNING', 'WAITING_BUDGET'].includes(value.state) || value.status === 'DEFERRED')
    return 'DEFERRED'; return 'UNKNOWN'; }
function canonicalUrl(raw: string) { const u = new URL(raw); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new HandoffError('INVALID_REQUEST'); u.hash = ''; return u.href; }
const safe = <T>(value: T): T => sanitizeTraceRecord(value);
const pick = (r: Row, keys: string[]) => Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, safe(r[k])]));
/** Read-only, Feed-scoped facade over original records. No runner, model,
 * transaction, enrollment, source fetch or financial mutation is invoked. */
export async function readPipelineTrace(db: D1Database, feedId: string, raw: TraceOptions = {}, runtime: {
    admittedSourceIds?: string[];
} = {}) {
    const o = traceOptionsSchema.parse(raw);
    const supported: Record<string, string[]> = { overview: [], sources: ['sourceId'], articles: ['sourceId', 'url', 'evidenceRevisionId', 'targetId', 'candidateId'], candidates: ['sourceId', 'evidenceRevisionId', 'targetId', 'candidateId'], operations: ['evidenceRevisionId', 'recordId'], records: ['kind', 'recordId', 'evidenceRevisionId', 'targetId', 'candidateId'] };
    for (const key of ['sourceId', 'url', 'evidenceRevisionId', 'targetId', 'candidateId', 'recordId', 'kind'])
        if ((o as Row)[key] !== undefined && !supported[o.view].includes(key))
            throw new HandoffError('INVALID_REQUEST');
    const inventory = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{
        name: string;
    }>(), tables = new Set(inventory.results.map(r => r.name)), feedRow = await db.prepare('SELECT json,epoch FROM v1_feeds WHERE id=?').bind(feedId).first<{
        json: string;
        epoch: number;
    }>();
    let feed: Row;
    if (feedRow)
        feed = JSON.parse(feedRow.json);
    else {
        const product = tables.has('briefings') ? await db.prepare('SELECT id,title,owner_account_id,interest_profile,paused FROM briefings WHERE id=?').bind(feedId).first<Row>() : undefined;
        if (!product)
            throw new HandoffError('SCOPE_DENIED');
        feed = { id: product.id, title: product.title, ownerId: product.owner_account_id, interests: [product.interest_profile], paused: Boolean(product.paused), enrollment: 'NOT_ENROLLED' };
    }
    ;
    const docs = async (kind: string, where = '1', params: any[] = []): Promise<Row[]> => { const r = await db.prepare(`SELECT json FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind=? AND (${where}) ORDER BY d.id`).bind(feedId, kind, ...params).all<{
        json: string;
    }>(); return r.results.map(r => JSON.parse(r.json)); };
    const doc = async (kind: string, id?: string): Promise<Row | undefined> => id ? (await docs(kind, 'd.id=?', [id]))[0] : undefined;
    const intake = async (table: string, where = '1', params: any[] = []): Promise<Row[]> => { const r = await db.prepare(`SELECT d.json,d.feed_source_id FROM ${table} d JOIN v1_intake_scopes s ON s.id=d.feed_source_id WHERE s.feed_id=? AND (${where}) ORDER BY d.id`).bind(feedId, ...params).all<{
        json: string;
        feed_source_id: string;
    }>(); return r.results.map(r => ({ ...JSON.parse(r.json), feedSourceId: r.feed_source_id })); };
    const scopes = await db.prepare('SELECT id,source_id,json FROM v1_intake_scopes WHERE feed_id=? ORDER BY id').bind(feedId).all<{
        id: string;
        source_id: string;
        json: string;
    }>();
    if (o.sourceId && !scopes.results.some(s => s.id === o.sourceId || s.source_id === o.sourceId) && !(tables.has('sources') && await db.prepare('SELECT id FROM sources WHERE id=? AND briefing_id=?').bind(o.sourceId, feedId).first()))
        throw new HandoffError('SCOPE_DENIED');
    if (o.evidenceRevisionId && !(await intake('v1_revisions', 'd.id=?', [o.evidenceRevisionId])).length)
        throw new HandoffError('SCOPE_DENIED');
    const edition = o.editionId ? await doc('editions', o.editionId) : undefined;
    if (o.editionId && !edition)
        throw new HandoffError('SCOPE_DENIED');
    if(edition && o.windowStart && (Date.parse(o.windowStart)!==Date.parse(edition.windowStart)||Date.parse(o.windowEnd!)!==Date.parse(edition.windowEnd)))throw new HandoffError('INVALID_REQUEST');
    const candidateReference = o.candidateId ? await doc('candidates', o.candidateId) : undefined;
    if (o.candidateId && !candidateReference)
        throw new HandoffError('SCOPE_DENIED');
    const targetId = o.targetId ?? candidateReference?.targetVersionId;
    const start = edition?.windowStart ?? o.windowStart, end = edition?.windowEnd ?? o.windowEnd;
    const windowWhere = start ? "julianday(json_extract(d.json,'$.window.start'))=julianday(?) AND julianday(json_extract(d.json,'$.window.end'))=julianday(?)" : '1', windowParams = start ? [start, end] : [];
    // A request/selection freezes a window. Prefer its exact parent shortlist;
    // child cohort documents never count as additional eligible developments.
    const timestamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
    const latest = (rows: Row[]) => rows.sort((a,b)=>timestamp(a.window?.end)-timestamp(b.window?.end)||timestamp(a.computedAt??a.createdAt)-timestamp(b.computedAt??b.createdAt)).at(-1);
    const selections = await docs('selections', windowWhere, windowParams), selection = edition ? selections.find(s => s.id === edition.selectionId) : latest(selections);
    const plan = selection?.editorialPlanId ? await doc('editorial_plans', selection.editorialPlanId) : latest(await docs('editorial_plans',windowWhere+" AND NOT EXISTS(SELECT 1 FROM v1_feed_documents w,json_each(w.json,'$.cohorts') cohort WHERE w.feed_id=d.feed_id AND w.kind='editorial_processing_work' AND json_extract(cohort.value,'$.id')=json_extract(d.json,'$.shortlistId'))",windowParams));
    let shortlist = plan ? await doc('shortlists', plan.shortlistId) : undefined;
    if (!shortlist) {
        const sql = `SELECT json FROM v1_feed_documents d WHERE feed_id=? AND kind='shortlists' AND (${windowWhere}) AND NOT EXISTS(SELECT 1 FROM v1_feed_documents w,json_each(w.json,'$.cohorts') cohort WHERE w.feed_id=d.feed_id AND w.kind='editorial_processing_work' AND json_extract(cohort.value,'$.id')=d.id) ORDER BY julianday(json_extract(json,'$.window.end')) DESC,julianday(json_extract(json,'$.createdAt')) DESC,json_array_length(json_extract(json,'$.candidates')) DESC,id LIMIT 1`;
        const r = await db.prepare(sql).bind(feedId, ...windowParams).first<{
            json: string;
        }>();
        if (r)
            shortlist = JSON.parse(r.json);
    }
    const cohortPlans=shortlist?await docs('editorial_plans',"EXISTS(SELECT 1 FROM v1_feed_documents w,json_each(w.json,'$.cohorts') cohort WHERE w.feed_id=d.feed_id AND w.kind='editorial_processing_work' AND json_extract(w.json,'$.shortlistId')=? AND json_extract(cohort.value,'$.id')=json_extract(d.json,'$.shortlistId'))",[shortlist.id]):[];
    const scopeFingerprint = await sha256(canonicalJson({ feedId, ...o, cursor: undefined, pageSize: undefined, windowStart: start, windowEnd: end, shortlistId: shortlist?.id }));
    let after = '';
    if (o.cursor) {
        try {
            const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(o.cursor), c => c.charCodeAt(0))));
            if (c.scope !== scopeFingerprint || typeof c.after !== 'string')
                throw Error();
            after = c.after;
        }
        catch {
            throw new HandoffError('INVALID_REQUEST');
        }
    }
    const page = <T extends Row>(rows: T[], total: number, key: (r: T) => string) => { const visible = rows.slice(0, o.pageSize); return { items: visible, page: { total, pageSize: o.pageSize, returned: visible.length, nextCursor: rows.length > o.pageSize ? btoa(Array.from(new TextEncoder().encode(JSON.stringify({ scope: scopeFingerprint, after: key(visible.at(-1)!) })), b => String.fromCharCode(b)).join('')) : null } }; };
    const sqlPage = async (sql: string, params: any[], key = 'id') => { const total = (await db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).bind(...params).first<{
        n: number;
    }>())!.n; const rows = await db.prepare(`SELECT * FROM (${sql}) WHERE ${key}>? ORDER BY ${key} LIMIT ?`).bind(...params, after, o.pageSize + 1).all<Row>(); return { rows: rows.results, total }; };
    const request = latest(await docs('briefing_requests', windowWhere, windowParams));
    const editions = start ? await docs('editions', "julianday(json_extract(d.json,'$.windowStart'))=julianday(?) AND julianday(json_extract(d.json,'$.windowEnd'))=julianday(?)", [start, end]) : edition ? [edition] : [];
    const readMany = async (kind: string, field: string, values: string[]) => { const rows: Row[] = []; for (let i = 0; i < values.length; i += 80) {
        const part = values.slice(i, i + 80);
        rows.push(...await docs(kind, `${field} IN (${part.map(() => '?').join(',')})`, part));
    } return rows; };
    const statuses = await readMany('publication_status', 'd.id', editions.map(e => e.id)), statusFor = (id: string) => statuses.find(s => s.id === id);
    const ids = (rows: Row[]) => rows.map(r => r.id), arrayContains = (field: string) => `EXISTS(SELECT 1 FROM json_each(d.json,'$.${field}') ref WHERE ref.value=?)`;
    const financialNote = 'Costs belong to immutable operations. Shared semantic work is not assigned wholly to a publication window unless its recorded identity binds that window. Held exposure is not confirmed spend.';
    const publicationFor = async (candidateIds: string[]) => {
        const included = editions.filter(e => e.stories?.some((s: Row) => candidateIds.includes(s.candidateId))), entries = await readMany('ledger_entries', "json_extract(d.json,'$.candidateId')", candidateIds);
        return { included, entries };
    };
    let items: Row[] = [], pagination: Row = { total: 0, pageSize: o.pageSize, returned: 0, nextCursor: null }, lookup: Row = { state: 'SUCCESS' }, summary: Row | undefined;
    if (o.view === 'overview') {
        const selected = selection?.selectedCandidateIds ?? [], published = [...new Set(editions.flatMap(e => e.stories?.map((s: Row) => s.candidateId) ?? []))], communication = await publicationFor(selected);
        const decisions = plan?.stories ?? [], notReviewed = new Set(plan?.inputCoverage?.notComparativelyReviewedTargetVersionIds ?? []);
        const n = (decision: string) => plan ? decisions.filter((s: Row) => s.decision === decision && !notReviewed.has(s.targetVersionId)).length : null;
        summary = { collection: { configuredSources: tables.has('sources') ? (await db.prepare('SELECT COUNT(*) AS n FROM sources WHERE briefing_id=?').bind(feedId).first<{
                    n: number;
                }>())!.n : null, enrolledSources: scopes.results.length, observationsInWindow: start ? (await db.prepare("SELECT COUNT(*) AS n FROM v1_inputs d JOIN v1_intake_scopes s ON s.id=d.feed_source_id WHERE s.feed_id=? AND julianday(json_extract(d.json,'$.observation.observedAt'))>=julianday(?) AND julianday(json_extract(d.json,'$.observation.observedAt'))<julianday(?)").bind(feedId, start, end).first<{
                    n: number;
                }>())!.n : null, definition: 'Observation count, not distinct articles. Configured source inventory is in the sources view; unenrolled sources are not implied absent.' }, editorial: { shortlistId: shortlist?.id ?? null, eligible: shortlist ? shortlist.candidates.length + (shortlist.overflow?.length ?? 0) : null, offered: plan?.inputCoverage?.offeredTargetVersionIds?.length ?? null, acceptedJudgments: plan?.route === 'GPT' ? decisions.filter((s: Row) => !notReviewed.has(s.targetVersionId)).length : plan ? 0 : null, selected: n('SELECT'), suppressed: n('SUPPRESS'), deferred: n('DEFER'), notComparativelyReviewed: plan?.inputCoverage ? notReviewed.size : null, planId: plan?.id ?? null }, publication: { request: request ? { ...pick(request, ['id', 'state', 'result', 'failure', 'reason', 'attempts', 'createdAt', 'completedAt', 'blocked', 'requireModel']), diagnosticState: state(request) } : null, selected: selection ? selected.length : null, verified: null, published: start || edition ? published.length : null, currentlyPublished: start || edition ? new Set(editions.filter(e => statusFor(e.id)?.status === 'PUBLISHED').flatMap(e => e.stories?.map((s: Row) => s.candidateId) ?? [])).size : null, publicationStatuses: statuses, communicated: selection ? new Set(communication.entries.map(e => e.candidateId)).size : null, selectedUncommunicated: selection ? selected.filter((id: string) => !communication.entries.some(e => e.candidateId === id)).length : null, editionIds: ids(editions) }, problems: [] };
        if (!request)
            summary.problems.push({ stage: 'SCHEDULE', state: 'NOT_OBSERVABLE', reason: 'No matching durable request; no quiet or failed outcome inferred.' });
        if (request?.failure)
            summary.problems.push({ stage: 'REQUEST', state: state(request), reason: request.failure, recordId: request.id, lastConfirmedStage: plan?.route === 'GPT' ? 'EDITORIAL_PLAN_ACCEPTED' : 'REQUEST_RECORDED', firstUnconfirmedStage: selection ? 'WRITING_OR_VERIFICATION_OR_PUBLICATION' : 'SELECTION_COMMIT', rootCause: 'Request label alone does not prove the failing operation; inspect records and operation views.' });
        const grounding = selection ? await doc('grounding_results', selection.id) : undefined;
        if (grounding)
            summary.publication.verified = grounding.stories.length;
        summary.semantic = { completedReassessments: null, eventsCreatedOrUpdated: null, storylinesCreatedOrUpdated: null, note: 'No stage-to-window execution attribution is invented. Article lineage and operation records show source identity and processing time independently.' };
        summary.retainedFeedFootprint = (await db.prepare("SELECT kind,COUNT(*) AS count FROM v1_feed_documents WHERE feed_id=? AND kind IN ('events','event_versions','storylines','storyline_versions','claim_mentions','semantic_intents','rematch_requests','rematch_attempts') GROUP BY kind").bind(feedId).all<Row>()).results;
        if (tables.has('v1_model_spending_reservations'))
            summary.spending = await db.prepare("SELECT COUNT(*) AS operations,COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE 0 END),0) AS reportedCostUsd,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 THEN MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) ELSE 0 END),0) AS heldExposureUsd,SUM(CASE WHEN COALESCE(s.reported,0)=0 AND r.lease_until<=? THEN 1 ELSE 0 END) AS unknownOperations,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 THEN 1 ELSE 0 END),0) AS unsettledConcurrencySlots FROM v1_feed_documents i CROSS JOIN v1_model_spending_reservations r ON r.id=i.kind||':'||i.id LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE i.feed_id=? AND i.kind IN ('semantic_intents','model_intents','salience_intents') AND r.feed_id=i.feed_id").bind(Date.now(), feedId).first();
        else
            summary.spending = { state: 'NOT_OBSERVABLE', reason: 'Account accounting schema unavailable.' };
        summary.spending.scope = 'ACCOUNT_MAPPED_RETAINED_FEED_OPERATIONS_NOT_WINDOW_COST';
        if (tables.has('v1_model_spending_reservations')) summary.spending.unmappedIntentCount = (await db.prepare("SELECT COUNT(*) AS n FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind IN ('semantic_intents','model_intents','salience_intents') AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r WHERE r.id=d.kind||':'||d.id AND r.feed_id=d.feed_id)").bind(feedId).first<{n:number}>())!.n;
        summary.spending.note = 'Unsettled slots are conservative admission occupancy, not proven active remote executions. Expired leases do not establish termination. Account-mapped totals exclude unmapped historical intents; missing attribution is not zero cost.';
        summary.publication.delivery = safe(await readMany('delivery_jobs','d.id',ids(editions)));
        summary.queue = tables.has('v1_queue_outcomes') ? { scope: 'RETAINED_FEED_DELIVERIES_NOT_WINDOW_EXECUTIONS', outcomes: (await db.prepare('SELECT kind,outcome,reason,COUNT(*) AS deliveries,MAX(observed_at) AS latestAt FROM v1_queue_outcomes WHERE feed_id=? GROUP BY kind,outcome,reason').bind(feedId).all<Row>()).results } : {state:'NOT_OBSERVABLE'};
        if (start && tables.has('v1_model_spending_reservations'))
            summary.windowSpending = { ...await db.prepare("SELECT COUNT(*) AS operations,COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE 0 END),0) AS reportedCostUsd,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 THEN MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) ELSE 0 END),0) AS heldExposureUsd FROM v1_feed_documents i CROSS JOIN v1_model_spending_reservations r ON i.feed_id=r.feed_id AND r.id=i.kind||':'||i.id LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE i.feed_id=? AND i.kind IN ('semantic_intents','model_intents','salience_intents') AND (julianday(json_extract(i.json,'$.input.state.window.start'))=julianday(?) AND julianday(json_extract(i.json,'$.input.state.window.end'))=julianday(?) OR json_extract(i.json,'$.input.state.selectionId')=? OR json_extract(i.json,'$.selectionId')=?)").bind(feedId, start, end, selection?.id ?? '', selection?.id ?? '').first<Row>(), scope: 'EXACT_RECORDED_WINDOW_OR_SELECTION_ONLY', note: 'Shared article semantics and legacy operations lacking this binding are excluded, not treated as zero-cost processing.' };
        items = await docs('correction_obligations');
        const resolutions = await docs('correction_resolutions');
        items = items.filter(ob => !resolutions.some(r => r.obligationId === ob.id));
        const p = page(items.filter(i => i.id > after), items.length, r => r.id);
        items = p.items;
        pagination = p.page;
    }
    else if (o.view === 'candidates') {
        if (!shortlist) {
            lookup = { state: 'NOT_OBSERVABLE', reason: 'No retained shortlist for this window.' };
        }
        else {
            const sql = "SELECT json_extract(c.value,'$.targetVersionId') AS id,c.value AS json,part.value AS shortlistStage FROM v1_feed_documents d,json_each('[\"candidates\",\"overflow\"]') part,json_each(d.json,'$.'||part.value) c WHERE d.feed_id=? AND d.kind='shortlists' AND d.id=?" + (targetId ? " AND (json_extract(c.value,'$.targetVersionId')=? OR json_extract(c.value,'$.stableTargetId')=? OR json_extract(c.value,'$.storylineId')=?)" : '');
            let scoped = targetId ? [targetId, targetId, targetId] : [], candidateWhere = '';
            if (o.evidenceRevisionId) {
                candidateWhere += " AND EXISTS(SELECT 1 FROM json_each(c.value,'$.evidenceRevisionIds') e WHERE e.value=?)";
                scoped.push(o.evidenceRevisionId);
            }
            if (o.sourceId) {
                candidateWhere += " AND EXISTS(SELECT 1 FROM json_each(c.value,'$.evidenceRevisionIds') e JOIN v1_revisions r ON r.id=e.value JOIN v1_intake_scopes src ON src.id=r.feed_source_id WHERE src.feed_id=d.feed_id AND (src.id=? OR src.source_id=?))";
                scoped.push(o.sourceId, o.sourceId);
            }
            const result = await sqlPage(sql + candidateWhere, [feedId, shortlist.id, ...scoped]);
            const pageTargets = result.rows.map(r => r.id), inTargets = pageTargets.map(() => '?').join(','), candidateRecords = await readMany('candidates', "json_extract(d.json,'$.targetVersionId')", pageTargets), recordIds = ids(candidateRecords), ledgerRecords = await readMany('ledger_entries', "json_extract(d.json,'$.candidateId')", recordIds), factBindings = await readMany('ledger_fact_bindings', "json_extract(d.json,'$.candidateId')", recordIds), pendingRecords = await readMany('publication_reconciliations', "json_extract(d.json,'$.targetVersionId')", pageTargets);
            const writerWork = selection ? await doc('publication_work',JSON.stringify([selection.id,'writer-packets-v1'])) : undefined;
            const publicationOperations = selection ? (await db.prepare("SELECT id,kind,json_extract(json,'$.phase') AS phase,json_extract(json,'$.input.kind') AS semanticPhase FROM v1_feed_documents WHERE feed_id=? AND kind IN ('semantic_intents','model_intents') AND (json_extract(json,'$.selectionId')=? OR json_extract(json,'$.input.state.selectionId')=?) ORDER BY id").bind(feedId,selection.id,selection.id).all<Row>()).results : [];
            const draftRecords = selection ? await docs('drafts', "d.id=? OR substr(d.id,1,?)=?", [selection.id, JSON.stringify([selection.id]).length - 1, JSON.stringify([selection.id]).slice(0, -1)]) : [], groundingRecords = await readMany('grounding_results', 'd.id', [...new Set([...ids(draftRecords), ...editions.map(e => e.generation?.verificationId).filter(Boolean)])]), verificationRecords = await readMany('verification_results', 'd.id', ids(draftRecords)), fidelityRecords = await readMany('fidelity_results', 'd.id', ids(draftRecords)), feedbackRecords = selection ? await docs('verification_feedback', "json_extract(d.json,'$.selectionId')=?", [selection.id]) : [];
            for (const row of result.rows) {
                const c = JSON.parse(row.json), judgment = plan?.stories.find((s: Row) => s.targetVersionId === c.targetVersionId), recorded = candidateRecords.filter(r => r.targetVersionId === c.targetVersionId && (!selection || selection.candidateIds.includes(r.id))), candidateIds = ids(recorded), pub = { included: editions.filter(e => e.stories?.some((s: Row) => candidateIds.includes(s.candidateId))), entries: ledgerRecords.filter(e => candidateIds.includes(e.candidateId)) }, accepted = plan?.route === 'GPT' && Boolean(judgment) && !(plan.inputCoverage?.notComparativelyReviewedTargetVersionIds ?? []).includes(c.targetVersionId), pending = pendingRecords.filter(r => r.targetVersionId === c.targetVersionId);
                const written = draftRecords.filter(r => r.draft?.stories?.some((s: Row) => candidateIds.includes(s.candidateId))), verified = groundingRecords.filter(r => r.stories?.some((s: Row) => candidateIds.includes(s.candidateId))), failures = feedbackRecords.flatMap(r => (r.issues ?? r.feedback?.issues ?? []).filter((i: Row) => candidateIds.includes(i.candidateId)).map((i: Row) => ({ ...safe(i), recordId: r.id })));
                items.push({ id: row.id, shortlistStage: row.shortlistStage === 'overflow' ? 'SHORTLIST_OVERFLOW' : 'SHORTLIST_ADMITTED', targetVersionId: c.targetVersionId, stableTargetId: c.stableTargetId, storylineId: c.storylineId, candidateIds, readerHistory: safe((shortlist.ledger ?? []).filter((e: Row) => e.targetVersionId === c.targetVersionId || e.eventIds?.includes(c.stableTargetId) || e.storylineIds?.includes(c.storylineId) || (shortlist.obligations ?? []).some((ob: Row) => c.correctionObligationIds?.includes(ob.id) && ob.ledgerEntryId === e.id))), sourceTitles: c.sourceTitles ?? [], facts: safe(c.facts), flags: c.flags, protectedReasons: c.protectedReasons, correctionObligationIds: c.correctionObligationIds, readerState: c.readerState,cohortJudgments:cohortPlans.flatMap(p=>p.stories.filter((story:Row)=>story.targetVersionId===c.targetVersionId).map((story:Row)=>({planId:p.id,scopeShortlistId:p.shortlistId,route:p.route,modelOperationIds:p.modelOperationIds,decision:story.decision,rationale:story.rationale,globallyAccepted:false}))), relevance: safe(c.ranking), feedInterests: feed.interests, offered: plan?.inputCoverage ? (plan.inputCoverage.offeredTargetVersionIds ?? []).includes(c.targetVersionId) : null, acceptedComparativeJudgment: accepted, globalContextOperationIds: plan?.inputCoverage?.globalContextOperationIds ?? [], modelOperationIds: plan?.modelOperationIds ?? [], planId: plan?.id ?? null, decision: accepted ? judgment.decision : null, recordedDecision: judgment?.decision ?? null, state: accepted ? 'SUCCESS' : judgment?.decision === 'DEFER' ? 'DEFERRED' : 'NOT_OBSERVABLE', rationale: judgment?.rationale ?? null, feedFit: accepted ? judgment.feedFit : null, significance: accepted ? judgment.editorialImportance ?? null : null, selected: candidateIds.some(id => selection?.selectedCandidateIds.includes(id)), published: pub.included.length > 0, currentlyPublished: pub.included.some(e => statusFor(e.id)?.status === 'PUBLISHED'), publicationStatuses: pub.included.map(e => statusFor(e.id) ?? { id: e.id, status: 'NOT_OBSERVABLE' }), readerPresentation: 'NOT_OBSERVABLE', communicated: pub.entries.length > 0, requiredUncommunicatedFactIds: (judgment?.mustIncludeFactIds ?? []).filter((id: string) => !factBindings.some(b => candidateIds.includes(b.candidateId) && b.factId === id)), factCommunicationEvidence: factBindings.filter(b => candidateIds.includes(b.candidateId)).map(b => pick(b, ['id', 'factId', 'editionId', 'ledgerEntryIds'])), factCommunicationNote: 'A ledger sentence proves communication of that sentence, not every mandatory fact. Exact fact bindings are required; missing historical bindings remain unresolved.', writer: { selectedPlan: judgment ? safe(judgment) : null, operationReferences: publicationOperations,operationReferenceScope:'SELECTION',packetInputs:writerWork?.packets?.filter((p:Row)=>p.stories?.some((story:Row)=>candidateIds.includes(story.candidate?.id))).map((p:Row)=>({...p,stories:p.stories.filter((story:Row)=>candidateIds.includes(story.candidate?.id))}))??null,writerWorkId:writerWork?.id??null, state: written.length ? 'SUCCESS' : pending.length ? 'BLOCKED' : 'NOT_OBSERVABLE', draftIds: ids(written) }, verification: { state: verified.length ? 'SUCCESS' : failures.length ? 'FAILED' : 'NOT_OBSERVABLE', groundingRecordIds: ids(verified), semanticResults: verificationRecords.filter(r => written.some(d => d.id === r.id)).map(r => pick(r, ['id', 'supportedClaimIds', 'preservedFactIds', 'novelFactIds', 'addressedCorrectionObligationIds', 'semanticChecks', 'claimEntailment'])), fidelityResults: fidelityRecords.filter(r => written.some(d => d.id === r.id)).map(safe), issues: failures }, lastConfirmedStage: pub.entries.length ? 'LEDGER_COMMUNICATED' : pub.included.length ? 'EDITION_PERSISTED' : verified.length ? 'GROUNDING_ACCEPTED' : written.length ? 'DRAFT_PERSISTED' : candidateIds.some(id => selection?.selectedCandidateIds.includes(id)) ? 'SELECTION_COMMITTED' : accepted ? 'EDITORIAL_JUDGMENT_ACCEPTED' : 'SHORTLIST_RECORDED', firstUnconfirmedStage: pub.entries.length ? 'READER_PRESENTATION' : pub.included.length ? 'LEDGER_PROJECTION' : verified.length ? 'PUBLICATION' : written.length ? 'VERIFICATION' : candidateIds.some(id => selection?.selectedCandidateIds.includes(id)) ? 'WRITING' : accepted ? 'SELECTION' : 'COMPARATIVE_EDITORIAL_JUDGMENT', pendingDelivery: safe(pending), ledgerEntryIds: ids(pub.entries), editionIds: ids(pub.included) });
            }
            const p = page(items, result.total, r => r.id);
            items = p.items;
            pagination = p.page;
        }
    }
    else if (o.view === 'articles') {
        // Include discovery batches that never reached canonical intake. Prefer the
        // immutable intake row when present, then the latest recorded discovery.
        const branches = [`SELECT d.id,d.json,d.feed_source_id,s.source_id,0 AS priority,0 AS sequence FROM v1_inputs d JOIN v1_intake_scopes s ON s.id=d.feed_source_id WHERE s.feed_id=?`], branchParams: any[] = [feedId];
        for (const table of ['connector_provider_batches', 'connector_batches'])
            if (tables.has(table)) {
                branches.push(`SELECT json_extract(ob.value,'$.id') AS id,json_object('observation',json(ob.value),'collectionBatchId',b.batch_key,'discoveryRecordKind','${table}') AS json,b.feed_source_id,COALESCE(s.source_id,b.feed_source_id) AS source_id,1 AS priority,COALESCE(json_extract(b.data,'$.request.coverage.fetchStartSequence'),0) AS sequence FROM ${table} b LEFT JOIN v1_intake_scopes s ON s.id=b.feed_source_id AND s.feed_id=b.feed_id,json_each(b.data,'$.request.observations') ob WHERE b.feed_id=? AND json_extract(ob.value,'$.id') IS NOT NULL`);
                branchParams.push(feedId);
            }
        let where = '1', params: any[] = [];
        if (o.sourceId) {
            where += ' AND (d.feed_source_id=? OR d.source_id=?)';
            params.push(o.sourceId, o.sourceId);
        }
        if (o.url) {
            const url = canonicalUrl(o.url);
            where += " AND (json_extract(d.json,'$.observation.canonicalUrl')=? OR EXISTS(SELECT 1 FROM v1_revisions r WHERE r.feed_source_id=d.feed_source_id AND json_extract(r.json,'$.sourceObservationId')=d.id AND json_extract(r.json,'$.canonicalUrl')=?))";
            params.push(url, url);
        }
        if (o.evidenceRevisionId) {
            where += " AND d.id=(SELECT json_extract(r.json,'$.sourceObservationId') FROM v1_revisions r WHERE r.id=? AND r.feed_source_id=d.feed_source_id)";
            params.push(o.evidenceRevisionId);
        }
        if (start && !o.url && !o.evidenceRevisionId) {
            where += " AND julianday(json_extract(d.json,'$.observation.observedAt'))>=julianday(?) AND julianday(json_extract(d.json,'$.observation.observedAt'))<julianday(?)";
            params.push(start, end);
        }
        if (targetId) {
            where += " AND EXISTS(SELECT 1 FROM v1_revisions r JOIN v1_feed_documents m ON m.feed_id=? AND m.kind='memberships' AND json_extract(m.json,'$.evidenceRevisionId')=r.id JOIN v1_feed_documents ev ON ev.feed_id=m.feed_id AND ev.kind='event_versions' AND ev.id=json_extract(m.json,'$.eventVersionId') WHERE r.feed_source_id=d.feed_source_id AND json_extract(r.json,'$.sourceObservationId')=d.id AND (ev.id=? OR json_extract(ev.json,'$.eventId')=? OR EXISTS(SELECT 1 FROM v1_feed_documents st,json_each(st.json,'$.eventVersionIds') v WHERE st.feed_id=m.feed_id AND st.kind='storyline_versions' AND v.value=ev.id AND (st.id=? OR json_extract(st.json,'$.storylineId')=?))))";
            params.push(feedId, targetId, targetId, targetId, targetId);
        }
        const combined = `SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY id ORDER BY priority,sequence DESC) AS ordinal FROM (${branches.join(' UNION ALL ')})) d WHERE ordinal=1 AND (${where})`;
        const result = await sqlPage(combined, [...branchParams, ...params]);
        for (const row of result.rows) {
            const input = JSON.parse(row.json), obs = input.observation, revisions = await intake('v1_revisions', "json_extract(d.json,'$.sourceObservationId')=?", [row.id]), jobs = await intake('v1_jobs', "json_extract(d.json,'$.observationId')=?", [row.id]), revisionIds = ids(revisions), mentions: Row[] = [], states: Row[] = [], lineage: Row[] = [];
            for (const revision of revisions) {
                mentions.push(...await docs('claim_mentions', "json_extract(d.json,'$.evidenceRevisionId')=?", [revision.id]));
                const props = await docs('propositions', arrayContains('evidenceRevisionIds'), [revision.id]);
                for (const prop of props) {
                    const bindings = await docs('event_semantic_states', arrayContains('propositionIds'), [prop.id]);
                    states.push(...bindings);
                    for (const id of prop.claimMentionIds ?? []) {
                        let l = lineage.find(l => l.claimMentionId === id);
                        if (!l) {
                            l = { claimMentionId: id, eventVersionIds: [] };
                            lineage.push(l);
                        }
                        l.eventVersionIds.push(...bindings.map(b => b.eventVersionId));
                    }
                }
            }
            for (const l of lineage)
                l.eventVersionIds = [...new Set(l.eventVersionIds)];
            const ledger: Row[] = [], published: Row[] = [];
            for (const id of revisionIds) {
                ledger.push(...await docs('ledger_entries', arrayContains('evidenceRevisionIds'), [id]));
                published.push(...await docs('editions', `EXISTS(SELECT 1 FROM json_each(d.json,'$.stories') s,json_each(s.value,'$.claims') c,json_each(c.value,'$.support') ref WHERE json_extract(ref.value,'$.evidenceRevisionId')=?)`, [id]));
            }
            const operationRefs = revisionIds.length ? (await db.prepare(`SELECT d.id,d.kind,json_extract(d.json,'$.input.kind') AS phase,json_extract(d.json,'$.input.model') AS model,json_extract(d.json,'$.status') AS status,json_extract(d.json,'$.failure') AS failure FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind IN ('semantic_intents','semantic_results','semantic_resource_waits') AND EXISTS(SELECT 1 FROM json_each(d.json,'$.input.evidenceRevisionIds') ref WHERE ref.value IN (${revisionIds.map(() => '?').join(',')}))`).bind(feedId, ...revisionIds).all<Row>()).results : [];
            const eventVersions = await readMany('event_versions', 'd.id', [...new Set(states.map(s => s.eventVersionId))]), storylineVersions: Row[] = [];
            for (const ev of eventVersions)
                storylineVersions.push(...await docs('storyline_versions', arrayContains('eventVersionIds'), [ev.id]));
            const revisionMeta = revisions.map(r => ({ ...pick(r, ['id', 'title', 'canonicalUrl', 'representation', 'contentCompleteness', 'publishedAt', 'acceptedAt', 'sourceObservationId', 'acquiredContentId']), textAvailable: typeof r.body === 'string' && r.body.length > 0, textCharacters: r.body?.length ?? null })), acquisitions = jobs.filter(j => j.kind === 'ACQUIRE');
            items.push({ id: row.id, sourceId: row.feed_source_id, url: obs.canonicalUrl ?? null, discovery: { state: 'SUCCESS', recordId: row.id, collectionBatchId: input.collectionBatchId ?? null, recordKind: input.discoveryRecordKind ?? 'v1_inputs', fetchRunId: obs.fetchRunId, observedAt: obs.observedAt }, intake: { state: input.discoveryRecordKind ? 'NOT_OBSERVABLE' : 'SUCCESS', receipt: safe((await intake('v1_intake_receipts', 'd.id=?', [row.id]))[0] ?? null), note: 'An intake row proves a recorded input, not acceptance of every proposal. Inspect the receipt.' }, acquisition: { state: revisions.length ? 'SUCCESS' : state(acquisitions.at(-1)), records: acquisitions.map(j => pick(j, ['id', 'state', 'attempts', 'failureCode', 'nextAttemptAt', 'leaseUntil', 'exhausted'])) }, revisions: revisionMeta, review: jobs.filter(j => j.kind === 'REASSESS').map(j => ({ ...pick(j, ['id', 'state', 'failureCode', 'attempts', 'nextAttemptAt', 'leaseUntil']), diagnosticState: state(j) })), semantic: { operationRefs: safe(operationRefs), eventVersions: safe(eventVersions), storylineVersions: [...new Map(storylineVersions.map(s => [s.id, s])).values()].map(safe), claimMentions: mentions.map(m => pick(m, ['id', 'evidenceRevisionId', 'sourceText', 'span', 'certainty', 'attribution', 'reportingRole'])), claimLineage: lineage, eventStates: [...new Map(states.map(s => [s.eventVersionId, s])).values()].map(s => pick(s, ['eventVersionId', 'structuralRelation', 'epistemicEffects', 'provisional', 'provenance', 'propositionIds', 'storylineState'])) }, editorial: { state: 'NOT_OBSERVABLE', shortlisted: shortlist ? [...shortlist.candidates,...(shortlist.overflow??[])].some((c: Row) => c.evidenceRevisionIds.some((id: string) => revisionIds.includes(id))) : null, note: 'Use candidate view for the recorded window disposition; missing lineage is not model rejection.' }, publication: { editionIds: [...new Set(ids(published))] }, ledger: { entryIds: [...new Set(ids(ledger))] } });
        }
        const p = page(items, result.total, r => r.id);
        items = p.items;
        pagination = p.page;
        if (!result.total)
            lookup = { state: 'NOT_OBSERVABLE', reason: 'No matching recorded observation/acquisition. This does not prove the publisher had no article, or that the model rejected it.' };
    }
    else if (o.view === 'operations') {
        let where = o.evidenceRevisionId ? arrayContains('input.evidenceRevisionIds') : '1', params: any[] = o.evidenceRevisionId ? [o.evidenceRevisionId] : [];
        if (o.recordId) {
            where += ' AND d.id=?';
            params.push(o.recordId);
        }
        if (start) {
            where += " AND (julianday(json_extract(d.json,'$.input.state.window.start'))=julianday(?) AND julianday(json_extract(d.json,'$.input.state.window.end'))=julianday(?) OR json_extract(d.json,'$.input.state.selectionId')=? OR json_extract(d.json,'$.selectionId')=? OR json_extract(d.json,'$.editionId') IN (SELECT e.id FROM v1_feed_documents e WHERE e.feed_id=d.feed_id AND e.kind='editions' AND julianday(json_extract(e.json,'$.windowStart'))=julianday(?) AND julianday(json_extract(e.json,'$.windowEnd'))=julianday(?)))";
            params.push(start, end, selection?.id ?? '', selection?.id ?? '', start, end);
        }
        // Include unpaid waits and retained results without an intent. These are
        // distinct record types; no synthetic paid operation is fabricated for them.
        const sql = `SELECT d.id,d.json,d.kind FROM v1_feed_documents d WHERE d.feed_id=? AND (${where}) AND (d.kind IN ('semantic_intents','model_intents','salience_intents') OR d.kind='semantic_results' AND NOT EXISTS(SELECT 1 FROM v1_feed_documents i WHERE i.feed_id=d.feed_id AND i.kind='semantic_intents' AND i.id=d.id) OR d.kind='semantic_resource_waits' AND NOT EXISTS(SELECT 1 FROM v1_feed_documents i WHERE i.feed_id=d.feed_id AND i.kind='semantic_intents' AND i.id=json_extract(d.json,'$.operationId')))`;
        const result = await sqlPage(sql, [feedId, ...params]);
        const providerReceipts = await readMany('model_provider_receipts', "json_extract(d.json,'$.reservationId')", result.rows.map(row=>row.kind+':'+row.id));
        for (const row of result.rows) {
            const intent = JSON.parse(row.json), legacy = row.kind === 'model_intents', salience = row.kind === 'salience_intents', settled = await doc('semantic_settlements', row.id), answer = await doc(legacy ? 'model_executions' : salience ? 'salience_results' : 'semantic_results', row.id), value = settled?.usage?.reported ? settled : answer ?? (row.kind === 'semantic_results' || row.kind === 'semantic_resource_waits' ? intent : undefined), usage = legacy && answer ? { costUsd: answer.cost, reported: answer.confirmed, tokensIn: answer.tokensIn, tokensOut: answer.tokensOut } : salience ? answer?.result?.usage : value?.usage, reserved = intent.reservedCostUsd ?? intent.reservedCost ?? 0, phase = intent.input?.kind ?? intent.phase ?? (salience ? 'SALIENCE' : 'NOT_OBSERVABLE'), repairs = [...await docs('semantic_intents', "json_extract(d.json,'$.input.state.repair.originalOperationId')=?", [row.id]), ...await docs('semantic_results', "json_extract(d.json,'$.input.state.repair.originalOperationId')=?", [row.id])];
            const money = tables.has('v1_model_spending_reservations') ? await db.prepare('SELECT r.reserved_cost_usd AS reserved,r.lease_until AS leaseUntil,s.cost_usd AS cost,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=? AND r.id=?').bind(feedId, (legacy ? 'model_intents' : salience ? 'salience_intents' : 'semantic_intents') + ':' + row.id).first<Row>() : null;
            const costReported = money ? money.reported === 1 : Boolean(usage?.reported), cost = money?.cost ?? usage?.costUsd, reserve = money?.reserved ?? reserved;
            items.push({ id: row.id, recordKind: row.kind, providerReceipts:providerReceipts.filter(receipt=>receipt.reservationId===row.kind+':'+row.id).map(receipt=>pick(receipt,['id','stage','httpStatus','generationId','requestId','provider','model','createdAt'])), executionCapacity:executionCapacityDiagnostic({accountMapped:Boolean(money),reported:money?.reported===1,leaseUntil:money?.leaseUntil??intent.leaseUntil,calls:usage?.calls,providerDiagnostic:value?.providerDiagnostic}), operationId: intent.operationId ?? row.id, phase, model: intent.input?.model ?? intent.model ?? null, provider: intent.provider ?? answer?.provider ?? 'NOT_OBSERVABLE', state: answer ? state(answer) : value ? state(value) : Date.now() > intent.leaseUntil ? 'UNKNOWN' : 'DEFERRED', settlementState: settled ? state(settled) : 'NOT_OBSERVABLE', modelExecutionState: usage?.calls === 0 ? 'NOT_RUN' : answer ? state(answer) : value ? state(value) : 'UNKNOWN', failure: answer?.failure ?? value?.failure ?? null, admission: value?.admission ? safe(value.admission) : null, providerDiagnostic: value?.providerDiagnostic ? safe(value.providerDiagnostic) : null, validationDiagnostic: value?.validationDiagnostic ? pick(value.validationDiagnostic, ['stage', 'rejection']) : null, evidenceRevisionIds: intent.input?.evidenceRevisionIds ?? null, policyVersion: intent.input?.policyVersion ?? null, windowAttribution: start ? 'RECORDED_WINDOW_OR_SELECTION_ID' : 'FEED_OR_EVIDENCE_OPERATION', selectionId: intent.input?.state?.selectionId ?? null, budgetKey: intent.input?.budgetKey ?? null, repairOperationIds: [...new Set(ids(repairs))], constructionPath: intent.input?.state?.repair ? 'TARGETED_REPAIR' : intent.input?.state?.continuation?.stage ?? 'SINGLE_CALL', reportedCostUsd: costReported ? cost : null, costSource: money ? 'ACCOUNT_SETTLEMENT' : 'OPERATION_USAGE',providerReportedCostUsd:usage?.calls===0?null:value?.providerDiagnostic?.execution==='REJECTED_BEFORE_EXECUTION'?value.providerDiagnostic.reportedCostUsd??null:usage?.reported?usage.costUsd:null,financialConfirmation:usage?.calls===0?'NOT_RUN':value?.providerDiagnostic?.execution==='REJECTED_BEFORE_EXECUTION'?'CONFIRMED_NONEXECUTION':costReported?'CONFIRMED_COST':'UNCONFIRMED',accountSettlementState:money?money.reported===1?'SETTLED':'UNSETTLED':'NOT_OBSERVABLE', reservedExposureUsd: reserve, heldExposureUsd: costReported ? 0 : Math.max(reserve, cost ?? 0), tokensIn: usage?.tokensIn ?? null, tokensOut: usage?.tokensOut ?? null, latencyMs: value?.latencyMs ?? null, reusedResultId: answer?.id && answer.id !== row.id ? answer.id : null, reuseState: 'NOT_OBSERVABLE', resultRecordId: answer?.id ?? settled?.id ?? null });
        }
        const p = page(items, result.total, r => r.id);
        items = p.items;
        pagination = p.page;
    }
    else if (o.view === 'records') {
        if (!diagnosticKinds.includes(o.kind as any))
            throw new HandoffError('INVALID_REQUEST');
        let where = '1', params: any[] = [];
        if (o.targetId) {
            where = "(d.id=? OR json_extract(d.json,'$.targetVersionId')=? OR json_extract(d.json,'$.eventVersionId')=? OR json_extract(d.json,'$.eventId')=? OR json_extract(d.json,'$.storylineId')=?)";
            params = Array(5).fill(o.targetId);
        }
        if (o.recordId) {
            where += ' AND d.id=?';
            params.push(o.recordId);
        }
        if (o.candidateId) {
            where += " AND (json_extract(d.json,'$.candidateId')=? OR EXISTS(SELECT 1 FROM json_each(d.json,'$.draft.stories') s WHERE json_extract(s.value,'$.candidateId')=?) OR EXISTS(SELECT 1 FROM json_each(d.json,'$.issues') i WHERE json_extract(i.value,'$.candidateId')=?) OR EXISTS(SELECT 1 FROM json_each(d.json,'$.stories') s WHERE json_extract(s.value,'$.candidateId')=?))";
            params.push(o.candidateId, o.candidateId, o.candidateId, o.candidateId);
        }
        if (o.evidenceRevisionId) {
            where += ` AND (json_extract(d.json,'$.evidenceRevisionId')=? OR ${arrayContains('evidenceRevisionIds')})`;
            params.push(o.evidenceRevisionId, o.evidenceRevisionId);
        }
        if (start && ['briefing_requests', 'selections', 'shortlists', 'editorial_plans', 'editorial_proposals', 'schedule_observations'].includes(o.kind!)) {
            where += ` AND (${windowWhere})`;
            params.push(...windowParams);
        }
        const result = await sqlPage(`SELECT d.id,d.json FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind=? AND (${where})`, [feedId, o.kind, ...params]);
        items = result.rows.map(r => ({ id: r.id, kind: o.kind, record: safe(JSON.parse(r.json)) }));
        const p = page(items, result.total, r => r.id);
        items = p.items;
        pagination = p.page;
    }
    else {
        // Product configuration exists even for sources never enrolled in V1.
        const table = tables.has('sources');
        if (!table) {
            lookup = { state: 'NOT_OBSERVABLE', reason: 'Product source tables unavailable; scopes do not prove full configuration inventory.' };
            items = scopes.results.map(s => ({ id: s.id, sourceId: s.source_id, enrollment: safe(JSON.parse(s.json)) }));
            const p = page(items.filter(i => i.id > after), items.length, r => r.id);
            items = p.items;
            pagination = p.page;
        }
        else {
            const result = await sqlPage('SELECT id,provider,kind,source_url,enabled,collection_owner FROM sources WHERE briefing_id=?' + (o.sourceId ? ' AND id=?' : ''), [feedId, ...(o.sourceId ? [o.sourceId] : [])]);
            items = await Promise.all(result.rows.map(async (s) => ({ ...s, enrolled: scopes.results.some(r => r.id === s.id), admitted: runtime.admittedSourceIds ? runtime.admittedSourceIds.includes(s.id) : null, collection: await traceSourceCollection(db, feedId, s.id, tables, start ? { start, end } : undefined) })));
            const p = page(items, result.total, r => r.id);
            items = p.items;
            pagination = p.page;
        }
    }
    return safe({ schemaVersion: 'pipeline-trace-v1', editorialContextWindow: shortlist?.window ?? null, feed: pick(feed, ['id', 'ownerId', 'title', 'interests', 'geography', 'revision', 'paused', 'enrollment']), window: start ? { start, end } : null, view: o.view, lookup, summary, items, page: pagination, consistency: { state: 'READ_ONLY_LIVE_VIEW', feedEpoch: feedRow?.epoch ?? null, note: 'Immutable references are stable. Multiple read queries can observe concurrent progress; this is not a transaction snapshot.' }, limitations: ['No record is not proof that a publisher produced no news.', 'Source reporting time is not event time.', 'Discovery outside recorded observations can be unobservable.', 'Push-service acceptance does not prove device delivery or frontend display.', financialNote] });
}
