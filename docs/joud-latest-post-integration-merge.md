# Joud latest source/UI merge — October 24, 2026

Merged Joud's final `codex/integrate-joud-v3-source` state at `f76d23b` into `integrate-aya-v3-post-integration`, starting from `6707c96`. Both histories are preserved. No deployment, remote migration, paid acquisition/inference or real push delivery was performed.

## Combined changes

- Preserved Joud's streaming checked source recommendations, bounded discovery/topic publishers, request-local evidence reuse, recent checked-choice reuse and the ability to save accepted choices while slower recommendations arrive. Actual source-add failures remain visible.
- Preserved her latest list/card layout, action slots, header, loading, offline page, artwork presentation and dedicated deployment configuration.
- Preserved topic-backed article-body extraction, nested-related-article protection, the 2 MB HTML transport cap with separate retained-text limits, helper HTTP diagnostics, precise provider-generation recovery, publication dispatch recovery and V3 contention handling.
- Kept our creation-relative schedules and migration 0069, existing/daily schedules, no automatic Personal Briefing, fixed windows, full retained evidence, verifier/source identities, source-grounded prompts, publication memory, accounting and notification behavior.
- Kept HTTP 406/transient recovery and anonymous HTTP → Playwright → durable Zyte fallback, with exact-source, original-date, readability and uncertain-paid-operation protections.

## Feature-level conflict resolution

Three files conflicted; no entire-file ours/theirs selection was used.

1. `apps/web/src/main.tsx`: combined Joud's legacy headline/body display with the explicit V3 per-story renderer. `BriefingText` now accepts the existing legacy headline/body as a fallback; structured V3 keeps each original headline and citation. Both use Joud's headline class. Direction still follows content language independently of UI language. Two regressions cover the combined behavior. Restored the `normalizeSummary` import required by Joud's fallback after the compiler caught its absence.
2. `apps/worker/src/v1-downstream-runtime.ts`: retained our fallback adapter/source ownership imports and Joud's `PUBLIC_ARTICLE_MAX_BYTES` import. The runtime uses her 2 MB HTML cap without dropping our rendering/Zyte chain or its lease/accounting behavior.
3. `apps/worker/src/v1-intelligence/v3-window.test.ts`: retained all creation-relative/recovery regressions and appended Joud's semantic-lease contention test. The production change propagates contention without consuming draft attempts.

All 53 incoming changed paths were reviewed. Forty-four match Joud's final state exactly; nine shared paths contain feature-level adaptations, including two whitespace-only source cleanups. The existing V3 read-heading style rule is retained alongside her latest CSS. Our explicit renderer and two combined UI tests are additional adaptations outside her original changed-path set.

## Configuration, migrations and artifacts

Eleven prior protected paths were checked unchanged against `6707c96`: scheduling, product synchronization, repository persistence, briefing engine/prompts, push sender/preview, fallback adapter, Python helper, sources-QA configuration and migration 0069. No new migration is introduced. Apply 0069 before any future deployment to a database that has not received it.

Joud's D1, R2, VPC and dedicated queues remain scoped to her deployment. Her $10/day collector setting is retained there. Sources-QA's existing $15 configuration is unchanged. Package manifests and lockfile are unchanged. The merge does not transfer remote images, sessions, secrets or database state between deployments.

The incoming `apps/worker/dist-joud/` build and source map are retained byte-for-byte as historical generated artifacts. Active Joud configuration points to `src/index.ts`; the merged source is rebuilt for validation rather than treating that older bundle as the merged runtime. Generated bundle comment whitespace was not rewritten, preserving its source-map relationship. Source whitespace checks exclude this retained generated directory.

Rejected warning-selection, reader-focused writing and AI-written notification experiments remain evidence only. Active briefing prompts and model routing are unchanged from the already-integrated final V3 branch. Deterministic published-headline notification previews and `redirect: "manual"` remain intact.

## Validation

- 302 Worker tests across 20 files passed, including all changed Worker suites plus acquisition/fallback and notification preservation checks. Local setup and default test limits were bounded at 60 seconds for this Windows run; assertions were unchanged.
- 51 frontend tests passed, including two new combined-renderer regressions and Joud's streaming/save-while-loading checks.
- 108 connector tests passed for helper transport and provider/source extraction.
- TypeScript checks passed for connectors, briefing, web and Worker. The first web compiler run identified the missing import described above; final checks passed after correction.
- Final frontend production build and sources-QA Worker dry-run bundle passed. Nothing was deployed or uploaded.
- Four isolated Chromium fixture checks passed: English/Arabic content at 1280×800 and 390×844, English UI, bold headlines above bodies, content-driven RTL, functional source links, no horizontal overflow and no page JavaScript errors. Desktop English and mobile Arabic screenshots were visually inspected. These are local fixture checks, not live provider or device-delivery claims.

Local reports/screenshots are ignored under `.local-reports/joud-latest-merge-*`. Private benchmark datasets remain ignored and unchanged. No claim is made that every repository test or every live multilingual screen was exercised, or that source publishers/model factual accuracy is guaranteed by these merge tests.
