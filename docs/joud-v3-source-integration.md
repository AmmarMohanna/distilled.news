# Joud frontend / V3 / source integration

Integration branch: `codex/integrate-joud-v3-sources` (October 22, 2026).

## Pinned history and scope

- Started from Joud's latest fetched `frontend-fixed`:
  `ebe6997e6ef3f604d9c9ab821295394bd91822aa`.
- Incoming V3/source integration:
  `f18ef4bc8793bde8daaa95590d5cf5f7743b75eb`.
- Merge base: `785c56bfa9e75ca38f3211c389fddbb2e384d3f9`.
- Incoming history retains V3 `399acc9`, source fixes `35883ed`, and shared
  scheduling foundation `ac6299f`. Original branches were not rewritten.
- The supplied handoff and inventory are retained under `documentation/`.
  Frozen architecture, agreement, and `packages/contracts` remain unchanged.

This integrates code for review. It does not deploy, run remote migrations,
perform billable live tests, change credentials, or enable reader notifications.
Joud's configuration remains unchanged, including its existing engine selection.

## Accepted backend behavior

The incoming V3 path remains editor -> verifier -> targeted repair when needed ->
persistence. GPT-4.1 edits/repairs and GPT-4.1 mini verifies. Full retained evidence,
finite admission/batching, cutoff-aware temporal prompts, source-owned repair and
citation identities, actual published reader memory, first-complete reporting
intervals, timezone-aware fixed windows, stale-backlog filtering and recoverable
chronological processing remain intact. Started V2 operations keep their frozen
recovery and financial identities.

Source fixes retain distinct original publication, update and acquisition times,
explicit date provenance/conflict handling, negative encoded/unreadable-text
checks, conservative extraction completeness, and original connector hints.
Frozen X collection bounds, shared upstream cooldowns, durable source execution
admission, source scheduling/recovery and typed acquisition diagnostics remain.

All V3 failure fixtures, reports and benchmark evidence from the incoming branch
are retained. Successful publication/persistence is not proof of factual accuracy;
the known date, attribution and grouped-claim failures remain documented.

## Protected implementation and shared-file resolution

`scripts/check_joud_feature_preservation.py` verifies all 56 frontend files and 33
protected backend/configuration files against the pinned Joud snapshot. This
includes all frontend tests and styles, artwork generation/retrieval/storage,
recommendations and fetched-evidence assessment, private verification, native
extraction, collector budget implementation, maintenance implementation, shared
provider charging/normalization, execution server, repository and Joud bindings.
The frontend has no diff against Joud. Its separately built baseline and merged
JavaScript/CSS assets are byte-identical.

Shared changes were resolved by feature, including automatically merged changes:

| Shared path | Resolution |
| --- | --- |
| `apps/worker/src/app.ts` | Keep all Joud routes, recommendation checks, artwork and maintenance behavior; add first-full-interval scheduling and truthful next-boundary reporting. |
| `apps/worker/src/index.ts` | Keep dedicated image processing/dispatch and maintenance-before-scheduling; retain incoming V3 dispatch, recovery, transport leases and accounting. Image work remains outside source/intelligence admission. |
| `connector-runtime.ts` | Keep Joud deployment availability/authorized native routing checks; combine frozen X-window authorization and existing-job recovery. |
| `source-backend.ts` | Keep native public/Telegram isolation, website same-origin redirects and the shared daily budget in **both** durable paid HTTP constructions; add cooldowns and private-execution admission. |
| `public-source-fetch.ts` | Keep Joud bounded, same-origin redirect handling; add optional typed Retry-After metadata. |
| `v1-downstream-runtime.ts` | Keep native website acquisition and authorized private routing; add shared private-service capacity admission and incoming acquisition/normalization changes. |
| `v1-intelligence/semantic-operations.ts` | Keep minimal unpaid wait records in every wait branch; retain provider admission, reservation/recovery identities, settlement and uncertain-outcome fences. Both branches' regression cases remain. |
| `connector-availability.ts`, `product-feeds.ts` | Retain native/provider availability and existing API fields; add typed persistent collection diagnostics and optional collection-progress metadata. No frontend adaptation was introduced. |
| `types.ts`, manifests, lockfile | Combine additive V3/scheduler types and package dependencies without removing Joud bindings. |
| Connector scheduling/provider code | Retain Joud provider HTTP/normalization and native extraction; add source scheduling bounds, retry/cooldown diagnostics and article integrity checks around those interfaces. |

The older incoming recommendation implementation was excluded: it would replace
Joud's exact-topic, geographic and historical verification/recovery system. The
incoming generic execution-server queue was also excluded in favor of Joud's
existing authentication, Telegram serialization, bounded concurrency, optional
Telegram wait and retryable backpressure. Their protected tests were retained.
Worker-side execution admission still applies to authorized private dispatch.

Two inherited collector-to-publication tests still expected V2 event graphs.
Only their briefing steps were adapted to V3 with mocked editor/verifier calls.
RSS/Telegram authorization, immutable replay/checkpoints, private/native routing,
source references, publication and duplicate-call assertions remain covered.

## Migration and deployment compatibility

No applied migration was renamed, deleted or rewritten. Numeric prefixes
0059/0060/0061 are shared by **different full filenames**, with independent tables:

