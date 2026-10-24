# Distilled performance and reliability protocol v0.1

Design date: October 24, 2026, Asia/Beirut. This is a proposed protocol with tested reference calculations, not a completed evaluation. Freeze a campaign version before collecting comparison results. Record amendments rather than silently changing definitions after seeing outcomes.

## 1. Questions and ownership

Aya's primary question: **For independently scheduled reporting opportunities, how reliably, quickly and economically does the system produce the intended operational outcome under declared workloads and failures?**

An intended operational outcome is either a verified, persisted briefing confirmed through the reader, or an explicit quiet completion with no edition. Quiet completion is a mechanical outcome, not proof there was no important news. A rejected draft may demonstrate correct safety behavior, but is not successful delivery. Report safe rejection separately.

Person 1 owns independent human judgments about factual accuracy, importance, relevance, required developments, unnecessary repetition, novelty and user usefulness. Aya supplies immutable inputs/outputs, timing, cost, failure/recovery evidence, baseline execution and reproducible analysis. Joint review defines quality gates and realistic user tasks. Neither an LLM verifier's approval nor successful persistence is human ground truth.

Do not collapse quality, speed, cost, reliability and effort into one weighted score. Present tradeoffs and representative failures. A fast variant that drops important news, a cheap variant that emits nothing, or a reliable service that repeats misinformation cannot win on infrastructure metrics alone.

## 2. Four experiment modes that must remain separate

| Mode | Input and execution | Valid claims |
| --- | --- | --- |
| `OFFLINE_CONTRACT` | Synthetic fixtures, saved evidence, deterministic provider/fault doubles | Arithmetic, identity preservation, recovery invariants and harness correctness; not live latency, provider recall or factual quality |
| `FROZEN_REPLAY` | Frozen real acquired text; original article/window dates and isolated per-variant chronological history; real inference only if separately authorized | Paired intelligence behavior/cost and real measured inference timing on these inputs; no acquisition throughput or live scheduling/device claim |
| `CONTROLLED_LIVE` | Isolated Cloudflare/VPS resources, real approved sources and models, prospective observer, fixed offered workload | End-to-end outcomes for the stated sources, period, account limits and infrastructure; provider drift remains a confounder |
| `HISTORICAL_AUDIT` | Previously persisted records with explicit timestamp/cost evidence quality | Retrospective outcomes and named proxies; cannot reconstruct unobserved exact completion/device times |

Fault injection is an additional scenario label, not a reason to call a replay live. Every artifact records mode, whether providers are real/doubled, virtual versus wall time, and fault schedule. Synthetic adversarial content never enters a real-news dataset without an explicit synthetic label.

## 3. Units, independent opportunity manifest and states

Use different denominators for different questions:

- **Reporting opportunity:** feed ID + effective schedule revision/policy + exact window start/end. Generate before execution using the real scheduler rules, preserving migration 0069, timezone/DST, daily anchors, first-full-interval admission and prior window identities.
- **Source collection opportunity:** approved feed-source configuration + requested bounds + scheduled poll identity. This is not one article and not collection recall.
- **Acquisition job:** canonical source-observation/job identity. Attempts, fallback stages and retries remain children, not additional denominator successes.
- **Inference operation:** canonical billed/reserved operation identity, with reused receipts pointing to the original operation.
- **Publication:** exact edition ID and original reporting opportunity; retain verification/source references and public read-back evidence.
- **Notification eligibility:** edition × subscription version as eligible under existing ownership, publication, projection and cutoff rules. Actual coalesced HTTP send identity is separate.
- **Independent analysis unit:** a feed/development sequence or predeclared campaign block. Repeated windows and repeated executions of one story are not independent new examples.

The offered-opportunity manifest is authoritative for denominators, not whichever jobs happen to appear in D1. Count a lost Cron invocation, dropped delivery, admission denial or provider outage even when no request/result row was created. Retain its reason; do not erase it as "not tested" after it was offered.

Operational outcomes: `PUBLISHED_READBACK`, `QUIET`, `SAFE_REJECTED`, `FAILED`, `PERSISTED_UNCONFIRMED`, `PENDING`, `UNKNOWN`, `NOT_ADMITTED`. Keep late success separate from success by deadline. Preserve the final result and complete attempt history. Missing telemetry is an observability failure, not a zero-duration success.

