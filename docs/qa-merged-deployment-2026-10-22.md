# Merged integration deployed to sources QA

The user authorized deployment after the merge review. On October 22, 2026 at
14:08 UTC, code commit `fbad502ccbb8b17cacf21a1bf4933e2e9c2a9e0e` was deployed to
<https://distilled-news-sources-qa.distillednews-platform.workers.dev>.

- Worker: `distilled-news-sources-qa`.
- Version: `b894f983-15ff-4239-8115-267261be24c6`, serving 100%.
- Previous version: `027c0e5f-7c07-4562-a7e9-ab6e830e6b5d`.
- Existing QA database, R2, VPC service, queues, variables and secret bindings
  were compared before/after deployment and preserved.
- Applied only pending additive migrations: `0059_feed_sketch_jobs.sql`,
  `0060_storage_retention_indexes.sql`, `0061_daily_collector_budget.sql`.
  Wrangler subsequently reported no pending migrations.
- Live frontend returned HTTP 200 and matched the built index byte-for-byte.
  `/api/auth/session` and `/api/explore/feeds` returned HTTP 200 JSON.
- V3 remains selected, with GPT-4.1 editing/repair and GPT-4.1 mini verification.
  Existing financial settings and account authority were not expanded.

QA retains its existing configuration limits: source recommendations are disabled,
and `CLOUDFLARE_IMAGE_API_TOKEN` is not configured, so new artwork generation is
unavailable. No credentials were copied from Joud's deployment. The Python helper
was not deployed to the private execution service. No paid evaluation, manual
maintenance trigger, feed creation, reader notification test or production
deployment was performed. Normal QA Cron and queue triggers remain configured.

The baseline test failures and full-suite limitations described in
`joud-v3-source-integration.md` remain applicable. HTTP/persistence success does
not establish factual accuracy.
