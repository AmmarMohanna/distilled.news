# Read-only workload v1

This extends Aya's PROTOCOL.md, metric-catalog.json and metrics.mjs; it does not replace them. Freeze this workload/version and target configuration before comparisons.

## Scope and journeys
Five equally weighted deterministic journeys cycle by global scenario iteration index: GET homepage HTML; GET /api/explore/feeds; GET /api/feed/:username/:slug; GET its /editions/:editionId; GET feed again with Cache-Control: no-cache to model foreground refresh. Each iteration issues one request. This is an HTTP route mix, not full browser navigation or asset loading. Refresh is a read, never a source-refresh or catch-up generation endpoint. No authenticated routes, cookies, mutations, inference, source collections or notifications are used. Feed/edition fixture IDs must name public, preexisting authorized fixtures. Only ASCII safe path segments are accepted in this initial harness; this is not a Unicode username compatibility test.

Requests have no body and only small constant headers. Responses must fit 2 MiB of JS string length (a conservative character guard, not an exact wire-byte measurement); k6 data_received captures transferred bytes. CI fixture responses are tiny synthetic records, not realistic article-size distributions. Live campaign artifacts must record actual response sizes, source of fixture IDs and deployment configuration. Homepage status is checked, API response shapes require feeds/briefing/editions/edition as appropriate. Private feeds must remain inaccessible; existing authorization tests cover that separately.

## Profiles and offered load
| Profile | Offered arrival model | VUs | Measured duration/bound |
| --- | --- | --- | --- |
| smoke | 10 shared iterations | 1 | max 30s + 5s grace |
| load | 2 iterations/second | 4 allocated, max 20 | 30s + 5s grace |
| spike | 1 → 1 → 8 → 1 iterations/second | 4 allocated, max 20 | 5 + 10 + 5 seconds + grace |
| stress | 1 → 5 → 10 → 20 → 1 iterations/second | 4 allocated, max 20 | 4 × 30 seconds + grace |
| soak | 5 iterations/second | 4 allocated, max 20 | 5 minutes + grace |
| recovery | 1 iteration/second | 4 allocated, max 20 | 15 seconds + grace |
| fault | 12 serial iterations, first 3 expect 503 | 1 | max 30s + grace |

All non-fault profiles first offer five warmup iterations with a 4-second maximum; measured start is at 5 seconds. Warmup is tagged separately and excluded from custom measured thresholds. A slow warmup must not be interpreted as a healthy cold start. After each scenario k6 allows 5 seconds for in-flight requests. There is no injected cooldown work; recovery can run separately after load. The local runner imposes a wall-clock kill limit (65s ordinary, 150s stress, 330s soak). Ctrl+C/termination cancels. Never change CLI VUs/duration overrides to exceed these bounds without versioning a new workload.

Each measured iteration is an offered HTTP journey, not a scheduled reporting opportunity. Include k6 dropped_iterations, completed iterations and failed/interrupted requests beside latency. Arrival executors avoid a closed-VU throughput illusion; if VUs cannot keep up, dropped iterations fail. Success-only HTTP response latency is not end-to-end publication latency, source capacity or 1000 concurrent publications. Existing 1000-feed local benchmarks answer a separate question.

## Clocks, cache and thresholds
Use k6 monotonic request durations and record UTC run start/end, commit, pinned k6 1.3.0, configuration, raw sample artifact and exit code. Node runner fixes loopback and synthetic mode. k6's built-in p95 is a diagnostic threshold; use raw measured samples with Aya percentileR7/latencySummary for evaluation comparisons and retain failures/missing/dropped counts. Do not average route p95s. Samples below 100 carry Aya's exploratory-tail warning.

No browser cache is used. Warmup exercises connection reuse. CDN state is unobserved, and no-cache is a request hint, not proof of a cold edge cache. Freeze a named cache policy and actual deployment configuration for live comparisons. This harness does not flush caches or measure full browser rendering. Existing Playwright coverage makes a browser k6 scenario unnecessary for the initial request-only workstream.

Required checks: 100% expected statuses/payload/size checks and journey success, measured p95 <1500ms, at least 10 measured requests, zero dropped iterations. These are conservative provisional harness regression guards selected below the fixed 3-second request timeout; no production baseline or SLA is claimed. A failed threshold exits nonzero (verified 99 on a deterministic persistent outage). Load-dependent regressions require comparable approved target/hardware and predeclared baselines; local fixture timing does not establish an application performance improvement.

## Authorization and faults
Default target is http://127.0.0.1:8789. run-local.mjs always starts an owned allowlisted fixture and ignores external BASE_URL. Remote scripts require HTTPS, exact AUTHORIZED_ORIGIN, TARGET_ENV=isolated, ALLOW_REMOTE_READ_LOAD=I_HAVE_AUTHORIZATION, public fixture IDs, and separately recorded human approval. Known production domains distilled.news/lownoise.news are rejected, including subdomains. Redirect following is disabled; no dynamic response links are fetched. This is a guard against accidents, not a substitute for verifying DNS/infrastructure ownership and actual target authority.

Stress/soak/recovery/fault additionally require ENABLE_CAMPAIGN=yes. Ordinary CI only smoke and expected-threshold-failure proof. Manual workflow is local-only and uses the agentops-isolated-performance environment; configure required reviewers before allowing it. No live target campaign is authorized by this repository change.

Fixture faults: transient (first three allowed requests fail then restore), persistent outage (required threshold must fail), invalid JSON and redirect refusal. fault.js qualifies HTTP recovery observation, not durable queue/ledger recovery. To observe actual queue drain after an approved campaign, collect the same original private trace cohort before/during/after restoration and join Aya's manifest and fault schedule; oldest age/drain time remains unavailable without valid enqueue/restoration boundaries. Existing deterministic queue/paid-recovery unit tests qualify canonical invariants; this workstream adds no Kubernetes faults or paid provider load.

## Reproduction
```sh
node --test evaluation/performance-reliability/k6/*.test.mjs
node evaluation/performance-reliability/k6/run-local.mjs smoke
node evaluation/performance-reliability/k6/run-local.mjs load
node evaluation/performance-reliability/k6/run-local.mjs spike
node evaluation/performance-reliability/k6/run-local.mjs fault-proof
# Explicit local campaign opt-in (PowerShell: $env:ENABLE_CAMPAIGN='yes')
ENABLE_CAMPAIGN=yes node evaluation/performance-reliability/k6/run-local.mjs fault
```

Set K6_BIN to the absolute installed k6 binary if it is not on PATH. Results live in .local-reports/k6/<profile> with execution.json, <profile>.json, samples.json and k6.log. Artifacts never include authentication material. The runner reports actual code SHA at invocation; rerun after final commits for release evidence. No baseline history is overwritten outside that ignored local result directory.

Local runner metadata additionally records whether the Git worktree is dirty, the actual k6 version, and a SHA-256 over sorted harness files plus the lockfile. This prevents an uncommitted harness run from being represented solely by its older HEAD SHA. Archive the corresponding source alongside comparison artifacts.
