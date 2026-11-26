# Documentation index

Start with the [project README](../README.md) for the product, local setup and a map to course evidence. This index separates current operating instructions, completed measurements and historical design context.

## Current system

| Topic | Reference |
| --- | --- |
| Architecture, provider boundaries and publication | [Current architecture](ARCHITECTURE.md) · [V3 window adapter](../apps/worker/src/v1-intelligence/v3-window.ts) · [Editorial engine](../packages/briefing/src/engine.ts) |
| Reader, localization, PWA and notifications | [Web app guide and preservation notes](WEB_APP_AND_NOTIFICATIONS.md) |
| Source identity and retention | [Collection and cutoff](briefing-collection-cutoff.md) · [Feed archive](feed-archive.md) · [Source-bound claims](SOURCE_BOUND_CLAIMS.md) |
| Persistence and failures | [Transactional recovery](transactional-briefing-recovery-staging-2026-11-13.md) · [Source accounting replay](BRIEFING_QUALITY_FIXES_2026-11-19.md) |

## Deploy and operate

- [Production deployment and resource boundaries](production-deployment.md), [checked-in production config](../apps/worker/wrangler.production.jsonc) and [local config](../apps/worker/wrangler.toml). Review the exact target and approval before migrations, provisioning or deployment.
- [Collector and dashboards](observability/SETUP.md), [operational runbooks](observability/RUNBOOKS.md) and [independent quality Worker](../evaluation/briefing-quality/worker/README.md).
- [DevSecOps](security/DEVSECOPS.md), [container vulnerability decisions](security/CONTAINER_VULNERABILITY_MATRIX.md), and [historical failure matrix](planning/v1.5/FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md). The historical matrix records design risks and proposed checks. Execution evidence lives in tests and reports.

## Evaluation and evidence

