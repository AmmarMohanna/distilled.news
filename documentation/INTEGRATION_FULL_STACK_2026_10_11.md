# Three-contributor integration — 2026-10-11

## Deliverable and scope

Branch: `integration/distilled-full-stack-2026-10-11` in `AmmarMohanna/distilled.news`.

This is a full-history integration, starting from the latest distillation-quality tip and merging sources, then frontend, using two `--no-ff` merges. It is prepared for **controlled staging evaluation after the migration/binding review below**. It is not evidence of production readiness or a live deployment.

Original contributor branches and the original working checkout were not modified. No deployment, remote migration, VPS update, paid provider/model experiment, budget change, secret rotation, historical-record deletion, or force push was performed. Test keys/tokens are disposable local fixtures.

## Git ancestry and contributor preservation

| Contributor | Incorporated remote branch | Exact tip |
| --- | --- | --- |
| Frontend | `origin/main2-ui-polish` | `9af6eadd82a94ec3a71e817fe359af9b654eb5b9` |
| Sources/backend | `origin/backend-sources-fixes` | `b38e2effaee82743624ac27122ee5a58d3622abc` |
| Distillation quality | `origin/feat/distillation-quality` | `ead7035dac2fb091f97524d278bc3988a0f8f7df` |

The tips were checked after fetching, and checked again before final delivery. All three must pass `git merge-base --is-ancestor <tip> HEAD`. The merge commits are `c004cf8` (sources into quality) and `900bb1b` (frontend into the combined runtime). No branch history was squashed or cherry-picked. All ten frontend commits, including `972a2af`, `cecbef6`, `5274e5e`, `7aef6ae`, `df86e93`, `6a16e46`, `bdb4971`, `221ba0e`, `79dff0e`, and `9af6ead`, are retained through their tip's ancestry.

**Frontend:** the latest branding, icons/manifest/service worker, navigation, landing, account/Settings, compact Feed Editor, card illustrations/usernames/status/relative times, EN/FR/AR radios, redesigned reader, PWA instructions, notifications switch, Explore curation, sketches routes/storage, browser push endpoints, dependencies and lockfile survive. Source-approved public-only feeds and exact source inputs coexist with that design. Intelligence's correction-pending notice and citation-formatting helpers survive. No wholesale replacement of the frontend took place. Narrow fixes reduce artwork on short screens, leave scrolling room beneath mobile navigation in expanded account management, and honor an existing stored PWA-install confirmation. Required 1280×720 and 390×664 layouts were inspected visually; browser coverage also includes smaller portrait/landscape sizes and all three languages.

**Sources/backend:** source adapters and the private extraction helper match the source branch; RSS, exact Google queries/link resolution/caching/fingerprints, Telegram journal/edit/delete/recheck/session handling, X fallbacks, LinkedIn incremental behavior, snapshots/checkpoints, frozen provider ordering, lease renewal, provenance, downstream scope ordering, spending reservations, health/QA operations, backup/rollback tools, retention, and Outlook Graph verification/reset code remain. Source count caps were not restored. `collection_owner` and connector bindings continue to fence legacy collection; no additional collector was introduced. Merging Worker code does not update the VPS.

**Distillation quality:** contracts, semantic accounting/admission/reservations/reuse/unknown-outcome settlement, candidate catalogs, rematch fairness, bounded reconsideration, processing leases, batched graph reads, extraction, reader novelty, shortlist/overflow, editorial planning, fidelity checks, ledgers, verified publication, blocked windows and corrections remain authoritative. Shared contracts have no integration changes. Compared with this tip, intelligence changes are restricted to the source branch's expanded product-source bridge and quota removal, its exact RSS-title citation compatibility fix and associated tests, plus the integration's new immutable push-receipt document kind, delivery diagnostics and tests. No semantic/editorial call-count cap, numeric priority lane, story quota, automatic editorial deferral or publication veto was added.

## Material conflict audit

The source merge completed automatically. Its semantic differences were still inspected: the expanded source/product bridge and source-count removal must coexist with the newer quality runtime rather than overwrite it.

The frontend merge had four textual conflicts:

