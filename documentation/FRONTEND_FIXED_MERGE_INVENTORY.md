# frontend-fixed merge inventory

Scope clarification: this is an evidence inventory, not a list of files that must remain unchanged. The frontend, AI image pipeline, source recommendations, and Joud's other changes are protected. The feed briefing backend and inherited backend code may change when they preserve that protected work. Shared files require feature-level merging. See `FRONTEND_FIXED_MERGE_HANDOFF.md` for the authoritative ownership boundary.

Generated 2026-10-22 from local Git history. No secrets or environment file contents included.

Protected snapshot: ebe6997e6ef3f604d9c9ab821295394bd91822aa
Focused reporting base (parent of dedicated deployment commit): 785c56bfa9e75ca38f3211c389fddbb2e384d3f9
Local main merge base: 37eb30e1642651b0f6c8b2476d4b7879026640c3

## Focused final changed-file inventory

```text
A	apps/web/src/AdaptiveFeedGrid.tsx
A	apps/web/src/AppExperience.test.tsx
M	apps/web/src/AppExperience.tsx
M	apps/web/src/FeedArt.test.tsx
M	apps/web/src/FeedArt.tsx
M	apps/web/src/FeedEditor.test.tsx
M	apps/web/src/FeedEditor.tsx
A	apps/web/src/FeedLoadingSkeleton.tsx
M	apps/web/src/FeedNotice.test.tsx
M	apps/web/src/FeedNotice.tsx
M	apps/web/src/LanguageControl.tsx
M	apps/web/src/api.ts
M	apps/web/src/apple.css
M	apps/web/src/main.tsx
A	apps/web/src/sketchCache.test.ts
A	apps/web/src/sketchCache.ts
A	apps/web/src/sketchImage.test.ts
M	apps/web/src/sketchImage.ts
A	apps/web/src/useVisibleFeedMenu.ts
A	apps/worker/migrations/0059_feed_sketch_jobs.sql
A	apps/worker/migrations/0060_storage_retention_indexes.sql
A	apps/worker/migrations/0061_daily_collector_budget.sql
M	apps/worker/src/app.test.ts
M	apps/worker/src/app.ts
A	apps/worker/src/collector-budget.ts
M	apps/worker/src/connector-availability.test.ts
M	apps/worker/src/connector-availability.ts
M	apps/worker/src/connector-runtime.test.ts
M	apps/worker/src/connector-runtime.ts
M	apps/worker/src/feed-product.test.ts
A	apps/worker/src/feed-sketch-jobs.test.ts
A	apps/worker/src/feed-sketch-jobs.ts
M	apps/worker/src/index.ts
M	apps/worker/src/migrations-clean.test.ts
A	apps/worker/src/native-source-execution.test.ts
A	apps/worker/src/native-source-execution.ts
M	apps/worker/src/product-feed-discovery.test.ts
M	apps/worker/src/product-feed-discovery.ts
M	apps/worker/src/public-source-fetch.test.ts
M	apps/worker/src/public-source-fetch.ts
M	apps/worker/src/repository.ts
A	apps/worker/src/sketch-route.test.ts
M	apps/worker/src/sketches.test.ts
M	apps/worker/src/sketches.ts
A	apps/worker/src/source-assessment.test.ts
A	apps/worker/src/source-assessment.ts
M	apps/worker/src/source-backend.ts
A	apps/worker/src/source-catalog.ts
A	apps/worker/src/source-recommendation-fetch.ts
A	apps/worker/src/source-recommendation-flow.test.ts
A	apps/worker/src/source-recommendation-recovery.test.ts
M	apps/worker/src/source-recommendations.test.ts
M	apps/worker/src/source-recommendations.ts
A	apps/worker/src/source-verification-collector.test.ts
A	apps/worker/src/source-verification-collector.ts
A	apps/worker/src/storage-maintenance.test.ts
A	apps/worker/src/storage-maintenance.ts
A	apps/worker/src/storage-routes.test.ts
A	apps/worker/src/telegram-verification.test.ts
A	apps/worker/src/telegram-verification.ts
M	apps/worker/src/types.ts
M	apps/worker/src/v1-downstream-runtime.ts
M	apps/worker/src/v1-intelligence/semantic-operations.test.ts
M	apps/worker/src/v1-intelligence/semantic-operations.ts
A	apps/worker/src/v1-intelligence/semantic-wait-record.ts
A	apps/worker/wrangler.joud.jsonc
A	documentation/GOOGLE_NEWS_ALTERNATIVE_REVIEW.md
A	documentation/JOUD_DEPLOYMENT.md
A	documentation/MULTI_SOURCE_ACTIVATION_JOUD.md
A	documentation/SOURCE_RECOMMENDATIONS_VALIDATION_2026_10_21.md
A	documentation/STORAGE_OPERATIONS.md
A	documentation/STORAGE_VALIDATION_2026_10_21.md
A	documentation/google-news-trial.input.json
M	packages/connectors/src/index.ts
M	packages/connectors/src/source-runtime/provider-http.ts
M	packages/connectors/src/source-runtime/provider-normalize.ts
A	packages/connectors/src/source-runtime/public-html.ts
M	packages/connectors/test/provider-cloudflare-bindings.test.ts
M	packages/connectors/test/provider-source-runtime.test.ts
A	scripts/probe-google-news-apify.mjs
A	scripts/probe-google-news-apify.test.mjs
M	scripts/source-execution-server.mjs
M	scripts/source-execution-server.test.mjs
A	scripts/telegram-source-check.mjs
A	scripts/telegram-source-login.mjs
A	scripts/telegram-source-login.py
M	tests/e2e/app-experience.spec.ts
M	tests/e2e/home-explore-fit.spec.ts
M	tests/e2e/reference-ui.spec.ts
M	tests/e2e/requested-ui.spec.ts
M	tests/e2e/review-fixes.spec.ts
M	tests/e2e/screen-fit.spec.ts
A	tests/e2e/sidebar-toggle.spec.ts
```

## Focused chronological commits

Earlier experiments may be superseded by later commits. Preserve the final snapshot.

```text
150fb65 2026-10-16 Configure frontend-fixed for dedicated Joud deployment
d70d919 2026-10-16 Keep feed layout stable during initial loading
ce6bbc8 2026-10-16 Keep mobile settings language selector inline with uppercase codes
f89716b 2026-10-16 Remove Explore category filter row
b1c1a59 2026-10-16 Left align home feed heading and widgets
c67ba29 2026-10-16 Add spacing between home feed heading and widgets
9b3ab5b 2026-10-16 Match Explore feed alignment and section spacing to Home
e1b4644 2026-10-16 Hide Explore feed heading while preserving widget placement
6c9017f 2026-10-16 Automatically include all public feeds in Explore
2902a07 2026-10-16 Use Community feeds heading matching Home typography
b689914 2026-10-16 Keep feed usernames in a fixed row below single-line titles
f63968c 2026-10-16 Left align Settings page heading
b1d034f 2026-10-16 Center profile initials without vertical offset
6f418c9 2026-10-16 Raise profile initial slightly for visual centering
aa41868 2026-10-16 Balance visible spacing between header theme and profile controls
4aba38f 2026-10-16 Add persistent collapsible desktop navigation rail
4ff7097 2026-10-16 Remove sidebar toggle shading and align its icon with navigation
2908be7 2026-10-16 Enlarge sidebar brand symbol and strengthen its strokes
c17c617 2026-10-16 Animate sidebar resizing and center main page content
5712b55 2026-10-16 Make sidebar branding non-clickable
02084a3 2026-10-16 Preview sidebar on hover and pin only on click
e1312a2 2026-10-16 Restore sidebar logo after pointer focus leaves toggle
53ae65f 2026-10-16 Center feed groups beneath page titles when sidebar is minimized
952a061 2026-10-16 Fix missing card width in collapsed sidebar feed centering
53abc7b 2026-10-16 Capitalize News in the brand wordmark
820fa12 2026-10-16 Thin feed prompt scrollbar without changing input or microphone
a2829a2 2026-10-16 Hide feed prompt scrollbar while preserving scrolling
dc859b3 2026-10-16 Hide selected sources from feed recommendations
344ddb7 2026-10-16 Return clear recommendation rate-limit errors instead of server failures
306c46a 2026-10-16 Remove hourly AI source recommendation quota
1f7197c 2026-10-16 Limit source recommendations to three per user every five hours
710e12b 2026-10-16 Verify broad news sources with safe evidence fetching and Jev relevance checks
aa7c0cb 2026-10-16 Switch feed sketches to FLUX.1 Schnell and preserve pencil texture
3d2832d 2026-10-16 Keep stale sketches visible and make regeneration retryable
b2f05e7 2026-10-16 Generate a persistent feed illustration through durable queue work
b605136 2026-10-16 Make feed artwork read-only and update persistence tests
606da5b 2026-10-16 Fix persistent sketch generator type signature
3f5a622 2026-10-16 Use Klein 4B for interest-based feed illustrations
7d283e5 2026-10-16 Page complete feed cards to fit screens and remove illustration backgrounds
85fa134 2026-10-16 Restore continuous feed grids without pagination
6d11edb 2026-10-16 Remove unused feed pagination and restore scrolling checks
8f2c3d5 2026-10-16 Fit five feed widgets using responsive desktop columns and tighter vertical spacing
23be56b 2026-10-16 Calculate adaptive feed row sizes from remaining viewport space
34b07f5 2026-10-16 Remove feed section headings and reuse their space for adaptive widgets
92e7f71 2026-10-16 Size compact widgets for three rows and large widgets for two
2ae68d9 2026-10-16 Allow large-screen card design to override obsolete compact styling
38cc81a 2026-10-16 Hide feed and page scrollbars while preserving scrolling
70cd8dd 2026-10-16 Keep widget interiors fixed and calculate row capacity from remaining space
2dd88a0 2026-10-16 Keep feed card outlines visible on hover
01c27c7 2026-10-16 Enlarge artwork within feed widgets
1185dda 2026-10-16 Use larger side artwork in desktop feed cards
2d1c13b 2026-10-16 Fix desktop card proportions and options positioning
f3e2388 2026-10-16 Restyle feed preferences as grouped settings rows
f17d113 2026-10-17 Restore feed visibility switch and match preference typography
2453448 2026-10-17 Cache feed artwork and recommend sources supported by deployment
7a42869 2026-10-17 Keep translated feed status labels on one line
8505fb5 2026-10-17 Preserve centered welcome text in Arabic
6b38bc5 2026-10-17 Report precise source verification fetch failures
d88b7a6 2026-10-17 Display feed editor failures in red
0615b3a 2026-10-17 Redesign profile dialog with identity panel and settings cards
d113cc3 2026-10-17 Compact profile dialog and match settings typography
794da25 2026-10-17 Remove decorative circle from profile panel
16f1921 2026-10-17 Remove profile pencil button background
e9f515f 2026-10-17 Keep search controls stable across language changes
abcb9dc 2026-10-17 Recover failed source suggestions and contain microphone focus ring
9cad861 2026-10-17 Anchor Create feed icon across translations
5984609 2026-10-18 Style header login link with brand color
ba366ad 2026-10-18 Balance guest header login spacing
3c8fa24 2026-10-18 Keep guest header controls stationary across languages
ddb0f53 2026-10-18 Remove login link hover underline
65e6459 2026-10-18 Keep feed options menus within the visible viewport
2712183 2026-10-18 Move guest header controls closer to the right edge
5c75c6d 2026-10-18 Scroll feed lists with the full page and restore scrollbar
af82dab 2026-10-18 Calculate complete feed rows for the visible screen space
68a4ca1 2026-10-18 Keep adaptive feed cards compact instead of stretching
0cdf454 2026-10-18 Use smaller feed cards with uniform row and search spacing
08847a4 2026-10-19 Simplify phone branding and create controls with aligned header
10a9d32 2026-10-19 Match feed dashboard reference and move mobile appearance into settings
5cd43a5 2026-10-19 Use bottom Settings tab instead of an extra mobile header icon
f1f3858 2026-10-19 Fit complete feed cards and normalize briefing page sizing
74efe66 2026-10-19 Remove manual feed refresh and update automatically on reconnect
082cb00 2026-10-19 Remove feed paging and restore continuous page scrolling
ebc1a2b 2026-10-19 Calculate widget dimensions to fit complete rows without paging
0486908 2026-10-19 Use grey briefing skeleton rows with one loading status
5041176 2026-10-19 Compact empty briefing layout and fix search and icon rendering
d046097 2026-10-19 Avoid repeated Google News failures during source recommendation recovery
8e22fc6 2026-10-19 Discover advertised RSS anchors and recover dead publisher feed URLs
66c579d 2026-10-19 Preflight RSS recommendations and prepare a capped alternative collector trial
1a4991a 2026-10-19 Record multi-source activation gaps and approved trial credential blocker
5eef166 2026-10-19 Record successful capped Apify trial and source relevance limitations
421085e 2026-10-19 Distinguish local credentials from production connector setup
e9fc3f4 2026-10-21 Center auth dialog text in Arabic
b45c2e2 2026-10-21 Bound source recommendation latency and verify relevance with standard model API
ce235a7 2026-10-21 Verify source candidates as ready and avoid failed Google retries
317d83e 2026-10-21 Verify exact-topic source feeds with article-backed evidence
2f43130 2026-10-21 Avoid duplicating model context in unpaid capacity wait records
42ada40 2026-10-21 Automate diagnostic retention and isolate feed illustration jobs
fa413cb 2026-10-21 Record approved storage recovery results
1c2fba0 2026-10-21 Connect verified multi-source collectors with shared daily budget
ddaed5e 2026-10-21 Find and verify historical sources without current-news freshness bias
ebe6997 2026-10-21 Show loading spinner until generated feed artwork loads
```

