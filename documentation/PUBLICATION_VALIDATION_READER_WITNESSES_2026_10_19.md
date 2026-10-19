# Reader-grounded validation and publication input latency

19 October 2026. Branch `backend-validation-contract`, starting at `2e46fa9`.
Implementation commit: `7908a59` (local only); this report and benchmark artifacts
are committed separately. V2 remains disabled by default. No inference, remote mutation, deployment,
activation, merge or push was performed in this work. Existing evidence, labels,
provider receipts and financial holds were not modified.

## Confirmed defect and correction

The saved twelve-call evaluation was not independent human gold. Six invalid
controls had fact-level reasons describing source propositions as reader prose.
The wire requested only a claim ID; its decoder substituted the entire claim text
when text was absent. A bare reference to the road sentence therefore became an
apparently grounded witness for an unwritten bridge closure. Whole-claim/fact-level
conflict blocking prevented publication in that sample; it did not make the
fact-level judgments correct.

V2 now separates `sourceSupported`, `communicated`, and
`readerEntailsProposition`. Positive coverage requires all of these plus the
existing attribution, certainty, temporal, qualifier and repetition checks.
Semantic entailment explicitly covers subject/predicate, quantity/unit, date role,
speaker, modality, uncertainty, negation and causation. Exact lexical similarity
between source and reader is not required.

The provider must supply `claimId`, `start`, `end` and `text` for every positive
communication witness. Coordinates are half-open UTF-16 offsets into the exact
authoritative same-story claim string. Decoder, combined gate and proposition-work
resolution independently check the actual slice. No normalization, source-body
lookup, provider echo or whole-claim substitution can create a witness. Text
presence alone never replaces proposition entailment or whole-claim support.

Preservation summaries are scoped by the raw provider fact alias before aliases
are decoded to original fact IDs. The internal `preservedInSummary` marker is
derived locally and cannot be provider-supplied. This prevents a shared fact ID
in one story from turning another story's optional omission into a contradiction.
Packet merging retains occurrence ownership; positive/negative judgments for the
same occurrence across packets remain UNRESOLVED rather than buying a repair.

Whole-claim support evaluates only the actual written claim; mandatory coverage
is assessed separately. Omitted optional context needs no coverage verdict;
optional assertions actually written remain subject to whole-claim support and
any offered fact-level judgments. Contradictory positive summary IDs are retained,
not filtered into a repairable negative. Missing, incompatible and conflicting
verdicts remain UNRESOLVED and cannot purchase a repair. Consistent factual REJECTs
retain the existing sole repair opportunity. Legacy prompt/schema behavior stays
unchanged, including rejection of the newly introduced V2-only response fields.

The new prompt identity is `approved-propositions-reader-witness-v3`; the packet
schema identity is `verification-reader-witness-v3`. Existing question, draft,
source, model/provider, editorial, settlement-token and result-hash compatibility
checks remain. Historical provider responses are replayed unchanged and explicitly
excluded as incompatible with the new contract. They are not upgraded into new
compatible judgments or purchased again.

## Regression evidence

Fail-before/pass-after tests reproduced the bare-ID false communication, missing
coordinates, source-only/foreign spans, contradictory summaries and legacy schema
widening. Controlled semantic ports cover accurate paraphrase, S12 original versus
repaired legal scope, S18 speaker attribution, S16 independent development ownership,
T08 separate supported-road/omitted-bridge judgments and wrong subject/quantity.
Those ports test runtime routing, not new provider accuracy. The saved 12 real
responses are all incompatible with the revised request and remain UNRESOLVED
under the revised gate; no revised-model accuracy rate is claimed.

Final focused verification: **71/71 tests passed across eight files** (126.99 s),
including all six local D1 V2 publication/recovery tests and 25 reader-witness
regressions. These controlled publication tests preserve receipt fencing, deny
conflicts/incomplete verdicts without repair, and permit a valid paraphrase.

The broader 24-file run recorded **189 passed / four timing failures** (869.12 s):
legacy publication restart and 227-ID store batch tests hit their unchanged 5 s
limits; two spending integration tests hit unchanged 10 s setup-hook limits.
There was no memory-limit failure or ordinary assertion failure in that run.
It predates the final ownership/packet-merge fixes and is not final-revision broad
verification. The final focused run covers those later changes. The entire Worker
suite was not rerun. Prior baseline timing sensitivity does not exclude a small
additional regression; no timeout or timing assertion was relaxed.

One bounded final strict rerun: the two financial tests passed under their original
limits; legacy publication restart and the 227-ID batch test again exceeded 5 s
(two passed, two timed out, 30 unrelated tests skipped; 52.01 s). Thus financial
setup failures were not repeatable in this focused run, while the two strict
latency failures remain open. This does not establish environmental-only causation
or a fully green regression suite. Existing baseline/current timing evidence is
in `PUBLICATION_VALIDATION_REGRESSION_2026_10_19.md`; no final-code claim of timing
equivalence is made for those unresolved tests.

Repository-wide typechecks, web build and the explicit `wrangler.staging.toml`
Worker dry-run build passed. The dry run uploaded nothing. The final saved-real-provider replay passed: all 12 historical decisions/reasons
are reproduced exactly, while all 12 old responses are incompatible with the new
contract. The companion label/draft-routing test emitted its complete diagnostic
but exceeded its unchanged 5 s limit (13.447 s); that final check is a failure,
not a pass. Its earlier two-test run passed before the last packet fixes. The
emitted diagnostic has zero compatible semantic judgments and cannot establish
accuracy. No inference was performed. Source-free check results are in
`benchmarks/reader-witness-regression-results.json`.

