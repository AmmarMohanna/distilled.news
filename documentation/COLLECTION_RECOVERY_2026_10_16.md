# Collection recovery branch — October 16, 2026

Base: `origin/integration/backend-sources-mixed-frontend` at `785c56b`.
New branch: `backend-sources-collection-recovery`.

## Observed staging failure

The AI Industry Watch3 feed retained BBC RSS batches that had fetched successfully,
VentureBeat rate-limit coverage, and X batches without intake receipts. RSS jobs
exhausted retries; X's former `BOUNDED_LIMIT` combined attempt and page limits.
Blocked X jobs had only zero to two pages. The feed also recorded many
`FEED_TURN_BUSY` outcomes. A new pending poll hid the previous blocked outcome.

These findings do not establish that every temporary error was contention or
that publisher rate limits can be bypassed.

## Changes

- `SourceHandoffWait` is local runtime admission, not a new shared handoff error
  code. RSS and provider schedulers defer the exact saved batch/run with backoff
  without consuming a failure attempt. Existing genuine failure counts remain;
  provider backpressure no longer resets them either. Captured data is replayed
  without another upstream/paid request.
- Durable FIFO waiters arbitrate canonical feed turns. Stable handoff/job/window
  identities keep their place across delivery retries; newly arriving acquisition
  or review cannot jump them. Other feeds remain independent. Abandoned waiters
  expire after five minutes; scheduled cleanup is bounded to 1,000 rows per pass.
  Renewable turn tokens and canonical CAS still fence execution and commits.
- Retry exhaustion preserves the most recent result and a typed underlying cause.
  Provider page exhaustion is now `PAGE_LIMIT`, separately from `RETRY_LIMIT`.
  There is no increase in provider retry/page limits or financial authorization.
- Source health reads the last actual outcome rather than treating scheduling as
  recovery. A new pending job or intake-capacity wait does not erase the previous
  blocked status. A later successful poll clears it. Only allowlisted error codes
  reach public messages; rate limits and processing waits have distinct wording.

## Rollout requirement

Apply connector-owned migration **0059_connector_feed_turn_waiters.sql before
deploying** this Worker version. For staging, from `apps/worker`:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config wrangler.staging.toml
```

First inspect the target configuration/account and pending migrations; the command
applies every pending migration, not only 0059. Deploy backend and rebuilt frontend
through the project's normal coordinated deployment procedure.

This task does not deploy to staging, reset old blocked jobs, alter checkpoints,
extend budgets, or reconcile uncertain payments. Existing blocked polls need an
operator-reviewed recovery of their saved identity after rollout; never bulk-zero
attempts or create a replacement paid call to make health green.

## Verification

Connector regressions: 120 passed, including more than eight consecutive intake
waits followed by success with one original fetch, and preserved rate-limit causes
after genuine exhaustion. Worker admission, source health, authorization and scale
regressions: 51 passed, including FIFO fairness, abandoned-waiter expiry,
replacement-token fencing, source-health reporting, 1,000-feed dispatch and
1,000-consumer anonymous fetch reuse. Worker, connectors and frontend
typechecks and the QA-configured Worker dry-run build passed during implementation.
No live spending was incurred to test this branch.

Frontend production build also passed. These are local deterministic regressions,
not a new live staging end-to-end run. Staging and its database remain unchanged.

## Sources QA deployment — 16 October 2026

Deployed commit `5c09f04` from `backend-sources-collection-recovery` to
`distilled-news-sources-qa` only. Applied migration 0059 to QA database
`d9c3d31c-25d3-4bc3-829d-1402bae58627` before the Worker deployment; verified
the waiter table and its ordering index exist.

Backend deployment version: `08457c55-d98b-4d9f-b39b-28b0f0aaf1d0`.
After activating the rebuilt frontend, the final active version is
`5eb1d43f-98be-43cb-bd73-8014ecc5715c` at 100% traffic, verified at
2026-10-16 11:06 UTC (14:06 Beirut).

Uploaded all 16 frontend assets and the manifest before activation, using prefix
`staging-assets/d3e5d3a367b907cbce7b079f7ebaf65e4dd8cb53/`.
The public QA homepage and its new JavaScript/CSS returned HTTP 200 with the
expected content types. Compared QA bindings before and after: only the frontend
asset prefix changed; existing secrets, settings and financial limits were
preserved. No staging resources were modified and no blocked provider jobs were
reset. These deployment smoke checks do not establish a new live end-to-end
collection-to-publication pass.
