# Final staging activation preflight — 2026-10-31

## Outcome

**PARTIAL: actual one-point Grafana ingestion is verified; continuous telemetry is not enabled.** Production, existing staging deployment, financial records and notifications remain unchanged. The following evidence supersedes earlier authentication-only checks and the earlier five-minute collector proposal.

## Actual usage and headroom

Authenticated account-wide Cloudflare GraphQL analytics, October 1 through October 31 at approximately 13:40 UTC:

| Dimension | Observed | Standard monthly included allowance | Remaining against that allowance |
| --- | ---: | ---: | ---: |
| Workers invocations | 3,095,170 | 10,000,000 | 6,904,830 |
| Workers CPU | 584,979,580.660 ms | 30,000,000 ms | None |
| D1 rows read | 89,939,073,660 | 25,000,000,000 | None |
| D1 rows written | 74,060,648 | 50,000,000 | None |

These are analytics aggregates, not an invoice. Adaptive sampling, reporting delay, custom contract terms and billing-period alignment can affect reconciliation. Subscription inspection remains denied; a calendar-month query must not be represented as a verified custom billing-cycle total. Existing staging D1 size is about 6.68 GB; storage billing is already present and this read-only collector adds no persistent D1 storage.

Grafana's actual `grafanacloud-usage` datasource reports 10,000 included metric series, one included datapoint/minute/series, zero billable series and zero metric overage at observation time. These are lagging billing metrics, not an exact instantaneous active-series count. Trace usage reports zero with 50 included usage units; confirm units/plan in the portal before enabling traces. The stack is on trial. Post-trial downgrade behavior and absence of automatic paid conversion have not been independently verified.

Sources for standard rate assumptions: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). Account-specific Grafana limits must come from the [usage datasource](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/usage-limits/), not generic trial limits.

## One real OTLP metric

Exactly one sanitized gauge point was sent to the authenticated Grafana OTLP `/v1/metrics` endpoint. It contained no source text, URLs, account/feed/operation IDs or user data. Ingestion returned HTTP 200. A separate Prometheus query returned value **1**, with labels:

```promql
distilled_agentops_preflight{environment="staging"}
```

Observed additional labels were `job="distilled-agentops-preflight"` and `service_name="distilled-agentops-preflight"`. This is a deliberately synthetic preflight observation, not a live application health signal. No second point or retry was sent. Evidence is retained locally in `final-preflight-v2.json` and `metric-readback.json`.

The existing ignored local ingest credential demonstrably has metrics-write access. It also successfully authenticated logs/traces previously, so it is **not** a new least-privilege metrics-only credential. The available Grafana service-account permissions do not establish Cloud Access Policy management authority. Browser access was unavailable. Creation of a dedicated stack-scoped `metrics:write` token remains BLOCKED, rather than silently deploying the broader credential.

Minimum secure operator action: create a stack-restricted Cloud Access Policy with **metrics:write only**, generate its token, and save it in the existing ignored local `.env` as `GRAFANA_METRICS_WRITE_TOKEN`; retain the corresponding OTLP instance ID. Do not paste it in chat. After deployment approval, install the derived Basic authorization value as the dedicated Worker's `GRAFANA_OTLP_AUTH` Cloudflare secret through stdin/in-memory API handling, never a Wrangler var, command argument, report or Git file. No Worker secret has been installed yet because that new Worker has not been deployed.

## Exact proposed deployment

Target new Worker: `distilled-news-staging-agentops`, account `e32b564514d4f9b9e383b7dd30dbb026`. Config: `apps/agentops-collector/wrangler.staging.jsonc`. No application Worker replacement, migrations, new database, queue, R2 bucket, hosting service or production routing.

Proposed activation diff against the committed disabled configuration:

```diff
- "COLLECTOR_ENABLED": "false"
+ "COLLECTOR_ENABLED": "true"
- "COLLECTOR_FEED_ID": ""
+ "COLLECTOR_FEED_ID": "<one reviewed existing staging feed ID>"
```

