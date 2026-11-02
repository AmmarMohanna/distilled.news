# Real AgentOps pilot activation — 2026-11-01

## Outcome

The dedicated campaign environment is deployed and has passed live authentication/isolation probes. The two-user/four-feed, 120-GET, 90-minute pilot is **NOT RUN**. Real mailbox verification, source-helper credentials and a numeric replacement task allowance remain unresolved. No registered test user is represented as verified, no mock publication is presented as a result, and no existing staging or production resource was modified.

Branch: `ghada-agentops-grafana`. Application deployment source revision: `cbac307`; the novelty candidate remains disabled (`BRIEFING_PROMPT_VERSION=4`).

## Actual cloud changes and evidence

- Worker: https://distilled-news-staging-campaign-pilot.distillednews-platform.workers.dev
- Initial application version: `68095413-640a-41a9-9fb7-61ada8b9e8be`. Subsequent generated-secret installation uses the same application code.
- Separate D1: `5ca750ba-dad8-413f-896e-bd62b1023ac2`, 92 recorded application migrations and campaign-only observer schema.
- Separate private R2: `distilled-news-staging-campaign-pilot-raw`.
- Separate queues: `dn-campaign-pilot-processing`, `dn-campaign-pilot-collection`, `dn-campaign-pilot-acquisition`, `dn-campaign-pilot-v1`, `dn-campaign-pilot-dlq`.
- Cron absent; OpenRouter/source-provider keys not installed; no notification credentials. Worker observability export is disabled; no legacy logs or unreviewed native traces exported.
- First administrator created through the normal token-protected setup API. Anonymous session read returned unauthenticated; real admin cookie returned authenticated/admin; anonymous campaign observation returned 401; an unregistered-feed request under the admin session was denied.
- Ledger baseline: one administrator, zero feeds, zero model grants, zero reservations, zero settlements. Database size approximately 1.89 MB at baseline read-back.

## Measured setup resource work, not load results

Cloudflare returned 5 Worker requests, 0 Worker errors, 48.433 ms CPU, 193 D1 read queries / 22,819 rows read and 368 write queries / 1,246 rows written. All five queues had zero approximate backlog. Analytics can lag; these are a bounded setup snapshot, not a final campaign reconciliation or a capacity result.

Four sanitized bootstrap metrics were accepted by Grafana. Independent Prometheus query returned `distilled_campaign_bootstrap_worker_requests{component="isolated-campaign-bootstrap"} = 5`. Grafana: https://giganticmantel34.grafana.net/explore . These metrics have a separate bootstrap namespace and low-cardinality environment/component labels. They do not imply that any multi-user campaign or publication succeeded.

Inference calls/charges: **0 / $0**, corroborated by the new ledger and absent paid credentials. Cloudflare resource work is nonzero; no attributable invoice charge has been obtained, so $0 total cloud cost is not claimed. Existing account usage was inspected read-only and is not attributed to this pilot.

## Confirmed framework fix and tests

Deployment exposed a real resource-observer incompatibility: it admitted at most three queues, but the application has four work queues and a dead-letter queue. The observer now accepts at most five, preserving all other isolation/time/request guards. Regression failed before the change and passed after it; six queues still fail admission. No application pipeline behavior changed.

All performance/reliability Node regressions: **54 passed**, including 26 real-framework contracts. Frontend build and Worker dry-run passed. Existing synthetic smoke/load/spike/stress/soak/recovery/fault definitions are preserved. No new GitHub CI run or staging k6 execution is claimed.

## Exact remaining access requirements

1. Dedicated QA mailbox credentials with real send/read capability are required. Existing staging's Outlook integration is send-only, Cloudflare cannot reveal stored secret values, and no local QA mailbox token was found. Secure input template: `.local-reports/real-campaigns/pilotnov01/credentials.env`. It names `OUTLOOK_CLIENT_ID`, `OUTLOOK_REFRESH_TOKEN` (offline_access, Mail.Send, Mail.Read, User.Read), `CAMPAIGN_QA_EMAIL`, and `SOURCE_EXECUTION_TOKEN`. Encryption key was generated locally. Never paste credentials into chat. The folder ACL is restricted to the local operator and SYSTEM.
2. Telegram source execution needs the existing helper credential; no unapproved replacement collector or scraping route was enabled. The runner's mailbox/account-admission/accounting placeholders have not yet been qualified as live integrations. No readiness attestation has been fabricated.
3. A replacement numeric maximum was requested after the user authorized higher paid spending; no number has yet been supplied. The obsolete $2 proposal is not enforced as a task authorization. No old grant was reused and no unbounded new grant was created.
4. GitHub API reports push access but no admin permission; `agentops-multiuser-staging-approval` returns 404. For Actions execution, repository owner must create/configure that environment in repository Settings → Environments and add a required reviewer. This is not a reason to block a supervised local runner once real credentials/admission are available.

## Next execution

Connect real mailbox/helper access, complete the direct QA/accounting adapter against existing application mechanisms, freeze the exact approved allowance/manifest and fresh preflight, then register two actual users, verify delivered emails and create four feeds through authenticated APIs. Only then install paid credentials/enable the dedicated Cron, launch the approved traffic and asynchronous observer, reconcile bills, and archive campaign-owned accounts/feeds. Larger campaigns remain unrun and must be calibrated from the pilot rather than invented results.

Private append-only journal and exact cloud/API artifacts are under `.local-reports/real-campaigns/pilotnov01/`. No credentials or raw user/source payloads belong in this report. Rollback/quiescence: leave Cron absent, do not install paid credentials; disable only this Worker if necessary. Do not delete historical/shared resources or financial records.
