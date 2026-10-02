# X login compatibility regressions

## Authentication state machine

`LOGIN_ENTRY → IDENTIFIER_INPUT → IDENTIFIER_SUBMITTED → ordinary credential
confirmation when supported → USE_PASSWORD (when offered) → PASSWORD_FIELD_VISIBLE
→ PASSWORD_SECRET_INJECTED → PASSWORD_SUBMITTED → CHALLENGE_OR_AUTHENTICATED
→ SESSION_PERSISTED → FRESH_RESTORE_VERIFIED`.

Transitions are runtime controlled, with fresh trusted observations after actions.
Identifier submission and password-alternative selection occur once per bounded
bootstrap, followed by observation rather than repeated clicks. A password must
belong to one visible, enabled authentication form with an approved accessible
label. An unknown password-like input on an identifier surface is insufficient.
Ordinary username confirmation is not an owner-only factor; the present encrypted
credential schema contains one identifier, so a different required username must
not be guessed from an email address. Full confirmation handling remains a gap.

## Reproduced defects and controls

| Fixture | Root cause | Fix | Evidence / residual risk |
| --- | --- | --- | --- |
| SPA `div role=button` password alternative | Trusted inventory enumerated native tags only, excluding valid accessible actions | Include explicit button/link roles using CDP accessibility names and existing visibility, handle, origin and action fences | Fixture failed before fix and passes afterward; this is not yet proven to cause the live X stall |
| Restored session expires before automatic login | Persisting expiry increments profile version, but subsequent authentication lineage retained the old version | Validate current authority, persist expiry, carry only that runtime-owned version transition into the existing capability | Regression failed before fix; same tenant, owner, run, generation, origins and expiry retained; caller capability unchanged |
| Ordinary labeled password input | Suspected Playwright implicit-role incompatibility | No locator change: installed Playwright successfully injects it | Real Chromium fixture verifies secret-free observations and stale-handle rejection |

The SPA fixture runs the X adapter against synthetic identifier → verification
with password alternative → delayed password → authenticated account navigation.
It captures synthetic session state, destroys the login browser, and verifies
restore in two separately allocated browser processes. It uses no live credentials,
model calls or solver. Encrypted persistence and canonical candidate/evidence
pipeline behavior are covered separately; this fixture does not establish live X
authentication or AJEnglish acquisition.

## Executor capabilities

`BrowserExecutorPort.getCapabilities()` exposes authenticated profiles, session
capture/reuse, secret injection, service workers, CAPTCHA detection/solving,
challenge handling, proxy routing, stealth compatibility and fresh restore.
Unknown third-party capabilities are conservatively false. The current bridge
does not advertise a solver, proxy or stealth mode merely because a provider might
offer one. The Cloudflare browser advertises service-worker support only when its
independent provider egress fence and ordinary authentication features are enabled.
Persistent sessions means capture and restore through the encrypted profile path,
not an unencrypted browser profile directory.

Supported challenge solving is permitted when separately authorized/configured.
The current default provider detects and reobserves challenges; it does not solve
CAPTCHAs. Provider success is independently reobserved, with false-success,
deadlines, cancellation and budget exhaustion covered by coordinator tests.
Authorization, tenant/account isolation, SSRF protections and external read-only
authority remain independent of challenge capability.

## Production proof requirements

A live success requires encrypted persistence, destruction of the login browser,
independently authenticated fresh restore, real AJEnglish status URLs/IDs/timestamps
through CandidateProposal → Candidate Intake → CandidateItem → AcquiredContent
→ NormalizedEvidenceItem, followed by a second fresh acquisition with session
reuse. Synthetic success must never be reported as this production proof.

Do not repeat unchanged executors after cooldown alone. Each live retry requires a
concrete tested compatibility change or an authorized materially different route,
at most one bounded request, and a preceding safe profile/cooldown check. Browserless
remains ineligible without legitimate provider authorization. Never put X secrets
in Worker vars, source, model context, traces, screenshots, logs or public responses.

## Deployment handoff (2026-10-02)

Source fixes are committed and pushed as `96ecb38` (SPA controls/capabilities)
and `5dacef8` (expired-session recovery), on
`codex/v15-canonical-pipeline-reconciliation`, from base `88e9891`. Automatic
approval review initially failed because usage limits prevented review; it later
became available. Worker revision `2dd5647b-7258-4002-b0f3-1cbdfbd96e1d` deploys
the changed Cloudflare Browser fallback. The pinned Container image remains
`sha256:5a3895193ad31bd03f4b92dda73391c4ca457c38e74c7257a406eba44e4161fa`.
No migrations are required.

