# Ghada / Joud–Aya preservation integration

## Inputs and boundary

New working branch: **`ghada/joud-aya-preserved-integration`**. Created in a separate worktree so the existing main checkout and Ghada worktree remain untouched.

| Input | Exact commit |
|---|---|
| Ghada backend/scheduling branch | `f8d821bcc0a1521fb699ff63c2b2e93e9f51e688` |
| Latest fetched `joud/aya-integration-fixes` | `06dc7204da0047cbc4c44753d99df563ea8093f0` |
| Joud protected implementation | `ae0e2d95532c15e8c4ee0c7a0cb52c6d8bb49d8b` |
| Merge base | `524aed34648d6095b3f55ebcaabafdaaab0557cc` |

The integration starts from Joud's latest branch and merges the exact Ghada tip, preserving both histories. No reset, rebase, force-push or rewrite of either input branch was performed. The new branch's inherited upstream was explicitly removed before integration, preventing an accidental push to Joud's branch. New commits use Ghada Al Danab as sole author and committer, with no AI attribution trailers.

The final Joud/Aya preservation handoff/inventory and older frontend preservation documents were reviewed. This is a code integration, **not a deployment or paid evaluation**. No remote data, secrets, financial holds or reader notifications were changed.

## Frontend preservation proof

The audit compares against the latest fetched Joud branch, not an older intermediate design. **78 of 83 tracked frontend files are unchanged**. This includes every stylesheet, artwork/brand asset, PWA/service worker, translation file, custom dropdown component, adaptive-grid component, account/profile component, source-health component and summary component.

Only five frontend paths differ:

| Path | Exact reason |
|---|---|
| `FeedEditor.tsx` | One native input `step` attribute: half-hour daily choices for new clock-policy feeds, minute precision retained for existing feeds. Her custom menus, layout, clock-picker button, ref, classes and translations remain intact. |
| `main.tsx` | Import/use `editionDisplayTime` for existing reader time/day labels and source-sheet timestamps. Her Unicode username import and every other line are retained. |
| `helpers.ts` | Ghada's scheduled-time display helper; no layout changes. |
| `helpers.test.ts` | Scheduled-time/fallback regressions. |
| `FeedEditor.test.tsx` | Daily-time compatibility regressions alongside her translated custom-menu tests. |

The audit asserts that `FeedEditor.tsx` equals Joud's file with only that one attribute added, and that `main.tsx` equals her file with only the scheduled-time hooks applied. It also confirms all **99 paths changed exclusively on Ghada's branch** retain their exact Git content.

No speculative styling, CSS cleanup, font/logo replacement, translation rewrite or frontend redesign was made. Her inline offline illustration, white mobile launch background, desktop/notification/email assets, Arabic navigation/initials, narrow toolbar plus wider summary column, removed Source details disclosure, full-page grid scrolling and 72px/56px artwork rules remain the protected implementation.

## Six conflict resolutions

| Shared file | Feature-level resolution |
|---|---|
| `FeedEditor.tsx` | Retain Joud's controls; add only Ghada's schedule precision constraint. |
| `main.tsx` | Retain Unicode normalization and all protected UI; include scheduled-time helper. |
| `publication.ts` | Keep both `v3InputId` recovery reference and `scheduledFor` label. |
| `runtime.ts` | Keep her explicit reconciliation-dependency handling and our confirmed acquisition-budget wait handling; ordinary active/backpressure/uncertain-operation protections remain. |
| `window-coverage.ts` | Keep `blockedJobs` reconciliation diagnostics plus budget-unavailable coverage; recoverable jobs are not terminated. |
| `v3-window.ts` | Keep unstarted stale-input recovery, immutable predecessor/paid fences and catalogue evidence labels; combine selective hydration/history reads, settled-call failure handling and scheduled delivery. |

Clean automatic merges were reviewed too. Unicode account/alias handling, localized authentication mail, dynamic device-specific manifests, source identity/recovery and full/partial evidence rules remain. Joud's `wrangler.joud.jsonc`, username normalizer, authentication implementation and mailer are unchanged from her branch. Her dedicated Worker/D1/R2/queues/helper references are not replaced with staging references.

