# Multi-user AgentOps campaign framework — implementation and preflight

## Outcome

The existing synthetic k6 suites and live single-feed collector are preserved. A separate real authenticated campaign framework is implemented and locally validated. **No new real multi-user campaign, test account/feed, deployment, paid provider request or source-acquisition campaign has been launched. No staging scalability claim is supported yet.**

The initial basis is activation commit `a39deb40b6af07c0e7d6c4e7c44fc7c2a6b5b21e` on `staging/agentops-grafana-activation`. Final revision is recorded by Git/CI, not embedded recursively in its own commit. Existing main app behavior, models/prompts, account holds, queues and collector deployment have not been changed remotely.

Implementation and operating instructions: [real campaign framework](../../evaluation/performance-reliability/real/README.md). Sanitized measured inventory: [preflight artifact](../../benchmarks/results/agentops-real-framework/preflight-2026-10-31.json).

## Implemented and tested offline

- Six versioned draft workload profiles and strict revision/hash/phase/expiry/budget admission.
- Real application registration, email verification, login, account/feed setup and conservative archive cleanup; no authorization/source-assessment bypass. Setup requires genuine scoped spending admission before source/artwork work.
- Private, disabled-by-default campaign observation and evidence export. Bounded explicit-window queries, actual schedule reuse, citation-owner checks, durable operation/receipt checks and new-account ledger reads. The observer rejects forged windows and oversized/incomplete cohorts.
- Independent scheduled-opportunity denominator, completed/quiet/published read-back distinctions, polling-bound latency, deadline maturity, deterministic ownership/duplicate checks and retained observations across interruption.
- Separate k6 user traffic, asynchronous V3 observer and real Browser run references. No fixture endpoint or mocked response can stand in for a real campaign outcome.
- Genuine isolated provider-auth/queue contention controls, canonical duplicate queue sends and a bounded interruption after durable V3 result persistence. Existing V3 crash/replay behavior remains intact. These controls have not been exercised live.
- Private result journals and exact evidence/editions; bounded resource analytics; sanitized, fixed-cardinality Grafana gauges; optional dashboard definition; manual-only workflow with verified environment reviewers and encrypted private artifact storage.
- No new production-facing model stage, semantic policy, prompt or reliability bypass.

## Evidence and tests

The first complete focused run passed **41 tests**: the then-existing 36 V3 window regressions plus five initial campaign tests. These are local tests with deterministic model fixtures, not real inference results.

The expanded private campaign test file passed **seven tests**, including actual local D1 SQL against all application migrations plus the explicit campaign-only migration. It verified bounded reads, registered ownership, forged-window rejection, no financial reservations created and expired/default-off interruption behavior.

The new post-durable-result recovery regression passed separately: interruption after two fixture provider calls left one saved V3 result and no edition; recovery published one edition, and another duplicate delivery made no additional provider call. The existing runtime intentionally surfaced the injected internal exception as `TEMPORARY_UNAVAILABLE`; the regression checks that public behavior and the actual hook execution.

The final combined performance Node contract suite passed **51 tests**, including 23 new framework tests. Workspace TypeScript checks passed. The official checksum-verified k6 1.3.0 binary passed configuration inspection with zero traffic requests. Final GitHub CI results must be read from the final validation record; a passing harness is not staged execution evidence.

A fixture typo (`50`/`30m` instead of the real intensity/cadence types) was detected by workspace TypeScript checks and corrected in the new test only. k6 inspection initially did not inherit environment variables; explicit `-e` inputs and an isolated k6 configuration fixed it without generating traffic. No application behavior was restored or weakened to satisfy an obsolete expectation.

## Actual read-only preflight

At **2026-10-31 18:15:57 UTC**, bounded Cloudflare/Grafana control-plane reads returned:

