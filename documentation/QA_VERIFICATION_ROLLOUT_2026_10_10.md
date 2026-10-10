# Isolated sources QA verification — October 10, 2026

The merged frontend/Worker and private VPS helpers have been rolled out to
<https://distilled-news-sources-qa.distillednews-platform.workers.dev> in the user's
new Cloudflare account. Production, shared staging, the friend's checkout and remote
Git branches were not changed. Email was initially deferred. In the later mailbox
setup follow-up, Outlook authorization and QA deployment completed: a real signup
returned HTTP 200 after Graph accepted its verification message. Inbox delivery,
verification-link completion and password reset still require recipient checks.
See `OUTLOOK_QA_EMAIL_SETUP.md` for the current status.

## Changes and deployment

- Merged `backend-sources-fixes` through `0ef458b` into `codex/source-execution-backend`.
- Corrected R2 retention recovery, grounded RSS support checks, frontend public-feed
  behavior and CI/browser checks in the preceding fixes commit `234952b`.
- Froze daily Telegram edit-recheck identities and existing provider-window order.
  Funding changes cannot rewrite an existing window or introduce another paid identity.
  Retries and continuations are checked against the immutable initial hash, rather than
  against their legitimately changing request. Final correction: `0fa2d98`.
- Added bounded, authorized QA probes and read-only metrics/QA asset-upload scripts.
- Added opt-in Google RSS transient-fetch recovery through the private VPS and bounded
  modern Google publisher-link resolution. Listing evidence retains its original
  representation/completeness; it is not treated as fetched publisher article text.
- Uploaded the merged frontend to the QA raw bucket under
  `staging-assets/069e475ed9c0f3cc911c8b4f128cc3aa8866bc3a/`. Fifteen static files matched
  local hashes; the generated manifest also passed its public route checks.
- Updated all three VPS helper files together. Runtime, VPC tunnel and egress firewall
  were active. Reserved/private address probes were blocked, public HTTPS succeeded.
  Rollback copies were retained on the VPS. No Telegram session was deleted or logged out.
- QA D1 reported no pending migrations, including the previously applied mail-token
  migration. This follow-up added no shared schema/contract migration.

Final paused deployment: **`1358acf8-e260-48c0-85ea-119f4d6c68c1`**, backend code
`0fa2d98`. Remote checks confirmed zero enabled sources, zero enabled intake scopes,
and all five provider budget limits at zero. The checked-in config has `crons = []`.
Historical reservations were retained. Thirteen pending provider jobs remain stored
behind disabled authorization; they were not rewritten into new paid identities.
All three remote helper hashes matched local files and all three services were active
at the final check. The final paused frontend/browser and asset checks passed again.

The subsequent Outlook setup replaced that deployment with
`4a756988-c66c-47c2-bec9-896918628c2d`; source authorization and budget checks still
showed zero enabled sources and zero paid limits. Authorization reliability changes
are local setup-script changes (`4423684`), not a change to connector Worker logic.

## Local verification

- Complete serial Worker suite on corrected code `0fa2d98`: **883 passed, 10 skipped,
  zero failures**; 138 files passed, two skipped (1,417 seconds). Command:
  `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1`.
  The source code was held unchanged throughout this final run.
- Connector package: **184 passed**.
- Private Python runtime: **7 passed**; Node helper tests: **6 passed**.
- Follow-up Outlook setup retry tests: **3 passed**; setup-script syntax check passed.
- Workspace typecheck passed; Worker typecheck passed again after the immutable-hash
  correction. Frontend build and isolated QA Worker dry-run built successfully.
- Focused immutable-window regressions: **4 passed**, including funding races,
  retries/continuations and the daily Telegram range. The complete corrected
  connector-runtime file also passed **19/19** in the final serial run.

## Live results and limits

| Case | Observed result | What remains unproven |
|---|---|---|
| Telegram | Authorized channel resolution, recent-message collection, preserved session after helper restart; intentionally missing session returned `AUTH_REQUIRED`, real session then read successfully | Revoked-session recovery, controlled edits and deletions. User has no controlled test channel. The current polling transport does **not** emit authoritative deletion events; missing message reads are deliberately not tombstones. |
| LinkedIn | Two intended actor starts; first collected 20 observations/19 proposals, second suppressed unchanged valid posts and quarantined one malformed record; continuation/replay created no duplicate actor starts | Comprehensive incremental recall, especially a newly published controlled post. One unchanged dataset is insufficient proof. |
| Google News | Worker transient RSS failures recovered through the private VPS. One real snapshot handed off 30 observations/30 proposals; two Google links became durable publisher URLs, retaining `LISTING_RESULT` / `UNKNOWN` | All-link resolution, publisher article acquisition and exhaustive recall. The RPC protocol is best effort and undocumented. |
| Blocked website | JPL news returned `CHALLENGE` through HTTP and Playwright; the normal scheduled HTTP → Playwright → Zyte chain reached `DONE`/`HANDED_OFF` through Zyte | General reliability across all blocked sites. This is one genuine blocked-page case. |
| Paid-response recovery | A completed Books/Zyte client response was discarded before consuming its body. Replaying the same request returned the saved handoff and added zero paid operations/reservations | Loss of an external provider response before durable outcome storage. That uncertain submission case remains local/reconciliation coverage, not a live proof. |
| Public frontend | Root and existing BBC public feed loaded in a real browser, both HTTP 200, zero JavaScript errors; public feed API returned 200. Existing editions had seven support spans and zero unsupported spans | Fresh signup → feed approval → collection → new published edition. Outlook submission now succeeds, but inbox/link confirmation remains required; no verification bypass was introduced. |

