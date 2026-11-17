# V3 bounded history and diagnostic storage

## Outcome

Runtime commit cea9e58 is deployed only to distilled-news-staging as version 0b529271-161c-4a20-8c57-b8b65104a5cd. V3 preparation no longer retrieves unrelated retained result payloads to determine carry-over evidence. Existing unpaid diagnostic archival is enabled with bounded scheduled work. No prompt, model, source collection, financial authorization, historical hold or frontend behavior changed.

This addresses measured database waste; it does not qualify 1,000 simultaneously active feeds or establish the cause of every earlier database reset.

## Changes and correctness

Migration 0080 adds a derived per-feed/per-evidence carry index. Atomic result-insert/delete triggers maintain it; new feeds start ready and old feeds retain the original full-history fallback until resumable backfill completes. Lookups consider current revision IDs and use a partial positive-carry index to avoid scanning resolved-only history. Version checks reject changed snapshots across query pages. Exact original carry ordering and same-result precedence are preserved.

The backfill completed on all 33 existing feeds, indexing 1,576 retained results without modifying canonical results. A subsequent read-only audit compared the original complete result fold with the derived fold across all 33 feeds: 1,578 results, all stable versions and identical carried-ID sets, including one genuinely carried revision. Concurrent normal automation explains the two additional results after backfill. Offline tests also compare the entire prepared input and fingerprint, not merely the carried-ID count.

Existing storage maintenance was disabled in staging. It now archives at most five unpaid diagnostic records per scheduled sweep, checking a five-second budget between records. This is a best-effort diagnostic-loop budget, not a hard total maintenance timeout: in-flight R2 work, cache cleanup and bounded transport cleanup can exceed it. Manual callers retain their existing limits.

Only eligible zero-call, zero-cost, reported deferred diagnostics are compacted after exact R2 write/read verification. Original acquired articles and paid-operation payloads are not rewritten. A confirmed existing race could recreate a diagnostic deleted during archival; atomic conditional replacement now preserves concurrent deletion or modification. Failure tests cover R2 writes/read-back, database rollback and interrupted progress.

## Measurements

Identical synthetic local workloads retain one unresolved old article while unrelated history grows. At 5,000 historical results, preparation fell from 5,010 returned rows / 42,075,733 payload bytes to 19 rows / 1,873 bytes. The final single-sample timings were approximately 1,666 ms versus 164 ms. At zero history the indexed path has modest extra bookkeeping: 18 versus ten rows. These are local replay measurements, not Cloudflare latency guarantees or inference speedups. The complete prepared input and fingerprint remained equal.

The first recorded live archival checkpoint compacted 12 diagnostics, offloading 10,157,790 logical bytes. One 864,703-byte original became a 9,171-byte D1 record. An independent R2 download matched the complete saved original byte-for-byte and by SHA-256. Allocation reported by D1 need not shrink when pages become reusable; no physical-space reclamation claim is made.

All 25 ordinary staging GET probes succeeded. Five samples per route yielded session p50/p95 98/222 ms; English feed 702/953 ms; Arabic feed 622/710 ms. These are small smoke samples, not sustained-load distributions. Frontend assets matched the preserved live build exactly; queues, secrets and model settings remained unchanged. Signed-out summary invocation returned 401 without inference.

## Validation and boundaries

54 focused tests passed across seven files, including V3 source integration, window preparation, publication history, provider limits, carry equivalence/scaling and storage failure/recovery. Worker TypeScript checks passed. An earlier Windows Miniflare setup timeout disappeared on a clean complete rerun; no product behavior or test timeout was changed to hide it. Independent read-only review found no outstanding important correctness issue.

Protected financial snapshots compare equal: all account authorizations and the six targeted uncertain reservation/settlement records were unchanged. No manually initiated paid inference or notifications occurred. Normal staging automation remained active under existing controls; incremental R2/D1 charges were not separately measured and are not claimed to be zero.

## Remaining limits

- Internal provider concurrency remains six and the configured/default admission rate remains 20 requests/minute. That does not qualify 1,000 nonempty half-hour briefings: even two calls each require at least about 67 requests/minute before repairs and other traffic. Actual provider throughput and cost require a newly authorized bounded paid test.
- Current evidence catalogs, publication identity history and repeatedly carried individual revisions can still grow. This optimization removes unrelated carry-result payload reads; it does not make all preparation constant-space.
- Original article bodies and paid records remain in D1. More storage work may be required after measuring ongoing growth; no speculative cold-body format or financial rewrite was introduced.
- The scheduler already dispatches up to ten batches of 100 per Cron tick. The older claim that it necessarily takes ten minutes to dispatch 1,000 feeds was incorrect and is corrected in the capacity report. No new dispatch machinery was needed.
- No production deployment, 1,000-feed shared-staging load, or new real inference-quality evaluation was performed.

Safe numerical artifacts are in benchmarks/results/v3-selective-database-reads/bounded-history-staging.json and carry-targeted-scaling.json. Exact diagnostic evidence, financial snapshots, deployment logs, source response audits and probe records remain local under .local-reports/v3-working-set/. Unrelated favicon edits remain untouched.

Further pending-request reads, the settled V3 delivery blocker, sustained archival checkpoints and live recovery evidence are recorded in [the capacity and delivery follow-up](v3-capacity-delivery-followup.md).
