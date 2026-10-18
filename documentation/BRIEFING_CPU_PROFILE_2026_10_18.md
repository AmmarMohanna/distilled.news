# Retained-history shortlist CPU profile

This follows [the first live profile and metadata release](BRIEFING_PUBLICATION_PROFILE_2026_10_18.md).
The metadata changes reduced reads but did not eliminate publication's CPU-limit
failure. The CPU optimization passed the differential and retained replay checks
below. Its frozen full Worker run and targeted reruns are recorded separately;
deployment and live comparison remain pending at this checkpoint.

## Confirmed bottleneck

A staging delivery on version `7ec08976-c164-461d-886f-9b29d48d4688` hit the
32,500-ms CPU limit after two shortlist computations. Its window was
2026-10-17 19:30-20:00 UTC, 30-minute feed
`briefing_7cf3de95-82fc-4d7e-a801-c74e3329d139`, request
`4c4818ef3f1fb5ed20ae227237bbb4974a659f8d5e221e0f9353cfb538826e6c`.
The passes took 106,514 and 109,847 ms including remote database work. Both had
zero historical revision-body reads. This reproduced the failure after metadata
loading was reduced; absence of article-body reads does not prove low CPU usage.

The verified original SQL export was filtered locally into a profiling fixture.
The final read-only replay input is **243,081,216 bytes**, SHA-256
`aafc08fb64f3e35cc92d028904d445b5afee21585306303cc6a7473a6872aafd`:
one Feed, four scopes, 179 evidence items, 182 revisions,
183 inputs/acceptance receipts and 11,494 relevant Feed documents. Historical
shortlists/plans, graph facts, communication/provenance and verification witnesses
are retained. Unused paid-operation intents/results/proposals are excluded. This
is a deterministic-computation fixture, **not a database backup or provider replay**.
The complete original SQL backup remains unchanged and independently verified.

The local adapter opens SQLite read-only, accepts SELECTs only, denies fetch, and
does not commit canonical writes. The initial diagnostic fixture used the failed
window's start/end/kind; its calendar metadata was omitted. This does not represent
a complete runtime-message/provider replay. The full-calendar A/B tool below reads
the complete retained request window instead. The first unsampled replay used **32,751 ms process CPU**,
56,973.92 ms wall time, and 224 local SQL queries. It returned 144 candidates,
1,633 facts and four unresolved targets, with zero staged writes/provider calls.

V8 sampling identified repeated lexical preprocessing:

| Sampled frame | Sampled elapsed attribution, ms |
| --- | ---: |
| Editorial fact normalization | 22,648.66 |
| Editorial word mapping/filter callback | 7,356.61 |
| Material-delta text profile | 5,578.85 |
| Fact-equivalence function itself | 3,797.76 |
| Editorial word tokenization helper | 2,773.13 |
| Fidelity numeric normalization | 2,741.53 |

V8's sampling intervals include scheduling/descheduling and cannot be added as
precise independent CPU-time measurements. `process.cpuUsage` supplies the separate
whole-process CPU measurement. The profile nevertheless identifies the functions
doing repeated work on the actual retained dataset, rather than an invented workload.

## Implementation and correctness

`equivalentFact` now normalizes each side once and computes the same ordered-number,
qualifier and ordered-word signatures lazily. It preserves the prior lexical table,
modal-strength classes, punctuation treatment, attribution/order and early equality.
There is no new synonymy, entailment rule or semantic fallback.

`createFactEquivalence` owns a cache local to one operation. Merge, editorial-delta
and shortlist loops reuse immutable text signatures. The cache retains at most
2,048 inputs and 262,144 input UTF-16 characters. FIFO eviction only causes exact
recomputation; oversized facts are fully compared without retention. No fact is
truncated, pruned or suppressed by a cache limit. New text is a new key, and each
operation gets fresh state. Nothing is cached across requests, Feeds or CAS attempts.
The cache stores preprocessing, not authoritative Event identity or novelty decisions.

