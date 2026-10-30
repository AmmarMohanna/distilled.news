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
