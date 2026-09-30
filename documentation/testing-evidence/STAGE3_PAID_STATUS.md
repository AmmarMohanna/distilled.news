# Stage 3 paid routes: authorized and running

User clarification, September 27: **$20 consumption per alternative independently**. Thus X Apify and TwitterAPI.io each have a $20 ceiling. The existing smaller execution allowances are unchanged; $20 is not a spending target. X Apify reserves at most $8.40, TwitterAPI.io $4.20, Google News Apify $5.04, LinkedIn Apify $3.36 and Zyte $1.89 for this schedule.

Paid monitoring started **September 27 at 06:57:39 UTC (09:57:39 Beirut)**. Twenty-one rounds at six-hour intervals span five days; the final round is due **October 2 at 06:57:39 UTC**. Each round executes serially. The already-running free schedules retain their own timestamps; comparisons must account for collection-time differences.

| Source family | Paid routes | Targets per round | Stage 3 reservation allowance |
|---|---|---:|---:|
| X profiles and search combined | Apify + TwitterAPI.io | Six profiles + four searches, each provider | **$12.60** ($8.40 + $4.20) |
| Google News | Apify | Six queries | **$5.04** |
| LinkedIn | Apify | Four companies + four profiles | **$3.36** |
| Websites | Zyte HTTP | 30 URLs | **$1.89** |

Total planned allowances across families: **$22.89**, with every alternative below its independent $20 ceiling. This is not actual consumption. No earlier ledger was cleared or reset; these allocations cover incremental Stage 3 work. Earlier spending remains in its original campaign. No subscription, recharge, auto-recharge or account billing setting was changed. Official X API and Bright Data remain excluded; media is outside acceptance scope.

## Spending controls

- Apify: X/Google each reserve $0.04 per actor run; LinkedIn $0.02. Every request passes `maxTotalChargeUsd`, alongside item and runtime limits. Provider documentation describes this as a run charge cap for all pricing models: [Run Actor](https://docs.apify.com/api/v2/actors-runs-post). Each family's SQLite ledger has the lower allowance shown above; full reservations remain held even when reported charges are smaller. Reported usage is saved separately for reconciliation.
- TwitterAPI.io: at most 210 single-page calls, no pagination/retries, $0.02 reservation each. Check remaining account credits before and after each request; halt on low credit, timeout, unexpected schema/page size or unexpected credit delta. Published price is $0.15/1,000 tweets, 15 credits/tweet, 100,000 credits/USD; a twenty-tweet page normally costs $0.003. [Pricing](https://twitterapi.io/pricing), [account balance](https://docs.twitterapi.io/api-reference/endpoint/get_my_info), [page size](https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets). The credit delta is account-level and may include concurrent use or billing delay; it is not an independently reconciled invoice.
- Zyte: at most 630 plain HTTP requests; $0.003 reserved each. No browser rendering, extraction or geolocation add-ons. The published upper standard HTTP tier is $1.27/1,000 requests, below the reservation rate. [Pricing](https://www.zyte.com/pricing/). This is a fixed request/rate allowance, not a provider-side monetary cap; final actual billing still needs reconciliation.
- The locked worker writes a durable submission marker before dispatch. Restarting never repeats uncertain paid acquisition. Interrupted captures are processed from saved evidence; failures stay visible. Whole missed six-hour windows are marked `MISSED_WINDOW`, not backfilled with paid bursts. Paid work ends after round 20. A family is halted if a reported Apify charge exceeds its per-run allowance.

These controls bound this worker's planned consumption; unrelated manual requests on the same accounts are outside its ledger. Provider-side billing anomalies cannot be guaranteed away by a local script. Large headroom below $20, fixed request totals and fail-closed guards limit that risk.

## Verification and operation

Fair-comparison amendment: the same six X profiles and four searches are evaluated at ten posts per target/provider for 21 rounds. Raw/charged counts remain separate. Starting with round 1, provider order alternates: Apify first in even rounds, TwitterAPI.io first in odd rounds. A saved-data audit records shared IDs, unmatched counts and collection-time gaps; current first-round gaps reach about 343 seconds, so snapshots are not simultaneous. Reply/repost semantics may differ and are not automatically labeled accuracy failures. Empty outputs and failures stay in the denominator; no paid retries are purchased to pad results. See [paired-cohort audit](stage3-paid-20260927/fairness-review.json). Spending allowances did not increase.

Four offline safety tests passed: uncertain requests are not retried; total Twitter reservations block additional calls; timeouts keep reservations and halt; low credit prevents a paid request. All four benchmark configurations passed preflight. First live checkpoint confirmed X Apify dispatch and $0.12 of stored reservations; other families execute after it. No first-round quality acceptance is claimed.

VPS directory: `~/work/distilled.news/evaluation/acquisition-benchmark/data/campaigns/stage3-paid-20260927/`. Configurations, submission markers, logs, reported billing, Twitter snapshots and halt files are private to the benchmark user. Benchmark reports live in `data/stage3-paid-20260927-{x,google,linkedin,web}/reports/`.

Local [launch evidence](stage3-paid-20260927/launch.json) and [latest status](stage3-paid-20260927/status.json). Refresh with `python documentation/testing-evidence/check-stage3-paid.py`. The user cron entry tagged `distilled-stage3-paid-20260927` runs the locked worker every five minutes, surviving logout/reboot. Create `STOP` in the VPS campaign directory to stop further family dispatch; remove that tagged cron line to disable its watchdog. An in-progress provider job may complete within its submitted charge/runtime cap.

Technical captures remain unverified against original sources unless explicitly reviewed. This run does not resolve Stage 2's independent-reference, empty-target or repost-semantics gaps and does not certify production-use rights.
