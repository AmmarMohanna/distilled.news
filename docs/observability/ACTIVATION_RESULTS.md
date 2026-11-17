# Staging AgentOps activation results

## Operational status

**Real staging metrics, one privacy-reviewed native collector trace in Tempo and the approved read-only k6 campaign are VERIFIED. Full application-wide AgentOps activation is not yet established.** Broader model/agent tracing and several intentionally unavailable measurements must be judged separately; successful OTLP authentication is not the acceptance criterion.

Dashboard: https://giganticmantel34.grafana.net/d/distilled-agentops-v1/

Private folder: https://giganticmantel34.grafana.net/dashboards/f/distilled-staging-ops

The deployed collector is `distilled-news-staging-agentops`, every fifteen minutes, with a 100 ms CPU ceiling. Final metrics-only version: `a9e782d4-5260-437a-bc9f-9a933ccbc46b`. It has only the staging D1 binding, no public routes, no notifications, and no source collection or inference calls. The main application Worker and production were not deployed or modified. The repository's default collector configuration remains disabled so an accidental deploy cannot activate telemetry or select a feed.

## Actual evidence

- Real application OTLP metrics were independently queried from Grafana after scheduled executions at approximately 14:30 and 14:45 UTC on October 31, 2026.
- The 14:45 run read 19 D1 rows in seven queries, with 3.3098 ms SQL execution. Live tail observed outcome `ok`, approximately 10 ms CPU and 774 ms wall time, with no console entries or raw logs retained.
- Cloudflare aggregate analytics through 14:47 reported three invocations, one initial failed invocation and 31.368 ms total CPU. Actual CPU quantiles were p50 10.557 ms and p99 13.074 ms; quantiles with so few samples are descriptive, not a capacity guarantee.
- The 15:00 snapshot reported a real persisted publication, four model calls and $0.011934 settled model cost for the selected window. These were **existing application operations**, not inference initiated by the collector or this evaluation.
- An independent SELECT-only D1 replay then matched all **38 comparable application values** in Grafana exactly. The seven queries read 44 rows. Observer timestamps were excluded because the two observations occurred at different times.
- An earlier non-simultaneous comparison differed because the background feed advanced from a quiet window to a published window. That failed comparison is preserved locally; it was not treated as a projector defect or rewritten as success.
- An anonymous read of the private pipeline-trace API returned HTTP 401, with no response body retained and no provider operation.

## Runtime defect and recovery

The first real Cron at approximately 14:15 failed. Local workerd reproduced the cause: Workers does not implement Fetch `redirect: "error"`. The exporter now uses `redirect: "manual"` and explicitly rejects non-2xx responses, including redirects, without following them or retrying. Regression tests cover lost responses, redirects, partial ingestion and forbidden destinations. The corrected Cron produced real queryable metrics on subsequent runs.

The local workerd binary also rejected the October compatibility date; the isolated reproduction used its supported June 18 date. This local limitation is recorded rather than confused with the deployed runtime. No application data or financial state was reset.

## Dashboard and alerts

All **17 target queries across 14 panels** executed successfully in Grafana. Eight panels had real samples: 1, 3, 5, 6, 7, 8, 10 and 14. Six panels remain unavailable: invocation logs (2, 12, 13), retained queue/delivery history (4, 11), and source health (9). Those measurements are not read/exported by this bounded collector; empty results are not zeroes.

Dashboard version 2 scopes metrics to staging/service and retains the last observation for twenty minutes around the fifteen-minute collection cadence. Individual series are last-observed values, not continuous measurements or global cumulative counters. Missing fields can have different last-observation times; inspect snapshot freshness and original cohort before cross-metric conclusions. The collector covers one selected feed's latest recorded window and current active acquisition/reassessment jobs, not every historical unresolved publication.

All **11 provisional alerts** were evaluated through Grafana's preview API against actual datasource results, and all remain paused. Publication failures, current backlog, unsettled operations and snapshot health produced numeric results. Delay, backlog age, provider failures, runtime failures and spend-change evaluations lacked necessary samples and must remain unavailable. The legacy scheduled-log absence rule evaluated true because logs are intentionally not exported; it must not be enabled as a live-health signal under this configuration.

Two snapshot rules now accept an explicit fifteen-minute staging cadence, using a twenty-minute lookback/freshness threshold. Generic defaults remain unchanged. This fixes the demonstrated five-minute false-absence risk without enabling delivery. The retained-cohort spending-delta alert is not qualified for a rolling latest-window collector: changing cohorts must not be mistaken for cumulative new spend.

## k6: actual staging campaign

Run ID: `agentops-staging-1793457122664`. Code revision: `25a542dba6cb7e4fa5a7e263615e09b0db6f85bc`.

