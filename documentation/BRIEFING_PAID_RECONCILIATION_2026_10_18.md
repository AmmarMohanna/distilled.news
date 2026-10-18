# Paid model reconciliation: read-only staging audit

At the 2026-10-18 11:19-11:23 UTC checkpoint, **all 44 unsettled operations remain
financially UNKNOWN; zero have sufficient retained evidence for settlement**.
No reservation, settlement, quarantine, authorization or provider attempt was
changed. Production and sources QA were outside this audit.

## Current exposure

Authenticated Wrangler SELECTs targeted staging account
`e32b564514d4f9b9e383b7dd30dbb026`, D1
`ab259bfe-6029-4e20-8cb6-eea6b7a67459`, with the explicit staging config.
The reads are separate snapshots while staging Cron/queues continue operating.
All result metadata reports `rows_written=0`, `changes=0`, `changed_db=false`.

| Financial measure | USD / count |
| --- | ---: |
| Original current-period authorization | $50 |
| Confirmed current-period spending | $45.640232468 |
| All unresolved held exposure | $4.345092702 |
| Remaining exposure headroom | $0.014674830 |
| Quarantined unresolved operations | 25 / $1.470442694 |
| Active unresolved operations | 19 / $2.874650008 |

The original grant period remains 2026-10-12T19:15:55.700Z through
2026-10-19T19:15:55.700Z. All 44 local leases are expired. Quarantine removes
25 operations from admission concurrency, while preserving their financial holds
and semantic UNKNOWN fences. Expiry and age do not prove remote termination.

GPT-4.1-mini's configured output reservation alone is $0.0524288, before input.
Current headroom is $0.037753970 short of that minimum. This is an admission
constraint; it does not establish the budget needed for a complete briefing.

## Exact operation classification

All held amounts below equal the reservation ceiling: no unreported settlement
cost exceeds its reservation. Ages are approximately 45.207-304.664 hours at the
11:20 UTC reservation read. Quarantined ages are 114.131-304.664 hours; active
ages are 45.207-91.262 hours. Exact IDs, timestamps and age per operation remain
in the private classification artifact.

| Model | Operation | Quarantined | Count | Held USD |
| --- | --- | --- | ---: | ---: |
| GPT-4.1-mini | Legacy model intent | Yes | 6 | 0.240000000 |
| GPT-4.1 | Construction | Yes | 1 | 0.020000000 |
| GPT-4.1-mini | Editorial plan | Yes | 8 | 0.537650400 |
| GPT-4.1-mini | Construction | Yes | 9 | 0.672607200 |
| JEV-1.13 | Editorial relevance | Yes | 1 | 0.000185094 |
| GPT-4.1-mini | Publication synthesis | No | 2 | 0.174718000 |
| GPT-4.1-mini | Construction | No | 15 | 2.548311200 |
| JEV-1.13 | Relation | No | 1 | 0.000862008 |
| GPT-4.1-mini | Editorial plan | No | 1 | 0.150758800 |

There are 41 GPT-4.1-mini operations holding $4.324045600, one historical GPT-4.1
operation holding $0.020000000, and two JEV operations holding $0.001047102.
GPT-4.1 is historical liability, not a newly authorized model.

## Receipt proof and settlement eligibility

| Evidence class | Count | Interpretation |
| --- | ---: | --- |
| Bound OpenRouter HEADERS generation handle | 18 | Correlation only; $2.729273608 held |
| No retained provider handle or usage proof | 26 | $1.615819094 held |
| Provider USAGE receipt with reported dollar cost | 0 | No direct receipt settlement candidate |
| Provider recovery proof | 0 | No retained terminal generation-cost proof |
| Token-matched reported semantic settlement | 0 | No reusable reported settlement candidate |
| Reported semantic result | 0 | No retained reported result candidate |
| Strict, request-bound schema nonexecution proof | 0 | No zero-cost rejection settlement candidate |
| Confirmed legacy model execution | 0 | No legacy actual-cost settlement candidate |
| Rows in `llm_usage_events` | 0 | No independent usage record available |

All 18 handles belong to active operations: 17 GPT-4.1-mini and one JEV.
Receipt feed column, embedded feed ID, model and generation-ID format all match
their reservation. Every retained receipt is HEADERS with no reported dollar
cost. The remaining active construction has no handle, result or semantic
settlement and holds $0.145376400. All 25 quarantined operations lack a handle.

The 38 semantic intents all match their reservation token. Of these, 23 have
unreported DEFERRED results: 13 timeouts, six UNKNOWN outcomes, two generic
provider failures and two legacy HTTP-400 failures. Ten also have token-matched
semantic settlements, all unreported. Fifteen have no semantic result. The six
legacy model executions are explicitly `OUTCOME_UNKNOWN`, `confirmed=false`,
with no actual cost; their intent owner mapping matches the reservation.
Seventeen accounting settlements are unreported and 27 are absent. No retained
account/semantic settlement token mismatch was found within this cohort.

