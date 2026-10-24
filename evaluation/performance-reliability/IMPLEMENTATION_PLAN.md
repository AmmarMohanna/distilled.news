# Implementation plan and qualification gates

This plan implements Aya's system-performance/reliability workstream. The design/arithmetic foundation is present; later stages are not claimed complete. Do not modify the V3 workflow, production routing, acquisition authority or paid-operation identities merely to simplify an evaluation.

## Stage 0 — completed design foundation

Deliverables: protocol, repository timestamp/accounting audit, 25-metric catalog, read-only development-corpus audit, offline reference calculations and 22 contract/arithmetic tests. Existing datasets were checked without editing their source text. No network/provider execution is present in the new modules.

The tests cover null versus zero, malformed/negative timing, R7 interpolation, a large sample, independent-trial Wilson examples, deadline maturity and future-information leakage, duplicate opportunities, duplicate/conflicting charges, unknown/unsettled costs, zero publication denominators, frozen case/text hashes, stable IDs, half-open windows, track gaps and unsafe case paths.

## Stage 1 — normalized evidence contract and offline report

Status: **implemented offline** (`evidence-schema.mjs`, `import-evidence.mjs`, `report.mjs`, fixture and 26 tests). The qualification items below are covered by those tests on synthetic fixtures. Not yet done: a reviewed real bundle, the evidence-revision record needed for `evidence_availability_to_public_readback`, and a manual reconciliation against raw records (Stage 4).

Deliverables:

- Versioned schemas for campaign manifest, opportunity, attempt, timestamp/clock provenance, canonical financial operation, publication/read-back, subscription receipt and intervention event.
- Strict importer with idempotent identities, append-only evidence references and explicit historical-proxy labels. Report contradictions without deleting affected opportunities from denominators.
- Offline JSON/CSV report with per-language/variant/mode/source/workload slices, exact numerators, timing coverage, cost coverage and representative failures.
- Reproduction command pinned to hashes and analysis version; no hidden credentials or automatic provider calls.

Qualification: hand-computable fixtures reproduce the full report exactly; duplicate imports do not double-charge/count; missing fields remain unavailable; changing a case/hash/clock domain fails validation; synthetic/historical/live modes cannot be pooled into one result silently. Add a traceability test linking each reported metric to its catalog definition and input evidence.

## Stage 2 — deterministic opportunity planner and replay qualification

Use existing schedule functions and effective historical feed versions to enumerate expected opportunities before execution. Compare planned opportunities with observed requests, including missed scheduler invocations. Preserve daily/DST and creation-relative millisecond identities. A replay virtual clock must never be subtracted from the current physical clock.

The runner first performs a no-provider dry run: verify full text, finite admission limits, stable source/revision mapping, track order, exact cutoff, history availability and disjoint variant state. Keep input hashes and the mapping between exported acquired IDs and product evidence revision IDs. Do not confuse those identities or restore V2 extraction/graphs as a V3 prerequisite.

Qualification: identical inputs yield identical prepared artifacts and hashes; window 2 sees only that variant's actual published window-1 text; rejected drafts and another variant's history never leak into it. Broken/missing initial history requires an explicit cold-start policy, not an implicit empty array. Longer overlapping-duration tracks run as separate experiments. Include zero-source/empty/partial cases without inventing content.

Add a clock-isolation regression: replaying on different real calendar dates must not change the current 21-day/16-item history selection for the same logical window. Preserve original source/initial-history timestamps and distinguish virtual timestamps on new replay history from real generation timestamps. Never globally fake the clock used for real account grants, leases, provider deadlines or cost authorization.

## Stage 3 — baselines and evidence-bound inference adapters

Implement a frozen deterministic keyword/rule baseline and one-call LLM baseline, then existing V3 and named candidate variants. Each adapter consumes the same frozen input contract and returns a private result artifact with stage/call/source IDs. A dry-run plan lists all intended inference opportunities and bounds before execution.

Real inference must use existing durable product/evaluation admission, reservations, provider receipts, settlement and unknown-outcome fences. Do not create a second independent spending authority or bypass the ledger by directly calling a convenience SDK. Ensure the evaluator can resume a saved result without submitting another paid operation. Account for provider-reported versus settled charges and cache reuse once.

