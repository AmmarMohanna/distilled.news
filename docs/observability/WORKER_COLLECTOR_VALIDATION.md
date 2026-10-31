# Worker-native collector and performance validation

## Status: 2026-10-31

The implementation is local and disabled. No collector deployment, nonempty OTLP export, staging load campaign, paid inference or notification was performed. This report supersedes earlier collector-host questions: the selected architecture is a dedicated Cloudflare Cron Worker, not Alloy or a workstation.

The operator confirmed Workers Paid and a Grafana Cloud trial, with no intention to purchase Grafana. Consequently the original Workers Free deployment condition is not satisfied. Included account headroom, post-trial Grafana limits and permission to use the existing paid account must be resolved before activation. No upgrade is proposed.

## Collector

The collector reuses the existing pure snapshot projector. It reads one explicitly configured staging feed and its latest recorded window through indexed, metadata-only SELECTs. It does not read article text, prompts or model output. It cannot mutate D1 and exposes no HTTP metrics endpoint. Credentials belong in a Cloudflare secret. Legacy logs remain unexported.

One actual read-only staging measurement used 7 queries, read 30 rows, reported 3.2856 ms aggregate SQL execution and took 2751.3 ms from the local client. It reconstructed 37 metric points, two settled model operations and $0.0122164 historical settled cost. This cost was observed from existing receipts, not incurred by the test. Worker CPU and ingestion remain unmeasured.

Bounds: at most 10 queries, 24 operations, four sources, 100 active jobs per source and 80 exported points per run. Exceeding a cohort bound fails closed. The 2,000-row observed-read guard acts after a query executes; it is not a hard billing cap. Five-minute operation means 288 invocations/day, at most 2,880 queries/day and 23,040 points/day. These bounds do not establish account-wide free headroom. The existing staging database is approximately 6.68 GB.

This is latest-window monitoring for one feed, not an account-wide backlog inventory. Older unresolved windows require a separately reviewed lookup. Unavailable timings and costs remain absent; no healthy zero is fabricated. Live Prometheus metric naming/labels and metrics-write credential scope still require validation.

## Local evidence

- Root script suite: 85 passing tests.
- Collector/projector/local D1 checks: 15 passing tests, including unchanged selected metrics after adding 1,000 historical windows.
- Collector dry-run bundle: 50.88 KiB, 9.43 KiB gzip.
- Separate V3 correctness fixtures: 41 passed; Browser Agent fixtures: 15 passed; account fixtures: 68 passed.
- All seven original k6 fixture workloads passed. Fault workload included three deliberately injected HTTP 503 responses; its expected-failure proof also behaved correctly.

Local k6 fixture p95/p99 milliseconds: smoke 2.598/4.284; load 1.865/4.171; spike 2.489/4.308; stress 2.224/2.959; soak 2.208/2.831; recovery 4.498/4.637; fault 3.109/3.602. These are fixture-server measurements, not deployed product latency or real publication recovery time. Correctness-test runtimes likewise do not measure real agent/model throughput.

## Staging campaign controls

The separate manual workflow requires a protected GitHub environment with required reviewers, explicit approval evidence and verified usage headroom. It permits only 8–20 requests, one VU, at most 60 seconds, no retries and only the exact staging origin. Authenticated reads require an isolated account and secret cookie. No feed creation, scraping or inference is included. Requested trace IDs and run headers are correlation attempts, not proof that Cloudflare exported those IDs.

All existing deterministic workloads remain intact and are scheduled in CI. Browser/V3 correctness fixtures run separately. Real disposable-feed mutation campaigns and real agent/V3 performance harnesses remain NOT IMPLEMENTED; they must not be represented as HTTP-load coverage.

## Activation gates

1. Verify included Workers/D1 usage headroom and explicit permission for this account; confirm Grafana post-trial free ingestion limits.
2. Verify metrics-write credentials without exposing secrets; obtain approval for the concrete collector deployment and bounded ingestion.
3. Export a bounded sample, query actual names/labels in Grafana, validate each applicable panel and measure Worker CPU/resource usage.
4. Keep all eleven alerts paused. Missing-observer preview has been evaluated successfully, but continuous monitoring is not active.
5. Review a controlled native span sample before enabling direct traces. The inactive trace fragment is a proposal, not a deployed setting. Legacy-log export remains disabled.

Existing dashboard: https://giganticmantel34.grafana.net/d/distilled-agentops-v1/ . Fourteen panels and eleven paused rules were imported and read back. All seventeen panel queries executed but returned no samples. No actual trace correlation or complete live AgentOps workflow is claimed.

Exact local sanitized measurements and fixture reports are under `.local-reports/agentops-collector/` and `.local-reports/k6/`. Raw credentials and private evidence are excluded from Git.
