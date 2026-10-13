import { beforeAll, afterAll, it, expect } from 'vitest';
import { createIntakeDatabase, seedIntakeScope } from '../v1-intake/test-utils';
import { V1IntakeStore } from '../v1-intake/store';
import { V1FeedStore } from './store';
import { feedFixture } from './test-utils';
import { readPipelineTrace, sanitizeTraceRecord } from './pipeline-trace';
let ctx: Awaited<ReturnType<typeof createIntakeDatabase>>;
const start = '2026-10-03T12:00:00Z', end = '2026-10-03T14:00:00Z';
const options = { windowStart: start, windowEnd: end };
beforeAll(async () => {
    ctx = await createIntakeDatabase();
    await seedIntakeScope(new V1IntakeStore(ctx.db));
    await new V1FeedStore(ctx.db).registerFeed(feedFixture);
    const docs: any[] = [];
    const put = (kind: string, id: string, value: any) => docs.push(ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind, id, 'feed-1', JSON.stringify({ id, feedId: 'feed-1', ...value })));
    const facts = [{ id: 'fact-a', text: 'Officials approved a policy.', evidenceRevisionIds: ['rev-a'], claimMentionIds: ['mention-a'] }];
    const candidates = Array.from({ length: 125 }, (_, i) => ({ targetVersionId: 'version-' + i, stableTargetId: 'event-' + i, targetType: 'EVENT', facts: i ? [] : facts, evidenceRevisionIds: i ? [] : ['rev-a'], eventVersionIds: ['version-' + i], flags: [], readerState: 'UNSEEN', protectedReasons: [], correctionObligationIds: [], ranking: { source: 'JEV', relevance: 1, operationId: 'rank-op' } }));
    put('shortlists', 'shortlist', { window: { start, end }, candidates: candidates.slice(0, 124), overflow: candidates.slice(124), ledger: [], obligations: [] });
    put('editorial_plans', 'plan', { shortlistId: 'shortlist', window: { start, end }, route: 'GPT', modelOperationIds: ['planner-op'], inputCoverage: { offeredTargetVersionIds: ['version-0', 'version-1', 'version-2'], notComparativelyReviewedTargetVersionIds: candidates.slice(3).map(c => c.targetVersionId), globalContextOperationIds: ['global-op'] }, stories: [{ targetVersionId: 'version-0', decision: 'SELECT', mustIncludeFactIds: ['fact-a', 'still-uncommunicated'], rationale: 'Supported policy development.', editorialImportance: .9, feedFit: 'DIRECT' }, { targetVersionId: 'version-1', decision: 'SUPPRESS', rationale: 'Outside this Feed interests.', feedFit: 'OUT_OF_SCOPE' }, { targetVersionId: 'version-2', decision: 'SELECT', mustIncludeFactIds: ['fact-b'], rationale: 'Independent development.' }, { targetVersionId: 'version-3', decision: 'DEFER', rationale: 'EDITORIAL_PROCESSING_PENDING' }] });
    put('candidates', 'candidate-a', { targetVersionId: 'version-0' });
    put('candidates', 'candidate-b', { targetVersionId: 'version-2' });
    put('selections', 'selection', { window: { start, end }, editorialPlanId: 'plan', candidateIds: ['candidate-a', 'candidate-b'], selectedCandidateIds: ['candidate-a', 'candidate-b'], omitted: [] });
    put('briefing_requests', 'request', { window: { start, end }, state: 'DONE', result: 'PUBLISHED', attempts: 1 });
    put('drafts', 'selection', { draft: { stories: [{ candidateId: 'candidate-a', claims: [{ text: 'Officials approved a policy.', support: [{ evidenceRevisionId: 'rev-a', quote: 'Officials approved a policy.' }] }] }] } });
    put('grounding_results', 'selection', { stories: [{ candidateId: 'candidate-a', claims: [{ id: 'claim-a' }] }] });
    put('verification_feedback', 'feedback', { selectionId: 'selection', issues: [{ candidateId: 'candidate-b', code: 'MISSING_REQUIRED_FACT', factId: 'fact-b' }] });
    put('publication_reconciliations', 'pending', { selectionId: 'selection', candidateId: 'candidate-b', targetVersionId: 'version-2', state: 'SELECTED_UNCOMMUNICATED', requiredFactIds: ['fact-b'], reason: 'WRITER_MODEL_CONTEXT_WAIT' });
    put('editions', 'edition', { selectionId: 'selection', windowStart: start, windowEnd: end, createdAt: end, stories: [{ candidateId: 'candidate-a', claims: [{ id: 'claim-a', text: 'Officials approved a policy.', support: [{ evidenceRevisionId: 'rev-a', quote: 'Officials approved a policy.' }] }] }], generation: { verificationId: 'selection' } });
    put('publication_status', 'edition', { status: 'PUBLISHED' });
    put('ledger_fact_bindings', 'fact-binding-a', { candidateId: 'candidate-a', editionId: 'edition', factId: 'fact-a', ledgerEntryIds: ['ledger-a'] });
    put('ledger_entries', 'ledger-a', { editionId: 'edition', candidateId: 'candidate-a', claimText: 'Officials approved a policy.', claimFacts: ['Officials approved a policy.'], evidenceRevisionIds: ['rev-a'] });
    put('memberships', 'member-a', { eventVersionId: 'version-0', evidenceRevisionId: 'rev-a' });
    put('event_versions', 'version-0', { eventId: 'event-0', state: 'Officials approved a policy.' });
    put('event_versions', 'version-other', { eventId: 'event-other', state: 'A separate airport development.' });
    put('claim_mentions', 'mention-a', { evidenceRevisionId: 'rev-a', sourceText: 'Officials approved a policy.', span: { field: 'body', start: 0, end: 27 } });
    put('claim_mentions', 'mention-b', { evidenceRevisionId: 'rev-a', sourceText: 'The airport reopened.', span: { field: 'body', start: 28, end: 49 } });
    put('propositions', 'prop-a', { claimMentionIds: ['mention-a'], evidenceRevisionIds: ['rev-a'], text: 'Officials approved a policy.' });
    put('propositions', 'prop-b', { claimMentionIds: ['mention-b'], evidenceRevisionIds: ['rev-a'], text: 'The airport reopened.' });
    put('event_semantic_states', 'version-0', { eventVersionId: 'version-0', propositionIds: ['prop-a'], provisional: false });
    put('event_semantic_states', 'version-other', { eventVersionId: 'version-other', propositionIds: ['prop-b'], provisional: false });
    put('semantic_intents', 'construct-op', { input: { kind: 'SEMANTIC_CONSTRUCTION', evidenceRevisionIds: ['rev-a'], model: 'fixture', state: { secret: 'never expose prompts' } }, reservedCostUsd: .02, leaseUntil: 0, token: 'secret-owner' });
    put('semantic_results', 'construct-op', { input: { kind: 'SEMANTIC_CONSTRUCTION', evidenceRevisionIds: ['rev-a'], model: 'fixture' }, status: 'DEFERRED', failure: 'SEMANTIC_CONSTRUCTION_REJECTED', validationDiagnostic: { stage: 'CONSTRUCTION_BINDING', rejection: { code: 'SCOPE_DENIED' }, response: {unvalidated:'unvalidated-prompt-sentinel'} }, usage: { calls: 1, costUsd: .001, reported: true }, latencyMs: 250 });
    put('semantic_intents', 'unknown-op', { input: { kind: 'RELATION', evidenceRevisionIds: ['rev-a'], model: 'fixture' }, reservedCostUsd: .02, leaseUntil: 0, token: 'secret-owner' });
    put('semantic_results', 'unknown-op', { input: { kind: 'RELATION', evidenceRevisionIds: ['rev-a'], model: 'fixture' }, status: 'DEFERRED', failure: 'SEMANTIC_OUTCOME_UNKNOWN', usage: { calls: 1, costUsd: .02, reported: false } });
    put('semantic_results', 'repair-op', { input: { kind: 'SEMANTIC_CONSTRUCTION', evidenceRevisionIds: ['rev-a'], model: 'fixture', state: { repair: { originalOperationId: 'construct-op' } } }, status: 'SUCCEEDED', usage: { calls: 1, costUsd: .001, reported: true } });
    put('semantic_resource_waits', 'unpaid-wait', { operationId: 'not-started', input: { kind: 'COMPARATIVE_EDITORIAL_PLAN', evidenceRevisionIds: ['rev-a'], model: 'fixture' }, failure: 'ACCOUNT_AUTHORIZATION_REQUIRED', usage: { calls: 0, costUsd: 0, reported: true }, category: 'ACCOUNT_AUTHORIZATION' });
    await ctx.db.batch(docs);
    await ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind('semantic_intents:construct-op','test-only-account','test-only-grant','test-owner','fixture','feed-1',.02,0,start,'{}').run();
    await ctx.db.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,?,?,?)').bind('semantic_intents:construct-op','test-owner',.001,1).run();
    await ctx.db.exec('CREATE TABLE connector_provider_batches(feed_id TEXT,feed_source_id TEXT,batch_key TEXT,data TEXT,receipts TEXT);');
    await ctx.db.prepare('INSERT INTO connector_provider_batches VALUES(?,?,?,?,?)').bind('feed-1', 'feed-source-1', 'raw-batch', JSON.stringify({ providerId: 'fixture', request: { coverage: { fetchStartSequence: 1 }, observations: [{ id: 'raw-observation', canonicalUrl: 'https://publisher.example/discovered-only', observedAt: start }], proposals: [] } }), null).run();
    await ctx.db.batch([
        ctx.db.prepare('INSERT INTO v1_inputs VALUES(?,?,?,?)').bind('obs-a', 'feed-source-1', 'article-a', JSON.stringify({ observation: { id: 'obs-a', canonicalUrl: 'https://publisher.example/a', observedAt: start, fetchRunId: 'fetch-a' } })),
        ctx.db.prepare('INSERT INTO v1_inputs VALUES(?,?,?,?)').bind('obs-missing', 'feed-source-1', 'article-b', JSON.stringify({ observation: { id: 'obs-missing', canonicalUrl: 'https://publisher.example/b', observedAt: start } })),
        ctx.db.prepare('INSERT INTO v1_revisions VALUES(?,?,?,?)').bind('rev-a', 'feed-source-1', 'article-a', JSON.stringify({ id: 'rev-a', feedId: 'feed-1', evidenceId: 'evidence-a', revision: 1, sourceObservationId: 'obs-a', title: 'Policy and airport', body: 'Officials approved a policy. The airport reopened.', acceptedAt: start, publishedAt: '2026-10-02T00:00:00Z', representation: 'ARTICLE_EXCERPT', contentCompleteness: 'PARTIAL' })),
        ctx.db.prepare('INSERT INTO v1_jobs VALUES(?,?,?,?)').bind('acquire-b', 'feed-source-1', 'article-b', JSON.stringify({ id: 'acquire-b', observationId: 'obs-missing', kind: 'ACQUIRE', state: 'FAILED', failureCode: 'EXTRACTION_FAILED', attempts: 5 }))
    ]);
}, 30000);
afterAll(async () => ctx.dispose());
it('traces a retained article through publication and actual ledger communication', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'articles', evidenceRevisionId: 'rev-a' }); expect(r.items[0]).toMatchObject({ id: 'obs-a', acquisition: { state: 'SUCCESS' }, publication: { editionIds: ['edition'] }, ledger: { entryIds: ['ledger-a'] } }); });
it('discovery without acquisition is not editorial rejection', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'articles', url: 'https://publisher.example/b' }); expect(r.items[0]).toMatchObject({ acquisition: { state: 'FAILED', records: [{ id: 'acquire-b', failureCode: 'EXTRACTION_FAILED' }] }, editorial: { state: 'NOT_OBSERVABLE' } }); });
it('no recorded URL match never proves provider omission or editorial rejection', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'articles', url: 'https://publisher.example/never-observed' }); expect(r.page.total).toBe(0); expect(r.lookup.state).toBe('NOT_OBSERVABLE'); });
it('claims in one document have exact independent Event lineage', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'articles', evidenceRevisionId: 'rev-a' }); expect(r.items[0].semantic.claimLineage).toEqual(expect.arrayContaining([{ claimMentionId: 'mention-a', eventVersionIds: ['version-0'] }, { claimMentionId: 'mention-b', eventVersionIds: ['version-other'] }])); });
it('rejected construction exposes its repair and original operation', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'operations', evidenceRevisionId: 'rev-a' }); expect(r.items.find((i: any) => i.id === 'construct-op')).toMatchObject({ state: 'FAILED', failure: 'SEMANTIC_CONSTRUCTION_REJECTED', repairOperationIds: ['repair-op'] }); });
it('never offered work has unresolved status, not model irrelevance', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-3' }); expect(r.items[0]).toMatchObject({ offered: false, acceptedComparativeJudgment: false, decision: null, state: 'DEFERRED' }); });
it('accepted model omission exposes exact Feed fit and rationale', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-1' }); expect(r.items[0]).toMatchObject({ offered: true, acceptedComparativeJudgment: true, decision: 'SUPPRESS', rationale: 'Outside this Feed interests.', feedFit: 'OUT_OF_SCOPE' }); });
it('selected but failed or pending verification is not communicated', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-2' }); expect(r.items[0]).toMatchObject({ selected: true, published: false, communicated: false, requiredUncommunicatedFactIds: ['fact-b'] }); });
it('partial publication separates selected and communicated counts', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', options); expect(r.summary!.publication).toMatchObject({ selected: 2, published: 1, communicated: 1, selectedUncommunicated: 1 }); });
it('UNKNOWN exposure is held, never reported actual spend; prompts and tokens omitted', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'operations', evidenceRevisionId: 'rev-a' }); expect(r.items.find((i: any) => i.id === 'unknown-op')).toMatchObject({ state: 'UNKNOWN', reportedCostUsd: null, heldExposureUsd: .02 }); expect(JSON.stringify(r)).not.toContain('secret-owner'); expect(JSON.stringify(r)).not.toContain('never expose prompts'); });
it('pagination traces all 125 candidates with no hidden report truncation', async () => { let cursor: string | undefined; const ids: string[] = []; do {
    const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', pageSize: 30, cursor });
    expect(r.page.total).toBe(125);
    ids.push(...r.items.map((i: any) => i.targetVersionId));
    cursor = r.page.nextCursor ?? undefined;
} while (cursor); expect(new Set(ids).size).toBe(125); });
it('read-only requests preserve the database and cross-Feed IDs cannot leak', async () => { const before = await ctx.db.prepare('SELECT SUM(length(json)) AS bytes,COUNT(*) AS count FROM v1_feed_documents').first(); await readPipelineTrace(ctx.db, 'feed-1', options); await readPipelineTrace(ctx.db, 'feed-1', options); expect(await ctx.db.prepare('SELECT SUM(length(json)) AS bytes,COUNT(*) AS count FROM v1_feed_documents').first()).toEqual(before); await expect(readPipelineTrace(ctx.db, 'feed-1', { view: 'articles', sourceId: 'another-feed-source' })).rejects.toMatchObject({ code: 'SCOPE_DENIED' }); });
it('unpaid authorization waits are visible without inventing a provider call or charge', async () => {
    const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'operations', evidenceRevisionId: 'rev-a' });
    expect(r.items.find((i: any) => i.id === 'unpaid-wait')).toMatchObject({ state: 'BLOCKED', modelExecutionState: 'NOT_RUN', reportedCostUsd: 0, heldExposureUsd: 0 });
});
it('overflow candidates remain inspectable and are never labeled model-rejected', async () => {
    const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-124' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ shortlistStage: 'SHORTLIST_OVERFLOW', acceptedComparativeJudgment: false, decision: null });
});
it('cursor ownership cannot be changed to another Feed or filter', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', pageSize: 2 }); await expect(readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-1', cursor: r.page.nextCursor })).rejects.toMatchObject({ code: 'INVALID_REQUEST' }); });
it('withdrawn historical editions remain traceable without claiming current reader visibility', async () => {
    const previous = await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='publication_status' AND id='edition'").first<{
        json: string;
    }>();
    try {
        await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status' AND id='edition'").run();
        const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-0' });
        expect(r.items[0]).toMatchObject({ published: true, currentlyPublished: false, readerPresentation: 'NOT_OBSERVABLE', communicated: true });
    }
    finally {
        await ctx.db.prepare("UPDATE v1_feed_documents SET json=? WHERE kind='publication_status' AND id='edition'").bind(previous!.json).run();
    }
});
it('raw discovery without accepted intake remains visible and is not model rejection', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'articles', url: 'https://publisher.example/discovered-only' }); expect(r.page.total).toBe(1); expect(r.items[0]).toMatchObject({ id: 'raw-observation', discovery: { state: 'SUCCESS', collectionBatchId: 'raw-batch' }, intake: { state: 'NOT_OBSERVABLE' }, acquisition: { state: 'NOT_OBSERVABLE' }, editorial: { state: 'NOT_OBSERVABLE' } }); });
it('one communicated sentence does not prove all required facts were communicated', async () => {
 const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', targetId: 'version-0' });
 expect(r.items[0]).toMatchObject({ communicated: true, requiredUncommunicatedFactIds: ['still-uncommunicated'] });
});
it('source, evidence and candidate filters retain their exact owned lineage', async () => { const r = await readPipelineTrace(ctx.db, 'feed-1', { ...options, view: 'candidates', sourceId: 'feed-source-1', evidenceRevisionId: 'rev-a', candidateId: 'candidate-a' }); expect(r.items.map(i => i.targetVersionId)).toEqual(['version-0']); const article = await readPipelineTrace(ctx.db, 'feed-1', { view: 'articles', targetId: 'event-0' }); expect(article.items.map(i => i.id)).toEqual(['obs-a']); });
it('a late financial settlement never reports an UNKNOWN canonical result usable', async () => {
    try {
        await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('semantic_settlements', 'unknown-op', 'feed-1', JSON.stringify({ id: 'unknown-op', status: 'SUCCEEDED', usage: { calls: 1, costUsd: .001, reported: true } })).run();
        const r = await readPipelineTrace(ctx.db, 'feed-1', { view: 'operations', recordId: 'unknown-op' });
        expect(r.items[0]).toMatchObject({ state: 'UNKNOWN', modelExecutionState: 'UNKNOWN', reportedCostUsd: .001, heldExposureUsd: 0, settlementState: 'SUCCESS' });
    }
    finally {
        await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='semantic_settlements' AND id='unknown-op'").run();
    }
});

