# Performance and reliability evaluation

Owner: Aya, with quality annotations and user-study outcomes supplied by the quality-evaluation owner.

Status: **measurement design, offline calculation foundation, strict evidence schemas and offline report (Stage 1)**. This is not a completed live benchmark, an evidence collector or a new production monitoring system.

- [Protocol](PROTOCOL.md): questions, units, metrics, workload matrix, baselines, split policy, uncertainty and rollout gates.
- [Measurement audit](MEASUREMENT_AUDIT.md): what existing records establish and where prospective observation is required.
- [Development data audit](DEVELOPMENT_DATA_AUDIT.md): verified overlap, language imbalance and split limitations in our existing real exports.
- [Implementation plan](IMPLEMENTATION_PLAN.md): staged deliverables and qualification gates for a working runner.
- [Metric catalog](metric-catalog.json): versioned definitions and implementation status.
- [Reference calculations](metrics.mjs) and [tests](metrics.test.mjs): timestamp validation, durations, R7 quantiles, Wilson intervals, mature deadline cohorts and deduplicated cost accounting.
- [Evidence schemas](evidence-schema.mjs) and [tests](evidence-schema.test.mjs): versioned v0.1 records for campaign manifest, opportunity, acquisition job, attempt, timestamp/clock provenance, canonical financial operation, publication/read-back, subscription receipt and intervention. Metadata only: unknown keys (including any text/body/prompt field) are rejected and unknown values must be explicit nulls.
- [Strict importer](import-evidence.mjs) and [tests](import-evidence.test.mjs): JSON Lines bundles with idempotent identities. Schema, reference, clock-domain, mode/basis and frozen input-hash errors are fatal; contradictions are reported and the affected opportunity stays in every denominator as UNKNOWN (a contradicted charge becomes an unknown cost at its highest ceiling).
- [Offline report](report.mjs) and [tests](report.test.mjs): deterministic JSON/CSV per campaign with per-variant/partition/language/workload/source-type slices, exact numerators and denominators, timing and cost coverage, representative failures under a fixed rule, and the catalog ID plus input record IDs behind every number. Campaigns and modes are never pooled; latency distributions are split by clock basis so proxies stay separate from observations.
- [Hand-computable fixture](fixtures/offline-contract.jsonl): synthetic metadata only, used to check the full report exactly.
- [Read-only corpus auditor](audit-corpus.mjs): checks case/text hashes, immutable IDs, interval membership, track chronology and overlap; never assigns human labels or certifies semantic independence.

Run the offline reference tests from the repository root:

```powershell
node --test evaluation/performance-reliability/metrics.test.mjs evaluation/performance-reliability/metric-catalog.test.mjs evaluation/performance-reliability/audit-corpus.test.mjs evaluation/performance-reliability/evidence-schema.test.mjs evaluation/performance-reliability/import-evidence.test.mjs evaluation/performance-reliability/report.test.mjs
```

Produce an offline report from a normalized evidence bundle. Pin the bundle hash printed in a previous report's `reproduction` block to refuse a changed bundle:

```powershell
node evaluation/performance-reliability/report.mjs evaluation/performance-reliability/fixtures/offline-contract.jsonl --json .local-reports/perf-report.json --csv .local-reports/perf-report.csv
node evaluation/performance-reliability/report.mjs BUNDLE.jsonl --expect-bundle-sha256 HEX
```

All 48 offline tests pass (22 from the design checkpoint plus 26 for schemas, importer and report). They qualify the arithmetic, audit, validation and report mechanics on synthetic fixtures, not end-to-end performance or factual quality. No real evidence bundle exists yet: collectors and observers that would produce one are later stages. The modules have no network, credentials, deployment or provider execution paths. No existing feed, budget, model route, ledger or production source file is changed by this framework foundation.

Still to implement: evidence collectors that emit these schemas, the independent opportunity planner, chronological replay orchestration, baseline adapters, prospective observers, live/fault runners and paired clustered analysis. `evidence_availability_to_public_readback` needs an evidence-revision record type and stays arithmetic-only; throughput, backlog, recovery, model-call and safety-invariant metrics need their collectors first. Missing measurements and human judgments must remain unavailable rather than being invented to fill a report.

Existing 20- and 95-window exports are overlapping development assets. They are not independent validation/held-out sets, nor human-reviewed gold. Do not publish their article text. Live campaigns need their own explicit authorization, positive bounded allowances, existing durable admission/settlement and isolated resources.
