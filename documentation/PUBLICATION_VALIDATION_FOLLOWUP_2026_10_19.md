# Timing, compatible inference and publication follow-up

19 October 2026. Local branch `backend-validation-contract`, starting at `cf6ca33`.
V2 remains disabled. No push, deployment, activation, migration or publication was
performed. The only remote writes were new evaluation reservations/settlements
under the existing staging grant. Historical holds, evidence and receipts remain
unchanged. No production or sources-QA resources were accessed.
Runtime diagnostic commit: `4b498be` (local only); evidence is committed separately.

## Timing classification

Two alternating matched pairs per case used immutable `2e46fa9` Worker source
versus `cf6ca33`, the same dependencies/host and original 5-second test and
10-second hook limits. A test-only loader selects baseline source; no checkout
was overwritten. All selected assertions and fixture setup remained intact.

| Case | Baseline strict passes | Current strict passes | Finding |
|---|---:|---:|---|
| 227-ID immutable batch | 2/2 | 2/2 | Previous timeout not reproduced; both about 3 seconds including hooks. No regression demonstrated. |
| Offline label/draft routing | 2/2 | 2/2 | Baseline 668–682 ms; current 645–752 ms. Previous current 13,447 ms timeout was not reproducible under matched serial conditions. |
| Durable publication restart | 2/2 | 1/2 | Current timed out once at the unchanged limit. A small additional regression remains possible. |

The restart is already known to time out on older code in the previous regression
investigation. That establishes pre-existing susceptibility, not equivalence of
these revisions. This sample does not classify the remaining asymmetry as purely
environmental or prove a new code regression. Do not weaken its assertion/limit.
Vitest assertion durations include hooks; censored timeout durations cannot be
treated as completed callback latency. No ordinary factual/financial assertion
failed in these matched runs. No new memory-limit failure was observed; this was
not a full-suite memory stress test. Host-wide memory telemetry was unavailable.

Evidence: `benchmarks/validation-timing-followup-results.json`. Reproduce the
fixed two-round experiment with `python scripts/validation-followup-timing.py
--output-dir .local-reports/timing-new` in a new directory; existing evidence is never
overwritten. The runner does not retry until green or override timeouts.

## Compatible real-model evaluation

The user requested AI judges via OpenRouter. Public model discovery confirmed
Gemini and Claude availability, but the current immutable staging grant permits
only `typesafe/jev-1.13` and `openai/gpt-4.1-mini`. Routing through OpenRouter does
not expand that allowlist. Gemini/Claude judging was therefore **BLOCKED**, with
no grant/cap modification or alternative-account bypass.

The permitted GPT-4.1-mini judge received the twelve source/reader controls in
shuffled X-ID order, without old labels, verifier outputs or suggested answers.
Original source handles still contain T-case IDs, so this was only partially
anonymized; blinding applies to labels/outputs. Its labels were retained before any verifier
output. It labeled six positive and six negative, agreeing with the prior
AI-assisted labels. This is **blinded, single-model AI adjudication**, using the
same model family as the verifier and audit-exposed controls. It is neither
independent human gold, a fresh holdout, fully anonymous review or three-model consensus.

The revised verifier used the unchanged GPT-4.1-mini/OpenRouter route and exact
`approved-propositions-reader-witness-v3` requests. All twelve request, question
and wire hashes are pinned; offline replay verifies exact compatibility and
decisions. No old receipt was upgraded, no repair/retry was purchased.

| Outcome against blinded AI labels | Count |
|---|---:|
| Correct acceptance | 1/6 positives |
| Correct rejection | 1/6 negatives |
| False acceptance | 0/6 negatives |
| False rejection (REJECT) | 0/6 positives |
| UNRESOLVED | 10/12 (83.3%): five positives, five negatives |