Window: October 31, 2026, **14:33:30.644–14:33:42.753 UTC**. Ten read-only requests, one VU, no retries, no mutations or provider calls. All ten responses were HTTP 200, all thirty checks passed, and all configured thresholds passed.

| Measurement | Actual result |
| --- | ---: |
| HTTP duration p50 | 1,185.388 ms |
| HTTP duration p95 | 2,371.901 ms |
| HTTP duration p99 | 2,520.282 ms |
| HTTP maximum | 2,557.377 ms |
| Request throughput | 0.826 requests/second |
| HTTP error rate | 0% |
| Total campaign duration | 12.109 seconds |

The first launcher attempt failed on Windows module resolution **before sending requests**. The same campaign then ran once from the repository root. The successful requests were not repeated.

Seven actual k6 measurements were ingested into Grafana and independently queried by `run_id`. Private dashboard annotation ID 1 marks the campaign interval. Example:

```promql
last_over_time(distilled_k6_http_duration_ms_p95{run_id="agentops-staging-1793457122664"}[1h])
```

This establishes run-level metric/time correlation, not native distributed-trace correlation. Requested traceparent IDs and cf-ray values are retained locally; none is represented as an observed Tempo trace. Ten requests cannot establish 1,000-feed capacity, stress limits or recovery time. Browser Agent and V3 correctness fixtures remain separate from HTTP load testing. No paid Browser Agent or model workflow was triggered.

## Privacy and trace audit

The collector exports catalog-allowlisted numeric values and fixed labels. No source bodies, prompts, model responses, private feed IDs or raw exceptions are exported as metrics. Static audit found 109 application console sites: one fixed metadata emitter and 108 legacy sites. Broad legacy-log export remains disabled.

The existing authorized ingest token was reused after the operator clarified its metrics-write scope. It is installed as `GRAFANA_OTLP_AUTH`, an encrypted Cloudflare secret. Its broader logs/traces permission is acknowledged; a new metrics-only token was not falsely claimed to have been created. Token creation via the available management credentials returned HTTP 401. No secret was printed or committed.

Automatic approval review rejected creating an external trace destination before a native payload review. Neither rejected mutation executed. A separate explicit approval then authorized one collector-only capture retained inside Cloudflare, with no external destination or legacy logs. Its first short deployment missed the Cron boundary: it became active at 15:00:35, after the invocation's snapshot time. It was rolled back. The subsequent approved capture contains nine actual spans under Cloudflare trace ID `f6bc492aa16ae96ad4d4ea0ef4845dc0`: scheduled invocation, seven D1 reads and the metrics-export fetch. All seven SQL attributes exactly matched the reviewed fixed SELECT allowlist. There were no credential values or private feed IDs. The only URL was the fixed Grafana metrics endpoint, without query parameters. Raw span values were inspected in memory and not saved.

With that actual-payload privacy gate satisfied, the original conditional export approval was used for one collector Cron through destination **`distilled-staging-collector-traces`**. Cloudflare reported successful delivery at 15:32:51 UTC, with no delivery error. Initial searches were empty; independent Tempo readback subsequently succeeded. That delay was not misclassified as a credential failure. A temporary zero-sampling configuration retained the destination while checking delivery; it produced no additional sampled traces. Final deployment restored tracing fully off and detached all destinations.

