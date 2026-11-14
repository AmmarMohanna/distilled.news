# Production provisioning verification — 2026-11-14

Production URL: https://distilled-news-production.distillednews-platform.workers.dev

The deployment was created with fresh stateful resources. No users, feeds, editions, source history, evaluation jobs, or paid-operation records were migrated. The shared private source helper is the exception explicitly approved by the user. Provider credentials intentionally match staging.

## Active production versions

- `distilled-news-production`: `c1251f19-5b0e-4780-b97b-1ca5f740f6e4` (15 encrypted secret bindings).
- `distilled-news-production-quality`: `62bac40c-c110-40b8-8efa-0082b446a67f` (6 encrypted secret bindings).
- `distilled-news-production-agentops`: `63bf077e-b965-4498-87df-0d88ffb88500` (1 encrypted secret bindings).

## Verification

- Runtime encrypted readback verified all 22 secret values exactly against staging; plaintext values and private transfer keys were not persisted.
- Production plain variables match the checked-in configuration. Public API/web URLs and telemetry identity are production-specific.
- All three staging services were restored to their exact original active versions. Active-version binding inspection confirmed that no transfer marker or proxy binding remained. Cloudflare’s script-settings endpoint can describe the last uploaded version after a version rollback; deployment and version APIs were checked directly.
- The normal production entry point is active. Temporary transfer handlers and the temporary collector service proxy are absent.
- Homepage, session API, and Explore API returned HTTP 200. Session reports `authenticated: false, setupRequired: true`; Explore is empty. The old staging feed API returns HTTP 404 on production.
- Both production R2 buckets are empty. Application accounts, briefing records, V1 feeds, revisions, jobs, model reservations, and evaluation jobs/calls are empty. Migration records and operational configuration are expected.
- Scheduled production evaluation discovery completed successfully, found zero feeds, reported no spending fence, and exported production metrics to Grafana (observed export: `2026-11-14T19:40:23.905Z`).
- Evaluator tests: 105 passed. Collector tests: 11 passed. Temporary transfer security checks: 9 passed. Worker and evaluator TypeScript checks passed.

No production feed or paid ingestion/evaluation call was created for testing, preserving the requested clean start. A complete briefing lifecycle remains to be exercised after a real production feed is configured. Existing Grafana staging notification rules were not repointed to production.