| Incoming source lane | Protected Joud lane |
| --- | --- |
| `0059_connector_feed_turn_waiters.sql` | `0059_feed_sketch_jobs.sql` |
| `0060_connector_work_slots.sql` | `0060_storage_retention_indexes.sql` |
| `0061_connector_collection_windows.sql` | `0061_daily_collector_budget.sql` |

Migration bookkeeping must retain full filenames; do not build a numeric-prefix
deduplication tool or rewrite deployed history to make prefixes unique. There is
no incompatible table/column definition requiring a replacement schema migration.
Both existing deployments receive the other lane's unapplied additive files.
The fresh schema has 77 migration files. Existing Joud has ten pending full
filenames; existing V3/source has three. Offline SQLite upgrades from both parents
converge with integrity/foreign-key checks and retained account, daily reservation
and unknown-paid-hold data. The earlier V3/source upgrade/replay check also passes.

`wrangler.joud.jsonc` is unchanged: Joud DB, R2, queues, VPC service, image queue,
maintenance opt-in, total $5/day collector ceiling and Asia/Beirut reset remain.
The separate sources QA and isolated V3 QA resource configurations remain separate.
No scope expiry or historical evaluation grant was renewed. Before any later
deployment, apply the correct environment's pending migrations and independently
review engine/provider routing and financial authority.

## Validation

- All eight workspace package TypeScript checks passed. Worker TypeScript was
  checked again after the integration test/harness adjustments.
- 47 briefing, 43 core, 44 contracts, 41 frontend and 29 Python extraction tests
  passed. All 40 root Node script cases passed across the initial run and an
  isolated retry of one subprocess timeout.
- All 291 connector cases passed across the complete run and focused retries.
  The initial run timed out on three cases at five seconds. Two passed with a
  longer runner deadline; the 200-item RSS snapshot passed alone in 10.2 seconds.
  Assertions and protected tests were not relaxed.
- Worker coverage: 195 cases passed in the initial 25-file focused run. Its two
  obsolete V2 publication fixtures were adapted to V3 and passed, and its D1
  migration test passed after correcting the harness's SQL parsing. Together
  with 55 passing application cases and ten shared entry/feed/progress cases,
  this covers **263 successful distinct Worker cases**.
- Five protected recommendation-recovery cases still fail. All five reproduce
  on the untouched Joud Worker source: mocks expect four arguments, while the
  implementation calls `assessSources` with a fifth `undefined` when there is no
  verification scope. Their returned-source assertions pass before the mock-call
  assertion fails. The protected implementation and assertions remain unchanged.
  This is a baseline coverage mismatch, not a claim of a fully green suite.
- The D1 harness previously split multiline trigger bodies at semicolons. It now
  executes complete flattened scripts in the same manner as the intake harness,
  retaining all foreign-key, repository, visibility, search/star and schema
  assertions. Production migration SQL is unchanged.
- Fresh SQLite and both parent-upgrade paths pass schema convergence, integrity,
  foreign-key and retained-data checks. The earlier V3/source replay/financial
  preservation script passes as well.
- Frontend build passed. Separately built baseline/merged JS and CSS asset bytes
  match. The dedicated Joud Worker dry-run bundle passed with her bindings. The
  root build reached the default Worker container build and failed because Docker
  is unavailable; no container or deployment was changed to bypass that limitation.
- Seven existing Chromium Playwright suites ran 105 cases: 77 passed, 28 failed.
  Rerunning their failed source locations against the untouched Joud build selected
  32 cases (including four additional parameterizations): **the same 28 named
  failures reproduced**, with four passes. These include stale layout/selector
  expectations and existing assertions around form fitting, cards and translated
  controls. No frontend or protected assertion was changed to hide the failures.
- Direct baseline/merged screenshot comparisons cover 26 scenarios: English and
  Arabic; 390x844 portrait, 667x375 landscape, 1280x800 laptop and 1920x1100
  desktop; collapsed/expanded sidebar; Home/Explore/guest; populated/empty/loading/
  error reader; editor/profile/Settings and pending-artwork spinners. Nineteen pairs
  are pixel-identical. Seven have 5–82 differing pixels, each below 0.02% of the
  image, with matching geometry; inspected pairs show minor glyph/antialiasing
  differences. This does not constitute live-provider or exhaustive device proof.
- The root `pnpm test` command initially stopped at a script subprocess timeout
  (that script later passed alone). The broader workspace attempt subsequently
  encountered an inherited 90-second agent-runtime browser lifecycle timeout and
  was interrupted. A complete Worker run passed its 55 application cases but then
  stopped advancing in a local runtime fixture and was interrupted; the focused
  coverage above was run separately. Full workspace/Worker/browser-green status
  is therefore **not claimed**.

Recommendations, artwork, shared-budget exhaustion/unknown outcomes, private/native
routing isolation and archive-before-replacement failure behavior were checked
with mocked providers/local D1/R2 surrogates. No new paid/live provider test, remote
database migration, VPS update, or deployment was performed. The exact two original
article URLs remain unavailable; their ingestion failure classes have retained
regressions. Factual reliability and operational production readiness remain
separate from merge/persistence success.

Local logs, baseline build and screenshots are under `.local-reports/joud-*` and
are ignored working artifacts. Committed comparison metadata is under
`benchmarks/results/joud-v3-source-integration/`.
