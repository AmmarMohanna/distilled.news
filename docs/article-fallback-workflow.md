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
- No live paid evaluation was run and no exhausted QA article jobs were reset.

## Rollout dependency

Update `scripts/source-execution.py` on the private execution host before rolling
out the Worker. The updated Playwright adapter reports final URL/authentication
evidence and blocks another top-level URL when `exactCandidateOnly` is requested.
The Worker refuses to promote older helper browser responses without final URL
evidence. Preserve the host's existing secrets, sandbox and public-egress firewall.

The changes are implemented locally. QA deployment is pending the private helper
host/deployment access; no SSH host configuration is present in this workspace's
execution environment. This is not a claim that the remaining Guardian articles
have now been fetched through Playwright or Zyte.
