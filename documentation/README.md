# Acquisition and legacy engineering references

The [current documentation index](../docs/README.md) is the starting point for the product, deployment, testing and course evidence. The documents in this directory preserve acquisition methods, validation results and historical interface decisions.

| Topic | Reference |
| --- | --- |
| Current benchmark CLI and offline reproduction | [Acquisition benchmark](../evaluation/acquisition-benchmark/README.md) |
| Experiment design, scoring and provider comparison | [Scraper and API evaluation plan](SCRAPER_AND_API_EVALUATION_PLAN.md) · [Testing steps](SCRAPER_TESTING_STEPS.md) · [Acquisition benchmark design v1.5](../docs/planning/v1.5/ACQUISITION_BENCHMARK_RUNBOOK_v1.5.md) |
| Recorded source and publication validation | [Testing evidence](testing-evidence/README.md) · [Real news end-to-end evaluation](REAL_NEWS_END_TO_END_EVALUATION.md) · [Five-feed QA](FIVE_FEED_QA_VALIDATION_2026_10_15.md) |
| Compatibility and provenance | [V1 architecture and contract appendix](ARCHITECTURE_v1.md) · [Implementation agreement](PARALLEL_IMPLEMENTATION_AGREEMENT.md) · [Shared contracts](../packages/contracts/README.md) |
| Environment-specific deployment notes | [Joud deployment](JOUD_DEPLOYMENT.md) and [production deployment](../docs/production-deployment.md) |

Historical proposals describe capabilities contemplated at their revision. The [current architecture](../docs/ARCHITECTURE.md) describes the V3/V4 product path. Use authorized datasets and approved budgets when repeating live acquisition tests.

## Historical run records

The earlier acquisition runbook is preserved at its [original revision](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/ACQUISITION_BENCHMARK_RUNBOOK_v1.2.md). Use the current CLI and testing guides above to reproduce executed campaigns.

- The initial connector integration passed 100 connector and 43 core checks. The runtime full rerun recorded 260 passes, three failures and two skips. Two lease cases passed in isolation while the unchanged browser API guard still failed. All 212 Worker cases passed across multiple runs after installing Chromium. [Original record](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/CONNECTOR_MERGE_2026-10-02.md)
- The legacy [runtime checkpoint](V1_RUNTIME_CHECKPOINT.md) and [shared contracts](../packages/contracts/README.md) cover the integrated intake and publication paths. Earlier implementation snapshots preserve the [intake boundary and contract](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/V1_DOWNSTREAM_HANDOFF.md), [acquisition milestone](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/V1_ACQUISITION_EXECUTION.md), [feed intelligence milestone](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/V1_FEED_INTELLIGENCE.md) and [publication milestone](https://github.com/AmmarMohanna/distilled.news/blob/2f37bb445a2a54c4eb83eee2171e78facaeb3bab/documentation/V1_PUBLICATION_EXECUTION.md).
