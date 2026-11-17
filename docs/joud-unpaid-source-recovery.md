# Joud public-source recovery, 28 October 2026

Deployed Worker: `distilled-news-joud`, version `6aa31bfe-6e09-40f6-9a5c-c25b93f3db34`.
Branch: `joud/aya-integration-fixes`, based on `aya-joud-frontend-integration`.

## Changes

CBS's homepage wraps its news grid in `has-sidebar`. Discovery incorrectly
classified this layout modifier as navigation and excluded the entire grid.
Layout modifiers no longer exclude descendant article cards; actual sidebar,
header, footer and navigation containers remain excluded.

Secret-authenticated maintenance actions now support bounded public-only recovery:

- `POST /api/internal/collectors/recover-article-unpaid`: `{feedId,jobId,approvalId}`.
  Uses existing recovery eligibility and source approval checks, grants one extra
  cumulative attempt, retains previous failure history, and persists free-only
  capability restrictions on the existing job. Idempotent approval replay does
  not grant another attempt. Unknown paid outcomes are refused.
- `POST /api/internal/collectors/recover-poll-unpaid`: additionally requires
  `kind` (`rss` or `provider`). Only RSS/website polls are admitted. A durable,
  scoped marker removes provider credentials, funded ceilings and remote
  execution from this poll and its continuations. Newly admitted acquisition
  jobs inherit the restriction. Deployment-wide budget records are unchanged.
  Existing immutable provider snapshots and failed attempts remain immutable;
  recovering a poll does not force a new fetch of a recorded failed snapshot.

Both actions require the existing `x-distilled-internal` maintenance credential.
They are not public user-facing recovery controls. Poll capability markers are
retained beyond routine delivery-error cleanup so old deliveries cannot regain
paid authority. No migrations, frontend assets, account authorization or
resource bindings changed.

## Live results

Anonymous public HTTP previews selected 29 eligible old jobs with readable,
exact-page text. All 29 subsequently reached `DONE` with attempts increasing
from 1 to 2, using the same job and observation identities:

| Source | Recovered jobs |
| --- | ---: |
| Al Jazeera | 10 |
| Arab News | 3 |
| CBS | 1 |
| Aawsat English | 10 |
| Naharnet | 5 |

CBS's recovered `/live/` evidence is its own 121-character resource description,
not an invented transcript. Video descriptions retain their resource identity
and conservative completeness; they are not evidence of full video coverage.
The repaired CBS homepage poll separately produced a real `website_http`
`HANDED_OFF` result with 30 observations and reported provider cost $0. It was
still pending continuation when inspected; this does not prove every linked
article was acquired or a briefing published.

Three initial maintenance requests returned HTTP 500 after durable authorization.
Same-approval replay confirmed all three ultimately `DONE`; no additional attempt
was granted. Raw private diagnostics are ignored under `.local-reports/live-check`.
No retained article bodies or credentials are committed.

Remaining exclusions: unresolved paid submissions, authentication/paywalls,
unproven canonical mismatches, genuine listing pages and liveblogs whose body
cannot be extracted safely. Historical failures are preserved rather than
hidden. The inspected feed still had two briefing requests blocked by
`ACCOUNT_AUTHORIZATION_REQUIRED`, plus coverage/reassessment waits. No model
spending grant was added and end-to-end publication has not been validated.

A final read-only Wrangler query failed with Cloudflare account authorization
error 7403; the earlier durable snapshots and authenticated Worker replay are
the evidence for the results above.

## Reproduction

`scripts/recover-public-source-jobs.mjs` defaults to dry-run. Supply `--manifest`
and `--origin`. Execution additionally requires `--execute`, `--env-file` (an
ignored local file containing `INTERNAL_MAINTENANCE_SECRET`) and `--output`.
The manifest is `{feedId,items:[{jobId,approvalId,title?,kind?}]}`, bounded to 50
jobs per invocation. Omit `kind` for article recovery. Never put secret values
in command arguments. Preview exact URLs first and reuse approval IDs on retry.

Validation: 109 Worker acquisition/runtime/reconciliation tests, 32 connector
discovery/primary-content/resource-description tests, Worker typecheck,
connector build/typecheck and Wrangler deployment dry-run passed. Two old
acquisition assertions were aligned with the merged parser's conservative
`UNKNOWN` completeness: a weaker recheck must retain complete canonical evidence,
and readable WordPress text alone does not prove completeness. Existing checks
still assert qualifier retention and prohibit weaker evidence replacement.
