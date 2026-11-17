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

## AgentOps and HTTP performance extension

The opt-in [k6 workload v1](k6/WORKLOAD.v1.md) adds bounded read-only HTTP tests and deterministic fixture faults. [AgentOps setup](../../docs/observability/SETUP.md) and the [supplemental metric catalog](../../ops/observability/metric-catalog.json) reuse this protocol and its R7 arithmetic. This extension does not complete the prospective evaluation observer, live integration, human quality labels or account-level limit accounting.

Real authenticated campaigns are separate from fixture CI. See [the gated multi-user framework](real/README.md) and [implementation/preflight evidence](../../docs/observability/REAL_CAMPAIGNS.md). No new real load/stress/soak result is claimed.

### Local 100-feed reliability checkpoint

From the repository root in PowerShell:

```powershell
$env:CONNECTOR_LOAD_COLLECTION = 'true'
$env:CONNECTOR_LOAD_FEEDS = '100'
$env:CONNECTOR_LOAD_ARTICLES = '1'
$env:CONNECTOR_LOAD_READERS = 'true'
pnpm --filter @distilled/worker test src/connector-collection-load.test.ts
```

The workload uses the actual feed and session handlers, connector queue handlers and local D1. Eight reader workers make 300 feed and 300 guest session requests across three waves while eight queue workers schedule, collect and replay duplicate deliveries. The aged part of the workload adds 200 retained briefing requests and a pending window per feed. The fixture simulates a shared RSS origin and the archive. It measures collection through durable intake and checkpoints. Acquisition and editorial delivery are outside this workload.

The run checks for zero unexpected application responses, a durable receipt and checkpoint for every feed, and duplicate deliveries producing no additional receipts. The log reports reader p95/p99, queue timings, and D1 rows read by the combined publication-state query. Use the same fixture size and concurrency for comparisons. Validate Cloudflare availability, live-provider capacity and publication separately in a gated campaign.

The baseline mixed local run completed with **0 unexpected responses across 600 requests**, 100 receipts and checkpoints, and no additional receipts on replay. Feed requests took 10.47 s at p95 and session requests took 0.86 s at p95. The newest-briefing lookup alone read 200 rows across 300 lookups, including the first wave before briefing history was seeded.

The combined publication-state query uses one D1 call in place of up to four, with the same status precedence. Username resolution uses one joined lookup. A SQLite check using 20,000 retained briefing requests and 20,000 retained editions found identical publication states and latest-100 edition IDs before and after indexing. The query plan used all three new indexes and eliminated temporary sorts for the newest request and latest editions. A successful cache save now also avoids a redundant lease-release write.

The first optimized mixed run passed all 600 responses and all 100 receipt, candidate and checkpoint checks. Replaying deliveries produced no extra receipts. The first wave used 2,501 D1 calls compared with 2,801 in the baseline. Across 300 publication-state lookups, D1 read 200 rows in total. Feed p95 was 7.47 s compared with 10.47 s in the baseline, and session p95 was 0.65 s compared with 0.86 s. These single-run latency measurements vary with emulator load. The fixture made three simulated upstream fetches and zero paid requests.

### Recurring work on 100 aged feeds

```powershell
$env:CONNECTOR_RELAY_LOAD_FEEDS = '100'
pnpm --filter @distilled/worker test src/connector-relay-load.test.ts
```

The local D1 fixture runs the actual downstream relays in groups of eight. Each feed has one source, a settled request, and 200 historical schedule observations. The first pass records a boundary and detects two genuine gaps per feed. The second revisits the same settled windows. Both passes preserve all requests and the expected gaps. The test rejects outbound network calls.

| D1 work across 100 feeds | Before | After |
| --- | ---: | ---: |
| Calls to record the boundaries | 3,400 | 1,800 |
| Rows read to find prior observations | 20,099 | 100 |
| Calls to revisit settled windows | 3,100 | 1,300 |
| Rows read to revisit settled windows | 61,241 | 8,348 |
| Rows written to revisit settled windows | 900 | 0 |

The paired runs use the same fixtures and local schema. Global accounting recovery runs once per queue-mode Cron invocation, outside the per-feed measurements, using the existing bounded metadata lookup. These counts measure local operations. They do not estimate billed Cloudflare usage or the cost of live inference.

The subsequent mixed run again passed 600 responses, 100 durable receipts and checkpoints, and duplicate-delivery replay. Compared with the first optimized run, the scheduling wave made 2,301 D1 calls instead of 2,501 and the poll wave made 4,581 instead of 5,063. Other regression suites were running concurrently and the mixed run took longer, with five simulated origin requests as the cache expired during the run. It made zero paid requests.