it('account-mapped costs are counted once and unmapped history is explicit',async()=>{
 const r=await readPipelineTrace(ctx.db,'feed-1',options);expect(r.summary!.spending).toMatchObject({reportedCostUsd:.001,unmappedIntentCount:1,scope:'ACCOUNT_MAPPED_RETAINED_FEED_OPERATIONS_NOT_WINDOW_COST'});expect(r.summary!.windowSpending).toMatchObject({reportedCostUsd:0,scope:'EXACT_RECORDED_WINDOW_OR_SELECTION_ONLY'});
});
it('sanitizes nested credentials and URL credentials without erasing diagnostic state',()=>{
 expect(sanitizeTraceRecord({state:'FAILED',Headers:{Authorization:'not-for-output'},REFRESH_TOKEN:'not-for-output',url:'https://name:password@publisher.example/a?token=not-for-output'})).toEqual({state:'FAILED',url:'https://publisher.example/a?token=REDACTED'});
});

it('an edition cannot be attributed to a conflicting requested window',async()=>{
 await expect(readPipelineTrace(ctx.db,'feed-1',{editionId:'edition',windowStart:'2026-10-03T14:00:00Z',windowEnd:'2026-10-03T16:00:00Z'})).rejects.toMatchObject({code:'INVALID_REQUEST'});
});

