> Current live results supersede this earlier checkpoint: [staging activation results](ACTIVATION_RESULTS.md). The approved collector is deployed and real application/k6 metrics are queryable; trace privacy validation is tracked separately.

# Private Cloudflare → Grafana setup

Status: repository-side configuration only. No destination, dashboard, alert, datasource, secret, resource or deployment has been created remotely.

## 1. Review target and access
Select the actual staging or production Wrangler configuration explicitly. Default apps/worker/wrangler.toml is not proof of intended target. Preserve all resource bindings, routes, compatibility flags, vars, migrations and account IDs. Inspect the lockfile-resolved Wrangler schema; the validator checks the required keys exist. Both TOML fragments are intentionally inactive. Never deploy the fragments themselves.

Create a private Grafana folder and restrict it and its Loki/Tempo/Prometheus datasources to operators. Disable anonymous/public dashboard access and public snapshots. Keep IDs as private event fields or structured metadata, never index labels; permitted aggregate labels are service, environment, boundary and outcome. Existing application console logs may contain more information than the new metadata events: audit and redact them before enabling full native log export. Do not upload raw saved traces or cookies to Grafana or CI artifacts. Native tracing also records binding/HTTP metadata; inspect a controlled sample before broader activation.

## 2. Configure destinations (requires account approval)
In Grafana Cloud obtain the OTLP gateway region URL and a narrowly scoped ingest token. In Cloudflare account → Workers & Pages → Settings → Observability → Destinations, create separate Logs and Traces destinations for each authorized environment. Use names matching the fragments, e.g. distilled-staging-logs and distilled-staging-traces. OTLP URLs are https://otlp-gateway-<REGION>.grafana.net/otlp/v1/logs and /otlp/v1/traces. Store the required Authorization header only in the private Cloudflare destination configuration, using the Grafana-provided instance ID/token credentials. Never put it in Wrangler, Git, command history or Worker vars.

Merge the matching ops/observability/wrangler.<environment>.fragment.toml observability sections into the selected existing config, and add AGENTOPS_ENABLED = "true" inside its existing [vars]. Do not add duplicate TOML tables. For JSONC deployments translate exactly the observability object; do not assume the TOML target is active. Set invocation_logs = false under observability.logs if invocation URL metadata is unnecessary, after checking your operational needs.

Logs are initially unsampled so cron absence and observed error fractions are interpretable. Traces sample 5%. persist=false avoids duplicate Cloudflare retained storage; it does not make Grafana ingestion free. Start on a small approved isolated environment, measure daily event/span bytes and platform limits, cap Grafana retention to 7 days where supported, and configure account budget notifications before production activation. Reducing log sampling invalidates exact event rates and absence detection; revise those alerts rather than multiplying sampled counts into claimed exact totals. Existing retained D1/R2 policies remain authoritative for durable investigations.

A separately approved redeploy of the selected Worker activates export. Check Cloudflare destination last-delivery/error state, Grafana service_name, OTLP body shape, timestamp mapping and a known controlled invocation. The provided LogQL expects the JSON event itself as the log line; if your exporter wraps console messages, normalize that envelope in an approved private ingestion processor before enabling the queries. Query matching, ingestion filtering and Tempo correlation have not been verified remotely.

## 3. Application metrics without another trace store
Cloudflare native OTLP exports logs/traces, not custom Worker metrics. New agentops.v1 logs support invocation/investigation counts and elapsed duration. They do not count canonical publications or financial operations. Existing V1_QUEUE_LATENCY logs retain transport timing and attempts, while the existing private trace remains the incident evidence source.

Use existing scripts/pipeline-trace.mjs with an administrator session in DISTILLED_TRACE_COOKIE to export overview, operations and sources for ONE explicit UTC window. Example:

