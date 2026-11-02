# Real isolated multi-user pilot — execution results

Latest execution: [real publication pilot](REAL_PUBLICATION_PILOT_2026-11-02.md) ? four persisted/read-back editions; 90-minute observation remained partial. The historical results below are unchanged.

## Executive result

**PARTIAL: real accounts, source assessment, automatic polling, private Grafana ingestion and 120 authenticated HTTP reads were exercised. The requested 90-minute publication pilot did not complete. No V3 briefing was generated or persisted.**

The asynchronous campaign ran from 2026-11-02 **01:10:02 to 01:26:36 Beirut** (2026-11-01 23:10:02–23:26:36 UTC), then automatically stopped with `SAFETY_STOP_QUEUE_AGE_UNOBSERVABLE`. At the stop, the dedicated acquisition queue reported four messages but an unknown oldest-message timestamp. The guard was preserved; missing age was never relabeled zero. Cloudflare explicitly documents zero as unknown in [Queue Metrics](https://developers.cloudflare.com/api/resources/queues/methods/get_metrics/). The mapping was correct; this was a genuine provider-measurement gap, not evidence that those messages were overdue or that the application was overloaded.

The stop preceded the first 01:30 delivery deadline. Both English windows had reached `AWAITING_SCHEDULED_DELIVERY`; they contained no eligible fresh articles. Their completion/publication latency therefore cannot be established. The two Arabic feeds were scheduled hourly. The frozen plan contained eight reporting opportunities over the intended observation period; none had reached delivery before abort. Do not report 100% deadline success from that empty denominator.

All test feeds/accounts were archived, sources disabled, Cron disabled and financial history retained. The HTTP portion was completed separately with the same users and paused feeds; it did not run concurrently with publication.

## Exact target and revision

- Branch: the existing staging activation branch.
- Requested integrated baseline deployed: `cdb9fa5097c7fdf45f74a536028aa521b7837388`.
- Tested integration corrections deployed and pushed: `9ce7ad755d360d180d90bb4613f37d3bbbbc50e9`.
- Worker: https://distilled-news-staging-campaign-pilot.distillednews-platform.workers.dev
- Separate D1: `5ca750ba-dad8-413f-896e-bd62b1023ac2`.
- Separate private R2: `distilled-news-staging-campaign-pilot-raw`.
- Separate existing processing, collection, acquisition, intelligence and dead-letter queues. No queue was purged or replaced.
- All existing bindings, secrets and frontend assets were retained during backend deployment. Only the isolated Worker enabled the existing isolated-publication-preparation option.
- Production and the ordinary staging deployment were not changed. The previously deployed single-feed AgentOps collector was not redesigned or replaced.
- Models remained OpenRouter GPT-4.1 editor/repair and GPT-4.1 mini verifier; prompt version 4.

The later HTTP-only phase used the corrected initial-VU harness described below. Its exact files/hashes and both configurations are saved privately; do not represent it as the unchanged original ramp profile.

## Real setup and failures

Two distinct Gmail plus aliases registered through the actual application. Microsoft device consent installed the existing Outlook sender's Mail.Send, User.Read and offline-access credentials only on the isolated Worker. Gmail remained read-only. Both real verification messages were retrieved and their tokens consumed through `/api/auth/verify-email`; both users logged in and passed session-identity checks. No auth-token SQL, forged cookie or email-verification bypass was used.

The first verification message was in spam. The bounded Gmail reader now includes spam/trash while preserving exact alias, registration-time, isolated-origin, ambiguity and ten-message limits. The failed initial poll did not cause another registration.

The supplied helper token was stored as a Cloudflare secret and its existing private VPC binding reused. Authenticated helper status was reachable, with a two-slot shared capacity. Actual Telegram source assessment still returned `TELEGRAM_RUNTIME_UNAVAILABLE`, including after a free-capacity observation. No paid assessment occurred for that rejected setup. The exact execution failure was not diagnosed; capacity alone is not a proven explanation. No channel/session reset, new helper host, Telegram login or source-assessment bypass was performed.

Independent work continued with the already-authorized BBC Middle East RSS source, explicitly reducing source diversity. Four feeds were created through normal authenticated APIs: English/public/30-minute and Arabic/private/60-minute for each user. Their original source records were polled automatically. Observed publication timestamps preceded feed creation; the existing initial-backlog policy did not promote those articles as fresh news. There were no acquired article revisions or published editions in this pilot. Full-article grounding, factual accuracy and meaningful-update recall are therefore **not evaluated**.

## Accounting and integration corrections

The user approved a fresh four-hour **$50 total ceiling / 40 paid calls**, including setup and cleanup. The provider key had less than the proposed $50 available under its existing limit; that limit was not increased. A conservative **$12 / 40-operation** native authorization was appended for only the four pilot feeds and their assessment scopes, expiring no later than 2026-11-02 02:35 UTC. This is a smaller execution allowance inside the approved task ceiling, not permission to erase old liabilities or spend the full $50.

The isolated database already contained eight historical settled evaluation calls totaling $0.107676. They were preserved and excluded from fresh pilot totals. No historical grant, settlement, hold or account ceiling was rewritten, and tracking-only admission was not enabled.

Three confirmed integration defects were corrected:

1. The campaign observer equated the application user with the provider billing account. It now resolves exact observed operation IDs using feed ownership fences. That window-only view explicitly excludes setup/external charges, which the independent native-ledger adapter reconciles separately.
2. Native authorizations can optionally specify an explicit feed allowlist and operation ceiling. The ceiling is enforced atomically in the same reservation batch; settling a call does not restore call allowance. Existing grants without these fields keep their behavior.
3. Source assessment used a direct provider request. Only in the explicitly isolated campaign environment, that existing request now reserves and settles through the native account ledger and saves the actual provider response privately in R2. An uncertain request cannot be resent; a retained response can be replayed. No new inference stage or normal-deployment routing change was introduced.

Final authoritative paid usage: **8 setup assessment operations, $0.0039584 settled, $0 held, 0 uncertain operations**. There were **0 V3 editor/verifier/repair calls**. Artwork credentials were absent, Browser Agent was disabled, and the collector-operation/Browser-run tables contained no external paid operations. These capabilities were not tested. Infrastructure invoice charges are unavailable and are not asserted to be zero.

## Real HTTP performance

Two separate bounded runs completed the approved aggregate **120 GETs**. Neither used mock responses or fixture endpoints. All reads targeted the deployed isolated application with real authenticated sessions.

| Measurement | Initial profile | Remaining concurrency check |
| --- | ---: | ---: |
| Requests | 102 | 18 |
| Duration | 120 seconds | 60 seconds, request cap reached early |
| Measured maximum concurrent VUs | 1 | 2 |
| HTTP errors | 0 | 0 |
| Checks passed / failed | 102 / 0 | 18 / 0 |
| Reported safety violations | 0 | 0 |
| p50 latency | 117.74 ms | 122.17 ms |
| p95 latency | 500.49 ms | 454.35 ms |
| p99 latency | 618.41 ms | 474.53 ms |

The first ramp started at one VU and reached its target only at the end; it did not establish sustained two-user concurrency. The real-profile harness now starts at its first configured stage's VU count. `k6 inspect` reproduced the mismatch before the fix and passed afterward with zero requests. The remaining 18 reads established actual two-VU operation without exceeding the original 120-request approval. Do not combine percentile summaries or claim two-user concurrency for all 120 requests.

Journeys covered sessions, account reads, owned feeds, Explore, feed pages and foreign-private denial. No cross-account leakage was reported by these checks. Edition-level privacy and citation ownership were not exercised because no edition existed. No scale/capacity or factual-quality conclusion follows from these small samples.

The installed k6 JSON export used flat metrics; the Grafana reader expected nested `values`. It now accepts both formats, preserves absent measurements as absent, and exports measured percentiles, request counts, throughput and observed VUs. Both shapes have regressions. These are result-reader and workload corrections, not changes to the product pipeline.

## Grafana and resource evidence

- Dashboard: https://giganticmantel34.grafana.net/d/distilled-agentops-v1/
- Explore: https://giganticmantel34.grafana.net/explore
- Independent query verified `distilled_campaign_configured_feeds{profile="load",slot="isolated-campaign"}=4` during the live phase.
- Fifteen actual observation exports were recorded before the automatic stop. HTTP results were exported separately with their measured timestamps and a bounded phase label for the two-user run. Independent historical queries returned 18 requests, p95 454.35058 ms and observed maximum VUs 2. An initial private export duplicated phase attributes because its attribute array was shared; that first payload was retained and the private exporter corrected before the successful exact-label queries.
- Traces and legacy-log export remained disabled. Requested HTTP trace contexts are not evidence of Tempo ingestion.
- No real alert notification was enabled or sent.

The dedicated resource window 2026-11-01 22:18 UTC through final reconciliation observed **423 Worker requests, 0 Worker errors, 16.492 seconds CPU, 60,889 D1 rows read, 5,204 rows written, 5,460 read queries and 2,203 write queries**. Analytics may lag. All five queues reported zero backlog at cleanup verification. Queue age remained unknown when empty and was not fabricated.

These resource counts include setup, automatic processing, observer work and HTTP testing; they are not per-briefing recurring costs. The paid inference total is exact from settlements. Cloudflare resource cost is not invoice-reconciled; the CPU-only all-overage-price estimate is about $0.00033, excluding allowances, D1, R2 and queue billing. The original preflight estimated a $0.20 cloud envelope; no new hosting or subscription upgrade was provisioned.

## Acceptance status

| Requirement | Result |
| --- | --- |
| Isolated integrated deployment | VERIFIED |
| Two legitimate verified/authenticated users | VERIFIED |
| Four owned English/Arabic feeds | VERIFIED |
| Real source assessment and native accounting | VERIFIED |
| Automatic real RSS polling/backlog handling | VERIFIED |
| Telegram acquisition | BLOCKED: runtime unavailable |
| Real authenticated HTTP performance | VERIFIED: 120 total; 18 at measured two-VU concurrency |
| Live Grafana metrics | VERIFIED for configured cohort; exact HTTP query evidence retained separately |
| Full 90-minute observation | NOT COMPLETED: stopped after about 16 minutes 34 seconds |
| Fresh nonempty V3 generation/verification | NOT OBSERVED |
| Persisted briefing/read-back | NOT OBSERVED: 0 editions |
| Deadline-to-publication improvement | NOT ESTABLISHED |
| Nonempty verified-result reuse / live late-discovery recovery | NOT ESTABLISHED |
| Factual accuracy and important-news recall | NOT EVALUATED |
| Safe archive and authoritative settlement reconciliation | VERIFIED |

## Validation, artifacts and next step

The integration milestone `9ce7ad7` passed all eleven jobs in [GitHub Actions run 41361141073](https://github.com/AmmarMohanna/distilled.news/actions/runs/41361141073), including the existing full verification and synthetic campaigns. Locally: 61 focused Worker tests, 102 root script tests, focused campaign contracts and workspace TypeScript checks passed. The k6 summary-reader and initial-VU fixes have separate failed-before/passed-after evidence. Later harness/report changes require their own CI result; do not reuse the earlier SHA's green status as their result.

Private exact manifests, approval/preflight hashes, request journals, registration/mail receipts, source rejections, model ledger evidence, queued-window observations, two raw k6 JSON/log results, Grafana payload/query evidence, resource counters and HTML report are in `.local-reports/real-campaigns/pilotnov02/`; protected setup inputs remain in `pilotnov01/`. Credentials, sessions and raw provider/source outputs are not committed. The application revision and harness hashes are recorded in private reproducibility evidence.

Do **not** increase load yet. The next calibrated trial should remain two users/four feeds and target fresh nonempty evidence. First qualify a supported queue-age measurement or obtain explicit review of a bounded alternative stop policy that keeps canonical work age, backlog, native spending and uncertainty guards intact. Do not silently bypass the current missing-age guard. Restore actual Telegram acquisition or choose an explicitly authorized source with demonstrated fresh arrivals. Then repeat the 90-minute publication campaign before proposing a four-user/eight-feed load or spike trial. Do not automatically reopen archived users/windows, renew spending authorization or rerun paid work from this report.
