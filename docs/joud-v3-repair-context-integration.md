# Joud / V3 repair-context integration - October 25, 2026

Integration branch: `joud/v3-repair-context-integration`.
Protected parent: `joud/post-integration-fixes` at `89555c96a9aad44ff1562a6a55168c8f919f390f`.
Incoming branch: `feat/v3-repair-context-staging` at exactly `2d84d880ba0fd48b1fa581fe10ef3318de254045`.
Merge base: `078e0cab1cdc6b35fe7761a36e15db6f0842a6ab`.

## Merge decision and preservation

The merge applied without Git conflicts. Both original branches remain intact. No deployment, remote migration, credential modification, paid model call, or live feed test was performed for this integration.

All 49 files changed on Joud's branch since the common base were audited. 48 remain byte-for-byte unchanged. The only overlap is `apps/web/src/main.tsx`, which retains Joud's implementation and adds the incoming owned-feed resume-refresh hook and in-flight load guard. Its diff contains no reader, editor, header, source-popup, navigation, layout, artwork, language-control, or recommendation change.

Joud's CSS, adaptive full-page scrolling, complete initial widget rows, fixed headers, Arabic Back arrow, Sources slots and labels, feed-only profile visibility, blue-magenta toggles, feed-action panel, Copy link/Copied interaction, notifications, and frontend tests remain unchanged. Recommendation/assessment/cache/collector/Telegram fixes, storage maintenance, financial fences, and dedicated Joud deployment bindings/configuration also remain unchanged.

The tracked Joud configuration still reflects the protected parent. Existing live dashboard provider-budget differences were neither reconciled nor overwritten: there was no deployment. A future deployment must review that known configuration drift.

| Required behavior | Integration result |
| --- | --- |
| V3 article-first edit -> verify -> targeted repair -> persistence | Retained; no V2 extraction/Event prerequisite added to V3 |
| Full and short evidence | Worker retains full article bodies with `maxArticleChars:Number.MAX_SAFE_INTEGER` and `minChars:1`; no 6,000-character cap or sentence filter restored |
| Repair context and original-source checks | Previous draft/review context and sparse/local item-index mapping retained; initial source checking unchanged |
| Legacy history deduplication | Existing presentation-only exact-prefix deduplication retained; stored reader memory is not rewritten |
| Relative dates and replay | New snapshots use prompt version 3; SOURCE-relative dates use source publication dates and ITEM-relative dates use briefing cutoff; versions 1/2 retain original verifier bytes and operation identities |
| Scheduling | No migration or scheduling implementation change, including migration 0069, precise creation-relative closes, legacy schedules and daily timezone/DST rules |
| Account onboarding | No automatic Personal Briefing creation added; account/API code unchanged |
| Reader presentation | Separate title/body, citations, legacy fallback and content-language RTL unchanged |
| Installed app resume | Owned list refreshes on visible resume/focus/online/pageshow, keeps selection, deduplicates concurrent reads, ignores stale responses and preserves unsaved edits |

## Accepted incoming changes

Production changes are limited to:

- `apps/web/src/main.tsx`: the installed-app owned-feed refresh behavior.
- `apps/worker/src/v1-intelligence/v3-window.ts`: newly frozen windows record prompt version 3.
- `packages/briefing/src/engine.ts`: select the legacy verifier for older snapshots and the clarified verifier for version 3.
- `packages/briefing/src/prompts.ts`: preserve the legacy verifier string and distinguish source-relative from briefing-relative dates in the new verifier.

Incoming tests, frozen benchmark outputs, evaluation scripts and reports are retained as evidence. The deterministic prose cleaner was introduced and reverted within incoming history; it is absent from the resulting production behavior. Experimental compression, grouping, continuity and relevance candidates remain evaluation-only. Editor/repair GPT-4.1 and verifier GPT-4.1 mini routing is unchanged. No AI-generated notification copy was introduced.

## Validation results