it('record diagnostics withhold unvalidated provider responses',async()=>{
 const r=await readPipelineTrace(ctx.db,'feed-1',{view:'records',kind:'semantic_results',recordId:'construct-op'});expect(JSON.stringify(r)).not.toContain('unvalidated-prompt-sentinel');expect(r.items[0].record.validationDiagnostic).toMatchObject({stage:'CONSTRUCTION_BINDING',rejection:{code:'SCOPE_DENIED'}});
});
it('candidate-filtered feedback does not require a target field absent from its schema',async()=>{
 const r=await readPipelineTrace(ctx.db,'feed-1',{view:'records',kind:'verification_feedback',candidateId:'candidate-b'});expect(r.items.map(i=>i.id)).toEqual(['feedback']);
});

it('same-window context follows computation time, never opaque identity ordering',async()=>{
 const original=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='selections' AND id='selection'").first<{json:string}>();const base=JSON.parse(original!.json),oldId='z-earlier-selection',newId='a-later-selection';
 try{
 const oldPlan=JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='editorial_plans' AND id='plan'").first<{json:string}>())!.json);oldPlan.id='z-old-plan';oldPlan.route='DETERMINISTIC_FALLBACK';oldPlan.createdAt=start;
 await ctx.db.batch([ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('editorial_plans',oldPlan.id,'feed-1',JSON.stringify(oldPlan)),...[[oldId,'2026-10-03T13:00:00Z',oldPlan.id],[newId,'2026-10-03T13:30:00Z','plan']].map(([id,computedAt,editorialPlanId])=>ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('selections',id,'feed-1',JSON.stringify({...base,id,computedAt,editorialPlanId}))) ]);
 const r=await readPipelineTrace(ctx.db,'feed-1',options);expect(r.summary!.editorial.planId).toBe('plan');expect(r.summary!.editorial.acceptedJudgments).toBe(3);
 }finally{await ctx.db.batch([ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='selections' AND id IN (?,?)").bind(oldId,newId),ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='editorial_plans' AND id='z-old-plan'")])}
});

