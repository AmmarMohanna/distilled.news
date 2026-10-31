# Real multi-user staging campaigns

Status: implemented framework; **no new real campaign has been executed**. These definitions are not capacity results or spending authorization. The earlier ten-GET AgentOps smoke remains a separate result. Preserve the existing synthetic suites and the single-feed metrics collector.

## What is implemented

- `real/run.mjs`: exact-manifest/revision/preflight/approval admission; registration, email verification, sign-in, feed creation, schedule planning, asynchronous observation, k6 launch, fault controls, recovery reconciliation, archive cleanup and private HTML reporting.
- `real/lifecycle.mjs`: ordinary authenticated application APIs. No cookie signing, auth-token database reads, source-assessment bypass or administrator impersonation of users. Setup journals mutations before sending; unknown mutations stop and are reconciled by owned reads, never blindly resent.
- `real/users.k6.js`: real sessions, account/owned-feed reads, Explore, public/private feed reads and cross-user negative probes. One bounded request per iteration, fixed maximum requests, VU stages, p50/p95/p99 and aborting thresholds. It starts near the first reporting deadline so HTTP activity overlaps scheduled work. Edition read-back is performed separately by the observer.
- `real/observer.mjs`: independently enumerated scheduled opportunities, missing jobs, quiet versus published outcomes, reader read-back, polling bounds, citation ownership, duplicate identities, changed settlements and repeated provider-generation identities. Restart restores retained observations; it never infers successful publication from HTTP 200 alone.
- `apps/worker/src/agentops-campaign.ts`: private admin-only observation API, disabled by default, restricted to fresh registered campaign feeds/accounts. It reuses the actual scheduler and canonical window identity. Reads use explicit IDs, bounded cohorts and existing indexes; exceeding a cohort/query/row limit fails observation rather than silently reporting a partial healthy result.
- `real/faults.mjs`: genuine provider-auth rejection and dedicated queue-concurrency controls via Cloudflare, canonical duplicate queue delivery, and a short-lived exception after durable V3 output. Provider-secret rollback requires the original secret before mutation. Controls are journaled before use and restored on exit. No mocked provider success is used by real runners.
- `real/resource-window.mjs`: dedicated Worker/D1 time-scoped analytics and approximate real queue backlog/oldest-age metrics. Account-wide inventory is never relabeled as campaign consumption.
- `real/accounting.mjs`: explicit all-stage reconciliation, including assessment, artwork, Browser tools and external collectors. Missing categories or unknown outcomes block the campaign. Reservations are not treated as actual charges, and duplicate evidence is not summed twice.
- `real/telemetry.mjs`: OTLP gauges with only fixed environment/profile/slot labels. Correlation IDs, cookies, source text, account/feed IDs and model prompts remain private. Requested traceparents are explicitly distinguished from observed traces.
- `performance-real.yml`: manual-only protected GitHub environment; it verifies actual required reviewers through GitHub. Raw private artifacts are never uploaded. CI requires a separate 256-bit secret and uploads only AES-256-GCM encrypted evidence, with three-day retention. Existing synthetic CI workloads remain unchanged.

These components are tested offline. Real QA authentication/accounting adapters and deployment remain qualification gates, not claimed completed integrations.

## Isolation and deployment preflight

Do not enable this on the existing shared staging app. Prepare a dedicated `distilled-news-staging-campaign-<name>` app with **new** D1, R2 and queues, existing authorized source services and the current V3 path. Do not copy production resource IDs or deploy with the default Wrangler configuration. The target must preserve existing security, provider admission, idempotency and accounting settings. No VAPID private key, real push subscriptions or reader notifications.

Apply ordinary application migrations only to that new database, then `ops/performance/0001_campaign_controls.sql`. This opt-in schema is intentionally outside default application migrations. It does not alter historical financial records.

Only the isolated target may set:

```text
ENVIRONMENT=staging
AGENTOPS_CAMPAIGN_ENABLED=true
AGENTOPS_CAMPAIGN_ISOLATED=true
AGENTOPS_CAMPAIGN_ALLOW_FAULTS=false
```

Fault approval is separate and enables the last flag only for its bounded campaign. The API also requires real admin authentication, matching Origin and JSON content type. Production or a target with a VAPID private key cannot enable it. Normal V3 executions do no campaign-control SQL lookup.

The snapshot API admits at most ten explicit windows, 128 operations per window, 512 provider receipts, 500 citation IDs, three source scopes per feed, 100 pending jobs per source, 500 account reservations and 200 queries / 20,000 rows per request. Those metadata checks occur **after** each SQL query: they are abort thresholds, not hard database billing caps. Only fresh isolated cohorts are allowed. The client batches five windows and retains private immutable IDs.

Preflight evidence must establish current deployment revision, an exact model-configuration hash and a current provider-pricing evidence hash, exact isolation bindings, subscription/usage headroom, notification absence, ordinary mailbox/challenge readiness, source permissions, all-stage accounting, task-specific authoritative spending admission, execution slots, model call exposure, rollback and Grafana access. Initial evidence must be less than one hour old at phase startup; resource and accounting reads continue during execution; approval binds its hash, the exact manifest and phases, expires within 24 hours, and is checked again during execution. Model/provider execution remains subject to existing server-side admission; client polling is not a substitute for an atomic budget guard.

