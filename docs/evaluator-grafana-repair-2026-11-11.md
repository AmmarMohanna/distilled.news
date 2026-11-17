# Evaluator and Grafana repair — 11 November 2026

Scope: the separate staging evaluator, its own database/queue/private archive, the
existing operations collector, and the existing private Grafana folder. No main
application deployment, source ingestion change or new workload quota was added.

## Fixes

- Evaluator migration 0003 adds exact-call isolation, provider receipts, recovery
  audit records, review-version identity and published/QUIET outcome metadata.
- The explicitly enabled 20-minute recovery policy isolates stale execution holds
  without rewriting UNKNOWN charges or permitting a changed-prompt resend of the
  same unresolved job/stage. Unknown exposure still counts toward the previously
  authorized monitoring budget. Completed billing can be recovered by exact bound
  generation metadata, without pretending missing review text was recovered.
- The sampled failed English review had cited prior-reader IDs and prior text as
  current evidence; sampled Arabic output also contained foreign IDs. Current
  article/passage references now resolve mechanically to retained original text.
  Provider-enforced JSON schemas require arrays/labels and constrain source/passage
  references; the original semantic/evidence checks remain authoritative.
- Failed old-protocol reviews with only settled calls or no calls can be safely
  scheduled once under corrected formatting; their earlier failure records are
  retained in recovery events. Unknown calls are never replayed.
- Discovery now includes QUIET windows and resolves alternate frozen input IDs.
  A quiet result alone is not a defect. Importance remains an AI assessment of feed
  interests, not objective news value or independently calibrated reader preference.
- Current-protocol quality ratios are separated from historical reviews, both in
  storage and Grafana labels. New metrics show last successful review, current
  execution fencing, isolated unknown charges and historical review counts.
- The operations collector now reads deployment-wide overdue/failed windows and
  active/expired execution occupancy using the existing unresolved-work index and
  active-operation projection. It exports only aggregate counts, no feed/user IDs.

## Deployment and live evidence

- Main repair commit `4ecac25b`; structured-response follow-up `402f1698`, both pushed
  to `ghada/v4-reliability`.
- Evaluator migration 0003 applied only to EVAL_DB `fc476615-df19-482c-8cba-7bd399dbeef3`.
- Evaluator initial recovery version `dc05f3f6-6bda-4695-9d0a-819b142815a3`; final
  schema-enforced version `f4ac6a31-c98d-4319-a81d-f632dc9733c3`.
- Deployment collector version `1a304704-8f9b-4ce4-b34d-e3ae39ee98ec`, every five minutes.
- Exact before/after comparison confirms the original November 3 UNKNOWN call and
  charge record are unchanged. Isolation was recorded separately.
- Six fresh assessments completed by 21:42 UTC, including Lebanon-2's intended
  20:00 and 21:00 Beirut editions. These were accepted machine assessments with
  potential findings, not human-confirmed errors or factual-quality certification.
- By 21:50 UTC, seven assessments had completed: six published editions and one
  QUIET window, the latter at 21:48:29 UTC. The schema-enforced deployment produced
  new settled calls without a provider schema rejection in the observed interval.
- At 21:45–21:47 UTC, actual Grafana datasource queries returned current-protocol
  review count 6, a fresh successful-review timestamp, execution fence 0,
  deployment scope 1 and observer_up 1. This is datasource read-back, not merely
  HTTP ingestion acceptance.
- The deployment sample contained 652 overdue retained requests and 409 retained
  failed windows across all feeds, including historical feeds; these are not counts
  of currently paying users or a failure rate. A separate direct run used two D1
  queries, read 2,074 rows and measured about 136.7 ms combined SQL time.
- D1 CPU reset 7429 occurred during one direct observer verification and scheduled
  checks. The observer correctly exported observer_up 0 then later recovered to 1.
  This monitoring change does not fix the separate database availability problem.
- Monitoring resumed within the existing $5/day authorization. By 21:48 UTC,
  46 current-day calls had settled for $4.035325, plus the preserved $0.552510
  prior UNKNOWN estimate. These are review costs; no new throughput/academic
  experiment or source acquisition was launched.
- Final cost checkpoint at 21:50 UTC: 50 settled calls, $4.253171 current-day cost,
  plus the unchanged $0.552510 historical unknown estimate. Existing admission
  defers work when the remaining authorization cannot cover a conservative call
  reservation; this repair did not add or raise that financial authorization.

## Grafana

- [Quality dashboard](https://giganticmantel34.grafana.net/d/distilled-briefing-quality/)
- [Deployment health dashboard](https://giganticmantel34.grafana.net/d/distilled-deployment-health/)
- Both were imported into `distilled-staging-ops` and read back through the Grafana
  API using the existing locally stored service-account credential. Credentials
  were piped over stdin and never printed or committed.
- Two concrete health rules were installed and previewed server-side:
  `distilled-evaluator-progress` and `distilled-deployment-observer`.
  The user explicitly approved activation, and API read-back at 21:47 UTC confirmed
  both `isPaused=false`. Existing notification routing was preserved; no synthetic
  notification was sent and external email/device delivery is not claimed.
- At 21:50 UTC both actual alert PromQL expressions returned numeric 0 through the
  Grafana datasource API. This verifies executable queries and current healthy
  conditions, rather than just successful rule provisioning.
- The eleven older provisional rules remain paused. Their one-feed/historical
  thresholds are not silently presented as deployment-wide qualified alerts.

## Validation and remaining scope

76 replay/Worker tests, 68 Python tests, eight collector unit tests and two real local
D1 collector tests passed. Evaluator TypeScript, deployment dry runs and static
observability validation passed. New tests cover source/passage ownership, quiet
semantics, exact no-resend fencing after isolation, metadata-only cost recovery,
budget retention of unknown exposure and current/historical metric separation.

Review failures and unassessable source cases remain visible. Restored service is
not 100% review completion or human calibration. Strict-schema follow-up retains
the same protocol's evidence checks and does not automatically re-pay every
previously failed current-protocol job. Backlog review follows existing admission.

Private numerical evidence is in `.local-reports/evaluator-repair-20261111/`.