Zero false rejections in this table does **not** mean valid writing reliably
passes: five of six valid controls stayed unpublished. Five positives failed
exact reader-witness validation; negative cases also exposed incompatible novelty
and whole-claim/fact judgments. T08's bridge proposition is not communicated and
cannot satisfy coverage, but its whole-claim judgment still incorrectly treats
the omitted bridge as unsupported meaning in the true road sentence. T03 is
correctly rejected for swapped speakers; T24's wrong quantity is never accepted.

The harness retained decoded verdicts and authoritative usage/generation receipts,
but not raw wire spans. It cannot now distinguish wrong offsets from wrong echoed
text in the five positive witness failures. Do not reconstruct missing wire
values, assert that the decoder caused them, or reissue the paid operations.
Raw response retention is required before a separately authorized follow-up.

Verifier completion wall latency: **p50 2,256.90 ms / p95 2,924.99 ms** (12 samples,
nearest-rank p95 is the maximum). Header latency: 820.05/1,614.19 ms. These measure
real provider transport/body/decode, excluding D1 reservations and settlement.
The one judging call took 3,562.94 ms.

Actual cost: verifier **$0.0114568**, judge **$0.0010136**, total **$0.0124704**.
All **13/13** operations have authoritative reported settlements, independently
confirmed by read-only staging SQL; zero new unknown holds. Initial shared
headroom was $0.113387658; each call passed normal atomic exposure/concurrency
admission, plus a $0.10 evaluation-exposure bound. The $53 cap is unchanged.
Initial expired OAuth authentication was refreshed through normal `wrangler
whoami`; no key or grant was rotated. Credential contents were never logged.

Artifacts: `benchmarks/validation-compatible-evaluation-results.json` and
`benchmarks/validation-compatible-provider-verdicts.json`. The latter contains
actual new decoded provider verdicts, not mocked responses. The offline replay
test buys nothing; the live test is disabled without an explicit operator flag
and refuses every prior intent, including uncertain/prepared ones.

## Remaining publication bottlenecks

The retained slow attempt on Worker `45f475b8-0d2a-4da3-9b44-bffc113ffdcb` took
**661,592 ms** and failed without edition persistence:

| Stage | Wall time |
|---|---:|
| Readiness | 544 ms |
| Semantic shortlist | 240,361 ms |
| Editorial plan | 43,423 ms |
| Ranking/selection | 56,077 ms |
| Synthesis/prechecks/repair/persistence path | 317,624 ms |

Nested transaction callbacks total 516,201 ms; snapshot loading 5,533 ms and CAS
commit 11,516 ms. The containing invocation used 15,316 ms CPU over 663,037 ms
wall time. Invocation CPU is not stage CPU; transaction callbacks include awaited
work. These overlapping numbers show substantial waiting inside serialized work,
not 516 seconds of deterministic CPU or a measured D1-server CPU breakdown.

There were 41 CAS attempts, 17 conflicts, 1,640 document reads, 256 list reads,
248 revision reads and 623 preloads. Six sampled rejection diagnostics show
changed Feed epochs and unchanged observed scope sets; they contain **101,002 ms
discarded computation, 349 document reads and 110 preloads**. Diagnostics are
sampled at attempts 1 and 12, so this is incomplete conflict coverage. State is
observed after rejection: it does not identify the competing writer or prove all
17 conflicts have the same cause. Existing fencing correctly refused stale work.

Actual newly executed editorial-plan/synthesis/repair receipt times were
29,045 / 35,115 / 35,046 ms. A reused salience receipt's 953 ms is historical,
not new inference in this attempt. Paid-operation envelopes also contain spending
reservation, settlement, loading and persistence and must not all be called
inference. Final factual verification was never reached.

The queue wrapper holds the feed turn around the full publication callback.
Its previous `FEED_TURN_HELD` measurement had no active outer latency context;
the inner publication record could not report its enclosing lock. A small local
change adds a separate `PUBLICATION_TURN` aggregate, with stable normalized window
identity, admission/held durations and busy counts. It changes no lease, renewal,
admission, CAS, concurrency, budget or repair behavior and logs no payload.
It is not deployed. Historical inner publication duration is only a lower bound
on the enclosing turn where that wrapper is enabled, not a direct held measurement.