- Repository-wide `pnpm typecheck`: passed, all eight workspace projects.
- Node script suite: 59 passed.
- Non-Worker workspace suites: 885 passed, 2 skipped. This includes all 100 briefing tests, all 57 frontend tests and all 292 connector tests. The first parallel run had one 5-second connector timeout; the complete bounded rerun passed that suite.
- Worker suite: **2,164 passed, 75 failed, 32 skipped, with 4 unhandled errors** across 300 files. This is not a fully green repository test result.
- V3 fixed-window suite: all 18 passed, including semantic-lease recovery and frozen prompt versions 1, 2 and 3 with no duplicate inference after interruption.
- Existing scheduling suite: all 32 passed. Clean migration test and protected artwork/maintenance tests passed.
- Incoming PWA resume Playwright suite: all 12 passed on desktop/mobile with mocked APIs, including preserved selection, failed refresh, hidden app, unsaved draft and stale-response protection.
- Local adaptive/browser checks: 72 layout combinations passed; 16 shared-header/profile combinations passed; Arabic switching/back persistence and non-scrolling Sources slots passed. The Arabic comparison waits for the existing press animation to finish; no frontend change was made to satisfy measurement timing.
- Root `pnpm build`: frontend and preceding package builds passed, then the default Worker container build was blocked by unavailable Docker. Dedicated Joud `wrangler deploy --dry-run --config wrangler.joud.jsonc`: passed. No deploy command without `--dry-run` was issued.
- Secret-pattern check: no matching private-key/API-token material in incoming changed files.
- Whitespace check: two inherited benchmark Markdown files have extra final blank lines. Their recorded content was retained unchanged; no production-code whitespace errors were found.

The incoming PWA tests and browser fixtures use local/mock APIs. These checks do not establish paid live-provider behavior or factual accuracy on unseen articles.

## Broad-suite failures and baseline comparison

An isolated checkout of protected parent `89555c9`, with workspace package resolution directed to that checkout, reproduced **31 failures** from the merged run:

| Original-parent check | Result |
| --- | --- |
| Push integration | 14 existing failures |
| Authenticated profile store | 3 existing SQL-fixture failures |
| Construction provider wire | 11 existing failures |
| Reader witness | 2 existing failures |
| Google source assessment fallback | 1 existing call-count assertion failure: expects two fetches although the protected assessment performs an additional evidence audit |

These comparisons establish that those 31 failures predate this integration. The other 44 failures were not individually replayed on the parent and are **not claimed proven pre-existing**. Their test files and legacy implementation paths are unchanged by the merge, but they remain unresolved qualification limits. Tests were not deleted, skipped or weakened, and protected code was not changed to suppress them.

Failed Worker test files from the broad run:

- `src/authenticated-profile-bootstrap-trigger.test.ts`
- `src/acquisition-evaluation.test.ts`
- `src/authenticated-profile-manual-bootstrap.test.ts`
- `src/authenticated-profile-store.test.ts`
- `src/connector-work-admission.test.ts`
- `src/development-pipeline.test.ts`
- `src/live-source-route.test.ts`
- `src/model-availability.integration.test.ts`
- `src/push.integration.test.ts`
- `src/source-assessment-google.test.ts`
- `src/v1-intelligence/construction-provider-wire.test.ts`
- `src/v1-intelligence/editorial-continuation.test.ts`
- `src/v1-intelligence/editorial-selection.test.ts`
- `src/v1-intelligence/model-capacity.test.ts`
- `src/v1-intelligence/model-spending-amendments.test.ts`
- `src/v1-intelligence/provider-outcome.test.ts`
- `src/v1-intelligence/semantic-model.test.ts`
- `src/v1-intelligence/provider-schema.test.ts`
- `src/v1-intelligence/quiet-coverage-atomic.test.ts`
- `src/v1-intelligence/reader-witness.test.ts`
- `src/v1-intelligence/rematch-budget.test.ts`
- `src/v1-intelligence/salience-runtime.test.ts`
- `src/v1-intelligence/selection-quality.test.ts`
- `src/v1-intelligence/semantic-budget.test.ts`
- `src/v1-intelligence/semantic-coverage.test.ts`
- `src/v1-intelligence/semantic-relations.test.ts`
- `src/v1-intelligence/soak-quality-regressions.test.ts`

## Evidence and follow-up

Ignored local evidence: `.local-reports/joud-v3-merge-preservation.json`, `joud-v3-merge-typecheck.log`, `joud-v3-merge-tests.log`, `joud-v3-merge-tests-serial.log`, `joud-v3-merge-build.log`, `joud-v3-merge-joud-build.log`, `joud-v3-merge-pwa-e2e.log`, browser result logs, and original-parent failure JSON reports. The isolated parent checkout is retained under `.local-reports/joud-v3-parent-baseline/` for diagnosis.

The new integration branch is a reviewable merge with protected behavior preserved; it is not approval to deploy. Broad legacy test failures and the default Docker build limitation must remain visible in any release decision. Broader UI states not covered by the listed browser fixtures were not exhaustively re-reviewed; their implementation is unchanged.
