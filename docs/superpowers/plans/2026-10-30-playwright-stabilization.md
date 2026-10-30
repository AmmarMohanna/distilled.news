# Playwright stabilization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing desktop/mobile E2E matrix while preserving Joud's approved frontend and correcting only demonstrated application defects.

**Architecture:** Keep the present Playwright configuration, projects and timeout limits. Replace obsolete interactions with role/name-based operations on the actual custom controls. Retain meaningful persistence, privacy, accessibility, responsive geometry and clipping assertions. Application changes require a failing reproduction, screenshot and measured bounds before and after.

**Tech stack:** TypeScript, Playwright, React, CSS, pnpm, local Vite preview.

**Spec:** The user's eight-point dedicated stabilization request; preservation requirements in `AGENTS.md`; inventory below.

## Global constraints

- Work on `integration/aya-ghada-agentops-k6-preserved`, starting at `e2c05153436be863499b6e97a81f0bd8ca06454a`; preserve unrelated changes.
- Preserve Joud's latest approved frontend design, translations, RTL behavior and responsive layouts.
- No broader integration, dependency upgrades, scheduling/provider changes, deployment or paid operations.
- No skipped tests, conflicting accepted outcomes, increased limits or retries to conceal failures.
- Use the existing desktop Chromium/mobile matrix and two workers. Run the full matrix twice after affected scenarios pass.
- Commit test-contract corrections separately from small application defect fixes where practical; push without force.

## Baseline and approved contracts: all 55 CI failures

