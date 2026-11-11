# Provider capacity recovery — 11 November 2026

The staging incident exposed a shared execution pool held indefinitely by three UNKNOWN operations. The fix separates operational isolation from financial settlement without resending uncertain calls.

## Behavior

- Staging explicitly enables `V1_MODEL_UNCERTAIN_EXECUTION_POLICY=isolate-after-5m-v1`. The cron recovery owner first tries the existing metadata recovery and then independently isolates up to three reservations whose immutable lease expired at least five minutes ago. This is operator-authorized acceptance of possible unproven remote overlap, not evidence that a provider terminated execution. Quarantine retains account, token, policy and UNKNOWN-termination metadata. Historical charges, reservations and results are not rewritten, and late billing can still settle normally.
- Isolation removes the old identity from execution admission; the exact request remains fenced against resubmission. Account financial exposure limits still include uncertain charges. Deployments without the explicit policy keep their previous conservative behavior.
- A failed UNKNOWN V3 operation with an exact account/token-bound quarantine ends its window as FAILED / `V3_UNCERTAIN_CALL_ISOLATED`, rather than waiting forever. No delivery is fabricated. Evidence remains eligible for later windows, and retries never resend the frozen call.
- Staging limits each feed to two of the three provider slots. Optional summaries also leave one provider slot and one rolling-minute request for scheduled work. These are atomic admission limits, not a guarantee of starvation-free dispatch. Single-slot deployments cannot provide this headroom.
- Summary transport now persists sanitized generation handles and known usage before validating output. The existing metadata-only recovery can recover known provider cost without reissuing inference. Empty but conclusively billed responses release occupancy while remaining non-replayable.

## Storage and rollout

Migration 0088 adds a typed active-operation projection, atomically maintained by reservation, settlement and exact-quarantine triggers, plus an expression index for provider rolling-minute admission. It backfills only unconfirmed, non-quarantined identities and preserves all financial history. Provider admission uses the small projection when installed, rather than scanning financial history on every reservation.

A tested compatibility path retains ledger-based admission and bounded isolation before the migration exists. This avoids making recovery depend on a schema upgrade during a D1 incident. The legacy path has higher read cost; it is not presented as the indexed performance result.

During rollout, D1 repeatedly returned CPU reset 7429 during Wrangler's migration-ledger initialization and later during ordinary metadata SELECTs. This does not establish that the new migration caused the resets: its schema changes had not been sent in those attempts. The direct migration helper skips redundant ledger creation, checks schema state and sends the same migration SQL plus ledger insertion used by Wrangler.

## Validation

- 339 briefing package tests passed.
- 63 initial Worker tests passed across financial admission, quarantine, provider limits/recovery, routing, summary recovery and automatic isolation.
- The 61-test V3 suite initially passed 59 with two mock transport failures: those fixtures lacked answers for the previously added citation-coverage stage. Both corrected fixtures passed a focused rerun; no product guard was weakened. The new isolated-UNKNOWN test verifies failed-window transition, unchanged financial/result records, no duplicate inference and successful later publication with carried evidence.
- Migration/backfill and index-plan validation passed. The added unmigrated-upgrade test verifies per-feed admission, isolation and immutable replay protection without the projection.
- Worker typecheck and staging bundle dry run passed. Dry-run bindings remained the existing staging resources and frontend assets; no model or global provider ceiling was raised.

Live deployment, recovery and migration observations are recorded below once observed. These checks are not a paid load test or proof of production-scale throughput.