```sh
node scripts/pipeline-trace.mjs --origin https://APPROVED-ISOLATED-HOST --feed OWNED_FEED_ID --view operations --window-start 2026-10-29T00:00:00Z --window-end 2026-10-29T01:00:00Z --all --json > PRIVATE_OPERATIONS.json
node scripts/agentops-snapshot.mjs PRIVATE_OVERVIEW.json PRIVATE_OPERATIONS.json PRIVATE_SOURCES.json > PRIVATE_METRICS.prom
```

Repeat the first command with overview and sources. Keep all JSON private and use filesystem permissions; do not commit it. The CLI performs no network calls, accepts only complete views, rejects conflicting duplicates/mixed windows and emits label-free gauges. It does not establish atomic cross-view snapshots: collect quiescent cohorts and retain collection times/configuration privately. Do not continuously scan all retained histories or all feeds. Begin with one bounded incident cohort and an explicitly approved collection frequency. A missing projection is unavailable, not a healthy zero.

Serve the generated .prom file on an operator-private static endpoint or existing node_exporter textfile collector, then scrape it with existing Grafana Alloy/Prometheus using job_name: distilled-snapshot. Use the existing authorized remote_write destination for Grafana Cloud. Do not expose a public metrics endpoint in this app. Atomically replace the textfile after a successful projection; remove it on collection failure rather than leaving stale values. Configure external collector freshness/health alarms. A complete live network collector and automatic opportunity planner are NOT implemented here; manual snapshot gauges must not be presented as continuous production monitoring. The local textfile bridge below enforces input freshness and provides observer-health series. Prometheus/Alloy setup and actual remote_write delivery await operator configuration and authorization.

Reproduce synthetic metrics without account access:

```sh
node scripts/agentops-snapshot.mjs ops/observability/fixtures/published.json ops/observability/fixtures/quiet.json ops/observability/fixtures/deferred.json ops/observability/fixtures/failed.json ops/observability/fixtures/blocked.json ops/observability/fixtures/pending.json ops/observability/fixtures/operations.json ops/observability/fixtures/sources.json
node scripts/validate-observability.mjs
python scripts/validate-wrangler-observability.py
```

These are OFFLINE_CONTRACT fixtures. No live operational conclusion follows from them.

## 4. Dashboard and alerts
Import ops/observability/dashboard.json through Dashboards → New → Import in the private folder. Select the private Prometheus and Loki datasources using the dashboard variables. Set service to the observed exact Worker service_name. Verify all queries against a known event; empty panels remain Unavailable. There is no public-share configuration. Snapshot p95 is conditional on known samples, uses Aya R7, and is exploratory below 100 observations. Do not aggregate p95s.

Grafana Cloud does not support filesystem provisioning. The file ops/observability/grafana-alerts.json is a versioned Grafana file-provisioning source for self-hosters; convert it to Grafana-managed HTTP API bodies for Cloud:

```sh
node scripts/prepare-grafana-alerts.mjs PRIVATE_FOLDER_UID METRICS_DATASOURCE_UID LOGS_DATASOURCE_UID > PRIVATE_ALERT_API_BODIES.json
```

After approval, POST each array element separately to https://YOUR-STACK.grafana.net/api/v1/provisioning/alert-rules using a Grafana service account authorized to write alert rules in that folder. The converter performs no requests and needs no token. If UIDs already exist, inspect them and use the update endpoint for those exact rules; do not overwrite unrelated rules. Set the group evaluation interval to 60 seconds in Grafana (the file source records 1m); verify API representation against your Grafana version. Review the staging service_name selector for every Loki rule. All rules are paused and marked provisional. No contact point or policy mutation is performed. Merge the example grouping/repeat policy into the existing private notification tree, preserving other services.

Use RUNBOOKS.md to calibrate triggers on a stable cohort. USD 5/hour, backlog 25, three retained failures, 10-minute delay and 5% invocation errors are explicit review policies, not measured SLAs or regressions. Provider counts are retained scoped failures, not provider failure rates. Database failure attribution requires binding spans. Spending-limit proximity and full-history oldest-backlog coverage remains incomplete until the necessary timestamp/authorization evidence exists; do not synthesize them. A no-data state must route to observer diagnosis, not clear an incident as healthy.