New explicitly authorized experiment invocations get noncolliding scopes bound to variant, frozen input and repetition. Recovery of an existing invocation retains its original identity; an uncertain outcome must not be circumvented by creating a "new trial" automatically. Historical result reuse is a declared cache condition, not a fresh inference performance sample.

Qualification: fake providers demonstrate equivalent input bytes, no silent truncation, one-call baseline bounds, V3 targeted repair, exact-source ownership, per-variant published history, malformed output handling and zero re-submission after an uncertain paid outcome. No unverified baseline output enters real public feeds or notifications. Human quality labels remain a separate required join, not invented golden summaries.

## Stage 4 — read-only live observation and minimal hooks

Add an isolated observer that captures the independent offered schedule, actual dispatches, canonical state/accounting, last-negative/first-positive public-reader probes and version-bound push acceptance. Preserve raw observation timestamps and label proxy/interval uncertainty. Device receipt stays unavailable unless a consenting test client supplies it.

Where the current records cannot establish a boundary, add a minimal metadata-only evaluation hook behind an isolated configuration. Measure observer overhead in a controlled A/B fixture; observation failure must not alter publication authority or erase workload. High-cardinality operation IDs belong in private events, not public aggregate metric labels.

Qualification: manually reconcile a tiny controlled case from raw source/job → evidence → frozen input → model receipts → edition → public read-back → push service receipt. Reconcile every billed identity once. HTTP success, saved edition and safe rejection must remain different states. Live evaluation is still disabled until separately authorized.

## Stage 5 — controlled faults and recovery

Use deterministic fault schedules against owned adapters: HTTP 406/transient failures, explicit auth/rate/policy denial, unreadable/oversized content, helper backpressure, lease contention, lost/duplicate queue messages, crashes around fetch/commit/settlement, changed source approval and push rejection. Reference tests must assert the intended safe action, not that every source eventually succeeds regardless of policy.

Qualification: no duplicate logical edition or billed frozen operation, no source/citation reassignment, no original-date/window mutation, no lost reservation/recovery state. Report affected, recovered, failed and unresolved cohorts and horizon. Distinguish healthy quiet outcomes from missing acquisition and protected unknown outcomes. Use original identities; no "repair" that resets old financial history.

## Stage 6 — calibrated load, sustained operation and comparison

Choose realistic offered feed/source/volume mixes after calibration. Freeze targets, meaningful-effect margins, rates, concurrency, warmup, cache state, order randomization, fault times, stop/drain/follow-up rules and analysis methods before validation. Keep the offered arrival schedule independent of service completion and report driver misses.

Run isolated load steps, then a bounded soak and restoration/backlog test. A later 24-hour campaign is a separate budgeted authorization, not an automatic extension. Preserve all failures/censoring and all failed-call/repair/observer costs. Existing VPS/account/provider ceilings remain effective and may legitimately limit admitted throughput.

Qualification: artifact reproduction and financial reconciliation; sufficient independent units for each claimed language/source/workload slice; paired sequence/block analysis rather than treating repeated windows as independent. Report absolute and relative effects with uncertainty. Quality gates supplied by Person 1 must pass before calling the faster/cheaper variant an overall improvement.

## Stage 7 — validation/held-out release and user-study handoff

Freeze genuinely independent development/validation/held-out groups before tuning. Exact URL/hash checks are necessary mechanical diagnostics, not semantic independence proof. Person 1 confirms development links across publishers/languages, annotations, target users and realistic monitoring tasks. Preserve agreement/disagreement and adjudication records.

Aya supplies private hashed inputs/outputs, time/cost/recovery logs and a reproducible results bundle. Person 1 supplies externally reviewed accuracy/relevance/importance/coverage/repetition/novelty and observed user-effort/task results. Join on exact input/output hashes and rubric version. Unknown labels remain unavailable, and held-out feedback cannot become another tuning cycle without reclassifying the set.

## Ready-to-run live campaign checklist

A live campaign requires all of: reviewed protocol/targets; validated schemas and observer; independent offered manifest; isolated resources and approved sources; explicit unexpired authorization and positive bounded run/account/provider allowances; secret-free configuration fingerprints; read-only/consenting test subscriptions; no production notification audience; stop/cleanup procedure; accounting reconciliation and unknown-outcome plan. Defaults remain offline. Passing unit tests alone does not authorize or qualify a live performance claim.