## Full inherited changed-file inventory relative to local main merge base

This broader inventory includes integrated work, not only Joud-authored changes.

```text
A	.dockerignore
M	.env.example
A	.gitattributes
A	.github/workflows/acquisition-benchmark.yml
A	.github/workflows/project-checks.yml
M	.gitignore
M	AGENTS.md
M	README.md
A	apps/web/UI_DESIGN_NOTES.md
M	apps/web/index.html
M	apps/web/public/apple-touch-icon.png
A	apps/web/public/auth-globe.png
M	apps/web/public/favicon.svg
A	apps/web/public/home-globe.png
M	apps/web/public/icon-192.png
M	apps/web/public/icon-512.png
M	apps/web/public/manifest.webmanifest
A	apps/web/public/sw.js
A	apps/web/public/topic-atlas.png
A	apps/web/src/AdaptiveFeedGrid.tsx
A	apps/web/src/AppExperience.test.tsx
A	apps/web/src/AppExperience.tsx
A	apps/web/src/Dialog.tsx
A	apps/web/src/ExplorePublishingControl.tsx
A	apps/web/src/FeedArt.test.tsx
A	apps/web/src/FeedArt.tsx
A	apps/web/src/FeedEditor.test.tsx
A	apps/web/src/FeedEditor.tsx
A	apps/web/src/FeedLoadingSkeleton.tsx
A	apps/web/src/FeedNotice.test.tsx
A	apps/web/src/FeedNotice.tsx
A	apps/web/src/LanguageControl.tsx
A	apps/web/src/ScreenPages.tsx
A	apps/web/src/SettingsDialogs.tsx
A	apps/web/src/SourceLogo.test.tsx
A	apps/web/src/SourceLogo.tsx
A	apps/web/src/ThemeToggle.tsx
A	apps/web/src/VoiceInput.tsx
A	apps/web/src/api.test.ts
M	apps/web/src/api.ts
A	apps/web/src/apple.css
A	apps/web/src/experience.css
M	apps/web/src/helpers.test.ts
M	apps/web/src/helpers.ts
M	apps/web/src/main.tsx
A	apps/web/src/product.css
A	apps/web/src/pwa.ts
A	apps/web/src/sketchCache.test.ts
A	apps/web/src/sketchCache.ts
A	apps/web/src/sketchImage.test.ts
A	apps/web/src/sketchImage.ts
M	apps/web/src/styles.css
A	apps/web/src/summary-format.ts
M	apps/web/src/types.ts
A	apps/web/src/useConfirmation.tsx
A	apps/web/src/useVisibleFeedMenu.ts
M	apps/web/vite.config.ts
A	apps/worker/browser-container.Dockerfile
A	apps/worker/migrations/0011_agent_runtime.sql
A	apps/worker/migrations/0012_agent_runtime_security_and_provenance.sql
A	apps/worker/migrations/0013_web_operator_workflow_lifecycle.sql
A	apps/worker/migrations/0014_web_operator_workflow_failure_evidence.sql
A	apps/worker/migrations/0015_web_operator_acquisition_failure_evidence.sql
A	apps/worker/migrations/0016_model_attempt_timeout_provenance.sql
A	apps/worker/migrations/0017_web_operator_live_smoke_requests.sql
A	apps/worker/migrations/0018_model_gateway_diagnostics.sql
A	apps/worker/migrations/0019_openrouter_model_diagnostic.sql
A	apps/worker/migrations/0020_workflow_finalization_outcomes.sql
A	apps/worker/migrations/0021_authenticated_site_profiles.sql
A	apps/worker/migrations/0022_authenticated_profile_account_ownership.sql
A	apps/worker/migrations/0023_authenticated_profile_bootstrap_requests.sql
A	apps/worker/migrations/0024_authenticated_challenges.sql
A	apps/worker/migrations/0025_authenticated_surface_diagnostic_requests.sql
A	apps/worker/migrations/0026_source_acquisition_state.sql
A	apps/worker/migrations/0027_upstream_resources.sql
A	apps/worker/migrations/0028_browser_use_discovery_runs.sql
A	apps/worker/migrations/0029_public_acquisition_requests.sql
A	apps/worker/migrations/0030_authenticated_x_acquisition_requests.sql
A	apps/worker/migrations/0031_bounded_decision_events.sql
A	apps/worker/migrations/0032_openrouter_decision_metadata.sql
A	apps/worker/migrations/0033_acquisition_item_handoff.sql
A	apps/worker/migrations/0034_development_pipeline.sql
A	apps/worker/migrations/0035_v1_intake_evidence.sql
A	apps/worker/migrations/0036_v1_acquisition_results.sql
A	apps/worker/migrations/0037_v1_feed_intelligence.sql
A	apps/worker/migrations/0038_v1_publication_jobs.sql
A	apps/worker/migrations/0039_v1_product_sources.sql
A	apps/worker/migrations/0040_v1_product_lifecycle.sql
A	apps/worker/migrations/0041_v1_briefing_outbox.sql
A	apps/worker/migrations/0042_v1_feed_versions.sql
A	apps/worker/migrations/0043_v1_live_intervals.sql
A	apps/worker/migrations/0044_connector_runtime.sql
A	apps/worker/migrations/0045_connector_collection_owner.sql
A	apps/worker/migrations/0046_connector_item_fingerprints.sql
A	apps/worker/migrations/0046_explore_featured.sql
A	apps/worker/migrations/0047_mail_oauth_tokens.sql
A	apps/worker/migrations/0047_web_push.sql
A	apps/worker/migrations/0048_browser_push_lease.sql
A	apps/worker/migrations/0048_connector_scaling.sql
A	apps/worker/migrations/0049_manual_briefing_requests.sql
A	apps/worker/migrations/0050_connector_financial_scope.sql
A	apps/worker/migrations/0050_v1_queue_dispatch.sql
A	apps/worker/migrations/0051_connector_feed_scope_index.sql
A	apps/worker/migrations/0051_model_spending_authority.sql
A	apps/worker/migrations/0052_connector_relay_lease.sql
A	apps/worker/migrations/0052_model_spending_concurrency_amendments.sql
A	apps/worker/migrations/0053_connector_uncertain_scope_index.sql
A	apps/worker/migrations/0054_connector_collection_clock.sql
A	apps/worker/migrations/0055_connector_source_execution_claims.sql
A	apps/worker/migrations/0056_connector_telegram_lane.sql
A	apps/worker/migrations/0057_connector_read_recovery.sql
A	apps/worker/migrations/0058_connector_intelligence_turns.sql
A	apps/worker/migrations/0059_feed_sketch_jobs.sql
A	apps/worker/migrations/0060_storage_retention_indexes.sql
A	apps/worker/migrations/0061_daily_collector_budget.sql
M	apps/worker/package.json
A	apps/worker/src/acquisition-diagnostic-retention.test.ts
A	apps/worker/src/acquisition-diagnostic-retention.ts
A	apps/worker/src/acquisition-evaluation-fixtures.ts
A	apps/worker/src/acquisition-evaluation.test.ts
A	apps/worker/src/acquisition-item-handoff.ts
A	apps/worker/src/agent-artifact-store.ts
A	apps/worker/src/agent-runtime-recovery.integration.test.ts
A	apps/worker/src/agent-runtime-store.test.ts
A	apps/worker/src/agent-runtime-store.ts
M	apps/worker/src/ai.ts
M	apps/worker/src/app.test.ts
M	apps/worker/src/app.ts
A	apps/worker/src/authenticated-profile-bootstrap-trigger.test.ts
A	apps/worker/src/authenticated-profile-bootstrap-trigger.ts
A	apps/worker/src/authenticated-profile-bootstrap.ts
A	apps/worker/src/authenticated-profile-manual-bootstrap.test.ts
A	apps/worker/src/authenticated-profile-manual-bootstrap.ts
A	apps/worker/src/authenticated-profile-provisioning.ts
A	apps/worker/src/authenticated-profile-store.test.ts
A	apps/worker/src/authenticated-profile-store.ts
A	apps/worker/src/authenticated-surface-diagnostic-provider.test.ts
A	apps/worker/src/authenticated-surface-diagnostic-structure.test.ts
A	apps/worker/src/authenticated-surface-diagnostic-trigger.ts
A	apps/worker/src/authenticated-surface-diagnostic.ts
A	apps/worker/src/authenticated-x-acquisition-request.test.ts
A	apps/worker/src/authenticated-x-acquisition-request.ts
A	apps/worker/src/authenticated-x-acquisition.test.ts
A	apps/worker/src/authenticated-x-acquisition.ts
A	apps/worker/src/bounded-decision-provider.test.ts
A	apps/worker/src/bounded-decision-provider.ts
A	apps/worker/src/bridge-preflight.test.ts
A	apps/worker/src/bridge-preflight.ts
A	apps/worker/src/browser-use-fixture.test.ts
A	apps/worker/src/browser-use-lifecycle.test.ts
A	apps/worker/src/browser-use-run-telemetry.test.ts
A	apps/worker/src/browser-use-run-telemetry.ts
A	apps/worker/src/cloudflare-container-browser-transport.ts
A	apps/worker/src/cloudflare-container-browser.ts
A	apps/worker/src/collector-budget.ts
A	apps/worker/src/connector-authority.ts
A	apps/worker/src/connector-availability.test.ts
A	apps/worker/src/connector-availability.ts
A	apps/worker/src/connector-collection-load.test.ts
A	apps/worker/src/connector-delivery-generation.test.ts
A	apps/worker/src/connector-health.test.ts
A	apps/worker/src/connector-health.ts
A	apps/worker/src/connector-integration-safety.test.ts
A	apps/worker/src/connector-intelligence-turn.test.ts
A	apps/worker/src/connector-intelligence-turn.ts
A	apps/worker/src/connector-paid-fence.test.ts
A	apps/worker/src/connector-paid-fence.ts
A	apps/worker/src/connector-payload.ts
A	apps/worker/src/connector-public-cache.test.ts
A	apps/worker/src/connector-public-cache.ts
A	apps/worker/src/connector-publication-window.test.ts
A	apps/worker/src/connector-publication-window.ts
A	apps/worker/src/connector-queue-config.ts
A	apps/worker/src/connector-read-recovery.test.ts
A	apps/worker/src/connector-read-recovery.ts
A	apps/worker/src/connector-review-continuation.test.ts
A	apps/worker/src/connector-review-continuation.ts
A	apps/worker/src/connector-runtime.test.ts
A	apps/worker/src/connector-runtime.ts
A	apps/worker/src/connector-scale.test.ts
A	apps/worker/src/connector-scheduling.ts
A	apps/worker/src/connector-source.ts
A	apps/worker/src/connector-telegram-lane.ts
A	apps/worker/src/container-source-browser-port.test.ts
A	apps/worker/src/container-source-browser-port.ts
A	apps/worker/src/container-web-operator-browser.test.ts
A	apps/worker/src/container-web-operator-browser.ts
A	apps/worker/src/container-x-timeline-port.ts
A	apps/worker/src/development-feed.ts
A	apps/worker/src/development-pipeline.test.ts
M	apps/worker/src/editions.ts
A	apps/worker/src/feed-product.test.ts
A	apps/worker/src/feed-sketch-jobs.test.ts
A	apps/worker/src/feed-sketch-jobs.ts
M	apps/worker/src/index.test.ts
M	apps/worker/src/index.ts
A	apps/worker/src/ingestion-regressions.test.ts
A	apps/worker/src/live-public-acquisition-smoke.test.ts
A	apps/worker/src/live-public-acquisition-smoke.ts
A	apps/worker/src/live-source-route.test.ts
A	apps/worker/src/mailer.test.ts
M	apps/worker/src/mailer.ts
A	apps/worker/src/manual-briefing.test.ts
A	apps/worker/src/manual-briefing.ts
A	apps/worker/src/migrations-clean.test.ts
A	apps/worker/src/model-availability.integration.test.ts
A	apps/worker/src/native-source-execution.test.ts
A	apps/worker/src/native-source-execution.ts
A	apps/worker/src/news-model.test.ts
A	apps/worker/src/openrouter-model-diagnostic.test.ts
A	apps/worker/src/openrouter-model-diagnostic.ts
A	apps/worker/src/pipeline-trace-api.test.ts
A	apps/worker/src/processing-drain.test.ts
A	apps/worker/src/processing-drain.ts
M	apps/worker/src/processor.ts
A	apps/worker/src/product-feed-discovery.test.ts
A	apps/worker/src/product-feed-discovery.ts
A	apps/worker/src/product-feeds.test.ts
A	apps/worker/src/product-feeds.ts
A	apps/worker/src/provider-outcome.ts
A	apps/worker/src/provider-receipt.test.ts
A	apps/worker/src/provider-receipt.ts
A	apps/worker/src/provider-schema.ts
A	apps/worker/src/provider-stream.ts
A	apps/worker/src/public-acquisition-request.test.ts
A	apps/worker/src/public-acquisition-request.ts
A	apps/worker/src/public-browser-acquisition.test.ts
A	apps/worker/src/public-browser-acquisition.ts
A	apps/worker/src/public-source-discovery.test.ts
A	apps/worker/src/public-source-discovery.ts
A	apps/worker/src/public-source-fetch.test.ts
A	apps/worker/src/public-source-fetch.ts
M	apps/worker/src/publicTelegram.ts
A	apps/worker/src/publication-progress.test.ts
A	apps/worker/src/push-outbox.ts
A	apps/worker/src/push.integration.test.ts
A	apps/worker/src/push.test.ts
A	apps/worker/src/push.ts
A	apps/worker/src/qa-provider-recovery.test.ts
A	apps/worker/src/qa-provider-recovery.ts
M	apps/worker/src/repository.ts
A	apps/worker/src/retained-news-enrollment.ts
A	apps/worker/src/retention.test.ts
M	apps/worker/src/retention.ts
A	apps/worker/src/scheduled-source-acquisition.ts
A	apps/worker/src/self-hosted-bridge-backend.test.ts
A	apps/worker/src/sketch-route.test.ts
A	apps/worker/src/sketches.test.ts
A	apps/worker/src/sketches.ts
A	apps/worker/src/source-acquisition-store.test.ts
A	apps/worker/src/source-acquisition-store.ts
A	apps/worker/src/source-assessment.test.ts
A	apps/worker/src/source-assessment.ts
A	apps/worker/src/source-backend.test.ts
A	apps/worker/src/source-backend.ts
A	apps/worker/src/source-budget.test.ts
A	apps/worker/src/source-catalog.ts
A	apps/worker/src/source-recommendation-fetch.ts
A	apps/worker/src/source-recommendation-flow.test.ts
A	apps/worker/src/source-recommendation-recovery.test.ts
A	apps/worker/src/source-recommendations.test.ts
A	apps/worker/src/source-recommendations.ts
A	apps/worker/src/source-verification-collector.test.ts
A	apps/worker/src/source-verification-collector.ts
A	apps/worker/src/sources-qa.test.ts
A	apps/worker/src/sources-qa.ts
M	apps/worker/src/sources.ts
A	apps/worker/src/staging-assets.test.ts
A	apps/worker/src/staging-assets.ts
A	apps/worker/src/staging.ts
A	apps/worker/src/storage-maintenance.test.ts
A	apps/worker/src/storage-maintenance.ts
A	apps/worker/src/storage-routes.test.ts
A	apps/worker/src/telegram-verification.test.ts
A	apps/worker/src/telegram-verification.ts
M	apps/worker/src/types.ts
A	apps/worker/src/upstream-resource-store.test.ts
A	apps/worker/src/upstream-resource-store.ts
A	apps/worker/src/v1-downstream-runtime.test.ts
A	apps/worker/src/v1-downstream-runtime.ts
A	apps/worker/src/v1-intake/acquisition-lease.ts
A	apps/worker/src/v1-intake/acquisition-router.ts
A	apps/worker/src/v1-intake/acquisition.test.ts
A	apps/worker/src/v1-intake/acquisition.ts
A	apps/worker/src/v1-intake/browser-stages.test.ts
A	apps/worker/src/v1-intake/browser-stages.ts
A	apps/worker/src/v1-intake/canonical.ts
A	apps/worker/src/v1-intake/conflicts.test.ts
A	apps/worker/src/v1-intake/conflicts.ts
A	apps/worker/src/v1-intake/diagnostics.ts
A	apps/worker/src/v1-intake/empty-coverage.test.ts
A	apps/worker/src/v1-intake/evidence.test.ts
A	apps/worker/src/v1-intake/evidence.ts
A	apps/worker/src/v1-intake/index.ts
A	apps/worker/src/v1-intake/intake.test.ts
A	apps/worker/src/v1-intake/intake.ts
A	apps/worker/src/v1-intake/policy.ts
A	apps/worker/src/v1-intake/public-article-http.test.ts
A	apps/worker/src/v1-intake/public-article-http.ts
A	apps/worker/src/v1-intake/publication-date.test.ts
A	apps/worker/src/v1-intake/publication-date.ts
A	apps/worker/src/v1-intake/rss-handoff.ts
A	apps/worker/src/v1-intake/rss-language.test.ts
A	apps/worker/src/v1-intake/store.test.ts
A	apps/worker/src/v1-intake/store.ts
A	apps/worker/src/v1-intake/test-utils.ts
A	apps/worker/src/v1-intake/transaction.ts
A	apps/worker/src/v1-intake/types.ts
A	apps/worker/src/v1-intelligence/action-strength.test.ts
A	apps/worker/src/v1-intelligence/action-strength.ts
A	apps/worker/src/v1-intelligence/adaptive-publication.test.ts
A	apps/worker/src/v1-intelligence/approved-synthesis.test.ts
A	apps/worker/src/v1-intelligence/blocked-briefing.integration.test.ts
A	apps/worker/src/v1-intelligence/blocked-window.ts
A	apps/worker/src/v1-intelligence/briefing-coverage.integration.test.ts
A	apps/worker/src/v1-intelligence/briefing-outcome.ts
A	apps/worker/src/v1-intelligence/causal-bridge.test.ts
A	apps/worker/src/v1-intelligence/claim-spans.test.ts
A	apps/worker/src/v1-intelligence/claims.test.ts
A	apps/worker/src/v1-intelligence/claims.ts
A	apps/worker/src/v1-intelligence/comparative-selection.test.ts
A	apps/worker/src/v1-intelligence/composite-partition.ts
A	apps/worker/src/v1-intelligence/conditional-promotion.test.ts
A	apps/worker/src/v1-intelligence/construction-binding-diagnostics.test.ts
A	apps/worker/src/v1-intelligence/construction-identity.test.ts
A	apps/worker/src/v1-intelligence/construction-transport.test.ts
A	apps/worker/src/v1-intelligence/construction-transport.ts
A	apps/worker/src/v1-intelligence/correction-lifecycle.test.ts
A	apps/worker/src/v1-intelligence/correction-materiality.test.ts
A	apps/worker/src/v1-intelligence/correction-materiality.ts
A	apps/worker/src/v1-intelligence/delivery-coverage.test.ts
A	apps/worker/src/v1-intelligence/delivery-status.ts
A	apps/worker/src/v1-intelligence/dispatch-isolation.test.ts
A	apps/worker/src/v1-intelligence/editorial-blocker-successor.test.ts
A	apps/worker/src/v1-intelligence/editorial-blocker-successor.ts
A	apps/worker/src/v1-intelligence/editorial-context.test.ts
A	apps/worker/src/v1-intelligence/editorial-context.ts
A	apps/worker/src/v1-intelligence/editorial-continuation.test.ts
A	apps/worker/src/v1-intelligence/editorial-continuation.ts
A	apps/worker/src/v1-intelligence/editorial-evaluation.test.ts
A	apps/worker/src/v1-intelligence/editorial-evaluation.ts
A	apps/worker/src/v1-intelligence/editorial-facts.test.ts
A	apps/worker/src/v1-intelligence/editorial-fixes-canary.test.ts
A	apps/worker/src/v1-intelligence/editorial-global-context.ts
A	apps/worker/src/v1-intelligence/editorial-input-size.test.ts
A	apps/worker/src/v1-intelligence/editorial-keyed.test.ts
A	apps/worker/src/v1-intelligence/editorial-normalization.test.ts
A	apps/worker/src/v1-intelligence/editorial-obligation-contract.test.ts
A	apps/worker/src/v1-intelligence/editorial-plan.integration.test.ts
A	apps/worker/src/v1-intelligence/editorial-plan.test.ts
A	apps/worker/src/v1-intelligence/editorial-plan.ts
A	apps/worker/src/v1-intelligence/editorial-ranking.ts
A	apps/worker/src/v1-intelligence/editorial-repeat-contract.test.ts
A	apps/worker/src/v1-intelligence/editorial-replay.ts
A	apps/worker/src/v1-intelligence/editorial-selection.test.ts
A	apps/worker/src/v1-intelligence/editorial-transport-capacity.test.ts
A	apps/worker/src/v1-intelligence/editorial-transport.ts
A	apps/worker/src/v1-intelligence/editorial-work.ts
A	apps/worker/src/v1-intelligence/editorial.test.ts
A	apps/worker/src/v1-intelligence/editorial.ts
A	apps/worker/src/v1-intelligence/engine.test.ts
A	apps/worker/src/v1-intelligence/engine.ts
A	apps/worker/src/v1-intelligence/event-owned-fallback.test.ts
A	apps/worker/src/v1-intelligence/extraction-upgrade.test.ts
A	apps/worker/src/v1-intelligence/extraction-upgrade.ts
A	apps/worker/src/v1-intelligence/feed-fit-closeout.test.ts
A	apps/worker/src/v1-intelligence/fidelity.test.ts
A	apps/worker/src/v1-intelligence/fidelity.ts
A	apps/worker/src/v1-intelligence/fixtures/ai-overload-40.json
A	apps/worker/src/v1-intelligence/fixtures/construction-binding-20261013.json
A	apps/worker/src/v1-intelligence/fixtures/construction-identity-20261007.json
A	apps/worker/src/v1-intelligence/fixtures/construction-relation-20261007.json
A	apps/worker/src/v1-intelligence/fixtures/novelty-attempt-20261007.json
A	apps/worker/src/v1-intelligence/fixtures/oct11-rejected-repeat-proposals.json
A	apps/worker/src/v1-intelligence/fixtures/overnight-feed-fit.json
A	apps/worker/src/v1-intelligence/fixtures/overnight-hermes-plan.json
A	apps/worker/src/v1-intelligence/fixtures/overnight-mixed-verifier.json
A	apps/worker/src/v1-intelligence/fixtures/planner-schema-20261013.json
A	apps/worker/src/v1-intelligence/fixtures/staging-0200-oversized-editorial.json
A	apps/worker/src/v1-intelligence/fixtures/staging-1600-duplicate-candidate.json
A	apps/worker/src/v1-intelligence/fixtures/staging-1800-oversized-shortlist.json
A	apps/worker/src/v1-intelligence/fixtures/staging-2000-oversized-input.json
A	apps/worker/src/v1-intelligence/fixtures/staging-anthropic-report-date.json
A	apps/worker/src/v1-intelligence/fixtures/staging-approximate-quantity.json
A	apps/worker/src/v1-intelligence/fixtures/staging-causal-bridge.json
A	apps/worker/src/v1-intelligence/fixtures/staging-construction-slot.json
A	apps/worker/src/v1-intelligence/fixtures/staging-correction-verifier-budget.json
A	apps/worker/src/v1-intelligence/fixtures/staging-deferred-correction.json
A	apps/worker/src/v1-intelligence/fixtures/staging-editorial-invalid-treatment.json
A	apps/worker/src/v1-intelligence/fixtures/staging-editorial-timeout.json
A	apps/worker/src/v1-intelligence/fixtures/staging-google-report-date.json
A	apps/worker/src/v1-intelligence/fixtures/staging-jev-effect.json
A	apps/worker/src/v1-intelligence/fixtures/staging-midnight-missing-required.json
A	apps/worker/src/v1-intelligence/fixtures/staging-openai-revenue-report-date.json
A	apps/worker/src/v1-intelligence/fixtures/staging-partitive-quantity.json
A	apps/worker/src/v1-intelligence/fixtures/staging-planner-reference-categories.json
A	apps/worker/src/v1-intelligence/fixtures/staging-publication-withdrawals.json
A	apps/worker/src/v1-intelligence/fixtures/staging-temporal-false-pass.json
A	apps/worker/src/v1-intelligence/fixtures/staging-temporal-framing.json
A	apps/worker/src/v1-intelligence/fixtures/staging-writer-ordinal-dates.json
A	apps/worker/src/v1-intelligence/freshness.test.ts
A	apps/worker/src/v1-intelligence/freshness.ts
A	apps/worker/src/v1-intelligence/grounding-closeout.test.ts
A	apps/worker/src/v1-intelligence/headline-closeout.test.ts
A	apps/worker/src/v1-intelligence/hermes-reader-state.test.ts
A	apps/worker/src/v1-intelligence/indefinite-publication.test.ts
A	apps/worker/src/v1-intelligence/indefinite-quantity.test.ts
A	apps/worker/src/v1-intelligence/information-sufficiency.test.ts
A	apps/worker/src/v1-intelligence/language.test.ts
A	apps/worker/src/v1-intelligence/language.ts
A	apps/worker/src/v1-intelligence/ledger.test.ts
A	apps/worker/src/v1-intelligence/ledger.ts
A	apps/worker/src/v1-intelligence/matchers.test.ts
A	apps/worker/src/v1-intelligence/matchers.ts
A	apps/worker/src/v1-intelligence/material-delta.test.ts
A	apps/worker/src/v1-intelligence/material-delta.ts
A	apps/worker/src/v1-intelligence/model-capacity.test.ts
A	apps/worker/src/v1-intelligence/model-capacity.ts
A	apps/worker/src/v1-intelligence/model-quarantine.test.ts
A	apps/worker/src/v1-intelligence/model-quarantine.ts
A	apps/worker/src/v1-intelligence/model-reconciliation.test.ts
A	apps/worker/src/v1-intelligence/model-reconciliation.ts
A	apps/worker/src/v1-intelligence/model-spending-amendments.test.ts
A	apps/worker/src/v1-intelligence/model-spending-amendments.ts
A	apps/worker/src/v1-intelligence/model-spending.integration.test.ts
A	apps/worker/src/v1-intelligence/model-spending.test.ts
A	apps/worker/src/v1-intelligence/model-spending.ts
A	apps/worker/src/v1-intelligence/model.test.ts
A	apps/worker/src/v1-intelligence/model.ts
A	apps/worker/src/v1-intelligence/multi-story-capacity.test.ts
A	apps/worker/src/v1-intelligence/novelty-verifier.test.ts
A	apps/worker/src/v1-intelligence/operation-timing.test.ts
A	apps/worker/src/v1-intelligence/operation-timing.ts
A	apps/worker/src/v1-intelligence/overflow-fairness.test.ts
A	apps/worker/src/v1-intelligence/partial-publication.test.ts
A	apps/worker/src/v1-intelligence/pipeline-trace-cli.test.ts
A	apps/worker/src/v1-intelligence/pipeline-trace-sources.test.ts
A	apps/worker/src/v1-intelligence/pipeline-trace-sources.ts
A	apps/worker/src/v1-intelligence/pipeline-trace.test.ts
A	apps/worker/src/v1-intelligence/pipeline-trace.ts
A	apps/worker/src/v1-intelligence/plan-support.test.ts
A	apps/worker/src/v1-intelligence/planner-fact-capabilities.test.ts
A	apps/worker/src/v1-intelligence/planning-capacity.ts
A	apps/worker/src/v1-intelligence/policies.test.ts
A	apps/worker/src/v1-intelligence/policies.ts
A	apps/worker/src/v1-intelligence/preservation.test.ts
A	apps/worker/src/v1-intelligence/product-core-compatibility.test.ts
A	apps/worker/src/v1-intelligence/product.test.ts
A	apps/worker/src/v1-intelligence/product.ts
A	apps/worker/src/v1-intelligence/protected-planner-contract.test.ts
A	apps/worker/src/v1-intelligence/provider-outcome.test.ts
A	apps/worker/src/v1-intelligence/provider-recovery.test.ts
A	apps/worker/src/v1-intelligence/provider-recovery.ts
A	apps/worker/src/v1-intelligence/provider-schema.test.ts
A	apps/worker/src/v1-intelligence/provisional-closeout.test.ts
A	apps/worker/src/v1-intelligence/public-read-batching.test.ts
A	apps/worker/src/v1-intelligence/public-read.ts
A	apps/worker/src/v1-intelligence/publication-packets.ts
A	apps/worker/src/v1-intelligence/publication-precheck-isolation.test.ts
A	apps/worker/src/v1-intelligence/publication.test.ts
A	apps/worker/src/v1-intelligence/publication.ts
A	apps/worker/src/v1-intelligence/quiet-coverage-atomic.test.ts
A	apps/worker/src/v1-intelligence/reader-history-witness.test.ts
A	apps/worker/src/v1-intelligence/reader-history.ts
A	apps/worker/src/v1-intelligence/reader-novelty-age.test.ts
A	apps/worker/src/v1-intelligence/rematch-accounting.test.ts
A	apps/worker/src/v1-intelligence/rematch-budget.test.ts
A	apps/worker/src/v1-intelligence/rematch-immutable.test.ts
A	apps/worker/src/v1-intelligence/rematch-recovery.test.ts
A	apps/worker/src/v1-intelligence/rematch.ts
A	apps/worker/src/v1-intelligence/review-prefetch.test.ts
A	apps/worker/src/v1-intelligence/review-prefetch.ts
A	apps/worker/src/v1-intelligence/rss-canary-live.test.ts
A	apps/worker/src/v1-intelligence/rss-canary-test-support.ts
A	apps/worker/src/v1-intelligence/rss-canary.test.ts
A	apps/worker/src/v1-intelligence/rss-canary.ts
A	apps/worker/src/v1-intelligence/rss-pipeline.test.ts
A	apps/worker/src/v1-intelligence/runtime.test.ts
A	apps/worker/src/v1-intelligence/runtime.ts
A	apps/worker/src/v1-intelligence/salience-cache.ts
A	apps/worker/src/v1-intelligence/salience-persistence.test.ts
A	apps/worker/src/v1-intelligence/salience-persistence.ts
A	apps/worker/src/v1-intelligence/salience-router.test.ts
A	apps/worker/src/v1-intelligence/salience-router.ts
A	apps/worker/src/v1-intelligence/salience-runtime.test.ts
A	apps/worker/src/v1-intelligence/salience-runtime.ts
A	apps/worker/src/v1-intelligence/salience.test.ts
A	apps/worker/src/v1-intelligence/salience.ts
A	apps/worker/src/v1-intelligence/schedule-audit.ts
A	apps/worker/src/v1-intelligence/schedule.test.ts
A	apps/worker/src/v1-intelligence/schedule.ts
A	apps/worker/src/v1-intelligence/scheduled-writer.test.ts
A	apps/worker/src/v1-intelligence/schema-test-utils.ts
A	apps/worker/src/v1-intelligence/scoring.test.ts
A	apps/worker/src/v1-intelligence/scoring.ts
A	apps/worker/src/v1-intelligence/selection-quality.test.ts
A	apps/worker/src/v1-intelligence/selection-support-prefetch.test.ts
A	apps/worker/src/v1-intelligence/self-contained.test.ts
A	apps/worker/src/v1-intelligence/self-contained.ts
A	apps/worker/src/v1-intelligence/semantic-admission.test.ts
A	apps/worker/src/v1-intelligence/semantic-admission.ts
A	apps/worker/src/v1-intelligence/semantic-budget.test.ts
A	apps/worker/src/v1-intelligence/semantic-catalog.test.ts
A	apps/worker/src/v1-intelligence/semantic-citation-coverage.test.ts
A	apps/worker/src/v1-intelligence/semantic-construction-repair.test.ts
A	apps/worker/src/v1-intelligence/semantic-construction-repair.ts
A	apps/worker/src/v1-intelligence/semantic-construction.ts
A	apps/worker/src/v1-intelligence/semantic-continuation.test.ts
A	apps/worker/src/v1-intelligence/semantic-continuation.ts
A	apps/worker/src/v1-intelligence/semantic-coverage.test.ts
A	apps/worker/src/v1-intelligence/semantic-model.test.ts
A	apps/worker/src/v1-intelligence/semantic-model.ts
A	apps/worker/src/v1-intelligence/semantic-observability.test.ts
A	apps/worker/src/v1-intelligence/semantic-observability.ts
A	apps/worker/src/v1-intelligence/semantic-operations.test.ts
A	apps/worker/src/v1-intelligence/semantic-operations.ts
A	apps/worker/src/v1-intelligence/semantic-persistence.test.ts
A	apps/worker/src/v1-intelligence/semantic-preparation.test.ts
A	apps/worker/src/v1-intelligence/semantic-preparation.ts
A	apps/worker/src/v1-intelligence/semantic-provider.test.ts
A	apps/worker/src/v1-intelligence/semantic-provider.ts
A	apps/worker/src/v1-intelligence/semantic-read-cost.test.ts
A	apps/worker/src/v1-intelligence/semantic-relations.test.ts
A	apps/worker/src/v1-intelligence/semantic-replay.test.ts
A	apps/worker/src/v1-intelligence/semantic-reuse-settlement.test.ts
A	apps/worker/src/v1-intelligence/semantic-routing.test.ts
A	apps/worker/src/v1-intelligence/semantic-routing.ts
A	apps/worker/src/v1-intelligence/semantic-scheduling.test.ts
A	apps/worker/src/v1-intelligence/semantic-settlement.ts
A	apps/worker/src/v1-intelligence/semantic-state.test.ts
A	apps/worker/src/v1-intelligence/semantic-state.ts
A	apps/worker/src/v1-intelligence/semantic-wait-record.ts
A	apps/worker/src/v1-intelligence/semantic-work-lease.test.ts
A	apps/worker/src/v1-intelligence/semantic-work-lease.ts
A	apps/worker/src/v1-intelligence/shortlist-audit.ts
A	apps/worker/src/v1-intelligence/shortlist.integration.test.ts
A	apps/worker/src/v1-intelligence/shortlist.test.ts
A	apps/worker/src/v1-intelligence/shortlist.ts
A	apps/worker/src/v1-intelligence/soak-quality-regressions.test.ts
A	apps/worker/src/v1-intelligence/source-bound-reader-history.test.ts
A	apps/worker/src/v1-intelligence/staging-editorial-regression.test.ts
A	apps/worker/src/v1-intelligence/staging-editorial-treatment.test.ts
A	apps/worker/src/v1-intelligence/staging-jev-regression.test.ts
A	apps/worker/src/v1-intelligence/store.test.ts
A	apps/worker/src/v1-intelligence/store.ts
A	apps/worker/src/v1-intelligence/temporal-framing.test.ts
A	apps/worker/src/v1-intelligence/temporal-publication.test.ts
A	apps/worker/src/v1-intelligence/test-utils.ts
A	apps/worker/src/v1-intelligence/treatment.test.ts
A	apps/worker/src/v1-intelligence/types.ts
A	apps/worker/src/v1-intelligence/unknown-concurrency.test.ts
A	apps/worker/src/v1-intelligence/verification-occurrences.test.ts
A	apps/worker/src/v1-intelligence/verification-packets.test.ts
A	apps/worker/src/v1-intelligence/verification-packets.ts
A	apps/worker/src/v1-intelligence/window-coverage.ts
A	apps/worker/src/v1-intelligence/writer-feedback.test.ts
A	apps/worker/src/v1-intelligence/writer-feedback.ts
A	apps/worker/src/v1-intelligence/writer-plan.test.ts
A	apps/worker/src/v1-intelligence/writer-wire.test.ts
A	apps/worker/src/v1-intelligence/writer-wire.ts
A	apps/worker/src/v1-queue-dispatch.test.ts
A	apps/worker/src/v1-queue-dispatch.ts
A	apps/worker/src/web-operator-admission.test.ts
A	apps/worker/src/web-operator-admission.ts
A	apps/worker/src/web-operator-runtime.test.ts
A	apps/worker/src/web-operator-runtime.ts
A	apps/worker/src/web-operator-workflow-store.test.ts
A	apps/worker/src/web-operator-workflow-store.ts
A	apps/worker/src/x-ingestion-functional.test.ts
M	apps/worker/tsconfig.json
M	apps/worker/vitest.config.ts
A	apps/worker/worker-configuration.d.ts
A	apps/worker/wrangler.joud.jsonc
A	apps/worker/wrangler.sources-qa.toml
A	apps/worker/wrangler.staging.toml
M	apps/worker/wrangler.toml
A	docs/APPLE_UI.md
A	docs/FRONTEND_PRODUCT_MAIN2_CHECKPOINT.md
A	docs/FRONTEND_PRODUCT_MAIN2_REPORT.md
A	docs/WEB_APP_AND_NOTIFICATIONS.md
A	docs/acquisition-evaluation.md
A	docs/approved-fact-synthesis-proof.md
A	docs/news-pipeline.md
A	docs/openrouter-staging-proof.md
A	docs/planning/Distilled.news_Plan_v1.3.zip
A	docs/planning/Distilled_v1.5_document_pack.zip
A	docs/planning/v1.3/ACQUISITION_BENCHMARK_RUNBOOK_v1.3.md
A	docs/planning/v1.3/ARCHITECTURE_BASELINE_v1.3.md
A	docs/planning/v1.3/DOCUMENT_MANIFEST.json
A	docs/planning/v1.3/IMPLEMENTATION_PLAN_v1.3.md
A	docs/planning/v1.3/README.md
A	docs/planning/v1.3/REVIEW_AND_CHANGELOG_v1.3.md
A	docs/planning/v1.3/TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.3.md
A	docs/planning/v1.5/ACQUISITION_BENCHMARK_RUNBOOK_v1.5.md
A	docs/planning/v1.5/ARCHITECTURE_BASELINE_v1.5.md
A	docs/planning/v1.5/DISTILLED_AGENT_RUNTIME_AND_WEB_OPERATOR_ARCHITECTURE_v1.5.md
A	docs/planning/v1.5/DOCUMENT_MANIFEST_v1.5.json
A	docs/planning/v1.5/FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md
A	docs/planning/v1.5/IMPLEMENTATION_PLAN_v1.5.md
A	docs/planning/v1.5/PROJECT_PROBLEM_AND_VALIDATION_v1.5.md
A	docs/planning/v1.5/README.md
A	docs/planning/v1.5/REVIEW_AND_CHANGELOG_v1.5.md
A	docs/planning/v1.5/TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md
A	docs/staging-integration-report.md
A	docs/staging-integration.md
A	docs/superpowers/plans/2026-10-03-v1-acquisition-integration.md
A	docs/superpowers/plans/2026-10-03-v1-downstream-intake.md
A	docs/superpowers/plans/2026-10-03-v1-intelligence.md
A	docs/superpowers/plans/2026-10-04-distillation-editorial-v1.md
A	docs/superpowers/plans/2026-10-04-semantic-core.md
A	docs/superpowers/plans/2026-10-15-backend-sources-ai-editorial.md
A	documentation/ACQUISITION_BENCHMARK_RUNBOOK_v1.2.md
A	documentation/ARCHITECTURE_BASELINE_v1.2.md
A	documentation/ARCHITECTURE_v1.md
A	documentation/BRANCH_FIXES_2026_10_09.md
A	documentation/CONNECTOR_FOLLOWUPS_2026_10_09.md
A	documentation/CONNECTOR_MERGE_2026-10-02.md
A	documentation/CONNECTOR_SCALE_1000.md
A	documentation/CONNECTOR_V15_INTERFACE.md
A	documentation/DISTILLED_VPS_TO_ACQUISITION_BENCHMARK_FULL_GUIDE.md
A	documentation/EDITORIAL_FIXES_CANARY_2026-10-04.md
A	documentation/EXTERNAL_TESTING_A_TO_Z.md
A	documentation/FIVE_FEED_QA_VALIDATION_2026_10_15.md
A	documentation/GOOGLE_NEWS_ALTERNATIVE_REVIEW.md
A	documentation/IMPLEMENTATION_PLAN_v1.2.md
A	documentation/INTEGRATION_FULL_STACK_2026_10_11.md
A	documentation/INTEGRATION_SOURCES_AI_EDITORIAL.md
A	documentation/JOUD_DEPLOYMENT.md
A	documentation/LIVE_RSS_OPENROUTER_PROOF_2026-10-04.md
A	documentation/MIXED_SOURCE_FIXES_2026_10_15.md
A	documentation/MULTI_SOURCE_ACTIVATION_JOUD.md
A	documentation/OUTLOOK_QA_EMAIL_SETUP.md
A	documentation/PARALLEL_IMPLEMENTATION_AGREEMENT.md
A	documentation/PRODUCTION_READINESS_2026_10_10.md
A	documentation/QA_BRIEF_NOW_2026_10_11.md
A	documentation/QA_MERGED_DEPLOYMENT_2026_10_11.md
A	documentation/QA_SOURCE_BUDGETS_2026_10_11.md
A	documentation/QA_SOURCE_FIXES_2026_10_16.md
A	documentation/QA_VERIFICATION_ROLLOUT_2026_10_10.md
A	documentation/README.md
A	documentation/REAL_RSS_EDITORIAL_CANARY_2026-10-04.md
A	documentation/REVIEW_DATE_FOLLOWUP_2026_10_15.md
A	documentation/RSS_SOURCE_INTEGRATION.md
A	documentation/SCRAPER_AND_API_EVALUATION_PLAN.md
A	documentation/SCRAPER_TESTING_STEPS.md
A	documentation/SEMANTIC_CORE_IMPLEMENTATION.md
A	documentation/SEMANTIC_CORE_SPEC.md
A	documentation/SOURCES_QA_LIVE_2026_10_09.md
A	documentation/SOURCE_GAPS_IMPLEMENTATION_2026_10_10.md
A	documentation/SOURCE_PROVIDER_INTEGRATION.md
A	documentation/SOURCE_RECOMMENDATIONS_VALIDATION_2026_10_21.md
A	documentation/SPACE_SOURCE_REPAIR_2026_10_10.md
A	documentation/STORAGE_OPERATIONS.md
A	documentation/STORAGE_VALIDATION_2026_10_21.md
A	documentation/TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.2.md
A	documentation/TELEGRAM_GOOGLE_FRESHNESS_FIX_2026_10_10.md
A	documentation/USER_FEED_COLLECTION_CHECK_2026_10_10.md
A	documentation/V1_ACQUISITION_EXECUTION.md
A	documentation/V1_DOWNSTREAM_HANDOFF.md
A	documentation/V1_EDITORIAL_BEHAVIOR.md
A	documentation/V1_FEED_INTELLIGENCE.md
A	documentation/V1_PUBLICATION_EXECUTION.md
A	documentation/V1_RUNTIME_CHECKPOINT.md
A	documentation/VPS_TESTING_EXECUTION_LOG.md
A	documentation/X_QA_VERIFICATION_2026_10_10.md
A	documentation/example telegram.md
A	documentation/general image.md
A	documentation/google-news-trial.input.json
A	documentation/testing-evidence/CAMPAIGN_HANDOFF.md
A	documentation/testing-evidence/README.md
A	documentation/testing-evidence/STAGE2_STATUS.md
A	documentation/testing-evidence/STAGE3_PAID_STATUS.md
A	documentation/testing-evidence/STAGE3_STATUS.md
A	documentation/testing-evidence/X_ALTERNATIVES_COMPARISON.md
A	documentation/testing-evidence/X_TERMS_TEST_SCOPE.md
A	documentation/testing-evidence/audit-controlled-telegram.py
A	documentation/testing-evidence/audit-controlled-web.py
A	documentation/testing-evidence/check-edit-sql.py
A	documentation/testing-evidence/check-stage3-free.py
A	documentation/testing-evidence/check-stage3-paid.py
A	documentation/testing-evidence/close-controlled-google.py
A	documentation/testing-evidence/controlled-maintenance.py
A	documentation/testing-evidence/fix-browser-challenge.py
A	documentation/testing-evidence/fix-telegram-preview.py
A	documentation/testing-evidence/linkedin-pilot-run.py
A	documentation/testing-evidence/replay-linkedin-pilot.py
A	documentation/testing-evidence/review-controlled-feeds.py
A	documentation/testing-evidence/review-controlled-linkedin.py
A	documentation/testing-evidence/review-controlled-x.py
A	documentation/testing-evidence/review-web-boilerplate.py
A	documentation/testing-evidence/review-web-paragraphs.py
A	documentation/testing-evidence/run-controlled-browser.py
A	documentation/testing-evidence/run-controlled-free.py
A	documentation/testing-evidence/run-controlled-google-matched.py
A	documentation/testing-evidence/run-controlled-linkedin.py
A	documentation/testing-evidence/run-controlled-web.py
A	documentation/testing-evidence/run-controlled-x-alternatives.py
A	documentation/testing-evidence/run-controlled-zyte.py
A	documentation/testing-evidence/run-telegram-additions.py
A	documentation/testing-evidence/stage3-fairness-audit.py
A	documentation/testing-evidence/stage3-paid-worker.py
A	documentation/testing-evidence/start-stage3-free.py
A	documentation/testing-evidence/start-stage3-paid.py
A	documentation/testing-evidence/sync-linkedin-fix.py
A	documentation/testing-evidence/test_stage3_paid_worker.py
A	documentation/testing-evidence/twitterapi-io-pilot.py
A	documentation/testing-evidence/x-search-functional-run.py
A	evaluation/acquisition-benchmark/.gitattributes
A	evaluation/acquisition-benchmark/.gitignore
A	evaluation/acquisition-benchmark/README.md
A	evaluation/acquisition-benchmark/SERVER_START_HERE.md
A	evaluation/acquisition-benchmark/bench/__init__.py
A	evaluation/acquisition-benchmark/bench/__main__.py
A	evaluation/acquisition-benchmark/bench/adapters.py
A	evaluation/acquisition-benchmark/bench/campaign.py
A	evaluation/acquisition-benchmark/bench/cli.py
A	evaluation/acquisition-benchmark/bench/config.py
A	evaluation/acquisition-benchmark/bench/extractors/__init__.py
A	evaluation/acquisition-benchmark/bench/extractors/metadata.py
A	evaluation/acquisition-benchmark/bench/faults.py
A	evaluation/acquisition-benchmark/bench/gold.py
A	evaluation/acquisition-benchmark/bench/metrics.py
A	evaluation/acquisition-benchmark/bench/network.py
A	evaluation/acquisition-benchmark/bench/processing.py
A	evaluation/acquisition-benchmark/bench/records.py
A	evaluation/acquisition-benchmark/bench/reporting.py
A	evaluation/acquisition-benchmark/bench/routes/__init__.py
A	evaluation/acquisition-benchmark/bench/routes/brightdata_unlocker.py
A	evaluation/acquisition-benchmark/bench/routes/browser_playwright.py
A	evaluation/acquisition-benchmark/bench/routes/common.py
A	evaluation/acquisition-benchmark/bench/routes/direct_http.py
A	evaluation/acquisition-benchmark/bench/routes/zyte_http.py
A	evaluation/acquisition-benchmark/bench/runner.py
A	evaluation/acquisition-benchmark/bench/safety.py
A	evaluation/acquisition-benchmark/bench/score.py
A	evaluation/acquisition-benchmark/bench/state.py
A	evaluation/acquisition-benchmark/bench/storage.py
A	evaluation/acquisition-benchmark/bench/transform_worker.py
A	evaluation/acquisition-benchmark/bench/validator.py
A	evaluation/acquisition-benchmark/configs/combined-campaign.json
A	evaluation/acquisition-benchmark/configs/offline-demo.json
A	evaluation/acquisition-benchmark/configs/stage1-pilot.json
A	evaluation/acquisition-benchmark/configs/stage2-controlled.json
A	evaluation/acquisition-benchmark/configs/stage3-soak.json
A	evaluation/acquisition-benchmark/constraints.txt
A	evaluation/acquisition-benchmark/credentials.env.example
A	evaluation/acquisition-benchmark/fixtures/article.gold.json
A	evaluation/acquisition-benchmark/fixtures/article.html
A	evaluation/acquisition-benchmark/fixtures/article.json
A	evaluation/acquisition-benchmark/fixtures/blocked.html
A	evaluation/acquisition-benchmark/fixtures/generic.json
A	evaluation/acquisition-benchmark/fixtures/google.json
A	evaluation/acquisition-benchmark/fixtures/linkedin.gold.json
A	evaluation/acquisition-benchmark/fixtures/linkedin.json
A	evaluation/acquisition-benchmark/fixtures/rss.gold.json
A	evaluation/acquisition-benchmark/fixtures/rss.xml
A	evaluation/acquisition-benchmark/fixtures/telegram.gold.json
A	evaluation/acquisition-benchmark/fixtures/telegram.html
A	evaluation/acquisition-benchmark/fixtures/telethon.json
A	evaluation/acquisition-benchmark/fixtures/x-apify.json
A	evaluation/acquisition-benchmark/fixtures/x.gold.json
A	evaluation/acquisition-benchmark/fixtures/x.json
A	evaluation/acquisition-benchmark/node/package-lock.json
A	evaluation/acquisition-benchmark/node/package.json
A	evaluation/acquisition-benchmark/node/transform.mjs
A	evaluation/acquisition-benchmark/ops/README.md
A	evaluation/acquisition-benchmark/ops/distilled-bench.service
A	evaluation/acquisition-benchmark/pyproject.toml
A	evaluation/acquisition-benchmark/scripts/build_examples.py
A	evaluation/acquisition-benchmark/scripts/campaign_batch.py
A	evaluation/acquisition-benchmark/scripts/replay_cnn_error.py
A	evaluation/acquisition-benchmark/scripts/replay_rss_pilot.py
A	evaluation/acquisition-benchmark/scripts/replay_telegram_pilot.py
A	evaluation/acquisition-benchmark/scripts/replay_telethon_pilot.py
A	evaluation/acquisition-benchmark/scripts/setup-server.sh
A	evaluation/acquisition-benchmark/tests/test_article_metadata.py
A	evaluation/acquisition-benchmark/tests/test_campaign_batch.py
A	evaluation/acquisition-benchmark/tests/test_connection_fallback.py
A	evaluation/acquisition-benchmark/tests/test_decision_readiness.py
A	evaluation/acquisition-benchmark/tests/test_direct_http.py
A	evaluation/acquisition-benchmark/tests/test_feed_gate_and_cache.py
A	evaluation/acquisition-benchmark/tests/test_gold_and_baselines.py
A	evaluation/acquisition-benchmark/tests/test_infrastructure.py
A	evaluation/acquisition-benchmark/tests/test_null_article_fields.py
A	evaluation/acquisition-benchmark/tests/test_records.py
A	evaluation/acquisition-benchmark/tests/test_recovery.py
A	evaluation/acquisition-benchmark/tests/test_review_regressions.py
A	evaluation/acquisition-benchmark/tests/test_rss_pilot_fixes.py
A	evaluation/acquisition-benchmark/tests/test_safety.py
A	evaluation/acquisition-benchmark/tests/test_server_review_fixes.py
A	evaluation/acquisition-benchmark/tests/test_storage.py
A	evaluation/acquisition-benchmark/tests/test_telegram_preview_inventory.py
A	evaluation/acquisition-benchmark/tests/test_telethon_fields.py
A	evaluation/acquisition-benchmark/tests/test_website_routes.py
A	evaluation/editorial-v1/README.md
A	evaluation/editorial-v1/inputs.v1.json
A	implementation/ACQUISITION_BENCHMARK_IMPLEMENTATION.md
M	package.json
A	packages/agent-runtime/README.md
A	packages/agent-runtime/package.json
A	packages/agent-runtime/src/acquisition-router.ts
A	packages/agent-runtime/src/admission.ts
A	packages/agent-runtime/src/auth-profile.ts
A	packages/agent-runtime/src/authenticated-browser-bridge.ts
A	packages/agent-runtime/src/authenticated-site.ts
A	packages/agent-runtime/src/authenticated-source-workflow.ts
A	packages/agent-runtime/src/bounded-decision.ts
A	packages/agent-runtime/src/bridge-preflight.ts
A	packages/agent-runtime/src/browser-use-discovery.ts
A	packages/agent-runtime/src/browser.ts
A	packages/agent-runtime/src/budget.ts
A	packages/agent-runtime/src/challenge-classifier.ts
A	packages/agent-runtime/src/challenge-coordinator.ts
A	packages/agent-runtime/src/closed-loop.ts
A	packages/agent-runtime/src/completion.ts
A	packages/agent-runtime/src/contracts.ts
A	packages/agent-runtime/src/evaluation.ts
A	packages/agent-runtime/src/http-html-acquisition.ts
A	packages/agent-runtime/src/index.ts
A	packages/agent-runtime/src/model.ts
A	packages/agent-runtime/src/observations.ts
A	packages/agent-runtime/src/openrouter-diagnostic.ts
A	packages/agent-runtime/src/origin.ts
A	packages/agent-runtime/src/persistence.ts
A	packages/agent-runtime/src/policy.ts
A	packages/agent-runtime/src/product-loop.ts
A	packages/agent-runtime/src/production-source-acquisition-service.ts
A	packages/agent-runtime/src/production-web-operator-adapter.ts
A	packages/agent-runtime/src/public-source-stages.ts
A	packages/agent-runtime/src/rss-acquisition.ts
A	packages/agent-runtime/src/runtime.ts
A	packages/agent-runtime/src/source-acquisition-orchestrator.ts
A	packages/agent-runtime/src/source-browser-workflow.ts
A	packages/agent-runtime/src/state-machine.ts
A	packages/agent-runtime/src/temporal-acquisition.ts
A	packages/agent-runtime/src/tools.ts
A	packages/agent-runtime/src/upstream-resource.ts
A	packages/agent-runtime/src/workflow.ts
A	packages/agent-runtime/src/x-timeline-evidence.ts
A	packages/agent-runtime/test/authenticated-profile.test.ts
A	packages/agent-runtime/test/authenticated-source-workflow.test.ts
A	packages/agent-runtime/test/browser-use-discovery.test.ts
A	packages/agent-runtime/test/browser.integration.test.ts
A	packages/agent-runtime/test/challenge-classifier.test.ts
A	packages/agent-runtime/test/challenge-coordinator.test.ts
A	packages/agent-runtime/test/closed-loop-lifecycle.test.ts
A	packages/agent-runtime/test/hostile-fixture.ts
A	packages/agent-runtime/test/http-html-acquisition.test.ts
A	packages/agent-runtime/test/kernel.test.ts
A	packages/agent-runtime/test/openrouter-diagnostic.test.ts
A	packages/agent-runtime/test/openrouter-live.smoke.test.ts
A	packages/agent-runtime/test/origin.test.ts
A	packages/agent-runtime/test/production-source-acquisition-service.test.ts
A	packages/agent-runtime/test/production-web-operator-adapter.test.ts
A	packages/agent-runtime/test/public-acquisition-live.smoke.test.ts
A	packages/agent-runtime/test/public-source-stages.test.ts
A	packages/agent-runtime/test/redirect-hops.integration.test.ts
A	packages/agent-runtime/test/rss-acquisition.test.ts
A	packages/agent-runtime/test/runtime-timeout.test.ts
A	packages/agent-runtime/test/source-acquisition-orchestrator.test.ts
A	packages/agent-runtime/test/source-browser-workflow.test.ts
A	packages/agent-runtime/test/temporal-acquisition.test.ts
A	packages/agent-runtime/test/trusted-browser-api-guard.test.ts
A	packages/agent-runtime/test/workflow-lifecycle.test.ts
A	packages/agent-runtime/test/x-timeline-evidence.test.ts
A	packages/agent-runtime/tsconfig.json
A	packages/agent-runtime/vitest.config.ts
A	packages/browser-bridge/README.md
A	packages/browser-bridge/browser_use_discovery.py
A	packages/browser-bridge/package.json
A	packages/browser-bridge/preflight/run-preflight.ts
A	packages/browser-bridge/preflight/run-synthetic-sites.ts
A	packages/browser-bridge/preflight/synthetic-sites.ts
A	packages/browser-bridge/src/bounded-browser-decision.ts
A	packages/browser-bridge/src/manual-bootstrap.ts
A	packages/browser-bridge/src/server.ts
A	packages/browser-bridge/src/service.ts
A	packages/browser-bridge/test/auth-surface-readiness.test.ts
A	packages/browser-bridge/test/authenticated-source-ingress.test.ts
A	packages/browser-bridge/test/bounded-browser-decision.test.ts
A	packages/browser-bridge/test/bridge.adversarial.test.ts
A	packages/browser-bridge/test/bridge.integration.test.ts
A	packages/browser-bridge/test/bridge.preflight.test.ts
A	packages/browser-bridge/test/bridge.secret-leak.test.ts
A	packages/browser-bridge/test/browser-use-ingress.test.ts
A	packages/browser-bridge/test/support.ts
A	packages/browser-bridge/test/synthetic-site.ts
A	packages/browser-bridge/test_browser_use_discovery.py
A	packages/browser-bridge/tsconfig.json
A	packages/browser-bridge/vitest.config.ts
M	packages/connectors/package.json
A	packages/connectors/src/acquisition/contracts.ts
A	packages/connectors/src/acquisition/http.ts
A	packages/connectors/src/acquisition/intake.ts
A	packages/connectors/src/acquisition/rss.ts
A	packages/connectors/src/acquisition/telegram.ts
M	packages/connectors/src/apify.ts
M	packages/connectors/src/index.ts
M	packages/connectors/src/rss.ts
A	packages/connectors/src/source-runtime/execution-http.ts
A	packages/connectors/src/source-runtime/http.ts
A	packages/connectors/src/source-runtime/item-fingerprint.ts
A	packages/connectors/src/source-runtime/platform-providers.ts
A	packages/connectors/src/source-runtime/ports.ts
A	packages/connectors/src/source-runtime/provider-collector.ts
A	packages/connectors/src/source-runtime/provider-factory.ts
A	packages/connectors/src/source-runtime/provider-http.ts
A	packages/connectors/src/source-runtime/provider-normalize.ts
A	packages/connectors/src/source-runtime/provider-scheduler.ts
A	packages/connectors/src/source-runtime/provider-storage.ts
A	packages/connectors/src/source-runtime/provider-types.ts
A	packages/connectors/src/source-runtime/public-html.ts
A	packages/connectors/src/source-runtime/rss-normalize.ts
A	packages/connectors/src/source-runtime/rss.ts
A	packages/connectors/src/source-runtime/scheduler.ts
A	packages/connectors/src/source-runtime/social-providers.ts
A	packages/connectors/src/source-runtime/storage.ts
A	packages/connectors/src/source-runtime/website-discovery.ts
A	packages/connectors/src/source-runtime/website-providers.ts
M	packages/connectors/src/sources.ts
M	packages/connectors/src/telegram.ts
A	packages/connectors/test/acquisition-v15.test.ts
M	packages/connectors/test/apify.test.ts
A	packages/connectors/test/execution-http.test.ts
A	packages/connectors/test/ingestion-regressions.test.ts
A	packages/connectors/test/provider-cloudflare-bindings.test.ts
A	packages/connectors/test/provider-source-runtime.test.ts
A	packages/connectors/test/rss-cloudflare-bindings.test.ts
A	packages/connectors/test/rss-redirect.test.ts
A	packages/connectors/test/rss-source-runtime.test.ts
M	packages/connectors/test/rss.test.ts
M	packages/connectors/test/sources.test.ts
M	packages/connectors/test/telegram.test.ts
A	packages/connectors/test/website-discovery.test.ts
A	packages/contracts/README.md
A	packages/contracts/package.json
A	packages/contracts/src/acceptance-cases.json
A	packages/contracts/src/fixtures.ts
A	packages/contracts/src/handoff.ts
A	packages/contracts/src/hashing.ts
A	packages/contracts/src/index.ts
A	packages/contracts/src/ordering.ts
A	packages/contracts/src/schemas.ts
A	packages/contracts/src/types.ts
A	packages/contracts/src/validation.ts
A	packages/contracts/test/contracts.test.ts
A	packages/contracts/tsconfig.json
A	packages/contracts/vitest.config.ts
A	packages/core/src/developments.ts
M	packages/core/src/editions.ts
M	packages/core/src/events.ts
M	packages/core/src/filtering.ts
M	packages/core/src/index.ts
M	packages/core/src/processing.ts
M	packages/core/src/summarization.ts
M	packages/core/src/types.ts
A	packages/core/test/developments.test.ts
M	packages/core/test/processing.test.ts
M	playwright.config.ts
M	pnpm-lock.yaml
M	pnpm-workspace.yaml
A	scripts/attribute-legacy-x-operation.mjs
A	scripts/attribute-legacy-x-operation.test.mjs
A	scripts/authenticated-profile-provisioning.mjs
A	scripts/authenticated-profile-provisioning.test.mjs
A	scripts/authorize-source-provider.mjs
A	scripts/bootstrap-authenticated-profile-manual.mjs
A	scripts/bootstrap-authenticated-profile-manual.test.mjs
A	scripts/check_ai_source_integration_migrations.py
A	scripts/check_integration_migrations.py
A	scripts/connector-scale-metrics.mjs
A	scripts/connector-scale-metrics.sql
A	scripts/dev.mjs
A	scripts/evaluate-acquisition-suite.mjs
A	scripts/evaluate-news-pipeline.mjs
A	scripts/evaluate-public-discovery.mjs
A	scripts/generate-brand-icons.mjs
A	scripts/measure-sources-qa.mjs
A	scripts/model-concurrency-amendment-usage.txt
A	scripts/model-reconciliation-usage.txt
A	scripts/outlook-mail-target.mjs
A	scripts/outlook-qa-request.mjs
A	scripts/outlook-qa-request.test.mjs
A	scripts/pipeline-trace-usage.txt
A	scripts/pipeline-trace.mjs
A	scripts/prepare-connector-scale-qa.ps1
A	scripts/probe-google-news-apify.mjs
A	scripts/probe-google-news-apify.test.mjs
A	scripts/process-tree.mjs
A	scripts/provision-authenticated-profile.mjs
A	scripts/run-public-http-acquisition.ts
A	scripts/run-public-rss-acquisition.ts
A	scripts/setup-outlook-qa-mail.mjs
A	scripts/setup-outlook-qa-mail.test.mjs
A	scripts/setup-push.mjs
A	scripts/setup.integration.test.mjs
M	scripts/setup.mjs
A	scripts/source-execution-server.mjs
A	scripts/source-execution-server.test.mjs
A	scripts/source-execution.mjs
A	scripts/source-execution.py
A	scripts/source-execution.requirements.txt
A	scripts/source-execution.test.mjs
A	scripts/telegram-source-check.mjs
A	scripts/telegram-source-login.mjs
A	scripts/telegram-source-login.py
A	scripts/test-connector-scale.mjs
A	scripts/test_source_execution.py
A	scripts/trigger-authenticated-profile-bootstrap.mjs
A	scripts/trigger-authenticated-surface-diagnostic.mjs
A	scripts/trigger-live-public-acquisition-smoke.mjs
A	scripts/trigger-openrouter-model-diagnostic.mjs
A	scripts/unknown-model-capacity-usage.txt
A	scripts/upload-sources-qa-assets.mjs
A	scripts/verify-d1-backup.mjs
A	tests/e2e/account-dialog-fit.spec.ts
A	tests/e2e/adaptive-feed-viewport.spec.ts
A	tests/e2e/app-experience.spec.ts
A	tests/e2e/auth-landing-fit.spec.ts
A	tests/e2e/briefing-layout.spec.ts
A	tests/e2e/curated-explore.spec.ts
M	tests/e2e/distilled.spec.ts
A	tests/e2e/feed-loading.spec.ts
A	tests/e2e/feed-request.spec.ts
A	tests/e2e/feed-widget-consistency.spec.ts
A	tests/e2e/guest-navigation.spec.ts
A	tests/e2e/header-logo-alignment.spec.ts
A	tests/e2e/helpers.ts
A	tests/e2e/home-explore-fit.spec.ts
A	tests/e2e/landing-feed-layout.spec.ts
A	tests/e2e/layout-integrity.spec.ts
A	tests/e2e/reference-ui.spec.ts
A	tests/e2e/requested-ui.spec.ts
A	tests/e2e/review-fixes.spec.ts
A	tests/e2e/screen-fit.spec.ts
A	tests/e2e/settings-fit.spec.ts
A	tests/e2e/sidebar-toggle.spec.ts
M	vitest.workspace.ts
```
