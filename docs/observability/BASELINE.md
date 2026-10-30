# AgentOps baseline — 2026-10-30
Base: feb20d9d74aba538cd0666863bf2e75f7b289480, fetched origin/ghada/joud-aya-preserved-integration.

Existing pipeline-trace.ts and pipeline-trace-sources.ts are administrator-only, feed-scoped, read-only projections. They expose request outcomes, incomplete coverage, jobs, poll metadata, queue attempts, operation latency/tokens, provider receipts, settled versus held costs, quarantine and recovery. scripts/pipeline-trace.mjs already reads/paginates these. Do not introduce another trace store.

Existing index.ts logs V1_QUEUE_LATENCY and retry/quarantine diagnostics; connector and model modules retain durable admission, lease, reconciliation and paid identities. Notification receipts prove service acceptance, never device receipt. Trace overview spending is feed-scoped retained accounting, not incremental window spend. Sources jobCounts are retained current state, not window counts. Current trace reads have some retained-history aggregates: do not schedule broad trace polling as a cheap heartbeat.

Missing boundaries: uniform nonthrowing invocation telemetry, monotonic invocation duration, cron heartbeat, investigation outcome. Publication schedule timestamps need inclusion in the existing whitelist. Exact commit/read-back, oldest canonical backlog, complete notification eligibility, account limit utilization and independent offered opportunities cannot be inferred from the existing projections. Keep these unavailable until a separately authorized prospective observer exists.

Architecture: extend existing trace whitelist; metadata-only invocation/investigation log events; bounded offline trace-to-Prometheus projection; Cloudflare OTLP configuration fragments, private Grafana dashboard/rules; Aya-compatible read-only k6 workloads. No additional database writes, migrations, new public endpoint, runtime history scans or provider requests.

Alternatives: Analytics Engine adds a binding/resource and sampled analytics semantics; direct OTLP metrics adds runtime network/retry complexity. Selected structured log queries plus externally projected existing snapshots. Logs measure attempts/investigations, never durable success or billed-operation totals. Snapshot gauges are replaced, never increased on replay. Sampled logs cannot establish exact operational rates.

CI evidence before edits: GitHub connector returned no PR workflow runs and no combined statuses for base SHA; this is unavailable evidence, not a green status. Existing project-checks already runs workspace tests/build/e2e. Local baseline: 22/22 evaluation tests passed. No live environment tested.

## Enqueue-age and V3 timing extension
New canonical jobs record a real wall-clock enqueuedAt precommit proxy in the existing immutable job write; no new write or identity is introduced. The existing grouped sources query now returns oldest timestamp, observed/missing timestamp coverage, attempts and recorded resource waits. Retained legacy jobs are not backfilled. Oldest observed pending age is a known-subset lower bound, never proof that older unmeasured work does not exist. The supplemental paused age alert uses a provisional 30-minute threshold held 15 minutes.

V3 already persists total/stage timings in v3_window_results. Overview now reads that exact request-bound result by indexed ID and exports only fixed timing stages (edit, verify, repair, consolidate) and status. No prompt or reader text is exported. Stage timing includes existing engine/reuse behavior and uses the engine's existing wall clock; it is not a claim of fresh provider execution. Recorded publication proxies use publication_status.publishedAt, edition.publishedAt or edition.createdAt in that order with explicit source provenance.