The JPL automatic-fallback job was
`d1a2585bdb5e96ace3dd9dc939809454605dac5480cfec8130af6f0d1cdfe05b`.
Its saved result records HTTP and Playwright challenges followed by Zyte success.

## Spend fencing

The user authorized **$10 per source**. Temporary limits were substantially smaller:
LinkedIn aggregate $1.00 with $0.25 actor-start ceilings, Zyte aggregate $0.15 with
$0.03 operation ceilings. X and Google Apify remained unfunded. Historical reservations
were included in those aggregate limits.

LinkedIn reservations rose from $0.250004 to $0.750012; Zyte from $0.03 to $0.12.
**New reserved ceilings: $0.590008**, consisting of two LinkedIn starts plus status/dataset
operations and three Zyte operations. Existing X reservations were unchanged. These
are conservative reservation ceilings, not verified provider invoices. A sampled Apify
actor status reported $0.04005 usage; that single report is not a total-billing claim.

## Short operation study

Six manual ticks over 11:08:31–11:20:42 UTC covered five enabled feeds (eight fixtures
total). HTTP tick durations were 35.5–152.3 seconds. D1 grew **901,120 bytes**; Telegram
added three receipts (1,503 JSON bytes, three distinct keys), other feed receipt counts
were unchanged, candidates increased by two and editions by zero. D1 growth therefore
cannot be attributed solely to receipt content; scheduler/other state also grew.

The study encountered the mutable-request scheduling guard bug, which was fixed and
deployed afterward. HTTP 200 from maintenance is **not** proof that every source
finished: connector failures can be logged internally, and historical blocked/pending
jobs remain. This window is diagnostic evidence, not a clean long-running benchmark.

After deploying the immutable-hash correction, two more manual ticks over
11:26:11–11:28:56 UTC returned HTTP 200 in 34.7 and 126.5 seconds. D1 grew another
290,816 bytes; Telegram added one receipt, RSS completed jobs increased from 34 to 35,
and provider pending jobs increased from 12 to 14 with completed jobs unchanged at 35.
This confirms continued activity, but the growing pending count does not establish
steady-state capacity or healthy drainage.

The final paused audit classified the seven blocked provider jobs as six
`BUDGET_EXCEEDED` and one `BOUNDED_LIMIT`; these are retained historical/test records,
not evidence that the final sources are enabled. There were also 35 retained blocked
RSS jobs. Diagnose individual histories before reenrolling sources; do not hide them
or infer health from maintenance HTTP status alone.

A real Google collection took **137.8 seconds**, exceeding the scheduler's default
120-second provider-job lease. Before regular concurrent polling, size leases against
bounded provider work (or renew them), verify expiry/concurrency recovery, and measure
backlog drainage. The current one-job-per-tick rate and accumulated pending jobs also
need a sustained multi-feed capacity check. Do not extrapolate this short window into
monthly spend, storage requirements or uptime guarantees.

## Remaining rollout gates

### Subsequent X verification

The October 10 X follow-up verified live NASA profile and `from:NASA lang:en`
query collection through both TwitterAPI.io and Apify. The primary provider produced
40 observations for each scope. Apify produced 20 profile observations and returned
20 raw query records, all matching already accepted primary query posts; unchanged
duplicates correctly produced no new query observations. Audited query replays added
no paid operations or reservations. Added reserved ceilings were $0.800008, below
the authorized $10 per source. These later reservations supersede the earlier study's
statement that X reservations were unchanged; the earlier study itself remains accurate.
See `X_QA_VERIFICATION_2026_10_10.md` for scope, test counts and limitations.
Final deployment `42f17a4b-d7cb-4e38-968a-fa67974b667b` contains the X probe changes
and preserves Outlook configuration. Remote audits after maintenance confirmed zero
enabled sources/scopes and all five paid-provider limits at zero; cron remains disabled.

### Outstanding gates

1. Confirm receipt of the submitted Outlook verification message, complete its link
   and test password reset, then run a fresh frontend signup-to-new-edition test with
   the friend. Outlook sender authorization and QA deployment are now complete.
2. Provide a controlled Telegram channel for edit tests; implement and verify an
   authoritative deletion-event transport before claiming live deletion coverage.
3. Run a controlled LinkedIn new-post incremental test and provider pre-storage
   uncertain-response reconciliation test without automatic duplicate resubmission.
4. Resolve provider lease/capacity sizing and repeat a sustained multi-feed study,
   including receipt retention, backlog age, latency and provider-reported spend.
5. Review the evidence before enabling cron or promoting these flags to production.

Raw response payloads, credentials and session material are not included in this report.
Ignored `.review-tmp` logs contain bounded local diagnostic evidence and are not pushed.
