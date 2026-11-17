import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function formatPipelineTrace(trace) {
    const number = value => value === null || value === undefined ? 'NOT_OBSERVABLE' : String(value);
    const lines = [`Feed: ${trace.feed?.title ?? trace.feed?.id ?? 'NOT_OBSERVABLE'}`, `Feed ID: ${trace.feed?.id ?? 'NOT_OBSERVABLE'}`, `Window: ${trace.window ? trace.window.start + ' -> ' + trace.window.end : 'not specified'}`, `View: ${trace.view}`, `Rows: ${trace.items?.length ?? 0} / ${trace.page?.total ?? 'NOT_OBSERVABLE'}`];
    const s = trace.summary;
    if (s) {
        const request=s.publication?.briefingRequest??s.publication?.request;
        lines.push(`Collection: ${number(s.collection?.enrolledSources)} enrolled sources; ${number(s.collection?.observationsInWindow)} recorded observations.`, `Editorial: ${number(s.editorial?.eligible)} eligible; ${number(s.editorial?.offered)} offered; ${number(s.editorial?.acceptedJudgments)} accepted judgments; ${number(s.editorial?.selected)} SELECT; ${number(s.editorial?.suppressed)} SUPPRESS; ${number(s.editorial?.deferred)} DEFER; ${number(s.editorial?.notComparativelyReviewed)} not comparatively reviewed.`, `Publication: ${number(s.publication?.selected)} selected; ${number(s.publication?.verified)} grounded; ${number(s.publication?.published)} persisted; ${number(s.publication?.communicated)} ledger-communicated; ${number(s.publication?.selectedUncommunicated)} selected but uncommunicated.`, `Request: ${request?.diagnosticState ?? 'NOT_OBSERVABLE'} ${request?.failure ?? request?.reason ?? ''}`, `Model costs (${s.spending?.scope ?? 'NOT_OBSERVABLE'}): reported $${number(s.spending?.reportedCostUsd)}; held $${number(s.spending?.heldExposureUsd)}.`);
        for (const p of s.problems ?? [])
            lines.push(`Problem: ${p.recordId ?? p.stage} | ${p.state} | ${p.reason}`);
    }
    for (const row of trace.items ?? []) {
        lines.push(`\n${row.targetVersionId ?? row.id} | ${row.decision ?? row.state ?? row.acquisition?.state ?? 'NOT_OBSERVABLE'}`);
        if (row.rationale)
            lines.push(`Reason: ${row.rationale}`);
        if (row.lastConfirmedStage)
            lines.push(`Last confirmed: ${row.lastConfirmedStage}; first unconfirmed: ${row.firstUnconfirmedStage}`);
        if (row.failure)
            lines.push(`Failure: ${row.failure}`);
        if (row.phase)
            lines.push(`${row.phase} | ${row.model ?? 'NOT_OBSERVABLE'} | actual $${number(row.reportedCostUsd)} | held $${number(row.heldExposureUsd)}`);
        if (row.url)
            lines.push(`URL: ${row.url}`);
        if (row.pendingDelivery?.length)
            lines.push('Pending delivery: ' + row.pendingDelivery.map(p => p.id + ' ' + p.reason).join('; '));
    }
    if (trace.page?.nextCursor)
        lines.push('More rows exist; use the returned cursor or --all.');
    for (const note of trace.limitations ?? [])
        lines.push('Limitation: ' + note);
    return lines.join('\n');
}
async function main() {
    const args = process.argv.slice(2), get = name => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
    let trace;
    if (get('input'))
        trace = JSON.parse(readFileSync(get('input'), 'utf8'));
    else {
        const origin = new URL(get('origin') ?? 'https://distilled-news-staging.distillednews-platform.workers.dev'), feed = get('feed');
        if (!feed || !process.env.DISTILLED_TRACE_COOKIE)
            throw Error('Provide --feed and an operator session in DISTILLED_TRACE_COOKIE, or --input trace.json. Never put the cookie in command arguments.');
        if (origin.protocol !== 'https:' || origin.username || origin.password)
            throw Error('An HTTPS origin without credentials is required.');
        const url = new URL('/api/admin/briefings/' + encodeURIComponent(feed) + '/pipeline-trace', origin);
        const fields = { view: 'view', 'window-start': 'windowStart', 'window-end': 'windowEnd', 'source': 'sourceId', url: 'url', evidence: 'evidenceRevisionId', target: 'targetId', candidate: 'candidateId', edition: 'editionId', kind: 'kind', record: 'recordId', 'page-size': 'pageSize' };
        for (const [arg, param] of Object.entries(fields))
            if (get(arg))
                url.searchParams.set(param, get(arg));
        const all = args.includes('--all'), items = [], seen = new Set();
        let first;
        do {
            const response = await fetch(url, { headers: { cookie: process.env.DISTILLED_TRACE_COOKIE, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(60000) });
            if (!response.ok)
                throw Error('Trace request failed with HTTP ' + response.status + '; credentials and response body withheld.');
            const page = await response.json();
            first ??= page;
            if (page.feed.id !== first.feed.id || page.page.total !== first.page.total)
                throw Error('Trace changed during pagination; rerun rather than reporting a fabricated snapshot.');
            items.push(...page.items);
            trace = { ...first, items, page: { ...page.page, returned: items.length } };
            if (!all || !page.page.nextCursor)
                break;
            if (seen.has(page.page.nextCursor))
                throw Error('Repeated pagination cursor');
            seen.add(page.page.nextCursor);
            url.searchParams.set('cursor', page.page.nextCursor);
        } while (true);
    }
    process.stdout.write(args.includes('--json') ? JSON.stringify(trace, null, 2) + '\n' : formatPipelineTrace(trace) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