## Secure integrations still required

`real/adapter.mjs` connects to **existing authorized private QA interfaces**, not a newly provisioned service. It requires an allowlisted HTTPS origin, private token and endpoints providing real mailbox verification tokens, valid Turnstile results, bounded new-account spending admission and complete current accounting. It never fabricates these results. If these interfaces do not exist, provide an operator-reviewed local adapter implementing the same functions; use the already authorized mailbox/normal browser flow and existing financial mechanisms. Do not build new hosting or disable production challenges just to launch a test.

The accounting response is passed through `reconcileAccounting`: unique model reservation IDs, actual known calls, settlement/held state and explicit coverage of assessment/artwork/Browser/collector costs are required. A reserved or in-flight operation is distinct from an uncertain outcome. Task admission must be real, scoped to new accounts and bounded by the manifest; an attestation alone does not authorize or implement grants. Historical grants/holds are untouched. If atomic task limits or complete tool-cost coverage cannot be established, remain BLOCKED.

Credentials belong only in secure environment storage; never chat or committed manifests. The runner uses `CAMPAIGN_ADMIN_COOKIE`, `CAMPAIGN_EMAIL_DOMAIN`, `CAMPAIGN_ADAPTER`, the private QA API variables documented in `adapter.mjs`, and Cloudflare/Grafana tokens only when their particular phase is approved. Account passwords/cookies and exact outputs are saved beneath `.local-reports/real-campaigns/<runId>/` (ignored). Windows operators must restrict this directory to their user; POSIX modes alone are not Windows ACL enforcement.

The AgentOps setup additionally exercises the ordinary authenticated source-assessment API on its separately authorized `agentSources`. The private runtime evidence adapter must return actual owned decision/tool records; an RSS acquisition or accepted source URL is not proof that Browser Agent ran. For Browser Agent runs, retain exact owned run IDs in `registry.private.json.browserRuns` as `{runId,ownerId}`. The observer reads the existing durable Browser telemetry records. The AgentOps profile refuses to run without these references. Missing telemetry is `NOT_OBSERVED`, not proof of a successful agent. Detailed decision/tool history requires the existing authorized private runtime trace API and a separate privacy review before any external export. Metadata counts alone cannot judge reasoning correctness.

## Commands

Run from the repository root. First copy a versioned draft to the ignored run folder, choose a fresh run ID, pin the **current clean Git SHA**, and freeze it before seeking approval. A run manifest is a hashed private artifact; it cannot embed its own eventual commit SHA. Versioned draft workload definitions remain in Git.

```text
node evaluation/performance-reliability/real/run.mjs validate MANIFEST
node evaluation/performance-reliability/real/run.mjs inspect-resources MANIFEST
node evaluation/performance-reliability/real/run.mjs preflight MANIFEST EVIDENCE
node evaluation/performance-reliability/real/run.mjs setup MANIFEST PREFLIGHT APPROVAL
node evaluation/performance-reliability/real/run.mjs resume MANIFEST PREFLIGHT APPROVAL
node evaluation/performance-reliability/real/run.mjs plan MANIFEST PREFLIGHT APPROVAL
node evaluation/performance-reliability/real/run.mjs campaign MANIFEST PREFLIGHT APPROVAL
node evaluation/performance-reliability/real/run.mjs cleanup MANIFEST PREFLIGHT APPROVAL
node evaluation/performance-reliability/real/run.mjs report MANIFEST
```

`validate`, local `preflight` and `report` do not contact providers. `inspect-resources` performs six bounded read-only Cloudflare/Grafana control-plane requests. It never provisions or queries article tables. Other phases require explicit authorization and a clean exact revision. There is no command that grants its own approval. Scope duration must cover observation plus the cleanup request-timeout reserve; active execution stops early enough to archive before expiry. A stale run lock requires review; never automatically delete it or replay unknown mutations.

Approval schema: `distilled-real-approval.v1`, exact `manifestHash`, `preflightHash`, `revision`, `issuedAt`, `expiresAt`, allowed `phases`, `maximumUsd`, `maximumRequests`, `maximumModelCalls`. Maximum requests must cover application **plus** control-plane budgets. Setup and campaign authorization must include cleanup. The active campaign also requires observe/traffic, faults when configured and telemetry for Grafana writes. A known control-plane request budget includes private auth/accounting APIs, fault APIs and metric exports. Cleanup has reserved application requests.

Private resource registry: `{runId,isolated:true,accountId,worker,databaseId,queueIds,queueId?,consumerId?}`. Queue contention additionally verifies the actual consumer belongs to the isolated Worker before updating it. Do not purge queues. Provider failure requires the original key securely available for rollback; it is never saved in the rollback file.

## Profiles and proposed first pilot

All six JSON definitions are **DRAFT / NOT AUTHORIZED**. Their dollar amounts are proposed caps, not established prices or estimates. Do not run the whole matrix automatically.