| File | Competing intent | Resolution |
| --- | --- | --- |
| `apps/worker/src/app.ts` | Sources added preparation/resolution/health APIs; frontend added push imports/APIs. | Combine imports and keep both route families, together with Explore/sketch endpoints and unrestricted approved source inputs. |
| `tests/e2e/distilled.spec.ts` | Older signup navigation versus frontend's Create an account control. | Follow the latest frontend control while retaining signup behavior assertions. |
| `tests/e2e/reference-ui.spec.ts` | Atomic feed-create/source mocks versus frontend's notification Settings switch. | Keep the atomic `/api/me/feeds` request fixture, remove a duplicate route mock, and assert the new switch. |
| `tests/e2e/screen-fit.spec.ts` | Source/public-feed assertions versus new source placeholder, language radios and notifications. | Keep the public-feed requirements and overflow checks; target the actual latest controls. |

Non-conflicting compatibility fixes were also necessary:

- Older browser tests addressed cycling language buttons/title selectors that the frontend deliberately replaced with radios and username-bearing cards. They now assert the same saved language/title against the actual controls. The Explore publishing fixture starts unfeatured so it can genuinely exercise the Publish action.
- The untouched frontend tip reproduced nine targeted Chromium failures (32 passed): short-screen cards/landing, a featured/unfeatured mock mismatch and PWA confirmation. These were distinguished from merge regressions. The merged layout/PWA fixes address these without changing deadlines or force-clicking blocked actions.
- Mobile account management removed bottom padding when expanded, hiding its final action behind navigation. The narrow mobile override restores the scrolling space. An Edge-only test now explicitly supplies an Edge UA in both viewport projects, avoiding Android instructions being mistaken for desktop Edge behavior.
- `CLOUDFLARE_IMAGE_ACCOUNT_ID` is an explicit environment input instead of carrying a contributor's image-account value into shared defaults. `setup.mjs --write-wrangler` now preserves that input. Its API token stays a secret; VAPID keys retain their existing identity across repeated setup. The original environment/resource configurations remain distinct.

## Publication and push integration

The automatically merged browser sender looked directly at saved editions, while intelligence already wrote a durable `delivery_jobs` outbox and correctly reported that it had no consumer. The integration connects them instead of declaring saved editions delivered.

`push-outbox.ts` gates browser notification eligibility on a public product feed, enabled owner, PUBLISHED status, successful fidelity result and the edition's communication-ledger projection. The existing scheduler still runs collection, continuations, intake, intelligence/rematches/briefing/corrections/publication, push and maintenance. Its dispatch responsibilities were not replaced.

Each active subscription has a version and a fenced lease token. Successful external responses atomically commit immutable `browser_push_receipts` and release the matching lease; stale, expired or replaced subscription owners cannot acknowledge. A publication job becomes DONE only after all currently eligible subscriptions have durable push-service acceptance receipts. Missing subscribers or VAPID configuration leave it pending. Bounded batches do not advance a watermark past delayed ledger projections, and partially acknowledged jobs cannot starve later fully acknowledged jobs.

Push is **at least once at the external boundary**. A database acknowledgement lost after commit recovers without resending; a lost external response can require a retry and duplicate a push. The browser's stable notification tag is retained. DONE/DELIVERED means **push-service acceptance**, not device receipt, display, reading, email delivery or correction delivery. Semantic rematch completion never settles correction obligations by itself.

## Migration order and compatibility

Preserve all original SQL and filenames. Current installed Wrangler identifies applied migrations by the complete `d1_migrations.name`, not solely the numeric prefix; numeric sorting uses filename order for ties. The four overlapping migrations modify independent schema areas and do not need renaming.

Keep `0001` through `0045` in their existing order, followed by:

1. `0046_connector_item_fingerprints.sql`
2. `0046_explore_featured.sql`
3. `0047_mail_oauth_tokens.sql`
4. `0047_web_push.sql`
5. `0048_browser_push_lease.sql` — new additive `lease_token` and `notification_version` columns.

There are **50 SQL migration files**. Git blob comparison confirms all 45 common files are byte-identical across the three original tips; each source/frontend tip contains its own 47-file chain. The original four overlapping files are unchanged. The new migration must be applied before this Worker processes push subscriptions or scheduled notification work.

