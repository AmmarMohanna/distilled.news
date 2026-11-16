# Controlled first-beta production pilot — prepared, NOT AUTHORIZED

Use the existing production environment and selected V4 routing. This is a short product acceptance test, not the $11.138 continuous-value study, another judge comparison or an architecture experiment. No command in this document has been executed against production to create a user/feed, change configuration or deploy.

## Entry gates and spending

Before any production write or model dispatch:

1. Resolve the owner-only security actions in `FIRST_BETA_READINESS.md`; keep vulnerable authenticated-browser components disabled. Confirm which origin users will actually visit. The canonical domain currently differs from the supplied production Workers URL.
2. Obtain explicit approval for the exact candidate SHA, production deployment, creating the pilot account/feeds and their subsequent source/visibility changes. Confirm owner login and Outlook verification/password-reset email access. Do not recover a password by printing hashes or secrets.
3. Obtain a separate explicit finite monetary ceiling covering **generation, source assessment/discovery/extraction, feed illustrations if used, background evaluation, new unresolved reservations and any paid source providers**. Configure the approved enforcement before source activation. Current `TRACK_ONLY` plus source `unlimited` is not a cap. Keep all historical financial evidence and UNKNOWN fences.
4. Use existing `authorizeModelSpending` and account/operation safeguards where applicable, with explicit account/model/feed IDs, validity and exposure/concurrency scope. `TRACK_ONLY` must not silently override the intended grant. Independently account for the evaluator's budget and any source-provider ledger; a model-only grant does not cover all services. If existing settings cannot demonstrably enforce the approved total, **stop** and obtain owner-approved provider-side isolation/limits rather than running an unbounded pilot or introducing another budget framework.
5. Check available provider credit and credentials using read-only metadata immediately before activation. Do not test a key by issuing unaccounted inference. No previous UNKNOWN operation may be resent, no old identity reused with changed inputs, and no hold cleared without a matching receipt.

The only measured cost anchor is the observed English staging generation sample: $0.0272168–$0.0426128 per edition, mean $0.0353692, excluding acquisition/review/evaluation/infrastructure. Nine editions at those observed generation costs would be approximately $0.245–$0.384; this is **not an all-in pilot quote or a maximum**. Agree the all-in cap after inspection of each existing service's reservation ceilings. Reaching the cap records an incomplete pilot, not permission to top up or omit failed cases.

## Freeze and rollback preparation

- Record UTC time, approved Git SHA, deployment version, production binding identities, migrations, effective engine/prompt/models, rollout flags, schedule/timezone and the approved spending scope.
- Preserve the current version `c1251f19-5b0e-4780-b97b-1ca5f740f6e4` and a D1 recovery point/export through the existing backup process. Verify it can be read. Preserve asset references, R2 object/version references, queue ownership and existing financial receipts; do not truncate anything.
- Record the baseline production account/feed counts. At qualification they were one enabled verified admin and zero feeds. Do not modify staging users/feeds or copy staging data into production.
- A previous version exists, but select a rollback target that is schema-compatible and does not reintroduce the vulnerable RSS path. Rolling Worker code back does **not** roll D1, R2, queue deliveries, provider charges or credentials back. For a security regression, disable the affected pilot source/feed through existing controls and prepare a fixed forward version rather than silently restoring vulnerable code.
- Use project-local Wrangler help for version/deployment/rollback commands, with the production config every time. A production-config `deploy --dry-run` already passed. Actual deployment/rollback requires the separate approval above.

## Three real feeds

Create through the actual UI/API as a normal verified user so onboarding, source enrollment and publication are exercised. The admin account existing in the database is not proof of normal signup/email verification.

| Feed | Language | Interests | Starting source policy |
|---|---|---|---|
| Lebanon News | Arabic | Concrete government, security, economic and public-service developments affecting Lebanon; preserve uncertainty and distinguish incidents. | Two or three existing qualified public news/official sources. Inspect current extraction and source identity; do not reuse a blocked paid-operation identity. |
| AI & Technology | English | Released models/products, substantive research results, policy or security developments; omit generic promotion. | Two or three current first-party/public RSS sources, qualified using existing connector diagnostics. The paused historical AI staging feed is not a source-health certificate. |
| Space missions | English | Specific launches, mission status, results, delays and corrections; omit unrelated technology news. | Two focused public/official sources with current, extractable evidence. Verify source URLs/content before enabling. |

Prefer public RSS/direct sources for this first smoke to avoid unnecessary paid-source exposure. Do not enable the optional browser container. Do not assume a previously working URL or a successful RSS fetch guarantees a complete article. Keep original publication times, observed times, completeness and source revisions.

Use the existing clock-aligned **30-minute schedule** in `Asia/Beirut` (with UTC recorded), allowing enrollment to finish before the first cutoff. Observe at least **three consecutive scheduled windows per feed**: nine due-window opportunities, including honest QUIET/failure outcomes. Do not count a manually generated edition as scheduled delivery. If one feed never has evidence for a particular behavior, record that behavior NOT VERIFIED instead of inventing news or a correction.

## Execution and expected observations