## 5. Link incidents to existing pipeline traces
Use event UTC time, environment and boundary to narrow the incident. In the private admin UI identify the affected feed/window; run scripts/pipeline-trace.mjs against its existing administrator-only route. Use operations for immutable receipts/reservations and articles/sources for acquisition lineage; retain private record IDs in the incident, never labels or public links. A completed investigation means the diagnostic read worked, not that the pipeline succeeded. Compare durable request results, recorded edition and independent reader observation separately. Notification API success proves service acceptance only. No auth route is changed by this workstream.

## Primary references checked
- https://developers.cloudflare.com/workers/observability/opentelemetry-export/
- https://developers.cloudflare.com/observability/export/opentelemetry/
- https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/
- https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/http-api-provisioning/
- https://grafana.com/docs/k6/latest/using-k6/scenarios/

## Enqueue-age and V3 timing extension
New canonical jobs record a real wall-clock enqueuedAt precommit proxy in the existing immutable job write; no new write or identity is introduced. The existing grouped sources query now returns oldest timestamp, observed/missing timestamp coverage, attempts and recorded resource waits. Retained legacy jobs are not backfilled. Oldest observed pending age is a known-subset lower bound, never proof that older unmeasured work does not exist. The supplemental paused age alert uses a provisional 30-minute threshold held 15 minutes.

V3 already persists total/stage timings in v3_window_results. Overview now reads that exact request-bound result by indexed ID and exports only fixed timing stages (edit, verify, repair, consolidate) and status. No prompt or reader text is exported. Stage timing includes existing engine/reuse behavior and uses the engine's existing wall clock; it is not a claim of fresh provider execution. Recorded publication proxies use publication_status.publishedAt, edition.publishedAt or edition.createdAt in that order with explicit source provenance.

## Atomic private metrics bridge
For an existing operator-private node_exporter textfile directory, use:

```sh
node scripts/agentops-textfile.mjs /PRIVATE/TEXTFILE/DIRECTORY/distilled.prom PRIVATE_OVERVIEW.json PRIVATE_OPERATIONS.json PRIVATE_SOURCES.json
```

The parent directory must already exist. This command performs no network calls. It accepts at most 1000 files/50 MB total/20 MB per input, requires complete views from one explicit window and fresh observedAt values (at most five minutes old, never future), and atomically replaces the .prom output with mode 0600. On validation failure it replaces application metrics with observer_up=0 and exits nonzero; it never rewrites source JSON. It exports both the minimum data-observation timestamp and projection time, so regenerating an old file cannot make it appear fresh. Configure scraping under job distilled-snapshot, with node_exporter running as the file owner. Filesystem failures can prevent replacement; the separate timestamp/absence alerts and host monitoring must catch those. The five-minute freshness policy is provisional: approve a collection cadence and database budget before enabling these two additional paused alerts. Historical synthetic fixtures intentionally fail this freshness gate; use the offline projector for demonstrations.

## Staging activation progress

See [STAGING_ACTIVATION.md](STAGING_ACTIVATION.md) for the current authenticated-access blockers, exact baseline CI evidence, static privacy audit and per-requirement acceptance status. Do not treat the inactive fragments as a completed Grafana integration. No export should be enabled before the privacy findings and explicit cloud/deployment approvals are resolved.
# Current staging activation policy

For this activation, follow [the final approval package](ACTIVATION_APPROVAL.md) and [Worker collector evidence](WORKER_COLLECTOR_VALIDATION.md). The selected collector is Worker-native; no Alloy host is required. Legacy application-log export is prohibited. Earlier generic unsampled-log instructions below do not authorize staging log export. Native traces require a separate attribute/privacy review and deployment approval. The collector remains disabled until its concrete deployment is approved; all alerts remain paused.