Additionally install one Cloudflare secret, `GRAFANA_OTLP_AUTH`. Resolve the private feed ID locally from the reviewed staging feed; do not add it as a public telemetry label. All other configuration remains: staging D1 only; Cron `*/15 * * * *`; CPU limit 100 ms; no routes, workers.dev or preview URLs; logs and traces disabled; no public metrics endpoint. Worker deployment needs existing Workers Scripts edit and D1-binding access. Runtime SQL is SELECT-only; the standard D1 binding itself is not a database-enforced read-only role.

Expected 30-day usage: 2,880 invocations; at most 28,800 metadata queries; at most 230,400 metric points plus bounded OTLP resource metadata. At the observed 30 rows/run: 86,400 rows/month. At the 100 ms configured CPU ceiling: at most 288,000 CPU ms/month. Standard marginal rates imply approximately **$0.0058464/month** for CPU plus observed D1 reads if the existing allowances remain exhausted. Requests fit observed headroom, but future account traffic can consume it; requests at overage would add $0.000864/month. The 2,000 observed-row guard is post-query, not a hard read-charge cap; 5,760,000 rows/month at that envelope would cost $0.00576 for reads. There is no guaranteed total spend cap from these controls. A strict zero-incremental-charge requirement is therefore not currently established.

At most 80 collector metric series, with fixed labels, are intended; OTLP-created resource metadata may add series. Fifteen-minute sampling is below one DPM/series but has up to fifteen minutes' observation delay. Existing five-/ten-minute absence-alert assumptions cannot be enabled unchanged. All eleven provisional alerts stay paused. Snapshot metrics are latest-window gauges, not monotonically increasing global counters.

## Privacy and traces

Collector payload construction is catalog-allowlisted, numeric and low-cardinality. It never exports original articles, prompts, model outputs, SQL text, private identifiers or legacy logs. Static audit identified 108 legacy console sites plus one fixed metadata emitter; broad log export remains prohibited.

Direct native traces are a separate, **not yet approvable** deployment change. Existing native URL/SQL attributes need an actual controlled span/privacy review; query-string redaction alone does not remove sensitive URL paths or SQL bindings. The inactive 5% trace fragment must not be merged automatically. Initial trace verification should use only isolated, sanitized requests with a bounded observation interval, inspect actual attributes, then approve continuous sampling separately. No observed application trace ID or complete workflow correlation is claimed.

## Rollback and validation

For collector rollback, remove its Cron Trigger first, deploy `COLLECTOR_ENABLED=false`, verify no further scheduled exports, then revoke its dedicated Grafana token. Removing the collector does not remove staging data, old financial holds or existing application resources. Record deployed version and schedule read-back before activation. Exported samples expire under Grafana retention; do not delete unrelated telemetry.

After separately approved activation: verify Cron completion and CPU analytics, query exact application gauges, read back source-window metadata independently, compare known publication/cost values, inspect missingness and dashboard selectors, and evaluate paused alert expressions. Controlled observer failures must be isolated to the collector/test fixture and not corrupt the staging database. Paid inference is not part of this package.

## k6 remains gated

All seven original synthetic profiles and separate Browser/V3 correctness fixtures are preserved. Local evidence is in `WORKER_COLLECTOR_VALIDATION.md`. Real staging campaign proposal: **10 read-only requests, one VU, maximum 60 seconds, no retries**, exact staging origin, approved disposable account only for authenticated reads. No source collection, feed writes, Browser Agent billing or paid V3 generation. A protected manual GitHub environment and explicit campaign approval/headroom evidence are required.

Do not launch k6 until application telemetry is confirmed. Retain run ID, commit SHA, response status, cf-ray and requested traceparent, then distinguish requested IDs from genuinely observed Tempo traces. Produce JSON/HTML p50/p95/p99 and error results. Snapshot gauges alone cannot establish real V3 throughput or agent correctness. Live agent/V3 performance campaigns remain outside this read-only campaign and require separate controlled scenarios.

## Approval required

Approve the concrete collector deployment only after supplying the minimal credential and deciding whether the estimated **nonzero marginal cost** is acceptable. Permission to reuse included allowance does not cover already-exhausted CPU/D1 allowances. No new hosting or upgrade is needed. Traces, k6 and notifications are not implicitly activated by collector approval; notifications remain paused.