Feed/source authorization, Event/storyline versions, semantic leases, CAS fencing,
paid-operation IDs, reservations, settlement and unknown-outcome recovery are unchanged.
Policy versions stay unchanged because the deterministic decisions and resulting
model input must stay identical, avoiding accidental paid-operation invalidation.

The new differential test keeps the frozen pre-change implementation as an oracle.
It checks every pair in a 41-input matrix covering numeric/order changes, bounds,
negation, tense, attribution, certainty and Unicode; checks fresh operations, changed
text, cache pressure and oversized input; and counts one normalization per distinct
input in repeated comparisons. It does not relax quality expectations for speed.
An additional regression test requires identical malformed non-string facts to
throw, preserving the original fail-closed behavior rather than taking the new
string-equality shortcut. Its failure was reproduced before the two-condition fix.

## Before/after evidence

Five alternating paired samples on 70 identical long facts (4,900 pairs/sample),
using the frozen algorithm versus scoped signatures:

| Local comparison path | p50, ms | p95/sample maximum, ms |
| --- | ---: | ---: |
| Frozen implementation | 459.25 | 1,062.82 |
| Scoped signatures | 6.35 | 6.59 |

There were zero provider calls. This is a reproducible CPU microbenchmark, not
model inference or whole-briefing latency. These are the final standalone focused
run's samples. The frozen oracle uses the original module-level lexical constants;
an earlier diagnostic reallocated those constants per call and its timings are
superseded here. Assertions and the production lexical table are unchanged.

The final **full-calendar** retained replay ran five pairs sequentially, alternating
order, in fresh Node processes without V8 sampling or simultaneous regression work.
The trusted baseline was `082b65e7d3e73e7c5d2bdd357cedea2c4475c2ad`; the optimized
code includes the malformed-input guard. All ten commands passed. Every result had
144 candidates, 1,633 facts, four unresolved targets, 224 SQL queries, zero historical
revision-body reads, zero staged writes and zero provider calls. The complete output
SHA-256 was identical on every run:
`0886f41ed4bd23f63dd22e4023b7e2b52475613c7ef3c6c7c8c5b2845834760c`.

| Full-calendar local replay | Baseline p50 / p95, ms | Optimized p50 / p95, ms |
| --- | ---: | ---: |
| Wall time | 16,934.30 / 22,568.72 | 8,038.59 / 8,138.09 |
| Process CPU | 16,437 / 20,532 | 7,811 / 8,078 |
| SQLite query time | 655.70 / 831.67 | 659.82 / 816.41 |

Median wall/CPU time fell approximately 52.5%; p95 wall time fell 63.9%. SQL time
and query count did not materially fall. Measured-region sequential replay throughput
was 3.39 versus 7.63 attempts/minute (five attempts divided by summed durations),
excluding runner startup. With only five samples per path, empirical p95/p99 both
equal the sample maximum; these do not estimate production tail latency. CPU time
is process-wide and can include helper threads. This is one Feed/window, not an
end-to-end, multi-feed or provider experiment. No inference cost was incurred and
no new live edition's factual quality was assessed.

The earlier three-field diagnostic retained-history replay with V8 sampling measured:

| Retained deterministic shortlist | Before | After |
| --- | ---: | ---: |
| Wall time, ms | 67,577.62 | 28,782.66 |
| Process CPU, ms | 40,672 | 20,000 |
| Local SQL queries | 224 | 224 |
| Candidates / facts / unresolved targets | 144 / 1,633 / 4 | 144 / 1,633 / 4 |
| Canonical writes / provider calls | 0 / 0 | 0 / 0 |

The complete shortlist JSON fingerprint was identical in all three captures:
`59d6e9c4274783dc4f9ad2f2dab01838ed31aeae1ffbc0252cb428b32ca989e9`.
The optimized replay explicitly asserts that fingerprint. This pair measured
50.8% less process CPU and 57.4% less wall time locally. It is one retained-input
pair, not a p50/p95 distribution or an assertion about Cloudflare execution time.

