# frontend-fixed: preservation requirements and merge handoff

Prepared 2026-10-22. Protected source branch: `frontend-fixed`.
Reference snapshot for protected work: `ebe6997` (full hash in the inventory below).

## Mandatory merge policy from Joud

Joud's frontend, AI-generated feed images, source recommendations, and other work on this branch must remain intact. Her friend may change the feed briefing backend and inherited backend implementation, provided those changes do not alter or break Joud's protected work. In a conflict involving protected work, frontend-fixed is authoritative; omit or adapt the incoming change. In inherited briefing backend code outside that protected scope, her friend's implementation may replace the existing implementation. This rule applies to clean automatic merges and explicit conflicts alike.

Use frontend-fixed as the starting point for a separate integration branch. Keep the original branch intact. Do not force-push, reset, rebase, or rewrite it. Do not merge directly into it while reviewing the integration. Keep this snapshot reachable through its existing history.

Preserving commits alone is insufficient: a later commit can undo their behavior. Review the resulting diff against the protected snapshot, including changes Git merged without a conflict. Passing tests alone is also insufficient for visual preservation.

## Ownership boundary: what may change

| Area | Merge rule |
| --- | --- |
| All frontend, including the feed briefing reader | Protected. Preserve existing implementation, appearance, interactions, responsive behavior, translations, and loading/error states. |
| AI-generated feed images | Protected end to end: model, prompts/style, generation jobs, API behavior, persistence, caching, retries, and frontend display. Backend location does not make these editable. |
| Source recommendations | Protected end to end: discovery, relevance assessment, historical-topic handling, verification, limits, recovery, APIs, and editor integration. |
| Other Joud work described below | Protected, including collector activation/budget controls, storage maintenance, and dedicated deployment setup. |
| Feed briefing backend | Editable: inherited intelligence/editorial processing, summarization, story selection, review, correction, and publication implementation may change while preserving the frontend-facing contracts and protected features. |
| Other inherited backend code | Editable where it does not replace Joud's changes or interfere with the protected features. Being present in this branch does not by itself make inherited implementation protected. |

Protection follows the feature and the specific changes, not an entire shared file. For example, `app.ts`, `index.ts`, `repository.ts`, and `v1-downstream-runtime.ts` may contain editable inherited briefing code alongside protected image, recommendation, collector, or maintenance code. Merge those portions separately; do not take either whole file blindly. Backend API/data changes must remain compatible with the existing frontend rather than requiring frontend edits.

The detailed preservation sections below describe Joud's protected work. The inherited file inventory is context for integration, not a blanket prohibition on changing inherited code. If ownership of an overlapping change is unclear, retain that portion pending clarification rather than guessing that it is disposable.

## Scope and evidence

This branch contains inherited backend integrations as well as later Joud changes. Commit subjects alone do not establish personal authorship. Inherited briefing backend work is allowed to change; Joud's work remains protected under the ownership boundary above.

For a focused inventory of later work, this handoff uses the parent of `150fb65` (the dedicated Joud deployment commit) as a reproducible landmark. That is a reporting boundary, not a claim that it is the branch's original fork point. The focused range contains 93 changed files. The frontend remains protected regardless of when it entered the branch; inherited backend implementation is editable under the ownership boundary above.

`main` is substantially behind this snapshot and includes a much larger integrated history. Do not assume every difference from main was personally authored on this branch. The machine-generated inventories alongside this document record both scopes.

## Frontend layout and navigation to preserve

- Home, Explore, and the guest landing use adaptive feed cards. Preserve the current card proportions, column calculation, viewport-dependent sizing, complete rows, compact spacing, larger desktop side artwork, and stable initial loading layout.
- Preserve the FINAL continuous document scrolling behavior. Earlier experiments introduced pagination and hidden scrollbars; later commits superseded those. Do not restore paging, nested feed-list scrolling, or obsolete CSS just because an older commit contains them.
- Preserve the alignment between page titles, search, create controls, and feed grids, including laptop heights, large displays, mobile portrait and landscape, and the collapsed sidebar state.
- Keep the persistent desktop navigation rail, hover preview, click-to-pin behavior, resizing animation, non-clickable branding, logo restoration after focus leaves, and the existing toggle spacing and icon treatment.
- Keep the current phone branding and aligned create controls. Mobile Settings belongs in the bottom navigation; appearance controls live in Settings. Preserve the current header control arrangement.
- Preserve the final Home/Explore headings and spacing. Explore uses Community feeds and automatically includes public feeds; do not restore the removed category filter row or obsolete section headings.
- Feed titles remain single-line with usernames on their own fixed row. Status translations stay on one line. Preserve visible card outlines on hover.
- Feed action menus must remain above adjacent cards and inside the viewport, with placement recalculated for available space.
- Preserve stable search controls and create icons across languages, fixed guest header control positions, branded login text without the hover underline, and the final header spacing.

