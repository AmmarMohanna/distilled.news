# Staging AgentOps activation: acceptance record

Status: **BLOCKED before cloud activation; not an operational acceptance**.

## Baseline and boundary

- Working branch: `staging/agentops-grafana-activation`.
- Base: latest fetched `integration/aya-ghada-agentops-k6-preserved`, `feab966d12587d42e6f2c2cca299a6acee73e3b4`.
- Complete baseline GitHub Actions run [41142513586](https://github.com/AmmarMohanna/distilled.news/actions/runs/41142513586) completed successfully. This is the baseline workflow result, not a claim that a later activation deployment passed.
- Intended target: `distilled-news-staging`, account `e32b564514d4f9b9e383b7dd30dbb026`, staging URL `https://distilled-news-staging.distillednews-platform.workers.dev`.
- Expected resources from the explicit staging config: D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`, R2 `distilled-news-staging-raw`, and staging-prefixed queues. Live resources must be re-read after authentication is restored.
- No product instrumentation, prompts, scheduling, frontend, accounting or provider routing was changed. No cloud resource mutation, deployment, provider call, notification or financial mutation was performed.

## Authentication preflight

The existing Cloudflare OAuth returned HTTP 401/code 10000 for settings, destination inventory and deployments. Wrangler subsequently reported that the token expired and could not refresh. The failed preflight does **not** establish that destinations are absent or that permissions are adequate. No Grafana token was available in the task environment. Browser automation failed to initialize, so no authenticated Grafana UI was inspected.

The supplied Grafana organization URL identifies organization `giganticmantel34`; it is not the Grafana stack API URL. The actual `https://<stack>.grafana.net` hostname, OTLP gateway region/instance and existing collector inventory remain required.

### Minimum secure operator actions

1. Open the organization, select the stack, and use **Launch Grafana**. Supply only that nonsecret stack URL in chat.
2. Restore Cloudflare access. A scoped API token should be restricted to the staging account: Workers Scripts Read for preflight, Workers Observability Read for destination inventory, and Workers Tail Read for controlled log inspection. Later approved destination changes require Workers Observability Write; approved Worker activation requires Workers Scripts Write. Do not request unrelated D1 write, account billing or production permissions. Endpoint authorization must be confirmed before mutations.
3. In the Grafana stack, use a short-lived service-account token for resource provisioning. Prefer folder/dashboard permissions, datasource read/query access and `alert.rules.provisioning:read/write` where custom RBAC is available. Do not grant notification provisioning permissions. If fine-grained roles are unavailable, the temporary stack Editor role is the supported practical fallback, broader than ideal; confirm actual permissions and revoke it after setup. No organization-admin token is needed for dashboard import.
4. Obtain the stack's OTLP connection details and a stack-scoped Cloud Access Policy token with `logs:write`, `traces:write` and, only for the approved metrics route, `metrics:write`. Grafana service-account tokens and Cloud Access Policy ingest tokens serve different APIs. Prefer separate short-lived provisioning and long-lived narrowly scoped ingest credentials.
5. Store values locally or in an operator secret manager, never in chat, argv, Git, logs, screenshots or Worker vars. A blank local template is under `.local-reports/agentops-activation/credentials.env.example` in this worktree. Copy to an ignored local credentials file and restrict its Windows ACL to the operator before entering values. Do not run commands that echo file contents. Destination Authorization headers are secrets even when base64 encoded; destination API responses must be redacted before saving evidence.
6. Identify an existing private Alloy/Prometheus/node_exporter host, if any. No host access or provisioning is inferred from the existing source helper binding.

Restoring access is not deployment approval. After authenticated preflight, prepare exact destination/import/deployment diffs and obtain the user's separate approval before applying them.

## Privacy audit findings

Static inventory found 108 console call sites in non-test Worker source. This is an inventory, not 108 confirmed leaks. The existing `agentops.v1` event emitter has fixed metadata fields and suppresses observer failures. Other paths are richer:

| Surface | Finding | Export decision |
| --- | --- | --- |
| `src/app.ts` global error handler | Logs an arbitrary Error object | Raw message/stack must not be broadly exported without sanitization. |
| `src/app.ts` authentication mail diagnostic | Account ID, email/sender domains and arbitrary error message | Personal metadata and provider diagnostics need explicit minimization. |
| `src/index.ts` queue/maintenance diagnostics | Private work/message IDs and raw exception messages in several paths | IDs may only be private metadata, never index labels; raw text needs filtering. |
| `src/public-source-discovery.ts` challenge diagnostic | Visible/structural evidence and origin host | Can contain scraped source text; exclude from aggregate export. |
| `src/retention.ts` | Object key and raw failure message | Do not export unrestricted keys/errors. |
| `src/v1-intelligence/latency.ts` | Feed/window/operation IDs and timing/cost metadata | Keep private correlation fields separate from low-cardinality labels. |
| Native spans | HTTP URLs and binding metadata require a controlled real sample | Header, query-string, URL and SQL parameter exposure is not yet verified safe. |

No live log sample was retrieved because authentication failed. No actual secret disclosure is asserted from static risk alone. Do not activate the full native log stream simply because the new emitter is safe. `invocation_logs=false` removes invocation logs, not arbitrary existing console messages or all native span metadata. Setting `persist=false` is a storage choice, not redaction.

Preferred if an existing private Alloy host is available: allowlist the fixed aggregate event shape, normalize the actual OTLP console envelope, and remove nonessential resource/span attributes before Grafana export. Native trace/span IDs must survive that processing. This requires an authenticated sample and validation; no untested processor is represented as deployed. If no host exists, present an explicit low-cost option and obtain approval before provisioning. Do not silently add a second Worker or replace the intelligence pipeline.

## Metrics and operational limitations

The existing projector and atomic textfile bridge are implemented and tested. They perform no network collection or remote_write themselves. No existing private collector, scrape job or remote_write target has been confirmed. The simplest recommendation is Alloy on an existing operator host with node_exporter textfile collection, using the existing trace API and bounded explicit window. Reusing a workstation is suitable for a supervised smoke test, not unattended reliability. Do not provision a new VM merely to complete a dashboard.

A continuous collector needs an explicit cohort, cadence, database-read budget and a renewable operator-auth mechanism. The current trace API is administrator-session authenticated; do not invent a long-lived service token or public metrics route. The existing five-minute snapshot freshness rule must remain visible. Source history, missing timestamp coverage, model reported/settled/reserved/held amounts and observer health retain their existing meanings.

The 14-panel dashboard and all 11 paused rules pass static validation. All rules preserve `NoData` and `Error` states; no-data is not healthy. Actual datasource UIDs, folder ACLs, native log-envelope mapping, service/environment selectors and every panel query remain unverified. The aggregate AgentOps event itself has no native trace ID field: correlation with Tempo must be demonstrated through the real OTLP context, not assumed from an application record ID.

## Acceptance matrix

| Requirement | Status | Evidence or blocker |
| --- | --- | --- |
| Dedicated branch from latest integration | VERIFIED | Base and branch above; existing worktrees untouched. |
| CI-green starting point | VERIFIED | Exact baseline run above. |
| Existing implementation retained | VERIFIED | No runtime/config changes in this activation pass. |
| Secure authenticated Cloudflare access | BLOCKED | Expired OAuth, failed refresh. |
| Grafana authenticated access and stack identity | BLOCKED | Organization known; stack URL and tokens missing. |
| Audit before export | PARTIAL | Static risks inventoried; live sample unavailable. |
| Live target/account/bindings comparison | PARTIAL | Repository target known; live read returned 401. |
| Actual cost limits and retention | BLOCKED | Account plans/usage unverified; no new spending ceiling approved. |
| Private Logs/Traces destinations | BLOCKED | Names proposed: `distilled-staging-logs`, `distilled-staging-traces`; existence and endpoint delivery not verified. |
| Worker sampling/privacy activation | BLOCKED | Export audit, mutation approval and explicit deployment approval required. |
| Loki delivery | BLOCKED | No actual Grafana data observed. |
| Tempo delivery and trace correlation | BLOCKED | No observed native trace IDs. |
| Existing private metrics projection | VERIFIED | Local regression tests only; not live export. |
| Automated private collector/remote_write | NOT IMPLEMENTED | Existing bridge does not implement a network collection service; infrastructure inventory pending. |
| Backlog/outcome/delay/retry/model/cost coverage | PARTIAL | Existing schema/projection tested; live values and missingness not queried. |
| Private dashboard import | BLOCKED | 14 panels statically checked; no dashboard URL created. |
| All panel queries against real data | BLOCKED | Actual datasource mapping/data absent. |
| Paused alert import | BLOCKED | 11 definitions checked; none created by this task. |
| Alert thresholds/grouping/no-data | PARTIAL | Provisional definitions reviewed; live evaluation pending. |
| One verified alert evaluation | BLOCKED | No real Grafana evaluation. |
| Successful real staging workflow | BLOCKED | Existing private workflow/read-back and telemetry not observed in this task. |
| Controlled model/tool failure | BLOCKED | Isolated scenario and mutation/exposure approval not yet prepared. |
| Denied action/safe fallback and execution history | BLOCKED | No fresh correlated live scenario claimed. |
| Notifications disabled for this task | VERIFIED | No contact-point/policy changes or notifications initiated. |
| Production untouched | VERIFIED | No deployment or cloud mutation performed. |

## Local validation and evidence

- Ten Node tests passed across snapshot projection, atomic textfile export and alert API-body conversion.
- Four Worker AgentOps tests passed.
- Static validator: 67 metrics, 14 panels, 11 paused alerts, eight explicitly synthetic documents.
- Both inactive Wrangler fragments validate against installed Wrangler schema; merged TOML parses.
- Baseline complete hosted workflow is green. A documentation follow-up SHA needs its own hosted result and must not inherit that claim.
- Private local evidence: `.local-reports/agentops-activation/` contains the static log inventory, panel/rule inventory, failed Cloudflare read diagnostics and regression logs. Credentials are not committed.
- Paid inference: zero calls, zero charges initiated. Cloud resources provisioned: zero. Incremental telemetry ingestion: none activated. No claim of a measured recurring bill is made.

## Next approval package

After authentication and collector inventory, present exact resource operations: destination names/endpoints with headers redacted, privacy controls, unchanged target binding inventory, 100% logs/5% traces candidate rates, measured/estimated ingest volume, permitted retention, initial dashboard/rule UIDs and bounded smoke requests. Keep all alert notification delivery disabled. Do not infer approval to ingest potentially billable data from the existence of an account. Import and query actual Grafana data before promoting any BLOCKED row to VERIFIED.

## Primary references checked

- [Cloudflare OTLP export](https://developers.cloudflare.com/workers/observability/opentelemetry-export/)
- [Destination creation and required permission](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/destinations/methods/create/)
- [Grafana service accounts versus ingest credentials](https://grafana.com/docs/grafana-cloud/platform/security-and-account-management/security-and-access/authentication-and-permissions/)
- [Grafana alerting permissions](https://grafana.com/docs/grafana/latest/alerting/set-up/configure-rbac/)
- [Grafana Cloud Access Policies](https://grafana.com/docs/grafana-cloud/platform/security-and-account-management/security-and-access/authentication-and-permissions/access-policies/)
