# Documentation

The immediate priority is to compare scraper and acquisition API options before committing to new integrations.

Start with [External Testing: A to Z](EXTERNAL_TESTING_A_TO_Z.md) for the complete Windows-to-VPS operating guide, source configuration, all three testing stages, recovery, billing, and report export. Use [Scraper and API Testing on the University VPS](SCRAPER_TESTING_STEPS.md) for the broader experiment design and [Scraper and API Evaluation Plan](SCRAPER_AND_API_EVALUATION_PLAN.md) for scoring and methodological detail.

## Reading order

| Document | Use |
|---|---|
| [External Testing: A to Z](EXTERNAL_TESTING_A_TO_Z.md) | Start-to-finish external testing instructions, actual CLI commands, each source/candidate, references, schedules, recovery, costs, backups, and final deliverables. |
| [Runnable benchmark and commands](../evaluation/acquisition-benchmark/README.md) | Implemented CLI, all source adapters, stage configs, offline demo, scoring and recovery. |
| [General image](<general image.md>) | Quick source-by-source table of specific APIs/scrapers, plus an explanation of the existing Telegram scraper. |
| [Example Telegram](<example telegram.md>) | One-channel walkthrough with setup commands, illustrative collector code and comparison instructions. The original snippets are illustrative; the document links to the implemented collectors. |
| [Scraper and API Testing on the University VPS](SCRAPER_TESTING_STEPS.md) | Experiment design, source/provider roster, and stage rationale. Use the A-to-Z guide for current execution commands. |
| [Scraper and API Evaluation Plan](SCRAPER_AND_API_EVALUATION_PLAN.md) | Detailed procedure, scoring rules, and implementation requirements. |
| [Benchmark implementation notes](../implementation/ACQUISITION_BENCHMARK_IMPLEMENTATION.md) | Initial Python implementation and its limitations. Consult the evaluation plan for subsequently identified test gaps. |
| [Acquisition Benchmark Runbook](ACQUISITION_BENCHMARK_RUNBOOK_v1.2.md) | Extended experimental background and scenarios. Apply the current plan's scoring and execution clarifications. |
| [VPS Execution Guide](DISTILLED_VPS_TO_ACQUISITION_BENCHMARK_FULL_GUIDE.md) | Server preparation and operational reference. Confirm the actual host configuration before following environment-specific instructions. |
| [Architecture Baseline](ARCHITECTURE_BASELINE_v1.2.md) | Broader conceptual architecture. |
| [Technical Contracts and Service Boundaries](TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.2.md) | Proposed logical ownership, schemas, and reliability contracts. |
| [Implementation Plan](IMPLEMENTATION_PLAN_v1.2.md) | Broader milestone and evaluation program. |

## Implementation status and authority

The current application is the Cloudflare-first implementation described in the [project README](../README.md) and [AGENTS.md](../AGENTS.md). Conceptual documents include capabilities and infrastructure that are not implemented; they are not an inventory of current behavior.

The [acquisition benchmark package](../evaluation/acquisition-benchmark/README.md) now includes all candidate adapters, a CLI, durable jobs/budgets, raw evidence, extraction, normalization, scoring, reports, scheduling and offline tests. Live account settings, independent labels and server experiments are still required. No provider winner is established by these documents.

The new evaluation plan updates the acquisition work sequence and reconciles methodological differences between the earlier runbook and VPS guide. It does not change the application's deployment stack or public-feed model.