Primary files: `apps/web/src/AdaptiveFeedGrid.tsx`, `AppExperience.tsx`, `main.tsx`, `apple.css`, `LanguageControl.tsx`, and `useVisibleFeedMenu.ts`.

## Reading, loading, and refresh behavior

- Preserve the integrated single-column briefing reader, All/Unread filter, contextual back/actions toolbar, mobile filter width, retained-feed search, and reference/punctuation handling already in this snapshot.
- Keep automatic reconnection updates and the removal of the manual feed refresh control.
- Preserve grey briefing skeleton rows with a single loading status, compact empty briefing spacing, and the search/icon rendering fixes.
- Keep the latest artwork loading spinner visible until the actual generated image loads, rather than clearing it merely because an image URL or API response exists. Preserve image failure handling and its regression test.

Primary files: `FeedLoadingSkeleton.tsx`, `FeedNotice.tsx`, `FeedArt.tsx`, `api.ts`, plus the shared reader and application files already present at the snapshot.

## Feed editor, profile, preferences, and language

- Preserve grouped feed preference rows, typography, and the existing visibility switch behavior. Do not infer a new private-feed product model from that UI; published feeds remain public under the project direction.
- Keep the profile dialog's compact identity panel and settings cards, its current typography and avatar alignment, and the removal of decorative circles and pencil-button backgrounds.
- Preserve centered Arabic welcome/auth text, RTL layout fixes, uppercase inline mobile language codes, stable translated controls, and current Settings heading alignment.
- Feed editor failures are visible in red and retain precise source verification failure details. Selected sources are excluded from recommendations. Preserve microphone focus containment and prompt scrolling without the intrusive scrollbar.

Primary files: `FeedEditor.tsx`, `AppExperience.tsx`, `LanguageControl.tsx`, `main.tsx`, and `apple.css`, with their existing tests.

## Feed illustration pipeline

- Final model: `@cf/black-forest-labs/flux-2-klein-4b`. Earlier Schnell commits are historical, not the current selection.
- Illustrations represent the feed interest using the existing purple pencil style and square composition. Preserve the existing display/background treatment and desktop placement.
- Generation is durable queue work, with persistent R2 storage, existing-image reuse, retry/recovery handling, stale-image continuity, cache behavior, and ownership/currentness checks.
- Reading artwork must remain read-only. Do not restore generation as a side effect of an artwork GET request or make browser rendering responsible for durable job ownership.
- Preserve the dedicated illustration job handling and its isolation from diagnostic maintenance, AI editorial work, and source scheduling.
- Preserve sanitized provider errors and private server-side credentials.

Primary files: Worker `sketches.ts`, `feed-sketch-jobs.ts`, `app.ts`, `index.ts`, `repository.ts`; web `FeedArt.tsx`, `sketchCache.ts`, `sketchImage.ts`.
Migration: `0059_feed_sketch_jobs.sql`.

## Source discovery and exact-topic verification