Two paired local one-story profiles exercised real D1 turn admission and normal
publication, then one deliberately injected epoch conflict with identical
assertions and zero-network synthetic ports:

| Measurement | Baseline | Current |
|---|---|---|
| No-conflict total | 2.648–3.037 s | 2.813–2.873 s |
| No-conflict held stage | 2.542–2.925 s | 2.699–2.760 s |
| One-conflict total | 3.238–3.271 s | 3.386–3.514 s |
| One-conflict held stage | 3.128–3.171 s | 3.281–3.395 s |
| D1 binding requests | 80 / 100 with conflict | 80 / 100 with conflict |
| Returned row bytes | 28,810 / 37,645 | 27,038 / 34,987 |

The current parent scope rebuilds input twice without conflict and three times
with one conflict; CAS attempts increase 8 to 9. Candidate loading is about
0.4 seconds for two rebuilds; complete input about 0.8 seconds. These are local
small-fixture measurements, not full-history or live inference measurements.
They demonstrate **no total-publication speedup**; two pairs cannot establish a
portable p95 or attribute the small differences to code. Local D1 exposed no SQL
CPU timing, so CPU is unmeasured. Batch statement wall times overlap. Query/read
counters stop before the separately tested idempotent reuse read.

The previous 21.2% large-fixture input-stage improvement remains stage-specific.
It did not reduce the number of canonical phases, repeated authorization reads,
model admission boundaries or CAS retries in this small complete-path test.
No additional cache, lock removal, pruning or concurrency change was guessed.

A 45-second passive staging tail observed 13 invocations but no completed
publication or publication-stage aggregate. No work was triggered. It supplies
no new live publication latency or before/after comparison. An initial CLI
rejected sampling rate 1; the successful observation used default full sampling.
Retained captures are reported separately rather than pooled as independent runs.

Evidence and reproducibility: `benchmarks/publication-path-followup-results.json`,
`benchmarks/publication-trace-followup-results.json`,
`benchmarks/publication-path-profile.test.ts` and
`scripts/summarize-publication-traces.py`. Set `PUBLICATION_PATH_OUTPUT` to a new
path, use `scripts/vitest.validation-followup.config.ts`; set
`VALIDATION_TIMING_BASELINE=2e46fa9` only for the baseline. Ports are synthetic;
reported mock usage is never actual cost or inference latency.

## Verification and remaining gates

Final focused Worker tests: **44/44 passed**, including turn concurrency, expiry,
replacement fencing, renewal, receipt settlement safety, latency aggregation and
reader-witness regressions (46.81 s). The two new observability tests failed before
the fix and passed afterward; equivalent ISO window correlation also has a
fail-before/pass-after check. The real evaluation test completed; the final offline
compatible replay/preflight passed **2 tests, one live test skipped**, with no
additional inference. Four local path-profile processes (two pairs, each testing
normal plus one-conflict publication) passed. Repository-wide typechecks and the
explicit staging-config Worker dry-run build passed on final diagnostic source.
No upload occurred. Frontend source is unchanged; its build and the entire Worker
suite were not rerun in this follow-up. The matched restart timeout remains open.
A focused read-only review found no important accounting/fencing or report issue.

Three-model independent AI adjudication remains blocked by model authority;
representative independent human holdout performance remains unmeasured. The
compatible verifier's 83.3% unresolved rate prevents a readiness claim. The next
semantic investigation needs exact raw reader spans; the next latency work needs
identification of epoch-changing writers and per-query/phase measurements on a
representative complete staging path before changing serialized ownership.
End-to-end staged publication and factual/provenance certification remain undone
and were not authorized by this request. Do not activate V2 or extrapolate the
local input-stage gain to reader delivery time.