Local proof includes actual Wrangler fresh-D1 migration application and `scripts/check_integration_migrations.py`: fresh installation applies 50; source history and frontend history each apply only their three missing files, preserve seeded account/feed/ownership data plus source/OAuth or featured/push fixtures, pass foreign-key/integrity checks, are filename-idempotent and converge to identical schemas.

Existing remote history remains **unverified**. A read-only sources-QA history query failed with Cloudflare 7403 (account invalid/not authorized under the available authentication). No remote mutation was attempted. Do not infer the current live schema from local fixtures or historic handoffs.

### Controlled staging rollout, after review and separate authorization

1. Confirm the target account, staging Worker, DB, R2 bucket, processing queue/DLQ and VPC service independently of production and sources QA. Read `d1_migrations` and inspect the schema for all five files above. Stop if a name is recorded without its schema effect or a schema effect exists under an unrecorded name; reconcile the actual history against a backup under explicit review. Do not blindly reapply ALTERs or rewrite migration history.
2. Export staging D1 and record its currently running Worker version, frontend asset prefix and helper version. Existing databases must apply only pending full filenames. In particular, do not manually replay the destructive historical account-reset migration `0006_accounts.sql`.
3. Review/provide image account/token access, stable VAPID public/private keys and subject, model/AI-gateway authentication and approved monetary capacity, email transport, and private helper token/VPC binding. Confirm helper version/Telegram session and source ownership. Do not rotate keys or copy the QA deterministic-model/disabled-provider settings into a different environment.
4. Apply the reviewed pending migrations before switching to the new Worker. Then coordinate helper compatibility separately, upload the built frontend under a new immutable staging R2 asset prefix, and deploy the reviewed Worker using that prefix. The checked-in staging prefix still names an older build; a Worker-only deployment would not update the interface.
5. Verify auth, signup/reset mail, public feeds, exact source inputs, Explore/sketches, EN/FR/AR, notification subscription, acquisition/intelligence/publication, corrections and push acceptance with deterministic fixtures first. Live provider/model calls require separate approved budgets. Paid-source caps in the checked-in staging config remain zero.
6. Roll back to recorded Worker/asset versions if necessary, retaining additive schema/history. Do not reverse migrations or delete historical intelligence/receipt data as a rollback shortcut.

The current staging config references a VPC source execution service; its loopback URL alone does not prove Worker-to-VPS reachability. Images are generated through the preserved Workers AI REST path using the image account and token and archived in RAW_ARCHIVE; no new AI binding was assumed. Email transport and the required model credentials must be reviewed for staging rather than inherited from sources QA. Generic setup config generation should not replace an established staging config's specialized bindings.

## Verification results

Commands below ran from the clean integration worktree. On this Windows machine `C:\Program Files\nodejs` was prepended to PATH because the system pnpm shim points to an unconfigured nvm runtime. `corepack pnpm` uses the repository package manager. Tests do not enable opt-in paid/live proofs.

| Command | Final result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | Passed; merged dependency/lockfile resolution accepted. |
| `corepack pnpm -r typecheck` | All seven workspaces passed. |
| `corepack pnpm --filter '!@distilled/worker' -r test` | 652 passed, 2 skipped, 0 failed. Contracts 44; core 43; agent runtime 267 (+2 skipped); web 18; connectors 198; browser bridge 82. |
| `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` | 1,044 passed, 10 skipped, 0 failed; 158 files passed, 2 files skipped (160 total). |
| `corepack pnpm --filter @distilled/worker exec vitest run src/push.integration.test.ts src/push.test.ts src/connector-runtime.test.ts src/v1-intelligence/editorial-selection.test.ts --maxWorkers=1` | 49 passed, 4 files, 0 failed/skipped. |
| `node --test scripts/*.test.mjs` | 14 passed, 0 failed/skipped. Includes disposable self-host setup/image configuration/stable VAPID identity. |
| `python -X utf8 -m unittest discover -s scripts -p test_source_execution.py` | 19 passed, 0 failed/skipped. |
| `corepack pnpm --filter @distilled/web build` | Passed. |
| `corepack pnpm --filter @distilled/worker exec wrangler deploy --dry-run --config wrangler.staging.toml --outdir ../../.review-tmp/staging-final-build` | Passed; bundle only, no deployment. |
| `python scripts/check_integration_migrations.py` | 3 histories passed; schema/data/FK/integrity/replay checks passed. |
| `corepack pnpm --filter @distilled/worker exec wrangler d1 migrations apply DB --local --config wrangler.staging.toml --persist-to ../../.review-tmp/fresh-d1` | All 50 local migrations applied. |
| `corepack pnpm exec playwright test --workers=2 --reporter=line` | 249 passed, 1 skipped, 0 failed, across desktop and mobile projects. |
| `git diff --check` | Passed. |