The first sampled baseline capture completed its assertion and wrote the profile,
but the CPU-bound interval triggered a Vitest `onTaskUpdate` RPC timeout. That
command is **not counted as a passing verification run**. The initial unsampled
baseline and optimized sampled replay passed without that error. Profile metrics
remain diagnostic evidence, separately from regression pass/fail evidence.

## Reproduction

Portable deterministic differential/microbenchmark:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/fact-equivalence-cache.test.ts --maxWorkers=1
```

Owner-only retained export replay with Node 22.17+ (the export contains sensitive
retained data and must stay outside Git). The explicit baseline option reads trusted
editorial code from Git and substitutes it only inside this local benchmark; the
working branch and deployed Worker remain unchanged:

```powershell
python scripts/extract-shortlist-profile.py .local-reports/briefing-latency/staging-before-latency.sql --feed-id briefing_7cf3de95-82fc-4d7e-a801-c74e3329d139 --output .local-reports/briefing-latency/retained-replay.sqlite3 --expected-sha256 ccf4b1d34b84d33f0a43d3a83ef23f0a120c6aefd9295ded427aca2626791b8a
$env:V1_RETAINED_PROFILE_DB = (Resolve-Path .local-reports/briefing-latency/retained-replay.sqlite3).Path
$env:V1_RETAINED_PROFILE_FEED = 'briefing_7cf3de95-82fc-4d7e-a801-c74e3329d139'
$env:V1_RETAINED_PROFILE_REQUEST = '4c4818ef3f1fb5ed20ae227237bbb4974a659f8d5e221e0f9353cfb538826e6c'
$env:V1_RETAINED_PROFILE_NOW = '2026-10-18T08:13:00.000Z'
$env:V1_RETAINED_PROFILE_BASELINE_REF = '082b65e7d3e73e7c5d2bdd357cedea2c4475c2ad'
Remove-Item Env:V1_RETAINED_PROFILE_EXPECTED_SHA256 -ErrorAction SilentlyContinue
Remove-Item Env:V1_RETAINED_CPU_PROFILE -ErrorAction SilentlyContinue
corepack pnpm exec vitest run --config scripts/vitest.retained-shortlist.config.ts *> .local-reports/briefing-latency/retained-baseline.log
if ($LASTEXITCODE -ne 0) { throw 'BASELINE_REPLAY_FAILED' }
$baselineProfile = Get-Content .local-reports/briefing-latency/retained-baseline.log | Where-Object { $_.Trim().StartsWith('{"type":"RETAINED_SHORTLIST_PROFILE"') } | Select-Object -Last 1 | ConvertFrom-Json
if (-not $baselineProfile.semanticFingerprint) { throw 'BASELINE_FINGERPRINT_MISSING' }
$env:V1_RETAINED_PROFILE_EXPECTED_SHA256 = $baselineProfile.semanticFingerprint
Remove-Item Env:V1_RETAINED_PROFILE_BASELINE_REF
corepack pnpm exec vitest run --config scripts/vitest.retained-shortlist.config.ts *> .local-reports/briefing-latency/retained-optimized.log
if ($LASTEXITCODE -ne 0) { throw 'OPTIMIZED_REPLAY_FAILED' }
```

The export extractor refuses an existing output and verifies the supplied input
hash. It retains the original input unchanged. The benchmark is outside normal
Worker test discovery, opt-in only, and prints counts/timings/fingerprints instead
of article text or model payloads. Optional `V1_RETAINED_CPU_PROFILE` enables V8
sampling and must name a fresh file; existing files are never overwritten. The
full-calendar fingerprint differs from the initial three-field diagnostic fixture.
Long CPU-blocking baseline runs may require
separating a test-runner RPC timeout from the captured profiler data as above.

## Operational limits

## Verification checkpoint before the memory follow-up

The frozen cache Worker run completed 231 files in 7,025.70 seconds: 220 passed,
eight failed, three skipped; 1,602 tests passed, 15 timed out, 11 skipped. This
command was not green. The later two-condition malformed-input guard passed 31
focused fact/correction tests; it was applied after that frozen full run.

Three crash-recovery timeout cases then passed under their original 45-second
limits. The interrupted remaining-case wrapper was found to use PowerShell
`ErrorActionPreference=Stop`, which could abort on ordinary native stderr. With
stderr captured and exit status checked explicitly, the 12 remaining cases gave
nine passes and three repeat timeouts: adaptive source-bound publication (60 s),
salience contention (15 s), and new-identity reader history with an unseen sibling
(30 s). No assertions or original limits were relaxed. A controlled pre-cache/
cache comparison is in progress; repeated timeouts are not yet classified solely
as environmental.

The metadata release's Linux CI run
[39110627313](https://github.com/AmmarMohanna/distilled.news/actions/runs/39110627313)
passed typechecks, script/Python tests, workspace package tests and builds, then
failed the separate browser E2E step. That is evidence about `082b65e`, not a fresh
CI result for the cache or forthcoming memory fix.

## Operational limits and live evidence

During the final frozen Worker run, the Windows host had about 396 MB free RAM
of 16 GB and about 1 GB free disk. Several cases exceeded their existing limits.
No unrelated process or file was removed. These conditions qualify local timing
measurements; failures and reruns must be reported separately. The verified SQL
export remains preserved.

At 10:18 UTC, a fresh read-only staging query reported $45.640232468 grant-period
cost and $4.345092702 held exposure across 44 unsettled operations, against the
unchanged $50 grant. Remaining headroom was approximately $0.014674830. The durable
edition count remained 82, with latest creation 2026-10-16T13:21:25.910Z. This is
continued absence of a new edition, not successful end-to-end publication.

A service-filtered Observability query through 08:34 UTC also confirmed that
resource failures predate this CPU optimization: the first deployed version had
27 distinct CPU-limit, nine memory-limit and 14 wall-time-limit queue invocations;
the metadata version had one CPU-limit and five memory-limit invocations. These
cover different durations/workloads and are not comparable error-rate experiments.
They prevent declaring queue health clean from a short smoke tail. Full Worker
verification and a new bounded version-tagged staging check remain required.

The existing financial authorization still cannot admit new required GPT calls.
Faster deterministic attempts alone do not establish complete publication success,
source coverage or factual quality of a new live edition. No spending limit,
source permission, polling setting, provider route or partial-publication policy
is changed by the CPU optimization.

The additional bounded pre-CPU-release tail (10:15:37–10:22:56 UTC) captured
153 invocations: 152 `ok` and one `exceededMemory`. It contained 55 completed
delivery summaries (52 feed-turn busy, three temporary-unavailable/semantic-lease
busy), and no completed review/publication transaction. Delivery queue-wait
p50/p95 were 1,480/2,342 ms for that contended sample only. It supplies no new
publication latency distribution. At 10:26 UTC the staging queue metrics reported
processing/collection/acquisition/V1 backlogs 0/4/4/5 and DLQs 310/192/281/748.
Zero-valued oldest timestamps on several nonempty DLQs mean unavailable age,
not zero age. No delivery was consumed, purged or replayed for this inspection.

The 10:36:58 UTC pre-CPU snapshot retained 47,305 observations, 3,994 evidence
revisions, 3,059 intelligence receipts, 4,216 semantic results and 3,825 model
reservations. Active pending/running jobs included 983 reassessments and 288
authoritative rechecks. Pending request reasons were 89 awaiting reassessment,
51 account-resource waits, 58 incomplete-intake-coverage waits, two unknown
semantic outcomes and two model-context continuations. Edition count stayed 82.
These are heterogeneous background workloads, not a controlled throughput test.