it('accepted child cohorts cannot hide the full parent pool while global work is pending',async()=>{
 const parent=JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='shortlists' AND id='shortlist'").first<{json:string}>())!.json);parent.id='parent-pending';parent.window={start:'2026-10-03T16:00:00Z',end:'2026-10-03T18:00:00Z'};parent.createdAt='2026-10-03T17:00:00Z';
 const child={...parent,id:'child-pending',candidates:parent.candidates.slice(0,1),overflow:[]};const childPlan={id:'child-plan',feedId:'feed-1',shortlistId:child.id,window:parent.window,createdAt:'2026-10-03T17:30:00Z',route:'GPT',stories:[]};
 const records=[['shortlists',parent.id,parent],['shortlists',child.id,child],['editorial_processing_work','pending-cohorts',{id:'pending-cohorts',shortlistId:parent.id,cohorts:[child]}],['editorial_plans',childPlan.id,childPlan]] as const;
 try{await ctx.db.batch(records.map(([kind,id,value])=>ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind,id,'feed-1',JSON.stringify(value))));const r=await readPipelineTrace(ctx.db,'feed-1',{windowStart:parent.window.start,windowEnd:parent.window.end,view:'candidates'});expect(r.page.total).toBe(125);expect(r.items[0].acceptedComparativeJudgment).toBe(false)}finally{await ctx.db.batch(records.map(([kind,id])=>ctx.db.prepare('DELETE FROM v1_feed_documents WHERE kind=? AND id=?').bind(kind,id)))}
});