| Need | Start here |
| --- | --- |
| Course evaluation and grading evidence | [Agent performance and evidence appendix](AGENT_PERFORMANCE_EVALUATION.md) |
| Product quality, baselines and limitations | [Evaluation suite](../evaluation/briefing-quality/README.md) · [October baselines and split limits](../evaluation/briefing-quality/reports/FINAL_REPORT.md) · [V4 integration and excluded candidates](v4-final-release-2026-11-09.md) |
| Factuality, novelty and recovery regression evidence | [Source-bound verification](SOURCE_BOUND_CLAIMS.md) · [Failed production identity cases](PRODUCTION_IDENTITY_REVIEW.md) · [Recorded failures and repairs](BRIEFING_QUALITY_FIXES_2026-11-19.md) · [Live-model qualification](../evaluation/briefing-quality/reports/live-fixes-20261119/GO_RESULT.md) |
| Cost, capacity and valid publication | [Cost comparison](../evaluation/briefing-quality/reports/cost-reduction-20261119/PAID_VALIDATION.md) · [Synthetic 1,000-feed preparation](v3-thousand-feed-capacity.md) · [Real publication pilot](observability/REAL_PUBLICATION_PILOT_2026-11-02.md) · [Staging qualification and CI](release/STAGING_LIVE_QUALIFICATION_20261119.md) |
| Acquisition, k6 and regressions | [Acquisition benchmark](../evaluation/acquisition-benchmark/README.md) · [Source recovery cases](acquisition-evaluation.md#recorded-recovery-cases) · [Performance and fault workloads](../evaluation/performance-reliability/README.md) · [Offline evaluation workflow](../.github/workflows/briefing-evaluation.yml) |

Private retained article text, model responses, and live receipt bundles are handled separately from public summaries. A CI fixture, live staging validation and production assessment have different scopes. Preserve failed and unassessable outcomes in every comparison.

## Historical engineering context

The [acquisition and legacy contract index](../documentation/README.md) leads to archived methodology, executed benchmarks and compatibility references. The [planning context](planning/README.md) points to retained failure analysis and course planning. The historical checks below record their own revisions and scopes. Use the current setup and deployment guides above for operating instructions.

### Historical integration validation

| Recorded run | Evidence and scope |
| --- | --- |
| Source and reader integration | The dedicated Worker dry run passed. The browser run recorded **77/105** passes, and the same 28 named browser failures reproduced on the prior build. The default container build was limited by unavailable Docker. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-v3-source-integration.md) |
| Source/UI integration | **302 Worker, 51 frontend, and 108 connector tests** passed, along with four isolated Chromium checks. Builds reran from source. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-latest-post-integration-merge.md) |
| Briefing recovery integration | The fixed-window suite passed all **18** checks. The broader Worker run recorded **2,164 passes, 75 failures, 32 skips, and four unhandled errors**. A parent comparison proved 31 of the failures pre-existing, while the other 44 were unresolved. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-v3-repair-context-integration.md) |
| Scheduling and frontend integration | **1,000** unique unit/integration tests passed with one connector skip. The original browser matrix passed **56/57**. The timed-out case passed a focused rerun. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/ghada-joud-aya-integration.md) |
| Source and V3 integration | **343 distinct focused checks** passed across packages. The shared Worker run initially passed **106/107**. A stale verifier test double was corrected and the final two-file run passed 12/12. Both migration upgrade paths and two Worker dry-run builds passed. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/v3-source-integration.md) |
| Frontend integration checkpoint | The partial Worker run was interrupted by timeouts. Isolated engine and publication runs passed **6/9** and **4/13** respectively at the original limit. The completed [frontend integration report](FRONTEND_PRODUCT_MAIN2_REPORT.md) separately records four real staging editions. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/FRONTEND_PRODUCT_MAIN2_CHECKPOINT.md) |
| V3 and acquisition integration | **100 briefing, 295 connector, 62 frontend and 84 focused Worker tests** passed. Full Worker and browser suites and live factual evaluation were outside this run. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/aya-ghada-integration-2026-10-26.md) |
| Source and frontend preservation | **147 focused Worker and 49 selected Chromium checks** passed, including English, French and Arabic coverage. The connector invocation passed **321**, with one timeout and one opt-in skip. The timed-out case passed in isolation. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/aya-joud-frontend-integration-2026-10-28.md) |
| Acquisition and scheduling preservation | **111 frontend and 202 connector checks** passed, with one connector skip. The initial Worker run passed **170** and failed **2**. All six focused rerun cases passed after corrections. Separate scheduling and recovery reruns overlap the first run. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/aya-ghada-preserved-integration-2026-10-30.md) |
| AgentOps and k6 integration | **265 focused Worker, 340 connector and 103 script/evaluation checks** passed, with one connector skip. Static dashboard validation and a Worker dry run passed. These were local fixtures. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/aya-ghada-agentops-k6-preserved-integration-2026-10-30.md) |
| Source repair and V3 integration | **301 of 309 selected Worker tests** passed on the first run. The eight setup/test timeouts passed on a focused rerun with 60-second limits. The report counts **431** distinct passes across briefing, frontend and selected Worker coverage. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/aya-v3-post-integration-merge.md) |
| Combined acquisition, publication and observability | **123 briefing, 348 connector, 157 script/campaign and 242 focused Worker tests** passed, with one connector skip. The QA Worker dry run passed. Providers were mocked. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/working-version-integration-2026-11-02.md) |
| Beta integration | The initial local report records **188 frontend, 83 selected extraction, 145 browser, 10 Node helper and 34 Python helper tests**, with one recorded skip in each of the extraction and browser suites. A backend check exposed a missing BBC attribution alias, tracked separately from the passing runs. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/docs/release/THREE_BRANCH_INTEGRATION.md) |

## Repository map

| Location | Purpose |
| --- | --- |
| `apps/` | Reader, Worker API/runtime and AgentOps collector |
| `packages/` | Briefing, acquisition connectors, browser runtime/bridge and shared contracts |
| `docs/` | Current architecture, operations, evaluation evidence and research reports |
| `documentation/` | Acquisition methodology, verified historical reports and legacy compatibility contracts |
| `evaluation/`, `benchmarks/` | Experiment harnesses, fixtures, machine results and reproducibility |
| `ops/`, `scripts/`, `.github/workflows/` | Operator tooling, automation and CI |