## Latency diagnosis and bounded change

The historical failed attempt took 661,592 ms: readiness 544; semantic shortlist
240,361; editorial plan 43,423; ranking/selection 56,077; synthesis/repair/prechecks
and persistence 317,624. Actual synthesis and repair requests occupied 35,115 and
35,046 ms within that last stage; factual verification and edition persistence
were never reached. There were 41 CAS attempts, 17 conflicts and 623 preloads.
These nested measurements overlap; unexplained time is not all database CPU.
The previous 2.06/3.14-second verifier p50/p95 came from different synthetic calls.

Publication repeatedly reconstructs its authorized selection input around durable
model and canonical commits. The first measured two-read projection removed
unnecessary full active-article and historical-revision bodies: 511,089 to 9,006
serialized row bytes with identical identities. Full-input wall times for that
projection alone were mixed; it was not presented as an end-to-end speedup.

Profiling then identified eager semantic-reference loading for every eligible
Event although publication only consumes selected versions. The optimized path
still discovers the complete catalog and applies identical source/root/cutoff
checks. It batch-loads and validates the selected candidates, then preloads their
semantic states/propositions/slots/entities. Other `targets()` callers remain eager.
No candidate pruning, cross-request cache, extra concurrency, model operation,
policy-identity change or lock removal is involved. All current authorization and
version checks rerun per transaction and CAS retry.

Final alternating-pair comparison on the unchanged read-only retained database:
179 active revisions, three selected stories, ten measured full-input pairs after
warmup. Complete synthesis input JSON hashes match in all 22 captures:
`28f18733b6a4d666661f35fc88196978e5129d9a5930026397f95e3c4e71a00b`.

| Full publication input rebuild | Before | After |
|---|---:|---:|
| SQL statements | 46 | 29 |
| Binding requests (batch counts once; supplemental boundary count) | 30 | 26 |
| Serialized row-array bytes | 7,770,404 | 6,058,426 |
| Local wall p50 / p95 | 313.00 / 674.88 ms | 246.65 / 547.53 ms |
| SQLite execution/row extraction p50 / p95 | 108.57 / 336.15 ms | 86.19 / 157.26 ms |

The measured local input-stage median improves 21.2%, p95 18.9%; SQL statements
fall 37.0%, binding requests 13.3%, returned row bytes 22.0%. Binding counts are
not network latency measurements. Windows process CPU is coarsely quantized;
SQLite execution timing is not a measurement of remote D1 server CPU. Remaining
payload includes 2.74 MB of historical storyline versions and 1.60 MB of frozen
shortlist/context. Those dependencies were retained, not pruned speculatively.

The twelve-claim controlled combined-gate/one-packet-merge microbenchmark (ten
paired samples of 100 decisions) changes p50 from 0.23383 to 0.44241 ms/decision;
p95 from 0.43370 to 0.72668 ms. That is approximately 0.20857 ms additional median
local gate work, not actual revised inference latency. The two-read identity projection alone
changes local p50 10.035 to 1.400 ms with identical IDs; query/binding count stays
two in that isolated submeasurement.

Source-free samples and caveats are in
[publication input results](../benchmarks/publication-input-latency-results.json)
and [local reducer overhead](../benchmarks/reader-witness-cpu-results.json).
Reproduce with `scripts/vitest.publication-input.config.ts` using
`PUBLICATION_PROFILE_DB`, `PUBLICATION_PROFILE_FEED`,
`PUBLICATION_PROFILE_SELECTION` and a new `PUBLICATION_PROFILE_OUTPUT` path.
The test requires read-only access, rejects SQL writes/network and loads the
baseline input function from commit `2e46fa9`; only benchmark transforms export
private helpers. Run `scripts/vitest.reader-witness-profile.config.ts` for the
portable controlled reducer comparison. Do not overlap performance runs with
other local D1 tests. No simulated provider delay is included.

The instrumentation adds bounded aggregate stages for publication input, active
identities, full candidate catalog, selected semantic loading, history identities,
prechecks, provider execution, verdict reduction, result persistence and edition
persistence. Counts include input rebuilds, catalog/selected version counts,
identity queries/rows and verification request bytes. Existing reservation,
settlement, database snapshot, CAS attempt/conflict and canonical-turn diagnostics
remain. No article text, prompts, provider payloads or new D1 diagnostic writes
are logged. Stage totals can overlap and must not be summed as wall time.

## Cost, limits and next acceptance gates

The four saved drafts still fit one packet each. Their diagnostic wire grows by
1,484 bytes per packet; reservation ceilings grow by $0.0005936 per packet under
the existing conservative descriptor. This is estimated admission exposure, not
new actual spending. Additional response fields can increase output tokens;
actual revised provider cost and inference latency remain unmeasured. There are
no new provider calls, retries, fallback models or automatic purchases. Local
coordinate/reducer cost is measured separately from inference.

The publication exclusive turn is unchanged. Reduced serialized input work is
expected to shorten its occupied duration; neither live turn time nor complete
source-observation-to-publication speedup has been demonstrated here. Shortlisting,
remaining full metadata/context reads, CAS contention and long exclusive turns
remain confirmed priorities. Do not claim substantial live end-to-end improvement
or production readiness from this offline work.

Before real staging publication: obtain separate inference/publication authority;
check a currently valid grant/headroom without releasing unknown holds; run the
revised verifier against independently reviewed representative positives and
negatives with exact compatible receipts; score accept/reject/unresolved outcomes;
then authorize a controlled staged end-to-end publication with factual/provenance
review and observed stage/turn/cost measurements. V2 must stay disabled until these
gates pass. The historical $53 ceiling is not permission for new spending.
