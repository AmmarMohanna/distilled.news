# Provider capacity incident — 11 November 2026

Follow-up implementation: [provider-capacity-recovery-2026-11-11.md](provider-capacity-recovery-2026-11-11.md). The diagnosis below records the initial state before that follow-up.

The current staging configuration is not qualified for production-scale scheduled delivery. This is an application admission/recovery failure, not evidence that OpenRouter limits this account to three simultaneous calls.

## Live evidence

The Lebanon-2 edition scheduled for 18:00 UTC / 20:00 Beirut remained PENDING with `PROVIDER_RESOURCE_WAIT` during investigation. Its saved coverage was COMPLETE, with zero pending and failed jobs. Its frozen input existed, but no final V3 result was present at the check.

The provider admission query, including its actual quarantine exclusions and tracking-mode start time, counted three unresolved OpenRouter reservations:

| Operation | Feed | Created UTC | State observed |
|---|---|---|---|
| `unread-summary-provider:2492ea20d58bb5d620299d6ca266e66eb63ebaef5c2784edf8b0b3f0f8589c1a` | Lebanon-2 | Nov 11, 17:38:26 | No settlement or saved summary receipt found |
| `semantic_intents:8257b6f96d0e187b1fe0cd73aa420253677c856266aca0f34f16ff9c34f4be30` | `briefing_e69e607f-907b-43ec-a521-ccd61234c0ff` | Nov 11, 15:08:13 | DEFERRED / SEMANTIC_PROVIDER_FAILURE; usage unconfirmed |
| `semantic_intents:0c61b7f4c4d20c5b78ad32f1a42f3a63e4943061b9568e2aa8f931b752ee85a1` | same other feed | Nov 10, 20:14:41 | DEFERRED / SEMANTIC_PROVIDER_FAILURE; usage unconfirmed |

All three leases had expired. The two semantic operations had no retained `model_provider_receipts` generation handles in the inspected lookup. No actual provider execution lifetime can be established from these local records. The unread-summary reservation held an estimated $0.00169, and the semantic reservations $0.339706 and $0.0117324. These estimates are not confirmed charges.

The existing rule counts unconfirmed accounting against concurrency indefinitely. That preserves uncertainty, but couples unrelated feeds and optional summaries to a global failure domain. Existing automatic metadata recovery requires a retained generation handle; elapsed time cannot manufacture that evidence. Repeated queue retries do not create capacity.

## Implemented local safeguards

1. Optional unread summaries use an admission threshold one slot and one rolling-minute request below the configured provider ceiling, enforced in the existing atomic D1 reservation batch. With the default three-slot pool, summaries can consume at most two slots, leaving the third for scheduled work. Configured single-slot / single-RPM deployments preserve their behavior and cannot offer this headroom.
2. Summary calls retain sanitized provider header and body generation receipts in the same durable receipt format used by briefing recovery. The existing bounded metadata-only recovery sweep can discover these reservations. A missing reported cost can then be recovered when the exact provider generation reports completion and cost; no inference is resent.
3. Known summary usage is durably settled before output validation. A completed but empty model response no longer keeps capacity occupied merely because its content cannot be used. The immutable reservation still prevents replay of that paid request.

The transport hooks are optional. Existing briefing calls without them retain their request bytes, models and behavior. The changes do not add a migration, alter historical reservations/settlements, quarantine any operation, raise provider limits, or resubmit uncertain work.

These safeguards do not retroactively supply the three missing receipts, release their existing holds, guarantee starvation-free scheduling, or solve indefinite global blocking by multiple uncertain scheduled calls. They are local changes, not a deployed incident recovery.

## Required production work

- Separate execution occupancy from financial uncertainty through an explicit, bounded recovery/isolation policy. Preserve unresolved exposure and immutable request fences. Do not mark an expired lease as provider completion or casually resend its request. The existing exact-operation quarantine path requires explicit acceptance of unproven remote overlap; it is not a financial settlement.
- Add per-feed/tenant admission and fair dispatch so one feed cannot accumulate all useful capacity. Give deadline-driven briefings priority over optional summaries and other background calls; one reserved slot is only an initial safeguard.
- Size throughput against observed calls per edition and provider-account capacity. At six calls per edition, 1,000 nonempty feeds publishing every 30 minutes need about 200 requests/minute before retries, acquisition or optional work. A 20-RPM ceiling supports only 100 such editions per half hour even at ideal utilization. Users and feeds are different units: many readers of one cached feed need not generate one model call each.
- Replace admission history scans with indexed typed active-operation / rolling-window bookkeeping where measured, while preserving atomic limits and exact recovery paths.
- Monitor oldest overdue scheduled window, active versus uncertain slots, recovery age, queue wait and provider failure rate. Alert before saturation rather than leaving the feed apparently healthy.
- Qualify sustained fresh scheduled windows, fairness, provider errors, disconnects, D1 failures and recovery under a representative multi-feed workload. Passing a mocked burst or serving concurrent feed reads does not establish timely model-backed publication at scale.

## Validation

- 339 briefing package tests passed.
- 7 unread-summary provider tests passed, including simultaneous requests across feeds leaving headroom, metadata recovery without a duplicate inference call, and known-usage settlement before empty-output rejection.
- 8 provider-routing, 4 provider-admission and 19 provider-recovery tests passed.
- Worker TypeScript check passed.
- Initial new recovery tests needed their missing feed fixtures corrected to satisfy real D1 foreign keys; their assertions were preserved and the corrected suite passed.
- No new real inference, paid throughput test, live quarantine, deployment or notification was initiated for this change.