Observed Tempo trace: **`c595e50b5bd8056500148f6e9279bcd7`**, service `distilled-news-staging-agentops`, root `scheduled`, duration 1,078 ms. An independent trace-by-ID read returned all nine spans, including seven D1 operations and the outbound fetch. The delivered attributes again matched the reviewed SQL/URL policy, with no credential values or private feed ID. Trace start was 13 ms from the exported snapshot timestamp, establishing actual collector metric/trace correlation. Open [Grafana Explore](https://giganticmantel34.grafana.net/explore), select `grafanacloud-traces`, and look up the exact trace ID.

This is a **real collector/tool trace**, not a traced V3 model call, Browser Agent task or the earlier k6 requests. Broader application spans remain unaudited and disabled; no false correspondence is made between the k6-requested IDs and this later trace.

Native [span attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/) can contain URL paths, SQL and, for some bindings, parameters or object keys. Sampling alone is not a privacy filter. External export remains gated on the actual captured attributes, not this static inventory.

## Resource use and cost

No new hosting, subscription, database, bucket or queue was provisioned. The approved new Worker reuses existing Workers Paid/D1 resources. No paid inference was initiated. Dollar costs below are **estimates from metered quantities and standard rates, not settled invoices**.

At 2,880 invocations per thirty days, the configured 100 ms CPU ceiling projects $0.00576 CPU/month at marginal overage rates. Nineteen reads/run adds $0.00005472/month; forty-four reads/run adds $0.00012672/month. Request overage, if account headroom is later exhausted, would add $0.000864/month. The conservative successful-run envelope of 2,000 reads/run plus the CPU ceiling and request overage totals **$0.012384/month**, below the approved $0.10 planning threshold.

The read guard executes after SQL and is not a hard billing cap. Individual failures or query-plan changes can exceed that envelope. Current observations do not warrant disabling the collector. There is no account-wide automatic billing kill switch; operators must check attributable usage/projections and disable Cron before the planning threshold is exceeded. Do not install a broad account-administration token in the collector to implement self-disable.

Grafana reported 10,000 included metric series, one included DPM/series and zero metric overage. A query observed 44 current series before the later published-window fields arrived. Billing metrics lag and are not identical to active-series billing. No paid Grafana conversion was requested. Grafana documents automatic trial transition to Free, but account-specific contract overrides have not been independently inspected: [billing documentation](https://grafana.com/docs/grafana-cloud/platform/cost-management-and-billing/manage-invoices/understand-your-invoice/).

## Validation and evidence locations

- Local root script suite: **87 passed**, no failures/skips.
- Workspace TypeScript checks: passed.
- Existing synthetic k6 smoke/load/spike/stress/soak/recovery/fault and Browser/V3/account fixtures remain intact.
- Full GitHub CI passed on implementation commit `aecba9b75b93801cb7398c78c7787ef0d9201d84`: [run 41211533676](https://github.com/AmmarMohanna/distilled.news/actions/runs/41211533676), including typechecks, script/unit/integration tests, build, Playwright and all synthetic jobs. Final documentation/evidence commit status is recorded in the handoff separately.
- Exact local evidence: `.local-reports/agentops-collector/`, `.local-reports/agentops-activation/`, `.local-reports/k6-staging/`. Large/private raw artifacts and credentials remain ignored. JSON/HTML k6 reports and individual request correlation metadata are retained locally.

## Acceptance checklist

| Requirement | Status | Evidence/limit |
| --- | --- | --- |
| Isolated collector deployment/secret/Cron | VERIFIED | Actual settings, encrypted secret and scheduled exports |
| Actual application metrics in Grafana | VERIFIED | Scheduled snapshots, independent 38-value D1 comparison |
| Collector CPU/D1 measurements | VERIFIED | Native analytics, live tail, exported D1 resource gauges |
| All dashboard queries | PARTIAL | All execute; eight panels have data, six explicitly unavailable |
| Eleven paused alert evaluations | VERIFIED | Actual preview responses, no notifications |
| Alert production thresholds/coverage | PARTIAL | Cadence corrected; missing measurements and changing-cohort issues remain |
| Bounded staging k6 | VERIFIED | Ten successful requests, JSON/HTML, seven Grafana measurements |
| Collector native trace privacy and Tempo delivery | VERIFIED | Actual in-account audit, direct delivery and nine-span Tempo readback |
| Collector metric/trace correlation | VERIFIED | Real span start and snapshot timestamp differ by 13 ms |
| Broader agent/model execution-history correlation | NOT IMPLEMENTED | Collector D1 spans do not establish Browser Agent/V3 model tracing |
| Controlled model/tool failure | PARTIAL | Real exporter failure/recovery plus offline controlled fixtures; no paid model fault injected |
| Denied private action | VERIFIED | Anonymous trace read denied HTTP 401 |
| Notifications/production unchanged | VERIFIED | No delivery activation or production deployment |
| Protected GitHub environment for future campaigns | BLOCKED | Named environment is absent; available credential has push but not admin access |

## Rollback and next step

Remove the dedicated collector's Cron, then deploy its disabled repository configuration. Verify no new exports; revoke only its credential if a dedicated token is later installed, not the reused shared token. Never reset queues, financial records or source data. Trace-audit rollback restores the local metrics-only configuration, keeping the normal collector enabled and all external destinations detached.

The collector is usable for its stated bounded scope. Keep broader tracing and notifications disabled. Next, establish privacy-safe application instrumentation and explicit coverage for the six unavailable panels before claiming complete AgentOps coverage. Do not silently substitute collector observations for model execution history.

For future GitHub-run performance campaigns, a repository owner must create environment `agentops-staging-readonly-approval` and configure required reviewers. The current authenticated repository credential has push access but no admin/maintain access; the environment read returned 404. The manual workflow verifies this protection and refuses to run without it. The approved local campaign already completed and must not be repeated merely to work around this missing administration permission. Authenticated or feed-mutation campaigns require their own isolated accounts/data and authorization; neither was run here.
