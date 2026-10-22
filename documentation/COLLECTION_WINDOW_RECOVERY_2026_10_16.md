# Collection window and rate-limit recovery — 16 October 2026

Branch: `backend-sources-collection-recovery`. Target: existing **sources QA** only.

## Problem and change

The `codaya/ai-feed` noon request had finished acquisition and review (81/81 each),
but an X scan scheduled at 11:16 kept paginating without date bounds. Its request
had reached 30 historical pages during diagnosis. The public progress incorrectly
reported preparation even though collection still held publication.

Queue-mode X profile/search polls now freeze their start/end dates before dispatch.
The first interval starts at the source's first open briefing window, using its
approval time and the feed's actual calendar schedule. Later intervals start at
the last **complete**, finished registered interval. Failed, partial, unbounded,
and pending scans never advance this watermark. Page/retry identities may change;
the approved time interval cannot. New calls cannot copy another run's authority.
Current approval and configuration fences still apply on every boundary.

Both TwitterAPI.io advanced search and the Apify X fallback receive the frozen
time query. Second-resolution provider bounds overlap by at most one second;
existing item fingerprints deduplicate this overlap. Missing/out-of-range returned
dates fail closed rather than being silently trimmed. A repeated TwitterAPI.io
cursor is malformed. Provider exhaustion of a bounded search permits complete
coverage; capped Apify datasets retain partial coverage and do not advance the
watermark merely because the dataset ended.

Old unbounded X jobs drain their already saved snapshots and handoff slices under
their original identities, then stop with `UNBOUNDED_SCOPE_RETIRED`. They are not
relabeled complete. Runs started without a saved page stop with
`UNBOUNDED_RECOVERY_REQUIRED`, retaining artifacts and liabilities for explicit
reconciliation. Existing Apify actor continuations retain their recovery path.
No new historical page or paid fallback is opened by the retirement path.

VentureBeat's RSS endpoint repeatedly returned HTTP 429. Anonymous HTTP cooldowns
are now persisted per origin and shared across feeds. `Retry-After` seconds/dates
are honored in full; absent headers use exponential backoff from five minutes to
one hour. Local cooldown responses record zero network requests, retain source
authorization checks, and do not consume actual HTTP failure attempts. A successful
200/304 after expiry clears the cooldown. There is no IP/browser/provider workaround
for the origin's rate limit.

A durably acknowledged RSS rate-limit failure retains its scheduled retry and
failed coverage, but does not hold publication waiting for the origin to recover.
Unresolved handoffs and captured pages still block. This only releases collection
admission: downstream coverage, relevance, factual grounding, and model financial
authorization must still pass before an edition can publish.

Live verification also found that the old X scan's saved page was observed at
13:10 but still held the 12:00 request because its original poll began at 11:16.
Legacy unbounded X scans now stop blocking an older closed observation window
once durable coverage proves their current saved page belongs to a later window.
They retain their handoff and remain blocking for the appropriate newer window.
Absent that timestamp proof, the barrier remains in place. New bounded scans keep
their existing collection barrier. This matches the downstream observed-before
cutoff; it does not re-date source posts or treat later observations as old evidence.

`connector-briefing-priority.ts` gives a ready closed request its initial queue
turn before reassessment refills the single intelligence lane. It uses the existing
canonical enqueue identity, current acquisition/review window blocker check, and
the shared collection gate. It skips future/backed-off windows, missing model
configuration, and requests with an existing synthesis job. It does not reserve
model funds, reopen synthesis, or change canonical publication rules. This avoids
newer review arrivals monopolizing the lane after an older window is ready.

The public progress API and queue publication admission share one collection-gate
query. The frontend names blocking sources and can show completed review counts
while collection remains pending. It says preparation only after that gate clears.

## Merge and rollout requirements

- Apply additive migration `0061_connector_collection_windows.sql` before running
  the new queue-mode Worker. It adds window authorization and HTTP cooldown tables.
- Deploy the frontend together with the Worker; QA immutable asset prefix is
  `staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/`.
- Preserve secrets, source approvals, saved requests, ledgers, reservations,
  uncertain paid holds, and per-provider spending authorization. No reset or
  budget increase is part of this change.
- Changes stay outside `v1-intelligence/runtime.ts` and shared wire contracts.
- Staging and production are not deployment targets for this change.

## Verification

- Connector provider/RSS suites: **130/130 passed**, including captured-page
  retirement, actor recovery, date validation, retry accounting, and paid replay.
- Worker targeted checks cover 1,000-feed dispatch, shared fetch reuse, independent
  provider budgets, immutable enrollment, window freezing, collection admission,
  authorization, and source progress. This is not a full Worker suite claim.
- Frontend notice regressions: **14/14 passed**; frontend production build passed.
- Connector, Worker, and frontend typechecks passed; QA dry-run built.

Provider date-query references:
[TwitterAPI.io date search](https://twitterapi.io/blog/tweet-search-by-date),
[tested Apify actor input schema](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest/input-schema).

Live rollout results are recorded after deployment below.
