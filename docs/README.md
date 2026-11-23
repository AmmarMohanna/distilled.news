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
| Course report and grading evidence | [Technical report source and preview](report/README.md) · [Evaluation evidence PR #43](https://github.com/AmmarMohanna/distilled.news/pull/43) |
| Product quality, baselines and limitations | [Evaluation suite](../evaluation/briefing-quality/README.md) · [October baselines and split limits](../evaluation/briefing-quality/reports/FINAL_REPORT.md) · [V4 integration and excluded candidates](v4-final-release-2026-11-09.md) |
| Factuality, novelty and recovery regression evidence | [Source-bound verification](SOURCE_BOUND_CLAIMS.md) · [Failed production identity cases](PRODUCTION_IDENTITY_REVIEW.md) · [Recorded failures and repairs](BRIEFING_QUALITY_FIXES_2026-11-19.md) · [Live-model qualification](../evaluation/briefing-quality/reports/live-fixes-20261119/GO_RESULT.md) |
| Cost, capacity and valid publication | [Cost comparison](../evaluation/briefing-quality/reports/cost-reduction-20261119/PAID_VALIDATION.md) · [Synthetic 1,000-feed preparation](v3-thousand-feed-capacity.md) · [Real publication pilot](observability/REAL_PUBLICATION_PILOT_2026-11-02.md) · [Staging qualification and CI](release/STAGING_LIVE_QUALIFICATION_20261119.md) |
| Acquisition, k6 and regressions | [Acquisition benchmark](../evaluation/acquisition-benchmark/README.md) · [Performance and fault workloads](../evaluation/performance-reliability/README.md) · [Offline evaluation workflow](../.github/workflows/briefing-evaluation.yml) |

Private retained article text, model responses, and live receipt bundles are handled separately from public summaries. A CI fixture, live staging validation and production assessment have different scopes. Preserve failed and unassessable outcomes in every comparison.

## Historical engineering context

The [acquisition and legacy contract index](../documentation/README.md) leads to archived methodology, executed benchmarks and compatibility references. The [planning context](planning/README.md) points to retained failure analysis and course planning. Dated integration reports explain what was tested or ported at the named revision. Check current source and configuration before using their procedures.

## Repository map

| Location | Purpose |
| --- | --- |
| `apps/` | Reader, Worker API/runtime and AgentOps collector |
| `packages/` | Briefing, acquisition connectors, browser runtime/bridge and shared contracts |
| `docs/` | Current architecture, operations, research reports and technical report |
| `documentation/` | Acquisition methodology, verified historical reports and legacy compatibility contracts |
| `evaluation/`, `benchmarks/` | Experiment harnesses, fixtures, machine results and reproducibility |
| `ops/`, `scripts/`, `.github/workflows/` | Operator tooling, automation and CI |
