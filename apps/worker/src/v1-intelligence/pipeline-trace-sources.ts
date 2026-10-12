type Row = Record<string, any>;
/** SELECT-only metadata reads; missing connector tables are explicit, not zero polls. */
export async function traceSourceCollection(db: D1Database, feedId: string, sourceId: string, tables: Set<string>, window?: {
    start: string;
    end: string;
}) {
    const jobs: Row[] = [], batches: Row[] = [], attempts: Row[] = [];
    const reads: {
        kind: string;
        statement: D1PreparedStatement;
    }[] = [];
    for (const table of ['connector_provider_poll_jobs', 'connector_rss_poll_jobs'])
        if (tables.has(table))
            reads.push({ kind: 'jobs', statement: db.prepare(`SELECT job_id AS id,state,due_at AS dueAt,lease_until AS leaseUntil,attempts,last_error AS lastError${table === 'connector_provider_poll_jobs' ? ',provider_order AS providerOrder' : ''} FROM ${table} WHERE json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=? ORDER BY due_at DESC LIMIT 1`).bind(feedId, sourceId) });
    for (const table of ['connector_provider_batches', 'connector_batches'])
        if (tables.has(table))
            reads.push({ kind: 'batches', statement: db.prepare(`SELECT batch_key AS id,json_extract(data,'$.providerId') AS provider,json_extract(data,'$.request.coverage') AS coverage,json_array_length(json_extract(data,'$.request.observations')) AS observations,json_array_length(json_extract(data,'$.request.proposals')) AS proposals,receipts IS NOT NULL AS accepted FROM ${table} WHERE feed_id=? AND feed_source_id=? ORDER BY json_extract(data,'$.request.coverage.fetchStartSequence') DESC LIMIT 1`).bind(feedId, sourceId) });
    if (tables.has('connector_provider_attempts'))
        reads.push({ kind: 'attempts', statement: db.prepare("SELECT run_id AS id,json_extract(data,'$.providerId') AS provider,json_extract(data,'$.failure') AS failure,json_extract(data,'$.sequence') AS sequence FROM connector_provider_attempts WHERE feed_id=? AND feed_source_id=? ORDER BY json_extract(data,'$.sequence') DESC LIMIT 1").bind(feedId, sourceId) });
    if (tables.has('connector_fetch_runs'))
        reads.push({ kind: 'runs', statement: db.prepare('SELECT run_id AS id,started_at AS startedAt,sequence FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=? ORDER BY sequence DESC LIMIT 1').bind(feedId, sourceId) });
    const results = reads.length ? await db.batch<Row>(reads.map(r => r.statement)) : [];
    let run: Row | undefined;
    results.forEach((r, i) => { if (reads[i].kind === 'jobs')
        jobs.push(...r.results);
    else if (reads[i].kind === 'batches')
        batches.push(...r.results);
    else if (reads[i].kind === 'attempts')
        attempts.push(...r.results);
    else
        run = r.results[0]; });
    const count = async (table: string, path?: string) => { const condition = window && path ? ` AND julianday(json_extract(d.json,'$.${path}'))>=julianday(?) AND julianday(json_extract(d.json,'$.${path}'))<julianday(?)` : ''; return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} d WHERE d.feed_source_id=?${condition}`).bind(sourceId, ...(condition ? [window!.start, window!.end] : [])).first<{
        n: number;
    }>())!.n; };
    const observed = await count('v1_inputs', 'observation.observedAt'), acquired = await count('v1_revisions', 'acceptedAt'), jobsCounts = await db.prepare("SELECT json_extract(json,'$.kind') AS kind,json_extract(json,'$.state') AS state,COUNT(*) AS count FROM v1_jobs WHERE feed_source_id=? GROUP BY kind,state").bind(sourceId).all<Row>();
    return { scope: window ? 'WINDOW_OBSERVATIONS_AND_REVISION_ACCEPTANCE' : 'RETAINED_HISTORY', lastRun: run ?? null, lastPollJobs: jobs, lastBatches: batches.map(b => ({ ...b, coverage: b.coverage ? JSON.parse(b.coverage) : null })), lastProviderAttempt: attempts[0] ?? null, pollingState: batches.some(b => b.accepted) ? 'SUCCESS' : jobs.some(j => /AUTH|BUDGET|CREDENTIAL|CONFIG/.test(j.lastError ?? '')) ? 'BLOCKED' : jobs.some(j => j.state === 'FAILED') ? 'FAILED' : run || batches.length ? 'DEFERRED' : 'NOT_OBSERVABLE', lastConfirmedStage: batches.some(b => b.accepted) ? 'INTAKE_RECEIPTED' : batches.length ? 'OBSERVATIONS_SAVED' : run ? 'FETCH_RUN_ALLOCATED' : 'NOT_OBSERVABLE', observedItems: observed, evidenceRevisions: acquired, jobCounts: jobsCounts.results, countsNote: 'Revision count is not distinct-article count. Job counts are current retained states, not restricted to the window. Connector metadata is last known, not a full window poll inventory.', unavailableConnectorTables: ['connector_fetch_runs', 'connector_provider_batches', 'connector_batches', 'connector_provider_attempts'].filter(t => !tables.has(t)) };
}
