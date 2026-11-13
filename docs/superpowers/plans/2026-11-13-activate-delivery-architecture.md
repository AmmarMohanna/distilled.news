# Activate staging readiness and edition artifacts

User explicitly requests completion of the staged activation. Existing autonomy authorizes commit, push, staging deploy and real-data verification. Production is out of scope. Preserve existing paid operation identities, accounting, source authorization and private visibility.

1. Inspect migration/binding state, current flags and baseline reads/outcomes.
2. Deploy readiness shadow for the Lebanon staging feed; observe actual clock windows and stable canonical/projection parity. Keep current publication authority intact.
3. Run readiness/outbox replay tests and archive publication, privacy, withdrawal, corruption/fallback tests.
4. Verify real private R2 artifacts and real route parity; qualify before enabling archive reads broadly.
5. Enable readiness relay after matched shadow evidence. Validate send/consume/replay and available feed cohorts before widening staging.
6. Fresh review, final tests, commit/push/deploy, record actual flags and live measurements. Never equate a configuration flag or an HTTP200 with completed rollout.

Ruling: Keep VERIFIED_ARCHIVE_ENABLED outside this rollout; it controls diagnostic compaction rather than edition payload delivery, and user authorized readiness/edition activation. No historical financial/evidence cleanup.

## Execution record

Shadow parity, private R2 equality/idempotency, automatic attachment, actual native Queue consumption/replay, privacy checks and metered reads are complete. The isolated private queue fixture was cleaned after strengthened owner/source/payment checks. Final staging config removes the temporary cohort allowlist. See docs/delivery-architecture-activation-2026-11-13.md for measurements and evidence boundaries. Fresh review found no blocker; typecheck and final bundle dry-run passed. Final commit/deployment identifiers are recorded after release.

Ruling: Native Queue smoke verification used an explicitly private zero-source fixture in addition to the real feed event. It created no articles, model operations or published editions, and was removed transactionally. This tests transport/consumer idempotency without pretending to establish a production SLA or parity for every feed.

Final release: code1b9b0c68, staging7b73743f-4d4e-4cbe-a3b7-5341edee9ec7. Live settings confirm relay/artifacts active and no cohort restriction. Native real-feed consume/replay, automatic artifact attachment, private denial, fixture cleanup and subsequent23:30publication are verified. Activation tasks are complete; sustained production performance remains a separate qualification.
