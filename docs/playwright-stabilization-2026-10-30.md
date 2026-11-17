# Playwright stabilization

Branch: `integration/aya-ghada-agentops-k6-preserved`. Starting commit: `e2c05153436be863499b6e97a81f0bd8ca06454a`.

This pass preserves Joud's approved frontend. The only application change is the branding container-query unit correction in `apps/web/src/apple.css`, isolated in commit `5cb26737affc0b71b3e6f8f5d5649000a6067102`. No layout redesign, translation, runtime/provider, workflow, dependency, timeout, retry or skip configuration changed. No deployment or paid operation was performed.

## All 55 baseline CI failures

The [baseline run](https://github.com/AmmarMohanna/distilled.news/actions/runs/41093732117) failed 55 of 594 E2E executions. The [approved plan](superpowers/plans/2026-10-30-playwright-stabilization.md) maps every named scenario and source location to the current contract and preservation evidence.

| Root cause | Executions | Correction and retained coverage |
| --- | ---: | --- |
| Native-select/broad-label assumptions against custom controls | 22 | Named button/listbox/option interactions; exact selected state, keyboard selection/focus return, pointer actionability, full popover bounds, translated feed-language persistence, source/save payloads and role filtering. All four preference rows retain exact typography checks. |
| Obsolete Live badge/processing panel expectations | 6 | Active cards retain identity, link, artwork and real update times; paused badges remain separate. Pending empty-reader presentation remains distinct from confirmed quiet, and refresh never requests manual generation. |
| Obsolete large-card/fold sizing expectations | 20 | Preserve compact list sizing, width-based columns, exact compact typography/spacing, real links and menu controls, bounds/nonoverlap, equal row gaps and final-row reachability above navigation. Cards scroll continuously across the fold. |
| Older full-phone-wordmark/rounded-art assumptions | 4 | Preserve space-based compact branding, accessible identity, visible symbol, nonoverlapping controls, desktop wordmark, transparent square illustrations and rounded cards. Existing dark-mode/timestamp/menu checks remain. |
| Retired manual installation confirmation | 2 | Assert honest browser-derived unavailable guidance despite stale local hints, dismiss/reopen/reload behavior and no fabricated installed status. Positive browser-detected installation coverage remains. |
| Cross-frame notification geometry sampling | 1 | Read thumb and track simultaneously; retain original horizontal tolerance, add vertical containment and await enabled account state. Exact subscription GET/POST/DELETE checks remain. No toggle CSS changed. |
| **Total** | **55** | No conflicting outcomes are accepted and no failure was skipped. |

The exact current contracts come from `AGENTS.md`, final frontend preservation reports, `AdaptiveFeedGrid.tsx`, `FeedLanguageSelect.tsx`, `FeedNotice.tsx`, `SettingsDialogs.tsx`, `pwa.test.ts` and final `apple.css` rules. Older visual expectations do not override that implementation.

## Changed files

| File | Purpose |
| --- | --- |
| `apps/web/src/apple.css` | Scale the existing compact-branding threshold with text size; one value changed. |
| `tests/e2e/helpers.ts` | Semantic settings interactions, keyboard/focus checks, full menu bounds and pointer actionability. |
| `tests/e2e/app-experience.spec.ts` | Saved feed-language independence and Arabic phone/landscape menus. |
| `tests/e2e/feed-request.spec.ts` | Active/paused card distinction, language controls and truthful pending reader/refresh behavior. |
| `tests/e2e/home-explore-fit.spec.ts` | Compact resize contract, exact preference typography and linked-identity/menu geometry. |
| `tests/e2e/landing-feed-layout.spec.ts` | Current compact spacing with retained readability/bounds checks. |
| `tests/e2e/layout-integrity.spec.ts` | Retain strict overlap/clipping assertions; persist diagnostic bounds/screenshots. |
| `tests/e2e/reference-ui.spec.ts` | Role/rhythm controls, simultaneous toggle geometry and honest installation guidance. |
| `tests/e2e/requested-ui.spec.ts` | Responsive branding and transparent illustrations; retain timestamps/dark mode/menu behavior. |
| `tests/e2e/review-fixes.spec.ts` | Approved bounded compact cards for owner and guest views. |
| `tests/e2e/screen-fit.spec.ts` | Real language menus, explicit Public/Private default/selection and continuous-scroll reachability. |
| `docs/superpowers/plans/2026-10-30-playwright-stabilization.md` | Approved scope and all 55 failure-to-contract mappings. |
| `docs/playwright-stabilization-2026-10-30.md` | Sanitized evidence and validation record. |

## Confirmed application defect: enlarged-text overflow

At root text size 32px, the brand's available width was 258px but the full wordmark extended to x=428.875 in a 390px viewport. The fixed 180px compact-branding threshold left it visible. Focusing/scanning controls then horizontally scrolled the viewport 39px and displaced Explore copy to x=-7.

The threshold is now `11.25rem`: exactly 180px at the normal 16px root size, scaling with enlarged text. The existing compact symbol is used when the wordmark no longer fits; typography and controls are not shrunk.

| Measured mobile enlarged-text bounds | Before | After |
| --- | ---: | ---: |
| Viewport scroll width / client width | 429 / 390 | 390 / 390 |
| Horizontal scroll after control traversal | 39 | 0 |
| Header scroll width / client width | 397 / 326 | 326 / 326 |
| Explore copy left edge after traversal | -7 | 32 |

Original failing and corrected screenshots were inspected. Normal phone/desktop branding, artwork, constrained forms, RTL and enlarged-text checks were run. Raw screenshots and JSON bounds remain under ignored `.local-reports/e2e-stabilization/`; the layout regression also writes bounds/screenshots through Playwright output paths.

## Notification investigation and review

The original desktop geometry check reproduced once in 20 runs: later thumb-right 1043.6875 exceeded earlier track-right+1 of 1041.125. Instrumented runs recorded the approved sidebar hover transition moving the content margin from 72px to 288px and changing content width. Separate browser calls sampled different positions; simultaneous samples showed the thumb correctly inset by 3px.

The correction is entirely in the test. It measures both rectangles in one evaluation, without increasing tolerance or changing CSS. The corrected notification scenario passed 40 repeat executions across desktop/mobile.

Independent review identified one missing menu-actionability check; it was added, with Arabic 320x568 and 667x375 scenarios and screenshots. The follow-up review reported no remaining actionable findings or frontend regression. A named-card selector now avoids depending on alphabetical card order; its linked identity/menu bounds and pointer actionability are checked rather than measuring an intentionally hidden legacy arrow.

## Validation

Focused checks: semantic/lifecycle/install 26 passed; compact layout 26 passed; overflow/branding/preferences 10 passed; Arabic menu cases 4 passed; final named-card geometry 2 passed; notification repetitions 40 passed. The affected-suite run passed 331 with one pre-existing skipped case. Workspace and E2E TypeScript checks passed.

Two consecutive complete Playwright runs passed **597 tests with one pre-existing skip and zero failures** each (598 cases, 4.6 and 4.3 minutes). Each used the unchanged two-worker desktop/mobile configuration, a fresh preview server and separate artifacts. Four new executions are the Arabic constrained-menu scenarios. The existing mobile skip in the desktop-only vertical-overflow scenario was not introduced or expanded by this pass.

Node script/evaluation/k6 configuration tests: **103 passed, zero failed/skipped**. Python source-helper tests: **32 passed**. Observability static validation: 67 metrics, 14 panels, 11 paused alerts, eight synthetic outcomes accepted. Both Wrangler fragments passed installed-schema validation and merged TOML parsing, without deployment.

Full workspace tests passed **3,563 tests with 22 existing skips and zero failures**, without a retry or limit change. Worker alone passed 2,565 with 19 existing skips; the other seven packages passed 998 with three existing skips (including all 111 frontend unit tests). All workspace and E2E TypeScript checks passed.

Workspace build passed, including Wrangler `--dry-run` only. Local k6 smoke passed with exit 0; deliberate fault-proof produced the expected threshold exit 99 and its wrapper passed. The existing acquisition benchmark workflow and code are unchanged; its path filter does not match these frontend/E2E changes. Historical benchmark results must not be presented as fresh execution.

No remaining local failures were observed. GitHub Actions must be verified against the final pushed SHA; local success is not represented as completed remote CI.
