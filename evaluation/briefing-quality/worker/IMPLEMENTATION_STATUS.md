# Continuous evaluator activation ? November 2, 2026 (Beirut)

The separate Worker is deployed and live for distilled-news-staging:
https://distilled-briefing-quality.distillednews-platform.workers.dev/

Final verified code version: 3a255220-e0e2-4bb7-b132-a8c4a05534f3.
Cron: every five minutes. Dedicated D1, private R2, review queue and DLQ.
Monitoring alone has a $5/day UTC admission ledger and a 100-call daily ceiling.
The user expressly authorized reusing the existing OpenRouter key. It was installed
without printing it. Generation and academic replay remain separately budgeted;
no such experiment or source acquisition was activated by this deployment.

Grafana aggregate export is enabled. The user supplied existing OTLP base URL,
instance ID and ingest token in ignored .env. Only those values were installed as
Worker secrets; HTTPS was normalized without editing .env. The existing Grafana
OTLP endpoint returned successful ingestion with no partial rejection. Private
Grafana dashboard import, notification routing and datasource-query verification
are not claimed: the supplied credential is an ingest credential, not admin access.

Resources in account e32b564514d4f9b9e383b7dd30dbb026:

- Evaluator D1 fc476615-df19-482c-8cba-7bd399dbeef3; migrations 0001 and 0002 applied.
- Private R2 distilled-briefing-quality-private.
- Queues distilled-briefing-quality and distilled-briefing-quality-dlq.
- SOURCE_DB is staging D1 ab259bfe-6029-4e20-8cb6-eea6b7a67459.
- New dashboard/metrics tokens are in ignored ../private/evaluator-access.json.

The staging application/database were not modified by evaluator implementation.
The source adapter issues only SELECT statements and has an invariant test.
D1 bindings cannot themselves enforce read-only access.

Validation: 238 automated tests (68 Python, 67 replay/Worker, 100 existing engine,
three exporter), both TypeScript checks, Worker build/dry-run and successful live
deployment. Real browser login, evidence drilldown and logout passed with zero
page errors. Unauthenticated private API and incorrect metrics-token scope return
401; dashboard returns 200. Private snapshots and accepted two-stage review reports
exist for real English and Arabic briefings. Exact source quotes are mechanically
validated; judge outputs failing that validation remain failed, not quality passes.

Initial live discovery found 64 published editions since November 1 UTC. Review
coverage and costs evolve continuously; ignored ../private/evaluator-live-smoke.json
contains the latest aggregate check and the private dashboard is authoritative.
A recorded intermediate ledger check showed 46 settled calls costing $3.270726,
plus one active reservation of $0.271646. These are monitoring costs, not experiment
costs or proof of quality. Never use an offline report's zero paid calls to describe
this live monitor. Missing reviews, uncertain evidence and failed judge responses
remain visible. No human calibration, scientific accuracy or participant outcomes
are asserted.

During activation, the prior-history validator was corrected to compare actual
reader history against publication time: legitimately late earlier publications
can fall after the next window start. Read-only collection jobs affected by that
check and the source-identity migration were safely requeued only when no provider
call existed. No paid call was retried. Dashboard JavaScript parsing was checked
and the browser login fix has a regression assertion.

Further quality work requires real independent human reviewers on representative
English/Arabic (and French if included) assessment units, calibration of false alarms
and missed problems, and separately approved frozen paired V3/baseline experiments.
Existing experiment manifests are historical and source hashes must be refreshed;
the $5/day monitoring authorization does not authorize those experiments.
