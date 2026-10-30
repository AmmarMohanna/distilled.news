# Opt-in automatic fresh X polling recovery

On `aya-ghada-preserved-integration`, interrupted TwitterAPI.io reads no longer
require a separate manual acknowledgement for every future failure when the
owner has opted in through `SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS` (JSON feed IDs).
The default is disabled. QA initially opted in the four Aya-admin feeds. On
30 October its explicit deployment scope was expanded to those four feeds plus
the 20 user-requested canaries. Other feeds and deployments remain outside it.

During ordinary source scheduling, at most five expired operations per source
are acknowledged after a 15-minute cooldown beyond the recorded claim expiry
(or recorded failure timestamp). Active claims, unknown timestamps, paused feeds,
disabled sources/accounts, other feeds and other providers are excluded.

Acknowledgement is bound to the existing operation hash, reservation, owner and
policy. It does not mark the request successful, refund funds, change checkpoints,
reset jobs or resend the old request. The existing paid HTTP layer rejects the old
identity with RESULT_LOST. Only a fresh scheduled poll may charge again. Overlap
is possible and remains subject to existing accounting and configured limits.
Apify actor starts and other unproven submissions retain their reconciliation fences.

Additionally, saving an already received provider response retries up to three
times for payload storage and database completion separately. It does not issue
another HTTP request. This helps transient storage errors; it cannot guarantee
that upstream requests or process termination never fail.

Validation: 113 provider-runtime tests passed, including injected completion-write
failures with exactly one provider call and one reservation. Fourteen worker tests
passed, including cooldown, scope, paused feeds, active/legacy/other-provider
exclusion, idempotency, retained reservations and source availability. Typechecks
and final QA build are checked before deployment. No new spending grant is added.
Public availability now distinguishes active in-flight claims from expired/failed
unknown charges. Admission still fences both, so this display correction cannot
permit a duplicate dispatch. Final worker regression count: 19 passed.
