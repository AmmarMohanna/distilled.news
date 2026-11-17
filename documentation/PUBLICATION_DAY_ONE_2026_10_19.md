# Publication delivery: simplification, batching and measured progress

19 October 2026, `backend-validation-contract`, starting at `dd88f5c`.
Implementation commit: `2719c0d` (local only); evidence is committed separately.
V2 is still disabled by default. No push, deployment, activation, migration or
real briefing publication. Two separately approved evaluation calls cost
**$0.0110652 total**, both authoritatively settled. No new unknown holds, cap,
allowlist, credentials, source permissions or production/sources-QA changes.

## What changed

V2 no longer runs legacy lexical quantity/date/modality/negation/attribution and
coverage scans merely to downgrade their output to warnings. It also no longer
runs the legacy direct-quote scan before the V2 quote comparison. These duplicated
semantic work and could not establish factual meaning. Legacy behavior is unchanged.

Retained exact checks: selected story ownership/structure, source-bound citation
spans and reference IDs, approved URLs, direct quoted words and narrow presentation
equivalence, ambiguous quotation blocking, source authorization, immutable version
identity, canonical CAS/turn/lease fencing and durable model accounting. Missing
semantic capacity remains UNRESOLVED, never approval. Editorial V2 already requires
explicit proposition-level REQUIRED dispositions rather than automatically making
every novel/optional fact mandatory; that contract and protected corrections remain.

The verifier still answers two complementary questions in **one batch when it
fits**: every written factual assertion supported, and every mandatory proposition
actually communicated. Context is shared per story. The V2 prompt now states these
questions directly instead of attaching the long legacy policy plus overlapping
instructions. Jev remains available for its existing bounded structured decisions;
the current GPT-4.1-mini/OpenRouter route retains writing and deeper verification.
No new classifier, call, provider switch or cheap automatic factual approval.

The original five positive witness failures had only decoded outputs, not raw
provider coordinates; their exact coordinate mistakes could not be reconstructed.
V4 stopped asking the model to count UTF-16 offsets. It requests a named claim
and a unique excerpt from that claim; the server derives and stores exact reader
text and coordinates. No bare-ID/full-claim fallback, source lookup, fuzzy matching,
whitespace/punctuation normalization or paraphrase-based anchoring is permitted.
Meaning between source and reader can still be a paraphrase: the excerpt anchors
the **actual reader prose**, not lexical equivalence to source.

The first new raw response exposed a concrete remaining problem: it cited
`The product launched.` while actual prose contains lowercase `the product
launched.` inside a report-framed sentence. V5 permits only unique ASCII-letter
presentation-case lookup and persists the exact authoritative slice. This locates
text; it does not declare factual equivalence. Source/reader semantic entailment,
attribution, quantity, uncertainty, temporal and whole-claim judgments must still
agree. Missing, repeated/ambiguous or foreign reader excerpts cannot pass.

The raw negative quantity/negation/causation decisions correctly said the required
fact was NOT_COMMUNICATED, but filled unused novelty-history metadata with source
facts. V5 does not demand history witnesses for that negative state. It still
requires offered same-story history for NEW/ALREADY_COMMUNICATED decisions and
does not turn contradictory positive coverage into a rejection or approval.
Invalid spans cannot support positive coverage; an explicitly negative communication
judgment does not require a nonexistent positive reader witness. Conflicting whole-
claim/fact verdicts remain UNRESOLVED and buy no repair.

Explicit older-source framing remains a semantic obligation when
`timing.framingRequired=true`; absent framing requires `temporalFaithful=false`.
No lexical date-wording gate was restored. Prompt identity is
`approved-propositions-reader-anchor-v5`, packet identity
`verification-reader-anchor-v5`. Changed requests cannot reuse older receipts.

## Actual provider results, including unsuccessful work

Same twelve audit-exposed controls, six positive/six negative, prior AI-assisted
review labels. **No independent human gold or fresh holdout.** Gemini/Claude are
not permitted by the existing staging grant; no allowlist expansion occurred.

| Evaluation | Calls | Actual cost | Completion time | Valid ACCEPT | Invalid REJECT | UNRESOLVED |
|---|---:|---:|---|---:|---:|---:|
| Prior revised-coordinate evaluation | 12 | $0.0114568 | 28.704 s summed serial call completion | 1/6 | 1/6 | 10/12 |
| New V4 batch | 1 | $0.0056656 | 17.426 s | 5/6 | 0/6 | 7/12 |
| Final V5 batch | 1 | $0.0053996 | 16.068 s | 6/6 | 4/6 | 2/12 |

No false acceptance or false rejection in the final batch on these labels;
unresolved positives **0/6**, unresolved negatives **2/6**. T03's wrong-speaker
case and T08's omitted bridge remain blocked because the response offered missing
or conflicting witnesses. The model explicitly hallucinated that the bridge
sentence was in the reader; exact authoritative lookup caught it. S12 legal scope
and S18 speaker correctness additionally have controlled offline regressions,
not new real-provider judgments for those saved articles.

V5 uses 52.9% less actual verification cost and 44.0% less serial completion wall
than the prior twelve calls on the same controls. Prompt, anchoring and batching
all changed; this does not isolate batching as the sole cause. One V5 batch is
**not a p95 measurement**. It does not establish independently reviewed accuracy,
full-edition quality, writing cost or full briefing latency.

