# Public article fallback workflow

The full-article acquisition path for approved RSS, Google News and website
sources now attempts direct HTTP (including its anonymous Python HTTP helper),
then anonymous Playwright, then funded Zyte HTTP extraction. Platform-specific
Telegram/X/LinkedIn collection is unchanged.

The rendering chain is separate from the optional AI browser workflow flag.
It uses the existing source-execution binding and Zyte credentials, operation
ceilings, deployment/source/daily budgets, payload storage and durable provider
ledger. No new secrets, migrations, model calls or budget expansions are required.

Only recoverable network/extraction failures and ordinary anonymous HTTP
rejections enter the chain. Authentication, explicit challenges, policy denials,
rate limits, missing/deleted articles, body limits and source revocation stop it.
Helper capacity waits retain their existing backpressure behavior. Uncertain paid
submissions become explicit terminal acquisition failures; their durable ledger
fence remains available for operator reconciliation. The paid operation identity
is derived from the acquisition job and exact URL, never its retry attempt.

Each successful fallback must retain the exact requested/resolved article identity,
readable article text and publisher date metadata. It cannot promote listings,
another story or authenticated content. Completeness remains UNKNOWN. Local HTML
extraction after Playwright/Zyte does not depend on the failing Python extractor.
The full-article job has a bounded 180-second lease to cover the additional stages;
ordinary claim callers retain their existing 90-second default.

## Validation

- 62 acquisition tests and 14 fallback adapter tests passed (the first combined
  run included 12 adapter tests; the final adapter run includes two added guards).
- 7 product runtime and 4 shared source-backend regressions passed.
- 2 existing paid-ledger tests passed, including concurrent budget reservation
  and durable replay after restart.
- 30 Python helper tests passed, including the new exact-candidate navigation test.
- Worker TypeScript passed. Preservation checks passed for 56 frontend and 33
  protected backend/configuration files.
- No live paid evaluation was run during implementation. The bounded QA recovery
  performed after rollout is recorded below.

## Rollout dependency

Update `scripts/source-execution.py` on the private execution host before rolling
out the Worker. The updated Playwright adapter reports final URL/authentication
evidence and blocks another top-level URL when `exactCandidateOnly` is requested.
The Worker refuses to promote older helper browser responses without final URL
evidence. Preserve the host's existing secrets, sandbox and public-egress firewall.

## QA rollout, October 23, 2026

The VPS helper was still running an older protocol that rejected `public_article`
in both JavaScript operation allowlists. Its rejection was collapsed by the Worker
adapter into `HELPER_TRANSPORT_FAILURE`. This establishes a concrete cause of the
observed helper failures; it was not proof of Guardian blocking access.

Updated the three QA helper code files after saving a backup and passing 30 Python
and 5 Node server tests on the VPS. An authenticated extraction smoke check passed.
The environment file, Python environment, Telegram sessions and Joud's separate
collector were retained; Joud's helper code hashes were verified unchanged.

All three remaining Guardian URLs returned HTTP 200 and readable extracted text
through `public_article` (2,839 / 2,254 / 4,199 characters). A real Playwright fetch
also returned HTTP 200, HTML and the exact requested Guardian URL. These helper
checks made no Zyte requests.

QA Worker version `7b69dac4-fa51-4de2-afcb-72673a5c2a45` serves 100%. Deployment
verification confirmed matching frontend assets, unchanged live bindings/variables,
and HTTP 200 session/explore API responses. Production was not changed.

The three prior `HELPER_TRANSPORT_FAILURE` jobs were each admitted for one extra
acquisition attempt, with pre-change records saved and prior probe metadata
preserved. All three completed through `private_public_http`, retaining the exact
article URLs and 2,839 / 2,254 / 4,199 characters with completeness UNKNOWN.
All 16 jobs in the original Guardian recovery batch are now DONE. The successful
queue probes did not need Playwright or Zyte; live Playwright was checked separately
and Zyte behavior was verified with local mocked requests and durable-ledger tests.
No reporting windows, original publication dates or briefing schedules were changed.

The user explicitly authorized a temporary root SSH key for this rollout. Its exact
entry was removed from the VPS after verification, preserving other authorized
keys, and both temporary key files were deleted from the local machine.