Source baseline: [Actions run 41093732117](https://github.com/AmmarMohanna/distilled.news/actions/runs/41093732117), exactly the starting SHA. E2E: 538 passed, 55 failed, one existing skip. Local baseline: 537 passed, 56 failed, one existing skip. The local-only enlarged-text overflow and Arabic loading failure are additional investigation inputs, not silently added to the CI count.

The current frontend is authoritative under AGENTS.md. Preservation evidence: `docs/aya-joud-frontend-integration-2026-10-28.md`, `docs/ghada-joud-aya-integration.md`, `docs/aya-ghada-preserved-integration-2026-10-30.md`, and `docs/aya-ghada-agentops-k6-preserved-integration-2026-10-30.md`. Older visual proposals do not override the final implementation.

Read-only browser follow-up captured screenshots/traces for six unchanged original scenarios: three passed and three failed (Edge installation in both projects; enlarged-text Explore on mobile). The notification case passed both projects, so its CI failure remains an investigation rather than a presumed CSS defect. Representative overflow/install screenshots were viewed. Artifacts: `.local-reports/e2e-stabilization/baseline-browser/`.

| Root cause / executions | Exact scenarios (source line at baseline) | Approved contract / replacement proof |
| --- | --- | --- |
| Custom-control selectors: **22** | `app-experience:138,180` (4); `feed-request:37` two sizes (4); `home-explore-fit:164` two sizes (4); `reference-ui:44,87` (4); `screen-fit:17` three sizes (6) | `FeedLanguageSelect.tsx` exposes named buttons, listboxes, options and `aria-selected`. Labels name both trigger and menu. Use role-scoped trigger/option interactions; assert selection, save payload and reopened persistence, language independence, exact schedule choices and user-role filtering. Check all four preference rows individually. Preserve Public/Private radio semantics. |
| Obsolete status/progress UI: **6** | `feed-request:4` (2); `feed-request:82` two widths (4) | `AppExperience.tsx` shows a card badge only for paused feeds; active card retains identity, artwork, link and real update time. `main.tsx` + `FeedNotice.tsx` retain empty reader and explicit quiet/failure/correction notices; no inline processing panel is mounted. Assert exact current empty/pending presentation, never confirmed quiet, no manual generation and no request-summary writes on refresh. |
| Obsolete card sizing/fold metrics: **20** | `home-explore-fit:153,186` (4); `landing-feed-layout:52` four widths (8); `review-fixes:247,275` (4); `screen-fit:103` two failing sizes (4) | `AdaptiveFeedGrid.tsx:54-78` fixes list/compact artwork/type scale, uses width-based columns and natural bounded row heights, continuous scrolling. `apple.css:2779-2782` intentionally uses compact title .9375rem and row gap 2px. Verify exact compact layout, column adaptation, unclipped identity/control bounds, equal gaps, reachable last row after scrolling and no horizontal overflow. Preserve existing readability, square art, link/menu distinction and real timestamps. Do not restore large count-based cards or snap whole rows to the fold. |
| Responsive branding/artwork assumptions: **4** | `requested-ui:19,71` (4) | `apple.css:2653-2655` hides the wordmark when the brand container lacks space; accessible brand identity and symbol remain. Final artwork is a transparent illustration with radius 0 (`apple.css:2564-2565`), inside a rounded card. Assert symbol/accessible identity, exact responsive wordmark state, nonoverlapping controls and illustration/card treatment. Keep dark mode, menu and timestamp coverage. |
| Obsolete installation confirmation: **2** | `reference-ui:248` (2) | `pwa.test.ts` rejects stale installation hints and explicitly has no `confirmInstalledApp`; `SettingsDialogs.tsx` only reports browser-derived status. Test the unavailable-browser guidance, absence of fabricated installed state, dismiss/reopen/reload behavior, and retain the separate positive detected-installation scenario. Suppress native beforeinstallprompt only in fixtures specifically modeling its absence. |
| Valid toggle containment assertion: **1** | `reference-ui:193` Chromium (failure at222) | Notification thumb must remain inside its track in each settled state; switch state must agree with mocked account subscription and exact GET/POST/DELETE writes. CI measured right 987.234375 > allowed980. Capture bounds/computed styles/screenshots before deciding whether transition sampling, readiness, or CSS is responsible. Keep strict containment; use condition-based geometry synchronization only when evidence proves asynchronous movement. |
| **Total: 55** | Rows count executions across both projects unless stated otherwise. | No failure is removed without replacement contract coverage. |

## Review focus

1. French UI with Arabic feed content must save/reopen the Arabic feed language without changing website language; custom menus must support keyboard selection/focus.
2. Arabic/RTL, 320px phone, landscape and enlarged text must retain readable content, reachable actions and unclipped popovers.
3. Pending work must never display confirmed quiet; changing tests must retain no-manual-generation and refresh safety checks.
4. Responsive cards may cross the fold during continuous scrolling, but every card/action must be reachable and clear the bottom navigation when scrolled into view.
5. PWA detection and notification state must remain truthful; no manual confirmation, stale local hints, arbitrary sleeps or geometry tolerances may fabricate success.

## Task 1: Semantic custom-control and lifecycle tests

**Files:** `tests/e2e/helpers.ts`, `app-experience.spec.ts`, `feed-request.spec.ts`, `home-explore-fit.spec.ts`, `reference-ui.spec.ts`, `screen-fit.spec.ts`.

**Interfaces:** Shared helper accepts a scoped Playwright Locator, exact accessible trigger/listbox names and exact option label; returns only after selected state and closed menu are asserted. Callers retain their own save/request assertions.

- [ ] Use baseline failures as red evidence. Inspect screenshots/DOM for any subsequent assertion hidden behind the first failure.
- [ ] Add semantic control helpers only where reused; use `getByRole('button')`, named `listbox`, exact `option` and selected state. Exercise keyboard and translated controls in representative cases.
- [ ] Replace obsolete status/PWA scenarios with the exact approved contracts above. Preserve active/paused distinction, real timestamps, quiet safety and generation-request count.
- [ ] Run affected scenarios in both projects, then frontend unit tests and E2E TypeScript checking. Commit justified test-only changes.

## Task 2: Responsive contract alignment and defect investigation

**Files:** `tests/e2e/home-explore-fit.spec.ts`, `landing-feed-layout.spec.ts`, `requested-ui.spec.ts`, `review-fixes.spec.ts`, `screen-fit.spec.ts`, `layout-integrity.spec.ts`, `responsive-widgets.spec.ts`; application files only after confirming the failing owner, most likely `apps/web/src/apple.css` or `AdaptiveFeedGrid.tsx`.

**Interfaces:** Reusable geometry checks return measured rectangles/clipping state; screenshots and JSON bounds use `testInfo.outputPath`/attachments, separated by project/scenario.

- [ ] Capture baseline screenshots and element/computed-style bounds for compact cards, branding, notification toggle, enlarged-text Explore and RTL popovers; view representative images.
- [ ] Align obsolete layout assertions to the documented compact-grid contract while retaining exact CSS/geometry and actionability checks. Test resize in both directions and last-row reachability.
- [ ] Reproduce actual overflow/clipping/toggle failures independently. Keep failing assertions; identify owning style/measurement and implement the smallest correction only if application defect is confirmed.
- [ ] Capture after screenshots and bounds in the same viewports/languages. Run affected scenarios in both projects; add a focused regression for each genuine defect. Commit each application correction separately with its regression where practical.

## Task 3: Stability and preservation validation

**Files:** Existing package scripts/workflows stay unchanged; sanitized report in `docs/playwright-stabilization-2026-10-30.md`; raw artifacts under ignored `.local-reports/e2e-stabilization/`.

- [ ] Run all affected E2E suites; investigate additional assertions reached after selector correction, without relaxing contracts.
- [ ] Run the full default Playwright matrix twice, with fresh local preview each time, preserving both exact results and artifacts. Any instability gets diagnosis and targeted reproduction before another full pair is warranted.
- [ ] Run full workspace tests, workspace and E2E typechecks, workspace build (Worker dry-run only), Node evaluation/script tests, Python source-helper tests, observability/Wrangler validators, local k6 smoke and deliberate fault-proof.
- [ ] Keep acquisition benchmark workflow/code intact; distinguish path-filtered historical results from any fresh execution.
- [ ] Perform an independent review; inspect the entire diff for lost assertions, translations, RTL and frontend preservation.
- [ ] Commit remaining justified tests/report, verify clean tree and remote branch ancestry, push without force, verify Actions on final SHA and report exact outcomes. Never deploy.

## Execution decision

The user approved this plan and inline implementation. Tasks 1 and 2 are complete, with a fresh read-only review and its menu-coverage follow-up resolved. Two complete matrices passed 597 tests each (one unchanged skip), and the full workspace passed 3,563 tests (22 unchanged skips). Typechecks, build, script/helper/observability checks and local k6 smoke/fault-proof passed. See `docs/playwright-stabilization-2026-10-30.md` for evidence. The remaining finishing step is the already-authorized integration-branch push and exact-SHA Actions verification, without another merge or deployment.
