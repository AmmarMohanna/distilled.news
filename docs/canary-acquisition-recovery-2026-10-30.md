# Canary acquisition recovery

The 30 October QA ramp resumed 20 aged feeds with 100 sources. Reader APIs
remained available, but pending acquisitions rose from 5,463 to 5,799 while
245 additional acquisitions completed. A follow-up found 5,451 of 5,984 pending
jobs had source publication dates before feed creation and no source revision.
Two Space canary editions were published and independently read back.

## Initial acquisition backlog

V3 already excludes unchanged pre-subscription backlog from editorial admission.
The acquisition dispatcher now defers that same narrowly identified initial
discovery before scraping. It requires a known publication timestamp earlier
than feed creation, an unchanged first discovery, no source revision or
authoritative replacement, no existing evidence or saved acquisition result,
and no explicit recovery authorization. Correction/update markers in the title
remain runnable. Missing dates and changed discovery text remain runnable.

The job records `DEFERRED` and an `INITIAL_BACKLOG` policy decision. It is never
marked acquired or counted as a successful fetch. Inputs, payloads, receipts,
candidate IDs, job IDs, attempts, provider reservations and financial history
are retained. Completed and actively running jobs are not rewritten. New source
revisions and changed content acquire normally. Generic/non-V3 deployments do
not automatically run this backlog maintenance.

Migration 0082 adds an exact source/item/observation-time lookup index. Review is
bounded to 25 jobs per source and batches metadata reads. Retained exceptions
record that they were checked so they do not repeatedly occupy the review page.

Identical verified source discoveries also coalesce onto the existing unresolved
acquisition job. Every observation and receipt is retained; distinct publishers,
items, timestamps, revision labels, titles, URLs, completeness or content hashes
remain distinct. This is acquisition idempotency, not editorial deduplication.
It does not infer successful acquisition or alter canonical evidence ordering.

## Interrupted Apify reads

Maintenance can recover one blocked existing-run continuation per source using
the existing exact endpoint/hash reconciliation primitive. Only status/dataset
GETs for the saved run/cursor are read again. Actor starts are not repeated, and
reservations are not released. Failed recovery remains fenced and logged.
The complete response read now shares the same 60-second deadline as its request.

Unknown actor submissions still require provider evidence. They must not be
cleared because a request timed out or because a new collection window exists.

The first live follow-up found that nine legacy read continuations retained feed
revision 5 while current source scopes were at revision 12. Receipt-only recovery
therefore separately checks current owner/source identity and approval when the
normal frozen-poll authorization fails. It can read and retain the exact old GET
receipt, but cannot rewrite that poll's revision or resume its retired handoff.
Ordinary collection must still pass the current revision checks. Paused feeds,
changed source definitions, disabled owners and changed source identities remain
ineligible.

## Helper diagnostics

The admin-only `/api/admin/source-execution-status` route reads the fixed,
authenticated helper status endpoint through the configured private binding.
It exposes only bounded capacity/request-age metadata; source URLs, request
bodies, sessions, credentials and arbitrary upstream exception text are removed.
An unsupported status endpoint is reported as unavailable, not as idle capacity.

The saved VPS SSH key was rejected during investigation. Worker-side fixes and
service status cannot establish why a VPS process remains busy; process/log
inspection remains necessary if capacity errors persist after backlog removal.

## Validation

Focused regressions cover immutable inputs, retained charges, deferred-job
admission, repeated polling, changed content, missing dates, revisions,
corrections, existing evidence, saved results and explicit recoveries. Separate
read-recovery tests ensure one exact GET, no actor restart and no charge reset.
Live QA results are recorded separately from local tests. Publication and valid
JSON do not independently establish factual quality or 1,000-feed scalability.

Local validation passed 37 focused assertions across backlog/capability,
publication progress, window coverage, Apify read recovery and helper-status
sanitization. The existing 28 intake regressions also passed. Worker TypeScript
and the minified sources-QA dry-run build passed. QA migration 0082 was applied
and its exact index definition read back before deployment.

## First QA follow-up

Code commit `79d79492` was deployed at 100% as worker version
`5340f4fb-eea0-4fab-b7dc-5fe4412f3611`. All resource bindings were compared with
the previous live settings and preserved. The only scope change enabled the
existing fresh-X policy for the 20 active canaries alongside the four Aya feeds.
Unauthenticated helper-status access returned 401.

Between the first two post-deployment snapshots, deferred initial acquisitions
rose from 164 to 986, while pending acquisitions fell from 7,144 to 6,351 and
completed acquisitions rose from 6,198 to 6,244. Ten of eleven old canary X holds
had received charge-preserving no-replay acknowledgements by the latter snapshot.
These are sampled recovery measurements, not final totals or steady-state rates.

The authenticated helper status request returned upstream HTTP 404. This cannot
establish its internal capacity state; VPS access is still needed to distinguish
a missing status endpoint/proxy route from the actual execution-service load.

## Restored VPS access and subsequent QA checks

SSH access was restored on October 30. QA's deployed server file predated the
authenticated status endpoint; its Python wrapper already enforced a 60-second
execution timeout. After six local server regressions passed, the diagnostic
server file was installed during a sampled idle gap. The environment file hash
and Joud helper PID were preserved; QA concurrency remains two. Status now
returns authenticated capacity data through the Worker. Sampled Google resolution
requests completed within the observation period; these samples do not establish
that every historical capacity error was caused by normal load.

Commit `819d0373` was deployed at 100% as version
`44b2f2cb-0442-4be9-8dba-d1708eb664b6`, with resource bindings preserved.
By 19:27 UTC, six of nine legacy Apify reads had retained responses, and all
eleven original X holds had acknowledgements. Four uncertain Apify actor starts
and 21 uncertain Zyte operations remained fenced. Fresh uncertainty can still
occur; this is not a claim that every paid request has been reconciled.

The remaining three legacy reads exposed a selection defect: an already
reconciled, retired-revision poll remained the first eligible candidate. Recovery
now marks that poll `BLOCKED / RETAINED_READ_RECONCILED` only after no unresolved
start/status/dataset operation belonging to its exact run remains. Its frozen
request and all financial records remain unchanged, while later interrupted
reads can advance. A two-poll regression covers this starvation case.

At 19:27 UTC, acquisition totals were 3,738 deferred initial-backlog jobs,
8,600 completed, 275 failed, 4,789 pending and 18 running. These are moving
counts under continued collection, not a drained backlog. All 20 reader checks
returned HTTP 200 (sample p50 2.143 s, p95 4.664 s). Durable publication records
and readers independently showed 25 editions across 11 feeds; one edition
predated the resumed test, so these are not 25 newly generated editions.

The model authorization remains $24.3822355 total exposure, expiring November 1.
The 19:23 UTC snapshot reported $18.8980212 paid and $0.08201 held, leaving
approximately $5.40. No additional spending allowance was added in this follow-up.
