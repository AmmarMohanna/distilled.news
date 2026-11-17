# Unverified account recovery

Branch: `fix/unverified-account-recovery`, based on `origin/main` at `4d75b7c5`.

## Demonstrated cause

Registration stores an unverified account. The existing login route correctly
rejects it until verification. Duplicate registration returns `email is already
registered`; that is not the login route's response. Previously, forgot-password
returned generic success but sent nothing for unverified accounts. There was no
verification resend endpoint or UI, so a missing/expired initial email left users
without an application recovery path.

Microsoft Graph acceptance (`202`) and a Sent-folder entry do not prove inbox
receipt. Production uses the existing Outlook Graph sender. The recipient-side
cause of the reported non-receipt is not established: a bounce, quarantine or
message trace is required. This change does not claim to override institutional
filtering, prove deliverability or change the email provider.

## Behavior

- `POST /api/auth/verification/resend` accepts email, requested language and the
  existing bot-verification token. It sends a fresh verification link only for an
  enabled, unverified account. Unknown, verified and disabled accounts receive
  the same generic successful response without an email.
- Forgot-password sends verification first for an enabled unverified account;
  verified accounts continue to receive actual password-reset links. It never
  verifies an account, resets its password or establishes a session by itself.
- Both recovery paths share five verification sends per email/hour, using the
  existing authentication-attempt mechanism; changing endpoints cannot bypass
  that allowance. Authentication rate-limit failures now return 429 rather than
  an internal error. Existing login/register/reset limits are preserved.
- Resend never changes the existing username, password or account ID. A failed
  recovery email is logged using the existing privacy-bounded mail failure logger
  and does not delete the account. It returns generic success to avoid exposing
  account state; UI copy says requested, not delivered.
- The auth dialog offers resend after signup, an unverified-login response or a
  duplicate-email registration error. Resend is a separate button: a missing
  password does not block it. Button state is restored after failure, and bot
  verification is reset as for other auth actions. Recovery is tied to the email
  currently shown so changing it cannot resend to an old hidden address.
- English, French and Arabic feedback explains verification-before-reset,
  inbox/spam checks and support follow-up. Existing account-existence disclosure
  on registration is not expanded through the resend endpoint.

Tokens remain hashed, time-limited and subject to existing verification and
single-use behavior. No migration, credentials, provider routing, source pipeline
or production account mutations are included. All tests use fake email transports
or browser route fixtures; no real email, paid inference or deployment is needed.

## Reproduce verification

```sh
node node_modules/vitest/vitest.mjs run --root apps/worker --config vitest.config.ts src/app.test.ts src/auth-recovery.test.ts src/mailer.test.ts
node node_modules/vitest/vitest.mjs run --root apps/web --config vitest.config.ts
pnpm -r typecheck
pnpm --filter @distilled/web build
node node_modules/@playwright/test/cli.js test tests/e2e/auth-recovery.spec.ts tests/e2e/auth-landing-fit.spec.ts --workers=1
```

Deployment requires a separate request. After deployment, the affected reader can
choose resend verification or password recovery, open the verification message,
and then sign in or request a password reset if necessary. If mail still does not
arrive, inspect the sender's non-delivery report and recipient quarantine/trace;
do not bypass verification or assume Graph submission means delivery.


## Local validation

- 91 focused Worker tests pass: application/account routes (76), recovery (8),
  mail transport (7).
- All 247 frontend tests pass, including API language payloads and localization.
- 32 desktop/mobile browser checks pass across recovery and auth layout suites.
- Workspace typechecks, frontend build and `git diff --check` pass.
- Initial endpoint/UI/API regressions failed before implementation. Intermediate
  browser fixtures were corrected to call `request.method()` and include the
  existing empty Turnstile token in the exact expected payload; no application
  assertions were weakened. French fixture encoding was corrected before final
  localization/build checks.

No recipient delivery experiment or real email was sent. New code remains
undeployed pending an explicit deployment request.