- Preserve support for RSS/Atom, Google News, Telegram, X, LinkedIn, and public websites through the configured authorized paths. Deployment availability must reflect real configuration; local credentials alone do not mean production is configured.
- Recommendations must be fetched and verified before being offered as ready. Model suggestions and catalog entries are candidates, never approval.
- Require actual article/post evidence for the requested subject and geography. Broadly related industry sources, reflected query titles, invented citations, inaccessible content, or inconclusive fetches do not establish relevance.
- Preserve structured relevance assessment, fetched evidence IDs, server-derived excerpts, publisher deduplication, and explicit failure/status distinctions.
- Preserve publisher capability discovery, topic-filtered WordPress RSS where supported, advertised RSS/Atom alternate links and same-origin HTTPS anchors, and bounded recovery of dead feed URLs via publisher homepages.
- Preserve bounded concurrent verification, reuse of fetched responses, request/body limits, the 20-second recommendation network budget and 8-second per-call budget, bounded replacement discovery, and exclusion of failed Google attempts from retry rounds.
- Preserve the final three-recommendations-per-user-per-five-hours limit and clear rate-limit errors. Do not restore an earlier hourly quota or generic server errors for exhausted recommendation allowance.
- Preserve historical-interest classification: older evidence can qualify for a historical topic only with actual matching passages and cited evidence IDs, with archive freshness and an explicit age explanation. Stale current-news feeds remain rejected; unclassified historical intent fails closed.
- Preserve the bounded initial web search and prevention of a second web search in replacement discovery. Historical references must not be misrepresented as actively updating daily news feeds.
- Preserve deployment-specific Google recommendation controls and authorized collector routing. A later collector activation does not justify reviving blocked direct Google fetches or silently migrating existing approved source identities.

Primary files: Worker `source-recommendations.ts`, `source-assessment.ts`, `source-catalog.ts`, `source-recommendation-fetch.ts`, `public-source-fetch.ts`, `product-feed-discovery.ts`, `connector-availability.ts`, and `app.ts`.

## Multi-source collectors and spending controls

- Verification and ingestion must use the same authorized collector contracts and canonical owner/feed/source identities, evidence storage, checkpoints, and paid-operation lifecycle.
- Preserve the shared TOTAL $5/day collector limit for the Joud deployment, resetting at midnight in Asia/Beirut. It is not $5 per provider. Retain atomic conservative reservations across verification and ingestion, unknown-outcome fences, and existing paid-operation identities.
- Budget status reports conservative maximum-charge reservations, not measured invoices.
- Preserve Apify-backed Google News/X/LinkedIn routing, Worker-native public HTML extraction, provider normalization, bounded HTTP behavior, and native public acquisition paths where enabled.
- Preserve Telegram identity resolution and actual recent-post checks through the authenticated private execution service. Missing authorization, wrong identities, unreadable posts, and rate limits must not become accepted recommendations.
- Preserve execution-service authentication, bounded concurrency, Telegram session serialization and retryable backpressure. Ordinary Google/website work must not be diverted through the Telegram service simply because it is configured.
- Keep local login/check tooling and runtime secrets private. Never commit .env files or Telegram sessions. Do not run the transferred project session simultaneously on a local machine.
- Preserve authenticated maintenance endpoint protections; testing recommendations must not create public feeds or publish test material.

Primary files: Worker `collector-budget.ts`, `source-verification-collector.ts`, `telegram-verification.ts`, `native-source-execution.ts`, `connector-runtime.ts`, `source-backend.ts`, `v1-downstream-runtime.ts`; connector `provider-http.ts`, `provider-normalize.ts`, `public-html.ts`; source-execution and Telegram scripts.
Migration: `0061_daily_collector_budget.sql`.

## Storage lifecycle and operational safety

- Preserve minimal unpaid AI wait records: retain operation identity, canonical input references, failure and zero-call usage without duplicated model context.
- Preserve opt-in automatic bounded maintenance before source scheduling, keyset continuation, bounded pages and time budget, and the current Joud deployment opt-in.
- Legacy unpaid wait payloads must be copied to R2 and read back for byte verification before conditional SQL replacement. Archive failure leaves SQL intact.
- Preserve 30-day transient wait/delivery diagnostic retention, lease expiry grace, and the diagnostic archive lifecycle policy. Keep canonical published editions, evidence, paid intents/settlements, unknown paid outcomes, and artwork outside this cleanup policy.
- Preserve storage reporting and authenticated maintenance routes. Cleanup is not unlimited capacity or automatic database sharding.
- Retain documented storage recovery evidence and safeguards against renewed charges or loss of canonical state.

Primary files: `storage-maintenance.ts`, `app.ts`, `index.ts`, `v1-intelligence/semantic-operations.ts`, `semantic-wait-record.ts`.
Migration: `0060_storage_retention_indexes.sql`.

## Deployment, migrations, and inherited architecture

Preserve `apps/worker/wrangler.joud.jsonc` and its dedicated Worker, database, queues, buckets, bindings, enabled maintenance, provider controls, and budget configuration. Do not substitute another branch's staging or production resource IDs. Deployment instructions are in `JOUD_DEPLOYMENT.md`; do not deploy during a merge review.

