# October 11 merged branch — sources QA deployment

## Git state

The user requested undoing the merge on `backend-sources-fixes`, keeping the merged version on a new branch, and updating the existing sources QA site.

- `backend-sources-fixes` is restored locally and remotely to its exact pre-merge tip: `b38e2effaee82743624ac27122ee5a58d3622abc`. The remote update used an exact force-with-lease against our own merge, after preserving it on the new branch.
- New branch: `backend-full-stack-october-11`.
- Preserved full-history merge: `21f22c5b13e6dfcee14df3b8bd23648505781465`, titled `After merge October 11: integrate frontend, sources and distillation quality`.
- Deployed source revision: `68a12abf5ab48e63d890a11bef2021b96836a29e`. Compared with tested integration `145e99822a91676d96f37bbc80e98d576026ce88`, only the QA frontend asset prefix changed. Application code is identical.
- All original contributor histories remain incorporated. See `INTEGRATION_FULL_STACK_2026_10_11.md` for the integration changes and completed local suites. No full suite was rerun for this configuration-only deployment.

## Live target and rollback

Site: https://distilled-news-sources-qa.distillednews-platform.workers.dev/

Account: `e32b564514d4f9b9e383b7dd30dbb026`.

Worker version: `5b1489dd-212f-4ad1-8b44-a57039131315`.

Frontend prefix: `staging-assets/e458121646e6cf833383113afc17dd060a703a55/`.

Previous Worker version: `0685d080-3d1a-4d90-8872-cc0111d39063`.

Previous frontend prefix: `staging-assets/069e475ed9c0f3cc911c8b4f128cc3aa8866bc3a/`.

The existing QA Worker, D1, R2, processing queue and VPC helper binding were retained. Production and shared staging were not deployed. The VPS helper was not updated; the merged helper code is unchanged from the sources contributor branch. Fresh helper connectivity and live-source collection were not proved by this deployment.

For application rollback, restore the recorded previous Worker version with its previous asset prefix, keeping additive schema/history. Do not reverse migrations or erase intelligence/receipt records. Old frontend objects remain available.

## Backup and reviewed migrations

Cloudflare authorization was refreshed for the correct target account. Remote migration history and actual schema were inspected before mutation. The database had exactly the original sources branch's 47 migrations, with no push table or Explore field present.

A full private SQL backup was exported and restored locally before migration: 71,089,339 bytes, 104 tables, integrity OK, zero foreign-key violations. The backup, encrypted copy, restoration report and previous Worker metadata are in ignored `.review-tmp/` in the integration worktree; they are not committed. Keep backup material private.

Only these three pending migrations were applied remotely, in order:

1. `0046_explore_featured.sql`
2. `0047_web_push.sql`
3. `0048_browser_push_lease.sql`

All 50 migration filenames are now recorded; Wrangler reports no pending migrations. Historical migrations were not replayed. The push subscription fields, including lease token and notification version, were verified. Remote foreign-key checks passed.

Before/after counts matched: 4 accounts, 13 feeds, 17 sources, 448 connector fingerprints and 1 stored mail OAuth token. Existing authentication, source-provider, private-helper and Outlook secret bindings remain installed; none were rotated.

## Deployment verification

- Merged frontend build passed; 16 asset entries uploaded under the new immutable prefix, with the manifest uploaded last.
- Exact QA Worker dry-run passed before deployment.
- Worker deployment completed, including the existing queue producer/consumer bindings.
- All 21 scripted live smoke checks passed: static asset bytes match the local build; the dynamically generated PWA manifest has the expected structure; session and Explore APIs return HTTP 200; unauthenticated Home returns 401; an unknown public feed returns 404; unauthenticated QA maintenance returns 404.
- An additional root-page check passed: `/` returns HTTP 200 and exactly matches the new frontend index bytes.
- These are deployment checks, not a new authenticated signup-to-publication or live-source/model evaluation.

## Initial deployment limits and unverified features

For the later Brief now and scheduled collection update, see [QA_BRIEF_NOW_2026_10_11.md](QA_BRIEF_NOW_2026_10_11.md). For the USD 15 per-source update, see [QA_SOURCE_BUDGETS_2026_10_11.md](QA_SOURCE_BUDGETS_2026_10_11.md). The settings below describe the initial merged rollout.

Existing QA settings were preserved. Paid source-provider budgets and operation ceilings remain zero; automatic Cron polling remains disabled. The downstream runtime is enabled, but semantics and salience retain the existing deterministic policy and real-model synthesis remains disabled. This is the merged application running with the existing bounded QA configuration, not proof of production editorial quality or unattended collection.

Outlook Graph configuration and the encrypted stored mailbox token remain installed. Actual signup/reset link completion remains user-deferred and was not re-tested here.

Browser push code and schema are deployed, but no VAPID credentials are installed, so notifications still require server setup. Generated illustrations require the image account/token, which are also absent in this QA environment. Credentials were not fabricated or silently copied from another environment.

Live Telegram edit/delete/session recovery, new LinkedIn posts, X outage fallback, provider-cost recovery, sustained collection, real-model editorial evaluation and real device notification receipt remain separate validation work. No paid provider/model calls, source enrollment or maintenance collection were triggered during this rollout.