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

The [acquisition and legacy contract index](../documentation/README.md) leads to archived methodology, executed benchmarks and compatibility references. The [planning context](planning/README.md) points to retained failure analysis and course planning. Dated integration reports explain what was tested or ported at the named revision. Check current source and configuration before using their procedures.

### Historical integration validation

| Recorded run | Evidence and scope |
| --- | --- |
| Source and reader integration | The dedicated Worker dry run passed. The browser run recorded **77/105** passes, and the same 28 named browser failures reproduced on the prior build. The default container build was limited by unavailable Docker. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-v3-source-integration.md) |
| Source/UI integration | **302 Worker, 51 frontend, and 108 connector tests** passed, along with four isolated Chromium checks. Builds reran from source. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-latest-post-integration-merge.md) |
| Briefing recovery integration | The fixed-window suite passed all **18** checks. The broader Worker run recorded **2,164 passes, 75 failures, 32 skips, and four unhandled errors**. A parent comparison proved 31 of the failures pre-existing, while the other 44 were unresolved. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-v3-repair-context-integration.md) |
| Scheduling and frontend integration | **1,000** unique unit/integration tests passed with one connector skip. The original browser matrix passed **56/57**. The timed-out case passed a focused rerun. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/ghada-joud-aya-integration.md) |

## Repository map

| Location | Purpose |
| --- | --- |
| `apps/` | Reader, Worker API/runtime and AgentOps collector |
| `packages/` | Briefing, acquisition connectors, browser runtime/bridge and shared contracts |
| `docs/` | Current architecture, operations, evaluation evidence and research reports |
| `documentation/` | Acquisition methodology, verified historical reports and legacy compatibility contracts |
| `evaluation/`, `benchmarks/` | Experiment harnesses, fixtures, machine results and reproducibility |
| `ops/`, `scripts/`, `.github/workflows/` | Operator tooling, automation and CI |