Ghada's clock scheduling, existing-feed compatibility, early cutoff/intended-time separation, selective database reads/index migrations, published-reader memory, verified replay and budget-wait coverage are retained. Additive migration files are included in Git but **no migration was applied remotely**. Staging's maintenance opt-in is retained from Ghada's branch; Joud's separate configuration is unchanged.

## Validation on the merged result

**1,000 unique unit/integration tests passed**, with one connector test explicitly skipped:

| Suite | Passed |
|---|---:|
| Worker integration: accounts/Unicode/clock scheduling, mail, manifest, runtime, V3 windows/source integration, acquisition/intake/catalogues, coverage | 360 |
| New combined recovered-input + scheduled-delivery regression | 1 |
| Entire frontend unit suite | 111 |
| Contracts | 45 |
| Core, including Unicode usernames | 44 |
| Briefing package | 109 |
| Connectors | 330 |

The new combined regression proves that Joud's unstarted-input recovery preserves the predecessor, selects the replacement revision, holds verified output until Ghada's intended delivery, persists the recovery input reference and scheduled label, and replays without extra mocked model calls or delivery jobs. Existing uncertain-call recovery remains protected.

Workspace typechecks passed using `corepack pnpm -r typecheck`. The root `typecheck` wrapper initially could not find a bare `pnpm` executable inside its script on this Windows environment; the equivalent recursive Corepack invocation succeeded without changing package scripts. Frontend production build and Worker dry-run build passed. Dependencies were installed offline with the frozen lockfile; no package/lockfile upgrade was made.

### Browser checks and screenshots

The 57-case local Chromium matrix covers responsive widgets/profile, Home/Explore consistency, logo sizing, English/Arabic settings, guest navigation, owned-feed refresh, contextual/guest controls, unread summaries in light/dark and enlarged Arabic text, and actual service-worker offline navigation in English/French/Arabic. It uses mocked API fixtures, not real accounts or source/model calls.

Final matrix: **56/57 passed**; the first owner/320px case timed out before its feed heading loaded. That exact case passed on a focused unchanged rerun (3.7 seconds). The initial timeout and trace are retained; this is not represented as a perfectly clean single-pass browser run.

Three inherited browser tests contradicted the final protected UI and were corrected **without changing frontend code**:

- Header bounds now measure actual buttons because her group wrapper is `display: contents`. Guest controls retain their approved placement before shared language/theme/login controls.
- Summary alignment is checked against the reader column rather than demanding the narrow toolbar width.
- Offline tests validate the self-contained SVG and saved website language, including French and Arabic despite an English browser; they no longer wait for an obsolete image element or hardcode a preview port.

An initial preview-server reuse concern was checked: the served assets matched this build. A dedicated hash-verified local preview and per-test result reporter were subsequently used to distinguish assertions from Windows preview-child teardown delays. No product workaround or timeout increase was introduced to alter protected behavior.

Local profile screenshots at mobile/desktop sizes and the French offline screenshot were visually inspected. Other screenshots/assertions cover the matrix above. Physical Android/iOS install/splash behavior, real email delivery, paid source/model compatibility and every possible UI state were not revalidated. This is not a claim that the full repository CI/E2E suite was run.

## Uncommitted work and remaining limits

The existing uncommitted favicon in the original Ghada worktree was saved as a local patch and left in place, uncommitted and undeployed. Its SHA-256 remains `3c7a92504b6657c388f0db6adc5265d171cadbb7017d6a5c85890e896755a6d0`. The root main checkout's unrelated dirty frontend/configuration files were not copied into this integration or modified. Neither original worktree was switched or reset.

Raw logs, per-test browser verdicts, traces, screenshots, exact conflict-resolution notes and the preservation audit remain local under `.local-reports/joud-preservation/` (with earlier browser screenshots in the local test output). Only sanitized evidence/reporting is committed. There has been **no deployment, paid inference, source acquisition, email delivery, credential change, financial mutation or reader notification** for this merge.

Before deploying this branch later, choose the intended target's configuration and review migrations/resources separately. A successful local merge does not transfer Joud's deployment data or secrets, resolve the existing Bitcoin source-service backlog, or prove real-world model quality.
