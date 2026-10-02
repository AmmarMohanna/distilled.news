# Autonomous X acquisition handoff

Updated 2026-10-02. Continue on `codex/v15-canonical-pipeline-reconciliation`.

## Objective

Use the existing encrypted X credential profile to authenticate autonomously,
persist encrypted session state, verify restoration in a fresh browser, acquire
real AJEnglish posts through the canonical pipeline, and prove a second fresh
acquisition using session reuse. Require the owner only for an actual unavailable
OTP/MFA/security approval. Ordinary login UI failures are executor compatibility
failures.

## Verified production state

- Worker: `2dd5647b-7258-4002-b0f3-1cbdfbd96e1d`.
- Container image: `sha256:5a3895193ad31bd03f4b92dda73391c4ca457c38e74c7257a406eba44e4161fa`.
- Profile: `authenticated_profile_69c92a0d95b37746da1e7fb12dbcb84f`, version 8,
  `REAUTH_REQUIRED`, no saved session, no successful restore verification.
- The stored password has never been submitted. No credential rejection or
  owner-only factor has been observed.
- Latest bounded attempt:
  `authenticated_bootstrap_request_ada8a2a4ce104366ac4d3e528225c2e4`,
  2026-10-02 17:42 UTC.
- Chrome Container failed initial X navigation. Cloudflare Browser submitted the
  identifier, stayed on `IDENTIFIER_ENTRY`, and failed `AUTH_SURFACE_TIMEOUT`.
- Safe Cloudflare Browser diagnostics: document HTTP 200, one auth API response
  HTTP 200, zero auth API failures/4xx/5xx, zero page errors, two optional script
  denials, and `scriptDeniedX=0`.

## Implemented and tested

- Optional Browserless CDP executor behind the existing browser abstraction.
  It remains inactive without an authorized endpoint and provider token.
- Google Chrome Container executor for X, with bounded Cloudflare Browser
  fallback.
- Ordinary authentication page features; service workers admitted only in the
  independently domain-fenced Cloudflare Browser executor.
- Same-page child frame requests admitted while origin, method, redirect, and
  popup fences remain enforced.
- Bounded ten-second identifier transition wait and safe auth API diagnostics.
- Production bootstrap trigger enforces a one-hour identifier submission
  cooldown and duplicate delivery protection.
- Synthetic Chrome credential login and fresh session restoration pass.
  Authentication, Worker trigger/fallback, and redirect fence tests pass.
  These tests do not prove real X authentication.

## Latest tested compatibility changes

- `96ecb38` adds browser-owned discovery of SPA button/link roles and explicit
  conservative executor capability reporting.
- `5dacef8` fixes stale capability/profile versions after runtime-owned expiry
  transitions, preserving account/tenant/revocation authority.
- Synthetic SPA identifier to Use password to delayed password to login passed,
  with two fresh browser restores. Secret-leak, challenge, authentication,
  revocation and dedicated redirect/iframe tests passed; all three typechecks passed.
- Worker was deployed; Container image was unchanged. One bounded live attempt
  still failed before password submission. The role-control fix is therefore
  insufficient to resolve the remaining production transition failure.
- See `docs/x-login-compatibility-regressions.md` for regression evidence, safe
  production result, deployment handoff and known gaps.

## Next work

Do not repeat credential attempts on the unchanged routes merely because the
cooldown elapsed. The latest identifier submission was 2026-10-02 17:42:21.331 UTC;
no credential attempt is eligible before 18:42:21.331 UTC. Investigate a concrete identifier submission/transition fix or
configure another authorized durable executor. After a changed route is deployed,
make one bounded attempt, inspect safe audit fields, and proceed to fresh restore
and canonical acquisition only when authentication is independently verified.

Keep credentials in the existing encrypted AuthCapability/BrowserProfile path.
Do not put them in source, Worker variables, prompts, logs, screenshots, or API
responses. Browser acquisition remains read-only. New external provider costs
require authorization.

Cloud work needs its own authorized Cloudflare access for deployment and safe
production inspection. Local OAuth state and production secrets are not part of
this Git branch. The local Codex follow-up automation is also not transferred by
Git; coordinate it before making overlapping production login attempts.