| Profile | Users / feeds | Max VUs | HTTP active period / max GETs | Asynchronous observation |
|---|---:|---:|---:|---:|
| load pilot | 2 / 4 | 2 | 120 sec / 120 | 90 min |
| spike | 4 / 8 | 8 | 180 sec / 240 | 90 min |
| stress | 4 / 8 | 8 | 300 sec / 400 | 90 min |
| soak | 2 / 4 | 2 | 30 min / 600 | 90 min |
| recovery | 2 / 4 | 2 | 60 min / 120 | 120 min |
| AgentOps | 2 / 4 | 2 | 120 sec / 60 | 90 min; real owned Browser runs required |

The first pilot mixes English/public/30-minute and Arabic/private/60-minute feeds, different interests, and shared upstream reporting across users. Setup concurrency is one. HTTP activity starts near the first actual delivery deadline, while asynchronous observation continues across later opportunities. Sources and service terms still need explicit authorization. Real source acquisition may be quiet: a quiet window counts as a completed opportunity, not a successful nonempty briefing or factual-quality result.

Proposed first-pilot ceiling: **$2 total**, including a **$0.10 Cloudflare envelope** and **$0.50 reserved for stopping/draining**; at most 40 model calls as an admission requirement. Partition new-account exposure conservatively; do not exceed existing server-side limits. This is not yet an approved or verified executable budget. Application requests <=2,000 including the reserved 60 cleanup requests and 120 k6 requests; private/control-plane requests <=512. Require current pricing, all-stage worst-case bounds and actual resource headroom before approving the frozen manifest. If call limits cannot be enforced by existing admission, the campaign stays blocked rather than advertising a polling threshold as a hard limit.

Stop on any uncertain paid outcome, exhausted admission/exposure, HTTP/check thresholds, queue backlog >20, oldest pending age >15 minutes, missing queue age when backlog exists, incomplete observation, or any observed ownership/duplicate/ledger violation. p95 HTTP target <3 seconds and error rate <5% are provisional stop thresholds, not an SLO established by evidence. Permit a five-minute reporting-deadline grace for evaluation; also retain the raw scheduled-time delta.

Successful completion archives only run-owned feeds, disables their sources and disables test accounts. Financial/source/publication history is retained. No account/feed cascade deletion, queue purge, history rewriting or release of uncertain holds. In-flight work can finish under its original accounting; archive is not cancellation of provider charges. A stopped or partially completed setup also attempts safe archive; failed cleanup is an explicit operational blocker.

## Measurements and limitations

- Offered opportunities come from persisted schedules, not completed jobs. Quiet, missing, pending, failed and published/read-back outcomes remain separate. Deadline rates exclude immature deadlines and report UNKNOWN/bounds when polling cannot distinguish on-time from late visibility; missing jobs still remain in the denominator when due.
- Read-back timestamps are upper observation bounds at the polling interval. Do not call saved-source replay acquisition latency or use success-only p95 to hide missing windows. Small-sample tails are exploratory.
- HTTP latency/success comes from k6. Registration/feed-creation timing is in the separate private request journal. Neither proves asynchronous publication or Browser task correctness.
- Publication identity, source ownership and repeated paid identities are mechanical safety checks. They do not establish factual accuracy. Save exact sources, editions and references for separate human review; do not invent factual labels.
- Model tokens/latencies/failures are observed receipts; unknown fields remain identified as unknown. Model-account ledger totals alone omit some tool/collector charges, so external reconciliation is mandatory. Actual settled, held and uncertain amounts are separate.
- Worker/D1 analytics may lag; queue metrics are approximate. Observer SQL work is measured separately from application work. Empty analytics do not mean zero consumption.
- Each phase saves exact inputs, revision, journal, outputs and hashes privately. HTML reports label unexecuted results NOT RUN. Compare offered/completed throughput and resource growth before increasing the next profile. No capacity or first-bottleneck conclusion exists yet.
- Native application/model/tool trace export is not qualified by the earlier collector-only trace audit. Keep broad tracing and legacy logs off until its own reviewed approval. Requested trace IDs and CF-Ray correlation are not Tempo proof.

Grafana queries use `distilled_campaign_*{environment="staging",profile="load",slot="isolated-campaign"}` gauges. Run only one active campaign per slot (workflow concurrency enforces this in CI; supervised runners require the same operational exclusion). The existing dashboard and collector stay intact. The new optional dashboard definition is `ops/performance/grafana-campaign-dashboard.json`; import only with separate cloud-mutation approval. No user/feed/run labels or private URLs. Alert notifications remain paused.

Reference APIs: [Queue metrics](https://developers.cloudflare.com/api/resources/queues/methods/get_metrics/), [Queue consumer update](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/update/), [Workers analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/), [D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).

For protected CI, prefer a private bundle with `phase: "run"`; it executes setup ? plan ? campaign and always attempts owned cleanup. Standalone setup in that workflow is archived when the phase exits. Preserve the artifact encryption key securely outside Git. Restore a downloaded encrypted bundle locally with `CAMPAIGN_ARTIFACT_KEY` set and `node evaluation/performance-reliability/real/open-artifacts.mjs PATH_TO_ENCRYPTED_BUNDLE`; do not paste the key into chat or pass it as a command-line argument.
