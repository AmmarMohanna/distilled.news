# Refresh owned feeds when the app resumes

The private clean Lebanon feed existed in staging and appeared in the web browser, but the already-open installed PWA retained its old owned-feed list. `AdminPage` loaded `/api/me/briefings` at startup and after explicit account/feed changes; returning to the foreground did not reload that list. Public briefing pages already had their own foreground refresh behavior.

The focused fix refreshes the owned-feed list on visible `visibilitychange`, `focus`, `online` and `pageshow` events. It does not reload the application or add polling. Concurrent resume events share an in-flight guard, the currently selected feed remains selected when it still exists, and background failures retain the working list. The request is deferred while creating/editing feeds, changing account details, saving or recovering a failed autosave. A response arriving after editing starts is ignored.

No styling, feed visibility, acquisition, scheduling, inference, notifications or service-worker caching policy changed. The backend feed already exists; no duplicate was created. This change requires a later approved deployment before the installed staging app can receive it.

## Verification

- The new regression failed against the previous build: only the initial owned-feed API call occurred after resume events.
- Final Playwright run: **12 passed**, six scenarios each on desktop Chromium and mobile Chromium. Tests use mocked API responses and exercise the actual frontend, without deployment or paid operations.
- Web unit suite: **51 passed**, ten files.
- Web TypeScript check and production frontend build passed.
- One intermediate run had two initial Home-card visibility failures before exercising the resume action. Both did not recur in the final complete focused run. No application changes were made to satisfy those initial-visibility failures.

The tests simulate browser/PWA lifecycle events; they do not claim a manual test on the user's installed desktop PWA. Existing signed-in state and private-feed backend checks are preserved.