The Worker suite is serial on Windows by its existing config to avoid Miniflare loopback-port exhaustion. Recovery fault-injection tests intentionally print constraint/provider failures; these are not failed assertions. The first complete Worker run finished with 1,042 passed, 10 skipped and one failed new outbox fairness regression; the corrected final affected suite passed all 49 tests and a fresh frozen-code full rerun supplies the final result above. Earlier integration browser runs (35 failures initially, then two remaining) and the unchanged-frontend baseline (nine targeted failures) are diagnostic history, not the final result. No assertion or timeout was weakened to obtain a pass. The browser skip is the existing desktop-only vertical-overflow case in the mobile project; dedicated mobile fit tests still run. The ten Worker skips are three RSS live/saved-page probes, one frozen RSS editorial canary, one editorial-fixes canary, one paid editorial smoke and four frozen semantic-replay durations. These retain their explicit opt-in controls.

Full-path deterministic proof uses the actual connector runtime/private-helper fixture → ordered observations/intake → evidence → intelligence → grounded verified edition → actual public frontend API response. The new push integration tests exercise real local D1 and generated browser/VAPID crypto with a stub push service; they cover eligible delivery, replay, rejection/lease recovery, stale owner, missing config/subscriber, withheld/withdrawn/unverified/unprojected/private/disabled publication, multiple subscribers, delayed projection and bounded outbox fairness. Existing evidence-revision/deletion, rematch, correction/attestation, ledger and publication regressions remain enabled in the full Worker suite. This is integration mechanics proof, not a paid real-model quality evaluation.

## Remaining product and operational limitations

- **RSS depth:** the native RSS handoff still records ARTICLE_EXCERPT with unknown completeness. Provider RSS enrichment can fetch bounded same-origin publisher bodies through the configured helper, but publisher-link resolution, Google News listings or available extraction tools do not establish universal full-article acquisition. Keep this gap visible during editorial evaluation.
- **Editorial quality:** deterministic fixtures establish invariants and compatibility, not relevance/completeness/accuracy of real-model briefings on a labelled live corpus. Human review and grounded-quality evaluation remain necessary.
- **Semantic capacity:** actual monetary admission, protected reservations and unknown outcomes are preserved. Work can legitimately wait without sufficient approved model budget; there is no restored arbitrary daily call-count limit. Source-provider budgets are a separate authorization boundary.
- **Corrections:** OPEN obligations may require verified corrective publication. Identity/high-consequence uncertainty and failed attestation remain visible rather than being auto-resolved. Push-service acceptance of an edition is not proof a reader received or understood a correction.
- **Live sources:** local regression coverage is retained for all supported source families. Controlled Telegram edit/delete/session-revocation checks, real LinkedIn newly appearing posts, X provider-outage fallback, blocked-page fallbacks, paid-call recovery and sustained multi-feed cost/freshness/backlog evaluation require separate infrastructure/live validation. This task did not spend provider money.
- **Notifications/mail:** real device push receipt/display/opening is unverified; real signup and reset email link completion was previously deferred by the user. Outlook QA transport/configuration is preserved but does not automatically configure another environment.
- **Operations:** the helper must be version coordinated; merging it does not deploy it. Remote migration histories/credentials must be inspected with valid target-account access. Existing retention behavior is unchanged; durable intelligence and new push receipt storage growth needs measurement and an explicit retention policy before broad rollout. No historical cleanup was improvised during integration.

There are no known failing final browser, typecheck, migration or build checks. The final complete serial Worker run also passed with zero failures. The branch is suitable for controlled staging evaluation after the migration and binding review above. Staging remains a reviewed rollout step with environment credentials/resources and asset/helper coordination, not an automatic consequence of this merge.