Focused tests passed for the SPA control fixtures, delayed password transition,
two fresh synthetic restores, authentication/profile security, expiry recovery,
concurrent revocation, challenge false-success/budgets, trusted observation API
guard, browser security/redirect handling and bridge secret leakage. Agent runtime,
Worker and browser bridge TypeScript checks passed. The dedicated redirect-hop suite also passed all eight cases, including admitted
child frames and foreign redirects from out-of-process frames.

In an environment with working approval review and authorized Cloudflare access:

1. Check out the pushed source commits `96ecb38` and `5dacef8` on the existing
   branch. Inspect `git status` and `git diff` before any new commit. Do not merge
   or stage generated directories. The deployed attempt below already used the
   changed Worker; do not repeat it unchanged.
2. Run the focused suites from `packages/agent-runtime`:
   `vitest run test/authentication-control-compatibility.test.ts
   test/authenticated-profile.test.ts test/challenge-coordinator.test.ts
   test/trusted-browser-api-guard.test.ts test/redirect-hops.integration.test.ts`.
   From `packages/browser-bridge`, run
   `vitest run test/bridge.secret-leak.test.ts`. Use the installed workspace bins.
3. From the root, run `tsc --noEmit -p` separately for
   `packages/agent-runtime/tsconfig.json`, `apps/worker/tsconfig.json`, and
   `packages/browser-bridge/tsconfig.json`.
4. From `apps/worker`, deploy with the installed `wrangler deploy`. The Worker
   bundle applies the semantic-control fix to the Cloudflare Browser fallback.
   The existing Container image stays unchanged unless rebuilt and pushed with
   `apps/worker/browser-container.Dockerfile`; record its actual digest when done.
5. Before submitting anything, query only profile version/state/session presence
   and latest `identifier_submitted` timestamp. Require at least one hour since
   that timestamp and ensure no other bootstrap is in progress. Do not repeat a
   prior request. Coordinate with the existing follow-up automation.
6. From the repository root, run exactly once:
   `corepack pnpm bootstrap:x --profile authenticated_profile_69c92a0d95b37746da1e7fb12dbcb84f`.
   This queues a one-attempt request from the encrypted profile; it never asks
   for credentials. Record the emitted opaque request ID and poll only its state,
   failure code and approved safe audit fields. Do not log full raw audit/page data.
7. If unsuccessful, record the last transition and whether `password_submitted`
   occurred. Preserve cooldown and stop unchanged retries. If successful, require
   the fresh restore and two canonical AJEnglish acquisitions described above;
   an ACTIVE bootstrap response alone is not completion.

No new provider/solver resources were provisioned. Tests used local synthetic
browsers and no acquisition model calls. Provider and historical production costs
were not measured. A single bounded production retry follows the deployed change;
its actual outcome is recorded separately below. The live identifier/Use-password stall remains unexplained until the
tested change is deployed and observed. No owner-only factor has been established.

## Bounded production result

Request `authenticated_bootstrap_request_ada8a2a4ce104366ac4d3e528225c2e4`
completed at 2026-10-02 17:42:32.816 UTC with `AUTH_SURFACE_TIMEOUT`, attempt
count 1. The preceding safe check found profile version 8, no session, no
overlapping pending/queued/running bootstrap, and last identifier submission
2026-10-02 10:29:04.809 UTC.

Chrome Container returned `INITIAL_NAVIGATION_FAILED`. The changed Cloudflare
Browser fallback injected/submitted the identifier at 17:42:21.331 UTC but stayed
on `IDENTIFIER_ENTRY` for the bounded observation window. Its expanded control
inventory was active (button count category `many`), but `Use password` was not
present. An unknown-labeled password-like input did not satisfy the password
injection guard. No password was injected or submitted.

Safe network diagnostics remained document HTTP 200, one auth API response HTTP
200, no parsed task category, zero auth API failures/4xx/5xx, zero page errors and
zero denied X scripts. These values do not establish a successful login or explain
why identifier submission produced no usable password transition. The reproduced
SPA control omission is fixed; it was not sufficient to resolve this live failure.

Profile remains version 8 `REAUTH_REQUIRED`, no encrypted session reference and
no validation timestamp. Live fresh restore, AJEnglish acquisition, canonical
pipeline persistence and second autonomous acquisition were not executed because
no authenticated session exists. No owner-only factor or credential rejection
was observed. No CAPTCHA was presented in this attempt. No solver/model was
called. Provider browser usage charges were not measured.

Do not retry before 18:42:21.331 UTC, and do not retry after that time solely
because cooldown expired. Another concrete tested submission/transition fix or
legitimately authorized different durable executor is required. The unresolved
state is automated login-flow/executor compatibility failure, not human-login
requirement.