`QUIET` requires an explicit completed quiet request and no new edition for that opportunity. No model calls are expected for genuinely empty eligible evidence; nonempty evidence judged unimportant may legitimately require calls. Empty raw inputs, no eligible evidence, rejected output, missing acquisition and a healthy quiet window are different conditions.

## 4. Clocks and latency definitions

Capture these boundaries where observable:

| Symbol | Boundary |
| --- | --- |
| D | Source observation/discovery recorded |
| A | Acquisition request actually starts |
| R | Response/extraction completes |
| E | Accepted evidence becomes visible; use decision-time proxy only in explicitly historical rows |
| W | Original reporting cutoff, unchanged by delayed processing |
| Q | Successful queue dispatch for the opportunity |
| T | Worker processing attempt starts |
| P | Publication commit; recorded publication timestamp is a named proxy if commit is not observed |
| U | First matching public-reader positive observation |
| N | Push service's successful HTTP response is observed |
| V | Consenting instrumented client confirms notification display/receipt, if available |

Use `performance.now()`/monotonic time for durations inside one process and UTC timestamps with clock provenance for cross-service joins. Never subtract a historical/virtual reporting cutoff from a current replay wall clock. Keep original reporting dates for model temporal reasoning, but time replay execution with real monotonic spans from dispatch to persisted replay result.

