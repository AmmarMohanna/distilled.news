# Staging browser-push investigation — 2026-10-23

## Confirmed cause
The sender used `fetch(..., {redirect: "error"})`. Cloudflare Workers accepts only `follow` or `manual`; constructing this request throws TypeError before it reaches the push service. Node's Fetch implementation accepts `error`, which is why the existing mocked Node tests did not catch the runtime incompatibility.

Evidence:
- Staging has a saved device subscription and eligible published, verified, projected editions, but delivery jobs remain PENDING and no browser_push_receipts exist.
- Automatic cron on the original version logs a generic exception and renews its retry lease.
- Diagnostic commit 4728c9f adds only a fixed phase and allowlisted exception type, without logging keys, URLs, bodies or raw errors. Live automatic cron at 20:19:49 Beirut reports `phase: send, errorType: TypeError`.
- Local workerd request construction reproduces: `Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code).` No network request was sent by this reproduction.
- Offline encryption of the saved subscription with throwaway signing keys succeeds. Synthetic payload construction also succeeds in local workerd. The installed workerd supports dates only through 2026-06-18, so the diagnostic uses that supported date rather than claiming complete runtime equivalence with staging's 2026-10-05 compatibility date.

## Minimal correction
Use `redirect: "manual"`. Redirects are not followed. Existing response handling treats 3xx as rejection, records no acceptance, and retains retry behavior. Existing keys, subscriptions, leases, publication checks and receipts are unchanged. No manual notifications or inference requests are triggered by this investigation.

## Tests
- Regression first fails on the old sender's redirect option.
- Nine focused sender tests pass after correction, including actual local workerd request validation, accepted 201, rejected 302/503, expired 410, and safe parse/payload/network diagnostics.
- The broader push.integration.test.ts suite fails all 14 cases in its beforeEach publication fixture (`edition` undefined), before sender delivery is invoked. Its fixed October 3 source/publication setup no longer yields an edition under the current clock. This is a separate test-fixture limitation, not a passing delivery regression.
- Local Node tests alone were insufficient for this bug; the new runtime check exercises workerd as well.

## Artifacts
Private raw diagnostics remain in ignored .local-reports: push-diagnosis.json, push-worker-redirect.ts/cjs, push-worker-dry.ts/cjs, push-dry-build.mjs, push-tail logs and staging-deploy-4728c9f/. No subscription keys or tokens are committed.

Staging diagnostic version: 12b61c21-b61e-46e7-b862-0d04ab2e8e36. All existing bindings and feed reads were verified after deployment. Real push-service acceptance after the redirect fix must be checked separately; it does not prove device display or receipt by the user.
