# Backend sources and AI editorial integration plan

> Execution: implement inline with independent scoped reviews. Preserve original reports and both Git histories.

**Goal:** integrate source scalability with current canonical intelligence, fix four demonstrated correctness findings, verify staging compatibility before deploying.
**Architecture:** additive source scheduling/queues and per-attempt batched graph reads around existing account-authorized, source-grounded intelligence; never replace newer semantic/editorial contracts with the older shared baseline.
**Tech stack:** Workers, D1, R2, Queues, TypeScript, Vitest, Python helper.
**Spec:** user mission dated October 15, 2026 in this conversation.

## Global constraints
- Base latest recovery branch61c3548; merge source branch9052b56, common23c4c49; refresh before push.
- Branch integration/backend-sources-ai-editorial only. No main/main2, QA or production deployment.
- Preserve immutable evidence, claims, editions, paid identities, grants and UNKNOWN liabilities. No paid canary without separate confirmation.
- Do not import QA15/source permissions. No destructive schema operations, resets or quiet-as-failure.
- Preserve public/private controls, Outlook, notification and manual-feature retirement.

## Review focus
- Stale turn or queue owner returning after replacement cannot commit canonical writes or acknowledge replacement ownership.
- Failed pre-boundary acquisition/reassessment is incomplete coverage even if no story can be published.
- An Event lacking propositions cannot borrow sibling article facts.
- Scoped trace pages must not materialize unrelated historical drafts/claims or hide accurate totals.
- Distinct migration filenames with matching numeric prefixes must both remain tracked without changing authorized spending.

## Task1: integrate histories and overlapping contracts
Files: source-backend.ts; v1-intelligence/{store,semantic-preparation,review-prefetch,scoring,engine}.ts; connector scheduling/turn/queue modules.
- [x] Inspect divergent commits and actual overlapping functions, independent reviews.
- [x] Stage no-commit merge; resolve individual blocks, retain read metrics/redirects/financial authority and newer model fences.
- [x] Run typecheck plus batching/CAS/source isolation/semantic admission tests; classify failures against parent code.
- [x] Commit reviewed merge with component decision report.

## Task2: truthful coverage and internal briefing result
Files: v1-intelligence/runtime.ts, app.ts; corresponding tests and shared publication status where needed.
- [x] Reproduce failed acquisition/reassessment -> false quiet and endpoint undefined -> NO_NEWS.
- [x] Persist incomplete source/review coverage with reasons; allow supported news publication without claiming completeness. Response derives from durable request result/state.
- [x] Verify quiet/pending/deferred/blocked/failed/published and source-history preservation; commit separately.

## Task3: Event-owned fallback
Files: v1-intelligence/shortlist.ts and ownership/source-bound tests.
- [x] Add red regression: two Events sharing article, missing/unavailable propositions, updated revision.
- [x] Preserve genuinely legacy single-owner fallback; retain semantic ownership gaps for reassessment rather than importing full article.
- [x] Verify sibling new facts, novelty, corrections and protected obligations remain available; commit.

## Task4: scoped Pipeline Trace
Files: v1-intelligence/pipeline-trace.ts and tests.
- [x] Instrument query fixture and show unrelated history loaded before pagination.
- [x] Push view/filter/page predicates to indexed D1 access; preserve totals/cursors, graph lineage, costs and tenant authorization.
- [x] Test100+ candidates and large unrelated history plus missing article/UNKNOWN/no-mutation; commit.

## Task5: combined verification and staging gate
Files: wrangler.staging.toml, additive schema tests/docs and deployment report as justified.
- [x] Inventory migration filenames/hashes against staging d1_migrations and schema; inspect repository/Wrangler execution ordering.
- [ ] Run full Worker and connector tests, helper tests, workspace typecheck, frontend build, exact staging dry-run; retain every failure.
- [ ] Preflight source helper, exact resources/queues/DLQs, current grants/UNKNOWN, existing data, expected autonomous paid work and rollback.
- [ ] Push new branch. Apply only authorized additive migrations/resources after backup and review; if permission unclear or paid activation unsafe stop at gate.
- [ ] Deploy staging only after passing gate. Verify exact version/assets/bindings/data and read-only source-to-edition evidence.
- [ ] Request separate paid canary confirmation if required. Do not call deployment/test pass proof of news quality.

## Initial integration rulings
- Parallel/batched semantic preparation from recovery already performs the same graph retrieval with an indexed membership map and bounded metrics; retain it, with source review-prefetch in transaction attempts.
- Duplicate readMany/preloadRevisions from automatic merge are equivalent mechanisms: keep one implementation each, preserve cross-Feed rejection and per-attempt misses.
- Combine approved same-origin RSS redirect behavior with source public-fetch reuse and independent provider accounting. No whole-file preference.