Freeze the replay's logical history clock as well: the current `selectPrior` uses `EngineOptions.now()` with a 21-day/16-item policy and four recent items. Run it at the declared virtual reporting time rather than today's date. Retain initial original prior timestamps. For newly generated replay history, record real generation time separately from a clearly labelled logical publication time (default proposed convention: that replay window's end). This is counterfactual replay state, not a historical live publication claim. Clock injection must be limited to semantic/replay preparation; account grants, leases, provider deadlines and spending authorization always use real time.

Reject malformed, contradictory or cross-clock timing records; retain the affected opportunities and a diagnostic rather than dropping their failures. Do not clamp negative durations to zero. Document clock offset/uncertainty and sampling resolution. Source publication dates may be missing, coarse or incorrect: they measure source freshness, not request start or system performance.

### Primary latency measures

1. **Cutoff-to-public-read-back:** `U − W`, per successfully published opportunity. Includes scheduler delay, queueing, acquisition waits, retries, verification/repair, persistence and observed visibility delay after close. Keep all unsuccessful due opportunities beside this conditional distribution.
2. **Acquisition elapsed:** `R − A`, per acquisition attempt with trustworthy boundaries. Also report job elapsed through acceptance and retries. Legacy `acquiredAt` is not R.
3. **Evidence-availability-to-public-read-back:** `U − E`, per actually cited evidence revision. Label the selection conditioning explicitly. It cannot measure how fast every offered article was covered or whether important articles were missed.
4. **Publication-to-push-service-acceptance:** `N − P`, per eligible edition/subscription. If only recorded P is available, name it a recorded-publication proxy metric. N is not device delivery. U can be later than N because reader polling is delayed: do not compute N − U as a universal nonnegative delivery latency.
5. **Device receipt:** `V − P`, only for authorized client telemetry with clock synchronization/uncertainty. Otherwise null/unavailable, never inferred from a 201 response.

Secondary diagnostics: offered-to-enqueued, queue residence, worker attempt duration, model request elapsed, extraction duration, verification/repair overhead, persistence observation lag, source-discovery-to-acceptance, retry/backoff time and time to recover after restoration. Stage spans may overlap; do not sum them as a wall-time decomposition.

Polling gives an interval: true reader visibility is later than the last successful negative probe and no later than the first positive probe. Store both bounds, probe errors and interval. First-positive latency is an upper observation bound; do not hide the polling interval inside claimed subsecond precision.

Report p50/p95 using **Hyndman–Fan R7** with raw sample count, eligible opportunity count, timing coverage, missing/failed/censored counts and units. Do not average feed p95s into a global p95. Pooled and per-feed summaries answer different questions. Values with fewer than 100 completed samples get an exploratory-tail warning under this reporting policy; 100 is not a guarantee of precise tail estimation. Never describe success-only quantiles as unconditional end-to-end performance. No latency value exists for an empty population.

## 5. Metric dictionary and denominators

The machine-readable catalog names these metrics. This section defines their interpretation.

### Reliability and coverage

- **Operational successful-window rate:** `(PUBLISHED_READBACK + explicit QUIET) / all due offered opportunities` at a declared horizon. Require publication identity/receipt checks and report quiet count separately. Pair with independently reviewed quiet/selection correctness; this rate alone is not a quality score.
- **Success-by-deadline:** successes by `W + deadlineMs` divided by opportunities whose deadline was fully observed. Predeclare deadline; use a common observation horizon. Report immature opportunities separately and lower/upper bounds for the whole due cohort rather than silently deleting them. The deadline reference helper calculates this only after callers establish a valid success boundary.
- **Resolution rate:** opportunities with any known terminal outcome / all due. A known failure improves observability/resolution, not delivery success.
- **Read-back coverage:** published candidates with matching public-reader evidence / all persisted publication candidates. Persisted-but-unconfirmed remains a separate outcome.
- **Acquisition acceptance:** exact readable accepted jobs / all offered authorized acquisition jobs. Also report transport success, content/identity acceptance, partial/unknown completeness, permanent source errors and unavailable configuration. None is total source recall without an independent source universe/reference.
- **Notification acceptance:** eligible edition/subscription units with durable service-acceptance receipts / all units observed for the full delivery horizon. No configured subscriptions is not 100% delivery. Record eligibility changes and revocations without retrospectively deleting an originally offered unit.
- **Recovery success:** affected canonical jobs eventually meeting their intended outcome after a controlled fault / all jobs exposed to that fault, at the declared recovery horizon. Track time-to-recovery, retries and outcomes still unknown.
- **Observability coverage:** rows with all trustworthy timestamps/identities needed for a metric / all rows eligible for it. A low coverage rate disqualifies a headline performance claim even if its measured subset looks fast.

### Safety invariants, not average scores

Count exact violations and expose their cases: duplicate logical publication; a second billed submission under one frozen paid identity; wrong source/citation ownership; cross-feed state contamination; truncated evidence; reporting-window expansion; changed original publication dates; lost financial history; unknown paid outcome resubmission; automatic feed creation; unverified/withdrawn edition push; missing or skipped recoverable state. Zero observed violations is necessary for an improvement claim, not proof a violation is impossible. HTTP retries that are authorized and uncharged must not be mistaken for duplicate billed operations.

### Throughput, backlog and capacity

- Report offered arrival rate, actual dispatched rate, accepted/completed rate, dropped/not-started rate and successful outcomes per real elapsed minute. Count logical jobs once, attempts separately.
- Backlog: outstanding due jobs/windows; also report oldest due age, peak count, time-integral in job-seconds and unresolved financial operations separately. Missing sampling intervals remain gaps, not assumed zero backlog.
- Drain time: restoration to clearing the pre-fault cohort and holding clear for a declared stability interval. Keep ongoing background arrivals visible. Distinguish processing backlog cleared from unresolved account exposure.
- Saturation: throughput and deadline success as offered load rises, with queue age and resource use. Do not declare a sustainable rate merely because a short run finishes eventually after arrivals stop.

### Cost and efficiency

Use existing account/provider ledgers. Report acquisition, inference, infrastructure and manual intervention separately. Record run/case allocation rules before comparison, including shared fetches or coalesced work. Allocate each billed operation once; unallocated shared cost remains explicit. No arbitrary equal split after seeing which variant won.

Report confirmed/provider-reported actual charges, price-based estimates, total reserved ceilings, unresolved recorded exposure and settlement coverage separately. Include failed calls, targeted repair, retries that actually incur costs and recovery metadata requests. Unknown cost is null, not zero; a reservation is neither actual spend nor a universal upper bound on provider billing. Historical reused operations cost zero **incrementally in this run**, but their known original cost and reuse identity remain available in a separate lifecycle view.

Core ratios: all attributable run cost / verified public briefings; all attributable run cost / successful windows including quiet; source cost / accepted acquisitions; inference cost / attempted and completed windows; model calls/tokens per opportunity. Always show the denominator and failed/quiet counts. With no published briefing, cost-per-published is null even if money was spent. With any unresolved charge, full actual-cost ratios are unavailable; confirmed partial ratios must be explicitly labelled. Infrastructure-inclusive totals remain unavailable when the allocation/price is unknown. Do not mix credits, promotional prices and list-price estimates in one actual-cost comparison.

### User effort and quality interface

Record actual operator interventions, active operator minutes, setup time and recurring maintenance separately. Elapsed unattended processing is not human effort; estimated reading time is not measured task time. Person 1 conducts randomized/counterbalanced realistic user tasks and supplies measured completion/comprehension/missed-information/usefulness outcomes. Human time requires consent and a documented observer procedure, not a guessed conversion from clicks.

Quality tables join exact input hash + output hash + language + rubric version + reviewer identity. Scores without completed independent labels remain unavailable. Report source faithfulness separately from independent truth, and selection completeness separately from extraction completeness. Arabic, English and French get separate scores and costs; cross-language agreement alone does not establish correctness. Avoid treating whitespace word counts as comparable reading-effort units across languages.

## 6. Data freeze and leakage control

Every run freezes code commit/tree hash, dataset hash, case IDs, track order, input/previous-output hashes, exact prompts/model/provider settings, seed if supported, concurrency, cache/reuse policy, limits, infrastructure/configuration fingerprint, effective source approvals, clock rules, horizon, deadline and analysis version. Record actual provider identity, not just the requested model alias. A seed is not a reproducibility guarantee for hosted inference.

The existing pilot and extended export overlap; all 240 pilot IDs occur in the extension. They are **development data**. Do not randomly split their 95 windows or treat the 817 occurrences as 817 independent articles. The long World News sequence can dominate a micro-average; show per-language/per-feed/sequence summaries as well.

Acquire future independent material for validation and held-out evaluation. Build partition groups from complete chronological development sequences, exact IDs, canonical URLs and content hashes, then human-confirm cross-publisher/cross-language development links. Mechanical matches catch some leakage, not all semantic equivalents. Unresolved linkage is a split-integrity risk. Keep connected developments and their required initial history in one partition; use a declared temporal embargo for stories crossing the boundary. Preserve raw records even when a case is not admitted to the held-out comparison.

Provisional collection target: group-level development/validation/held-out allocation, roughly 60/20/20 only if independent coverage supports it; proportions are not a substitute for coverage or power. Cover each language, workload tier and relevant source type with independent episodes. Do not promise meaningful French/social/provider results from an empty or tiny stratum. Freeze partition assignments before tuning and keep held-out contents/results restricted until the final approved evaluation.

All variants receive identical evidence bytes and admission boundaries in intelligence comparisons. No manual relevance filtering or removal of duplicates. Keep partial/low-quality text, late discoveries, date conflicts and real repeated reports. Preserve distinction between acquired records, evidence revisions and real-world developments. Initial history null means unknown; preregister an explicit cold start or obtain actual preceding history. Each variant then uses its own generated published reader text. Never seed a candidate with a baseline's future or unpublished output.

## 7. Workload matrix

These are proposed experiment cells, not measurements or approved paid workloads.

| Axis | Cells and controls |
| --- | --- |
| Input volume | Empty; 1–5; 6–20; 21–50; 51–150; larger observed cases where available. Also record UTF-8 bytes, retained characters and actual provider tokenizer counts when known. Never truncate/fill real cases to hit a bucket. |
| Reporting intervals | 30, 60 and 120 minutes; creation-relative seconds/milliseconds; legacy and daily/DST scheduling remain separate compatibility tests. |
| Language | English, French, Arabic separately. Record input language mix, not just requested output language. |
| Sources | RSS, Google News, X, Telegram, LinkedIn and websites where actually configured; direct/helper/browser/Zyte route and fallback outcomes visible. |
| Feed concurrency | Calibration first, then isolated offered levels such as 1, 5, 10 and 20 feeds within actual source/provider budgets and capacity. These numbers are proposed starting cells, not supported capacity claims. |
| Continuity | Independent 6–12+ consecutive windows and longer sustained tracks; repeated reports, new developments, confirmations, corrections and conflicts where real evidence supports them. |
| State | Clean/cold; warmed caches; steady state; retained backlog; recoveries; each declared independently. Warmup is explicit and its costs retained. |
| Faults | Controlled 406/403 versus auth/challenge/429/451; transient 5xx; malformed/oversized/unreadable content; helper unavailable/backpressured; lease contention; duplicate/lost queue delivery; crash before/after result persistence or settlement; unknown paid outcomes; revoked sources; push failure. |

Faults are injected into owned adapters/queues, never by attacking third-party services. The safe expected action can be rejection, deferral or preserved UNKNOWN; success does not mean bypassing all denials until something is fetched. Keep original attempt/operation identities and accounting. Synthetic source instructions are untrusted data and must not alter the runner, spending authority or publication rules.

Use an **open offered-arrival schedule** for load tests, independent of previous completions. If the driver cannot start a planned job, record its scheduled start and not-started reason; do not slow arrivals silently. A sequential replay is useful for continuity but is not a capacity/load test. Record driver saturation separately from service saturation.

Campaign stages: (A) offline calculation/invariant qualification; (B) small controlled calibration; (C) paired frozen replays; (D) isolated increasing-load trials; (E) sustained run plus fault/backlog recovery; (F) fresh held-out evaluation. Start sustained experiments at a bounded, authorized duration; a proposed later 24-hour soak must include budget, cleanup and full follow-up plans. Freeze steady-state and drain intervals in advance. Do not call a brief burst a 24/7 reliability measurement.

## 8. Baselines and fair comparison

| Baseline | Same-input comparison | Separate end-to-end comparison |
| --- | --- | --- |
| Rule/keyword | Frozen, versioned deterministic terms, thresholds and dedup policy chosen on development data; returns referenced source items | No invented summarization or fact-checking capability; human task study measures resulting effort |
| Single LLM | One bounded edit call on the same full acquired evidence/history/cutoff and output contract; no hidden repair/verifier calls | Record input-limit inability as a failure; do not silently truncate. It has no agentic acquisition/recovery unless explicitly declared as another baseline. |
| Existing V3 | Exact pre-improvement commit, prompts, models, admission and history policy | Same isolated infrastructure/provider settings and arrival schedule as the candidate |
| Candidate V3 | One named, frozen intervention at a time where feasible | Capture added retries, repair, provider selection, accounting and instrumentation overhead |
| Manual monitoring | Representative users get the same task, horizon and allowed source universe | Person 1 measures active time, missed information and comprehension; no fabricated human baseline from source-count heuristics |

Separate inference-only from system-wide experiments. Feeding identical acquired text to variants controls acquisition; it cannot establish the benefit of acquisition recovery. Live acquisition comparisons need concurrent or randomized blocked schedules and source-version capture because publishers/providers change. Record unavoidable differences rather than claiming perfect control.

Single-LLM/rule outputs remain private evaluation artifacts, never unverified reader publications or real pushes. Judge their quality with the same external human rubric, not by whether they implement V3's internal verifier. Inference-only comparisons report cost/time per completed artifact plus independently quality-qualified output where labels exist. Product-specific verified-publication and notification metrics are not applicable to a baseline lacking that delivery contract; do not turn that structural difference into a misleading 0% quality score.

Randomize or counterbalance variant order within independent scenario/time blocks. Prespecify repetitions, seeds and stop conditions; multiple model draws estimate stochastic variability, not new independent news episodes. Keep equivalent context/inference limits and explicitly report unavailable baseline cells. No silent model upgrades/fallbacks or changed provider prices during one comparison.

## 9. Analysis and decision rules

Register primary endpoints before validation: deadline success and cutoff-to-read-back latency for the declared cohort, plus total cost per verified briefing with settlement coverage. Quality/noninferiority gates and safety invariants are required alongside them. Deadline, cost tolerance and quality margin are intentionally **unset until calibration/task requirements are agreed and frozen**. Missing targets mean "not assessed", never pass.

Give raw numerators/denominators and missingness for every rate. Use pooled micro-rates and equally weighted language/feed or sequence summaries, clearly named. Do not average ratios without defining weights. Cost-per-result is total comparable cost divided by total comparable results, with per-stratum views as diagnostics.

Use Wilson 95% intervals only for a defensible independent Bernoulli unit, such as separately reset controlled trials. Consecutive windows and repeated model draws are correlated. For paired comparisons, compute per-sequence/block differences and use a paired cluster bootstrap or another prespecified cluster-aware method; report cluster count and method/seed. With too few independent groups, give descriptive effects and label uncertainty insufficient rather than claiming significance. The reference module implements Wilson arithmetic, not automatic proof of independence or clustered inference.

Do not average per-window p95s or call a ratio of p95s the p95 of paired speedups. A paired p95 difference requires resampling paired clusters and recomputing each distribution. Keep zero baseline/empty denominators unavailable. Prespecify primary comparisons and treat many secondary slice findings as exploratory; do not cherry-pick the fastest successful repeat.

Failures and unresolved work are not removed from primary reliability denominators. Successful-completion latency is conditional. At observation end, show right-censored/unknown work and administrative follow-up. If censoring is material, do not claim a population p95 from successes; a properly implemented survival analysis is separate future work and depends on its censoring assumptions. A timeout is not a measured completion time.

An improvement requires preserved safety, independent quality evidence within its agreed margin, sufficient observed coverage, a prespecified meaningful effect, transparent uncertainty and all costs/retries counted. "All tests pass", "JSON is valid" and "edition saved" are qualification evidence, not sufficient production-quality results.

## 10. Reports, reproducibility and execution gates

Each campaign produces a private run manifest, partition manifest, offered schedule, append-only events, canonical attempts/operations, exact outputs/references, raw accounting join, aggregate JSON/CSV, and a human report. Hash inputs/outputs/configuration without exposing secrets. Keep source text, endpoint tokens, sessions and raw sensitive artifacts private; publish only approved aggregate results and licensed/sanitized failure excerpts.

Every result table includes mode, variant, dataset/split, language, source/workload stratum, independent group count, offered/due/mature/completed/failed/pending counts, latency sample coverage, p50/p95, deadline policy, partial/full cost and settlement coverage. Include cold/warm/cache/provider state, observation horizon, fault exposure and intervention time. Select representative and worst failures under a prespecified rule, not only attractive successes; retain exact evidence references and operator actions.

Qualification gates, in order:

1. Validate metric arithmetic, schemas, time domains, duplicate IDs/charges, horizon/censoring and snapshot completeness with hand-computable fixtures.
2. Verify split integrity, chronology, per-variant history, complete text/IDs, reproducible case hashes and baseline parity. Existing reused development data cannot qualify as held-out.
3. Implement read-only evidence collectors and prospective observers; cross-check a small case manually against raw D1/provider/public-reader evidence. Measure observer overhead.
4. Freeze calibration-independent targets, workload, randomization, repetition, cost caps, stop/cleanup and reporting rules. A small failed pilot is diagnostic, not discarded evidence.
5. For paid/live work, obtain explicit campaign authorization and positive bounded account/provider allowances through existing durable controls. Prior expired grants and earlier test approvals are not reused. Run only isolated resources; never reset histories, reservations, unknown fences or real user subscriptions to improve the numbers.
6. Execute the preregistered campaign, reconcile costs, follow outstanding jobs, restore test state and report limitations. Preserve unknown outcomes until evidence resolves them.

Current implementation status: protocol, repository audit, versioned catalog and offline arithmetic qualification are implemented. Collectors, full runner/baselines, cluster analysis, real users and live campaign results are not yet implemented. This phase changes no product paths and claims no performance improvement.

## Method references

- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) supports separate latency, traffic, errors and saturation views and external/internal observations.
- [NIST: Percentiles](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm) documents multiple percentile conventions, including R7; this protocol freezes R7 rather than implying all tools interpolate identically.
- [NIST: Confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) gives the Wilson approach. The independence restriction and clustered comparison policy remain explicit study-design obligations.
- [Grafana k6: Open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/) explains how completion-dependent arrivals can conceal offered load through coordinated omission. This protocol requires an independent offered schedule for load claims.
