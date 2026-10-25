# CI repair for the V3 integration branch

The repairs preserve current product behavior. They do not restore manual Publish to Explore, automatic Personal Briefing creation, removed feed filters, or the old feed More menu.

## Changes

- Test migrations use Wrangler's SQLite statement splitter. Multi-statement triggers, CASE expressions, comments and quoted semicolons remain intact. Regression coverage loads all retained migrations and checks financial-record immutability.
- Provider regression fixtures explicitly select OpenRouter rather than accidentally exercising the unqualified default route. Production model qualification and routing remain unchanged.
- Push integration exercises mocked V3 editing, verification, persistence, reader retrieval and push acceptance with in-window evidence.
- Semantic fixtures implement the current identity-review contract. Stale decisions retain provisional evidence and idempotent rematching; they do not become accepted stale merges.
- Async rejection expectations are attached before timers advance. Browser tests wait for observable cleanup and form rejection, and do not require unrelated outbox bookkeeping to be the last audit event.
- Native-process test concurrency is bounded. The Worker build remains a dry run and skips container rollout; actual deployment commands retain their existing container behavior. This check validates the Worker bundle, not a container image build.
- Playwright follows current UI controls, including direct feed settings, per-edition read status, source URL copying, website links, responsive cards and preferences reached from Home. It checks current behavior rather than reintroducing obsolete features.
- CI also typechecks Playwright tests through `tsconfig.e2e.json`.
- The separately approved product fix lets a narrow feed header wrap and prevents Back's container from shrinking beneath adjacent controls. All controls remain available; desktop layout is unchanged. Existing 320px and enlarged-text overlap/hit-testing regressions remain active.

V3 prompts, models, source collection, scheduling, publication, visibility enforcement and financial accounting are unchanged. No paid inference, deployment or reader notifications are part of this repair.

## Verification

The Project checks workflow runs workspace and browser-test typechecks, Node and Python scripts, all package/Worker tests, builds and desktop/mobile Playwright tests. The local evidence directory is ignored: `.local-reports/ci-fixes/`. It contains JSON test reports, failure/recovery logs and narrow-header screenshots; inspect the final hosted run before declaring CI green.

On Windows without a globally installed pnpm executable, nested package scripts need a local pnpm/Corepack shim on PATH. Wrangler logs can be redirected with `WRANGLER_LOG_PATH` to a writable local directory. Neither workaround requires changing production configuration.
