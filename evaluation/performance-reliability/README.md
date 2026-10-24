# Performance and reliability evaluation

Owner: Aya, with quality annotations and user-study outcomes supplied by the quality-evaluation owner.

Status: **measurement design and offline calculation foundation**. This is not a completed live benchmark or a new production monitoring system.

- [Protocol](PROTOCOL.md): questions, units, metrics, workload matrix, baselines, split policy, uncertainty and rollout gates.
- [Measurement audit](MEASUREMENT_AUDIT.md): what existing records establish and where prospective observation is required.
- [Development data audit](DEVELOPMENT_DATA_AUDIT.md): verified overlap, language imbalance and split limitations in our existing real exports.
- [Implementation plan](IMPLEMENTATION_PLAN.md): staged deliverables and qualification gates for a working runner.
- [Metric catalog](metric-catalog.json): versioned definitions and implementation status.
- [Reference calculations](metrics.mjs) and [tests](metrics.test.mjs): timestamp validation, durations, R7 quantiles, Wilson intervals, mature deadline cohorts and deduplicated cost accounting.
- [Read-only corpus auditor](audit-corpus.mjs): checks case/text hashes, immutable IDs, interval membership, track chronology and overlap; never assigns human labels or certifies semantic independence.

Run the offline reference tests from the repository root:

```powershell
node --test evaluation/performance-reliability/metrics.test.mjs evaluation/performance-reliability/metric-catalog.test.mjs evaluation/performance-reliability/audit-corpus.test.mjs
```

All 22 offline reference/audit tests passed at this design checkpoint. They qualify the implemented arithmetic and audit mechanics, not end-to-end performance or factual quality. The modules have no network, credentials, deployment or provider execution paths. No existing feed, budget, model route, ledger or production source file is changed by this framework foundation.

Still to implement after this protocol is reviewed: evidence collectors, independent opportunity schedule, run manifests/schema validation, chronological replay orchestration, baseline adapters, live/fault runners, paired clustered analysis and report generation. Missing measurements and human judgments must remain unavailable rather than being invented to fill a report.

Existing 20- and 95-window exports are overlapping development assets. They are not independent validation/held-out sets, nor human-reviewed gold. Do not publish their article text. Live campaigns need their own explicit authorization, positive bounded allowances, existing durable admission/settlement and isolated resources.