Both new trials count as experiment spend, including the inferior V4 trial:
**$0.0056656 + $0.0053996 = $0.0110652**. The previous judge's $0.0010136 is separate
prior experiment spend, not a new charge or a briefing cost. Raw response streams,
parsed raw verdicts, decoded results, request hashes and generation/cost receipts
were retained before settlement. Read-only staging SQL confirms both settlement
tokens match. No uncertain operation was reissued. The $2 user ceiling was not
used to increase the $53 grant or run additional calls.

Artifacts: `benchmarks/publication-day-v4-provider-evaluation.json`,
`publication-day-v5-provider-evaluation.json`, `publication-day-evaluation-summary.json`.
V4 replay under V5 is explicitly counterfactual and never upgraded into a V5 paid
receipt; final V5 replay checks its exact compatible request and actual raw output.

## Complete local publication path

One proven redundant read was removed: adaptive lease-renewal no longer builds
the complete authorized writer input, immediately before the provider callback
does the same work. Renewal still checks job token, state, lease and Feed revision;
durable admission still checks source-active inputs. The callback and result
consumption retain full selection/source/version checks in their own CAS snapshots.
A race test revokes the source after intent admission and confirms **zero provider
executions and no edition**. No transaction was removed, no paid boundary merged,
and no cross-request cache or unsafe parallel writer introduced.

Two alternating baseline `dd88f5c`/current pairs exercise ready selection through
persisted V2 edition with identical assertions and synthetic zero-network ports:

| Measurement | Before | After |
|---|---|---|
| Publication wall, pair 1 | 7.559 s | 6.713 s |
| Publication wall, pair 2 | 8.782 s | 6.638 s |
| Median of those two | 8.171 s | 6.675 s (18.3% lower) |
| Input rebuilds | 9 | 7 |
| Parent document/list/revision reads | 52 / 38 / 9 | 48 / 30 / 7 |
| Parent preloads | 45 | 35 |
| CAS attempts / document writes | 13 / 22 | 13 / 22 |
| Verification packets / controlled provider ports | 1 / 2 | 1 / 2 |

Parent counters exclude nested MODEL scopes; do not add overlapping stage totals.
This is the local **publication subpath**, not the whole evidence-ready runtime:
upstream shortlist/planning/collection and real inference are excluded. Do not
add the 16.068 s batch to these fixtures and claim a live 23-second briefing.
The larger 21.2% input-stage benchmark remains separate. No p95 claim from two pairs.

The historical failed evidence-ready attempt remains 661.592 s: shortlist240.361,
editorial43.423, ranking56.077, synthesis/repair/prechecks/persistence317.624 seconds.
Six sampled CAS rejections discarded 101.002 s. This work did not fix all epoch-
changing writers or long exclusive turns; it reduces repeated loading inside them.
Source collection delay and ready-to-trigger backlog are separate and were not
remeasured here. New outer turn diagnostics remain local, not deployed.

## Full cost target and unsuccessful publication attempts

Read-only ledger grouping by exact window/selection includes all bound paid
operations, not just successful writer calls. Both retained windows still have
FAILED requests and **no persisted edition**:

| Known window-bound stage cost | Failed window 1 | Failed window 2 |
|---|---:|---:|
| Editorial plan | $0.0474136 | Not bound by this query |
| Writer | $0.0326700 | $0.0031160 |
| Repair | $0.0344540 | $0.0035208 |
| Verification | Not reached | $0.0059032 |
| Known reported lower bound | **$0.1145376** | **$0.0125400** |

First window is already above $0.10 before acquisition/intelligence/collection.
Shared/reused intelligence and paid collection lack a complete edition allocation
in these queries; their missing costs are **unknown, not zero**. A lower bound
below $0.10 for window2 proves nothing about full cost. Historical failed-window
spend $0.1270776 and new experiment spend are reported separately; neither is
hidden by dividing by model successes. No complete new real briefing attempt,
therefore no measured cost per successful briefing. Under-$0.10 and under-60-second
product targets are **NOT YET DEMONSTRATED**.

For the next controlled publication, freeze a single feed/window, link all paid
source/intelligence operations to exact evidence/provenance, count failed/abandoned
and reused operations once, include existing charges/unknown holds, and compute
the complete conservative planning/writer/one-repair/verifier envelope before
requesting publication spending. If that full bound exceeds $0.10, reduce optional
editorial scope/prompt duplication before buying the attempt, retaining mandatory
developments pending when not selected. This is an acceptance gate, not permission
to discard relevant evidence or alter published coverage semantics.

## Verification and remaining approval

Final checks: **99/99** focused pure/model tests, **7/7** V2 D1 publication tests,
and **18/18** adaptive/semantic-operation tests passed. Exact raw V4/V5 replay and
new request preflight passed **3 tests**, live test skipped by default. Historical
V3 paid replay remains pinned to its original Git prompt/wire, never reinterpreted
as V5. Two local paired publication runs passed on each revision. Source revocation
and framing/anchor changes have fail-before/pass-after regressions. Repository-wide
typechecks and explicit staging-config Worker dry-run passed; no upload. A focused
read-only review found one lost semantic framing instruction, now restored and
regression-tested, with no remaining important findings. Frontend source is unchanged;
its build was not rerun. No new test timeout was raised; prior strict restart timing
asymmetry remains open, separately from the passing adaptive recovery cases.

No full Worker rerun, timeout increase, frontend change, provider/model switch,
additional repair loop or automatic retry. Earlier baseline-sensitive timing
failures remain documented separately; this work does not declare them resolved.
Independent factual review and holdout remain required. A controlled staging
publication still needs explicit deployment/activation/publication approval,
verified resources/backups/rollback, current grant headroom and complete-attempt
cost preflight. Neither the $2 evaluation approval nor these controls authorize
that step. Keep V2 disabled until those gates pass.