1. Register and verify the pilot user; log in/out and test the session after refresh. Check that password reset/verification links use the selected origin and cannot be reused. Redact tokens from evidence.
2. Create the three feeds with language, interests, timezone/schedule and sources. Confirm atomic saved configuration and the first actual scheduled time. Check empty-state and collection messages before any edition exists.
3. At each source cutoff, record collection-window coverage, observations, extraction results and frozen evidence IDs/hashes. Failed/partial sources must remain visible; missing evidence is not "no news". Do not fix a source mismatch by accepting unrelated fallback content.
4. Observe automatic preparation, verification and due-time publication. Record actual published output, its actual prior history and selected/dropped/omitted IDs/reasons. Verify claims against the original evidence, including places, names, quantities, dates and uncertainty. Retain all supporting citations rather than one arbitrary publisher.
5. Inspect both reader languages as rendered. Check an Arabic mobile view and English desktop view, links and retained evidence, absence of filler/repetition, useful development density, and whether publication happened on time. A successful HTTP response or evaluator pass alone is not editorial acceptance.
6. After one publication, add or disable one approved source using the UI. Confirm the next frozen input reflects the new authorized scope while old editions retain historical citations. Never accept a revoked source's new evidence merely to finish a window.
7. After a publication, switch one approved pilot feed to private. With a logged-out browser and another owner session, verify it disappears from Explore, its reader/search/edition/evidence/share routes deny access, and already cached public URLs cannot bypass the authoritative visibility check. Verify owner access still works. Restore public only if separately included in the pilot approval.
8. Observe unchanged reports, a genuine material update and an actual correction if available. Match exact occurrences and prior reader text; shared location/topic is not identity. Unchanged repeats should not create another edition story; later distinct incidents must remain eligible. If natural sources supply none, leave those live criteria NOT VERIFIED; existing controlled tests remain separate evidence.
9. Observe a quiet window if one occurs. Inspect its eligible sources and prior history to distinguish justified QUIET from collection failure, rejected generation or a missing relevant development. Do not manufacture QUIET by silently dropping failed work.
10. Use existing controlled interruption/duplicate/UNKNOWN fixtures for deliberate failure injection. Do not induce real provider uncertainty, terminate a paid production request or duplicate a paid submission. A live interruption drill, if required, needs its own narrowly specified approval; test recovery from a retained result without another provider charge.
11. Confirm evaluator discovery and monitoring progress, preserve findings and abstentions, inspect cost/holds and verify the approved alert route without sending an unapproved test notification. Pause the pilot after its planned windows so it cannot continue spending indefinitely.

## Per-window evidence record

Use an append-only private record and immutable source artifacts already supported by the product. Keep secrets, private feed payloads and account identifiers out of public reports.

| Field | Required record |
|---|---|
| Identity | Deployment/Git SHA; feed/window/request/edition IDs; effective V4 policies, models, language and feed revision. |
| Timing | Scheduled time, source cutoff, collection start/completion, generation stage times, publication time, delay, retries and recovery. |
| Evidence | Expected/finished/failed/blocked acquisition counts, completeness, immutable source hashes/IDs, source publication/observation times. |
| Editorial | Actual prior reader text; selected and omitted developments with source-derived reasons; claims/citations checked; material misses and their uncertainty; updates/corrections and occurrence identity; repeated/stale stories; word count. |
| Financial | Unique provider operation and generation IDs, reservation identities, calls/tokens, settled/reported cost, new UNKNOWN/conservative holds; acquisition/generation/evaluation split; infrastructure cost where measurable. |
| Delivery | Published/QUIET/rejected/failed result; duplicate suppression; owner and anonymous/private access; reader-visible source health and alerts. |
| Verdict | PASS/FAIL/NOT VERIFIED for this window, reviewer reasoning, unresolved evidence and remediation owner. Do not exclude failed or quiet windows from the denominator. |

## Stop and rollback conditions

Stop publication/activation of the affected pilot feed immediately through existing controls if there is a private-data exposure, unsupported material factual claim, wrong-place/number/date substitution, correction reversal, duplicate publication, unauthorized source use or a bypass of the approved financial scope. Preserve the output/evidence and all liabilities; do not edit history to hide the failure.

Pause and investigate if publication is over **five minutes** late without an explained source/operational state, if the same source remains unexplained blocked across two windows, if a source-supported important development is repeatedly missing, or if monitoring/evaluator discovery stops advancing. Five minutes is a proposed beta acceptance threshold, not a new runtime limit and not an excuse to suppress late evidence.

Roll Worker code back only to the preapproved compatible target after pausing new work and preserving in-flight result/operation identities. Recheck session/visibility, artifacts and queue recovery after rollback. Do not replay UNKNOWN work, drop queues, delete finance rows, restore a database blindly or roll secrets back. Owner-approved credential revocation takes precedence over code rollback.

## Exit decision

GO only for a limited, explicitly labeled beta after onboarding, source correctness, both languages, scheduled publication, access boundaries, cost enforcement and monitoring are demonstrated on production and all launch-critical security findings have dispositions. At least three due windows per feed must be accounted for; publication counts alone do not establish quality. Record updates/corrections/quiet behaviors not naturally observed as limitations and scope the beta accordingly, rather than claiming they were tested live.

NO-GO if a material factual/privacy/security/spending defect remains, the approved deployment or pilot cannot be safely executed, or production end-to-end evidence is still missing. Expand traffic gradually with the same monitoring and owner-approved spending policy; this pilot is not scientific proof of overall accuracy or production-scale capacity.