it('equivalent UTC timestamp representations locate the same persisted window',async()=>{
 const normalized={windowStart:'2026-10-03T12:00:00.000Z',windowEnd:'2026-10-03T14:00:00.000Z'};
 const r=await readPipelineTrace(ctx.db,'feed-1',{...normalized,editionId:'edition'});expect(r.summary!.publication).toMatchObject({selected:2,published:1});
 const candidates=await readPipelineTrace(ctx.db,'feed-1',{...normalized,view:'candidates'});expect(candidates.page.total).toBe(125);
});

it('unpaid provider-schema rejection exposes admission metrics without a fabricated provider cost',async()=>{
 const id='schema-admission-wait',record={id,feedId:'feed-1',operationId:'never-called',input:{kind:'COMPARATIVE_EDITORIAL_PLAN',model:'openai/gpt-4.1-mini',state:{}},status:'DEFERRED',failure:'SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED',usage:{calls:0,costUsd:0,reported:true},admission:{fits:false,reason:'MODEL_SCHEMA_CONTINUATION_REQUIRED',schemaAdmission:{enumValues:1001,violations:['ENUM_COUNT']}}};
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_resource_waits',?,'feed-1',?)").bind(id,JSON.stringify(record)).run();
 const response=await readPipelineTrace(ctx.db,'feed-1',{view:'operations',recordId:id});
 expect(response.items[0]).toMatchObject({modelExecutionState:'NOT_RUN',providerReportedCostUsd:null,financialConfirmation:'NOT_RUN',admission:{schemaAdmission:{enumValues:1001,violations:['ENUM_COUNT']}}});
});
