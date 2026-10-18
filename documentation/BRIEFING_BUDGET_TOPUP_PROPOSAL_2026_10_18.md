# Bounded staging model-budget top-up proposal

The owner authorized a budget increase if needed on 2026-10-18 and explicitly
approved this append-only $50-to-$51 design in the same session. No
grant, hold, reservation, source budget or credential has been changed.

The current grant has a $50 maximum, $45.640232468 reported in its original period,
and $4.345092702 held across 44 unknown operations. Headroom is $0.014674830; a
required GPT output reservation alone is $0.0524288. All 44 holds lack proof for
settlement/release. The base-grant table is immutable and overlapping grants are
rejected. Creating a new accounting period would omit existing period charges.

Proposed bounded design: an operator-only, append-only exposure amendment raises
this existing staging grant's absolute cap from $50 to $51. It retains the same
authorization ID, original validFrom/validUntil, allowed models, account, reported
costs, uncertain holds, concurrency amendments and every admission/settlement rule.
No original row is updated, deleted or replaced. No public endpoint is added.

One additive migration introduces immutable amendment records (grant ID, sequence,
absolute cap, creation time, owner-authority reference). Only monotonic increases
are valid. Admission reads the effective cap and fences its amendment sequence in
the same existing atomic reservation guard. Missing amendment schema preserves the
base-cap behavior. Production and sources QA receive no migration or deployment.

Before remote mutation: test representative retained financial history, idempotency,
invalid/overlapping amendments, concurrent reservation/amendment races, unchanged
charges/holds, original-period accounting, and operation without the new table.
Export and verify a fresh staging backup, record Worker/assets/rollback, apply only
the additive migration, deploy and verify all bindings, then append the single $51
amendment. No source budget or provider authorization is changed.

Bounded real-model verification then uses normal durable jobs and accounting. The
additional maximum exposure is $1, with no automatic further increases. Unknown
operations are not reissued. Success requires a genuinely new edition with complete
evidence and factual verification; otherwise the acceptance criterion stays BLOCKED.

Implementation is additive migration `0062_model_spending_exposure_amendments.sql`,
an operator-only amendment primitive, and effective-cap/sequence fencing in existing
reservation admission. The economic RED regression observed the old $50 admission
rejecting the required reservation despite an appended cap. The final six new cases
and thirteen existing spending/concurrency cases pass (19/19). They preserve charges,
old UNKNOWN money, idempotency, ownership, monotonicity, immutable base/amendment rows,
same-parent operator races, stale reservation fences, amended-cap concurrent limits,
allowed models and pre-migration fallback. One timestamp fixture initially selected
future-date validation instead of the intended outside-period check; the fixture
was corrected to a past date outside the grant.

Remote backup verification, representative-history migration validation, deployment
and the actual single $51 amendment remain required. Until those occur, live
real-model publication remains financially BLOCKED; approval alone is not headroom.