| Reading | Observed value | Interpretation |
|---|---:|---|
| Account Worker requests, month to date | 3,157,640 | Existing account usage, not campaign traffic |
| Account Worker CPU, microseconds, month to date | 591,711,911,410 | Existing account usage; not a per-request latency |
| Account D1 rows read, month to date | 91,346,760,555 | Existing account usage; broad history scans are inappropriate |
| Account D1 rows written, month to date | 76,070,754 | Existing account usage; does not establish remaining authorized spend |
| Proposed dedicated campaign Worker | HTTP 404 | Not provisioned; no deployment authorized by this task yet |
| Grafana reported billable series / included series | 3 / 10,000 | Usage billing metric, not measured active-series cardinality |
| Grafana reported trace usage / included trace usage | 0 / 50 | Usage-datasource values; not a new trace campaign |

The first Cloudflare inventory returned 401 after the old OAuth expired. The existing CLI session was refreshed securely; the repeat succeeded. The failed attempt is retained privately. Credentials were not printed, committed or requested in chat.

No production/shared-feed table scans, provider execution, source scraping, telemetry writes, alert notifications or new cloud mutations were needed for these reads. Model spend for this task is **$0 / zero paid inference calls**. Control-plane reads are not a measured billable campaign; no new attributable cloud invoice charge is claimed.

## Approval package — not ready to launch

Proposed first pilot: **two users, two feeds each, English/public/30-minute and Arabic/private/60-minute, a shared public Telegram channel plus a regional RSS source/topic (permissions still to verify), one setup worker, at most two HTTP VUs, 120 GETs over two minutes near the first deadline, 90 minutes of asynchronous observation, 60-second polling**. Application request ceiling 2,000; private/control-plane ceiling 512; 60 application requests reserved for cleanup. Automatic safety stops and exact phase authorization are required.

Proposed total exposure ceiling **$2**, including a $0.10 Cloudflare envelope and $0.50 stop/drain allowance, with at most 40 model calls as an admission requirement. These are proposed limits, **not verified pricing or current spending approval**. Current source-assessment/artwork/tool/model maxima and existing authoritative account limits must substantiate them first. No higher profile is automatically approved if the pilot succeeds.

Before approval can become executable:

1. Establish dedicated Worker/D1/R2/queue isolation and deployment approval, preserving existing staging and production.
2. Connect the authorized QA mailbox, valid challenge flow and genuine admin session securely. The adapter must not synthesize verified sessions or access auth-token SQL.
3. Connect task-specific new-account admission and full current cost reconciliation, including source assessment, artwork, Browser and external collector charges. Verify model-call bounds and existing execution slots without changing historical holds/grants. Client polling is not an atomic spending cap.
4. Verify resource/pricing headroom, exact source permissions, target model configuration, provider limits and projected marginal usage on the frozen manifest. Inventory alone does not do this.
5. Configure required reviewers on `agentops-multiuser-staging-approval` and secure private artifact encryption/access. YAML cannot create those reviewers.
6. Review actual application/model/tool trace attributes before external tracing. The prior collector-only privacy audit does not qualify the main app. Legacy logs remain disabled; no fake trace correlation is reported.
7. Approve the exact final manifest, preflight hash, phases, duration, requests, provider/tool exposure and isolated deployment. Until then all real profiles remain **NOT RUN**.

## Acceptance status

| Requirement | Status |
|---|---|
| Preserve current product, synthetic k6 and existing collector | Implemented; local regressions pass; final CI is authoritative |
| Real setup/cleanup runner | Implemented; real QA authentication/accounting integration BLOCKED |
| Six real campaign definitions/runners | Implemented/gated; NOT EXECUTED |
| Private bounded multi-feed observer | Implemented/local D1 tested; NOT DEPLOYED |
| Grafana-compatible campaign metrics/dashboard | Implemented; new real metric ingestion NOT VERIFIED |
| Real Browser decisions/recovery | NOT RUN; exact owned run evidence and privacy review required |
| Genuine V3 acquisition-through-publication under user concurrency | NOT RUN |
| Capacity / first bottleneck / soak degradation | NOT MEASURED |
| Provider/tool/Cloudflare campaign cost reconciliation | NOT RUN; zero new paid inference |
| Independent factual accuracy | NOT ASSESSED |
| Production changes or notifications | NONE |

The next useful result is the small real pilot after the listed gates, not another synthetic capacity claim. Its results determine whether spike/stress/soak deserve separate approval and larger limits.
