# Continuous evaluation

**November 12 staging policy update:** the owner requested no monetary limits. The evaluator now supports `SPENDING_MODE=unlimited`, bypassing monetary and daily-call admission quotas while retaining paid-operation accounting and uncertainty protections. Earlier capped-budget descriptions below are historical/bounded-mode behavior. See the Worker README for current configuration.

## Current implementation — November 2, 2026

The [separate Cloudflare Worker](worker/README.md) implements the live layer below
and is deployed for **distilled-news-staging**. Five-minute Cron discovery queues
private D1/R2 snapshots; independent development identification precedes atomic
claim/coverage review. Monitoring alone uses $5/day; generation and academic replay
remain separately authorized experiments. The user approved reusing the existing
OpenRouter key, installed without displaying it. Live reviews are enabled.

The private dashboard is https://distilled-briefing-quality.distillednews-platform.workers.dev/.
Enter the evaluator-only DASHBOARD_TOKEN from ignored `private/evaluator-access.json`.
Aggregate Prometheus metrics, direct Grafana OTLP export, dashboard import and alert
templates are implemented. Grafana aggregate export is enabled, and OTLP ingestion acceptance has been verified.
Grafana dashboard import and datasource queries remain separate operator steps.

All six offline phases pass: 238 tests plus replay and Worker type checks. Live
records are separate, including failed judge outputs, partial evidence, actual
costs and unreviewed cases. They never become synthetic human observations.

The design notes below describe the rationale; this section and worker/README.md
supersede earlier statements that the live layer is only proposed.

## Available now: offline regression checks

Run `python evaluation/briefing-quality/continuous.py` from the repository root.
It runs the evaluation's Python tests, provider-double replay tests, existing
briefing-engine regression tests, exporter tests and TypeScript checks. It exits
nonzero if any check fails or times out. Reports and logs are retained under
ignored `reports/continuous/`; `latest.json` points to the newest result.
Repeated runs keep separate records, even if the clock returns the same instant.

The `Briefing evaluation` GitHub Actions workflow runs on relevant pushes and
pull requests, manually, and daily at 06:00 UTC. The daily schedule starts only
after the workflow and evaluation code are merged into the default branch.
The workflow and code are maintained on the evaluation branch. A local green
report does not prove a GitHub Actions run passed, and scheduling requires the
workflow on the default branch.

Failures appear as a red check with a job summary and downloadable logs. GitHub
email notifications depend on each person's notification settings. No email,
Telegram or Slack alert integration is configured. Repository administrators can
require `Offline evaluation checks` before merging; this work does not change
branch protection.

These checks use synthetic fixtures and recorded/provider-double responses.
They do not inspect deployed briefings, certify human factual accuracy, measure
participant benefit, or make paid model calls. The report marks those dimensions
as unmeasured. A green status means these regression checks passed.

## Design rationale: fresh briefing review by an LLM

This original design is now implemented by the separate Worker above. Generate isolated
evaluation briefings from retained full evidence before creating production test
feeds. Keep evaluation artifacts outside public feeds, production reader memory,
and production financial operations.

For each sampled briefing, supply an independent reviewer with:

- Full retained source bodies and immutable source/citation identities.
- Feed interests, requested language, timezone and reporting-window boundaries.
- The exact generated briefing and actual prior published reader text.
- Pipeline outcome and recorded call/usage metadata, kept separate from prose.

Ask for structured findings, not just an overall score:

| Dimension | What the reviewer should identify |
| --- | --- |
| Factual support | Unsupported or contradicted statements, changed attribution, names, dates, quantities, and overstated certainty. |
| Citation support | A referenced source that does not support the linked claim. |
| Coverage | Potential important omissions, with the omitted fact and its source; human expected-fact references remain the stronger measurement. |
| Relevance | Items unrelated to the stated interests. |
| Continuity | Repeated old prose, merged distinct stories, missed updates/corrections, and unsupported novelty claims. |
| Language/readability | Wrong output language or unclear/truncated reader text. |

Each finding needs a category, severity, affected item/claim, source IDs, exact
evidence excerpts, explanation and an explicit unresolved option. Validate its
schema, source ownership and quoted text mechanically. Treat source text and
briefing text as untrusted data, never as reviewer instructions.

Keep deterministic operational checks alongside the reviewer: missing evidence,
terminal/unknown pipeline outcomes, publication delays, broken citations,
duplicate operations, usage/cost bounds and missing judge outputs. Missing or
failed reviews must be reported as unknown, not passed.

Start with a bounded sample of fresh cases plus fixed known failure fixtures.
Calibrate against independent human review and track false positives/negatives.
Record judge/model/prompt versions and evidence hashes so drift is visible.
Separate AI judgments from human labels and avoid training/tuning on held-out
cases. Do not automatically rewrite, delete or republish reader-facing briefings
from an uncalibrated reviewer verdict.

Before activation, agree the target environment, sources/cases, cadence, separate
generation/reviewer/source-acquisition budgets, concurrency, hard call ceilings,
unknown-outcome fences, private retention and alert destination. Paid replay
still requires the exact manifest approval described in `reports/PAID_RUN.md`.
Changed evaluator code makes the old manifest's source hashes stale: generate and
review a fresh proposal rather than bypassing that check. No new spending or
notification delivery has been activated here.

### SOURCE_DB reset recovery (November 2026)

The evaluator classifies a D1 deployment reset (`D1_ERROR` with code `7429`, the explicit database-code-update reset message, or the explicit `D1 DB exceeded its CPU time limit and was reset.` message) only around source SELECTs. Collection returns to `pending_snapshot`; a publication visibility check returns to `ready`. The next scheduled tick retries the read. Paid transport failures, generic exceptions, semantic validation failures, UNKNOWN/RESERVED calls and settled calls without a response body do not become retryable through this classification.

For historical `review_failed / EVALUATION_FAILURE` jobs, the existing recovery policy performs a single automatic recovery only if the retained snapshot exists and **no `eval_calls` record exists for the job**. It records the original error and status in `eval_recovery_events` before requeueing. This handles never-sent work such as the Berri 14:45 UTC failure without inventing a cause for its old generic exception. Already audited jobs are excluded. Old-protocol recovery also excludes all jobs with paid call records; a formatting change is not permission to pay for the same stage again.

A recovered review keeps its immutable snapshot and original request identity. Exact settled responses are read from R2. A settled stage whose request identity changes is blocked with `STAGE_REQUEST_IDENTITY_CHANGED`. The existing no-body/UNKNOWN fences remain in place. Do not bulk reset paid semantic-invalid jobs. Diagnose their retained response and original request separately.

`evaluation_incomplete` logs include the job ID, execution phase, normalized error category and a recognized provider code. They deliberately omit raw exception messages, SQL, source bodies and credentials. Old `EVALUATION_FAILURE` records cannot establish their original exception retrospectively.

No migration or manual live UPDATE is needed for this recovery. After deploying the evaluator, inspect the recovery audit and job status following the next scheduled tick. Deployment and live verification are separate operator actions.