Never rename, delete, or rewrite already-applied migrations 0059/0060/0061. If the incoming branch reused a migration number, resolve that explicitly with an additive migration and schema review. Do not rewrite earlier applied migrations. Additive schema and backend contract changes are allowed for the briefing backend when they preserve protected features, existing data, and frontend compatibility.

The existing snapshot also contains inherited backend integrations for source acquisition, queue fencing and recovery, paid operation safety, article provenance, editorial fact ownership, correction/publication recovery, and diagnostics. These inherited implementations are not frozen by this handoff: the feed briefing backend may be changed or replaced. Keep Joud's protected changes in shared backend code intact, including image generation, source recommendations and verification, collector/budget additions, and storage maintenance. Follow `ARCHITECTURE_v1.md` Appendix C, `PARALLEL_IMPLEMENTATION_AGREEMENT.md`, and `packages/contracts`; preserve production source routing until explicitly switched by an integration change.

## Merge procedure and acceptance

1. Obtain both remote branches and record their exact commit hashes. This handoff was created from local history; live remote freshness was not verified.
2. Create a new integration branch starting at the protected frontend-fixed snapshot (or its agreed descendant). Keep frontend-fixed untouched.
3. Compare the incoming branch to its merge base and review its intended changes before merging. Identify semantic overlap, not just same-line edits.
4. Classify each overlap by the ownership boundary. Preserve frontend-fixed for Joud's protected work. Accept her friend's changes to the feed briefing backend and other inherited backend implementation where they leave protected work intact. Split shared-file changes by feature; omit incoming changes that would alter protected work.
5. Review the complete resulting diff against the protected snapshot. Every incoming deletion or modification to protected behavior must be removed. New CSS overrides, defaults, route replacements, configuration changes, or altered tests can silently undo work even without conflict markers.
6. Preserve regression coverage for protected features. Briefing backend tests may be updated for authorized backend behavior changes; do not delete, skip, or weaken protected-feature assertions to accommodate a regression.
7. Run the repository typecheck, unit/script tests, and build (`pnpm typecheck`, `pnpm test`, `pnpm build`), then relevant Playwright coverage using the repository's configured environment. Record actual results and any unrun checks; never claim the commands passed merely because this document lists them.
8. Visually compare Home, Explore, landing, reader, editor, profile, Settings, artwork loading, and menus in English/Arabic, mobile portrait/landscape, laptop and desktop, with expanded/collapsed sidebar and loading/empty/error/populated states.
9. Verify recommendation relevance and failure paths, shared budget exhaustion and no duplicate paid submission, Telegram/native routing isolation, durable artwork recovery, maintenance archive failure, and clean plus existing-database migration compatibility. Avoid billable/live mutation tests without their existing authorization.
10. Deliver the integration commit, comparison against the protected snapshot, test results, and a list of accepted backend changes and additions, explicitly identifying shared files whose protected portions were retained. Do not replace the protected branch as part of this handoff.

Do not use a blanket `-X ours` merge as a preservation guarantee: it only favors overlapping hunks and can still introduce incompatible cleanly merged changes. Git's `ours`/`theirs` labels depend on the current operation and branch. Resolve protected portions against the reference snapshot, allow authorized inherited backend changes, and review the actual result.

## Evidence and limitations

See `FRONTEND_FIXED_MERGE_INVENTORY.md` for exact hashes, focused final file changes, focused chronological commits, and the broader inherited file inventory against local main. This is a preservation handoff, not an assertion that all code is newly authored or all connectors have live publication proof.

Read the latest sections of `MULTI_SOURCE_ACTIVATION_JOUD.md`, `JOUD_DEPLOYMENT.md`, `STORAGE_OPERATIONS.md`, `STORAGE_VALIDATION_2026_10_21.md`, `SOURCE_RECOMMENDATIONS_VALIDATION_2026_10_21.md`, and `GOOGLE_NEWS_ALTERNATIVE_REVIEW.md`. Older dated entries can be superseded by later activation evidence: an old zero-budget blocker is not the current $5/day policy. Telegram assessment/deployed connectivity evidence is not proof of a newly published live Telegram briefing; historical reference acceptance is not proof of an active daily source.

No merge, push, deployment, credential change, migration execution, or application test run was performed to prepare this document.