The newest scheduled recovery record for **each of the 18 handles** is
`WAITING / PROVIDER_COMPLETION_UNPROVEN`, dated between
2026-10-18T10:48:49.664Z and 11:19:32.980Z. Earlier HTTP-404 audit observations are
historical and must not be substituted for this fresh status. This audit did not
trigger provider lookups or inference. It read the staging scheduler's retained
metadata-only lookup outcomes.

The existing recovery implementation returns that reason when the parsed
generation metadata fails one or more exact identity/model, nonnegative finite
actual-cost, or terminal-finish predicates. The reason does not identify the
failed field. Therefore the current data cannot establish a zero charge,
nonexecution, a completed semantic answer, or a particular API incompatibility.
OpenRouter documents the metadata GET and its generation/cost/finish fields in
[the generation reference](https://openrouter.ai/docs/api/api-reference/generations/get-generation).

## Legitimate future settlement inputs

There are **zero write candidates from the current proof**. Existing safe inputs
would be an exact bound USAGE cost receipt; a token-matched reported semantic
settlement; terminal OpenRouter generation metadata with matching generation ID
and model plus finite nonnegative actual cost; or the existing strict HTTP-400
`invalid_json_schema` / `invalid_request_error` nonexecution diagnostic with
request identity and evidence-hash-bound operator approval. The inspected
implementations guard reservation ownership and immutable receipt identity.
A handle, timeout, HTTP status alone, expired lease, or reconstructed expected
schema is insufficient. Accounting settlement would not reconstruct a lost
semantic answer or authorize reissuing the UNKNOWN question.

## Exposure amendment limitation

The current implementation has **no exposure-cap amendment primitive, table or
operator route**. Migration 0051 makes base authorizations immutable; the
authorization helper rejects differing reuse of an ID and overlapping grants.
Migration 0052 and `model-spending-amendments.ts` amend concurrency only.
They cannot turn the existing $50 cap into $51.

Opening a replacement period now would change the reported-cost accounting
window and omit prior period spending from admission. Deleting/reinserting the
base grant would discard its immutable identity. Neither preserves the requested
original-period counters. A same-period append-only cap increase requires a
separately implemented and validated exposure amendment mechanism that keeps
the original grant ID, period, model list, concurrency rule and all liabilities,
and fences admission against stale amendment state. No such implementation,
migration or financial mutation was performed by this audit. Budget authorization
and its concrete implementation remain the root operator's decision.

## Private evidence and audit limits

Ignored evidence under `.local-reports/briefing-latency/`:

- `paid-reconciliation-20261018.sql`: projection-only SQL; execute each statement
  as a single-line `--command` with the explicit staging config.
- `paid-reconciliation-grant-20261018.json`: grant-period exposure.
- `paid-reconciliation-q2-20261018.json` through `-q6-20261018.json`:
  reservation projections, provider handles, latest recovery outcomes,
  recovery-kind counts and independent usage count.
- `paid-reconciliation-legacy-20261018.sql` and `-legacy-q0/q1-20261018.json`:
  exact legacy execution and both semantic result/settlement proof projections.
- `paid-reconciliation-classification-20261018.json`: all 44 opaque identities,
  timestamps/ages, model/state, held amounts, handle and proof classification.

No article, prompt, complete intent, provider output or secret was returned.
The grouped recovery-kind query read 558,169 metadata rows in 452.8 ms; it is
not a payload-memory benchmark and was not repeated. Other reservation/receipt
queries use bounded outputs and exact kind/feed/ID joins. The initial multiline
CLI invocation returned only its first timestamp statement; financial assertions
come from the subsequent individually executed statements, not that invocation.
The existing authenticated CLI succeeded without login/credential changes.

## Subsequent operator action (outside this read-only audit)

The owner explicitly approved the separately documented append-only $50-to-$51
cap design. After implementation, retained-history tests and verified backup,
staging migration 0062 and one sequence-1 amendment were applied. This audit
did not settle or release any of its 44 unknown operations. The original grant
period, all reported costs and $4.345092702 held exposure remain in admission.
At 13:11 UTC three newly authorized GPT operations had reported charges of
$0.219032 with no new unknown hold; two editorial results succeeded and one
deferred on invalid context references. See [the approved amendment record](BRIEFING_BUDGET_TOPUP_PROPOSAL_2026_10_18.md)
and [final validation](BRIEFING_FINAL_VALIDATION_2026_10_18.md) for later checkpoints.
