# Stage 3: five-day monitoring started

Started **2026-09-27 06:49:22 UTC (09:49 Beirut)**. The final scheduled round is **2026-10-02 06:49:22 UTC (09:49 Beirut)**; processing finishes afterward. This page describes the free-route portion. The user subsequently authorized [paid Stage 3](STAGE3_PAID_STATUS.md), which started at 06:57:39 UTC with each source family's allowance below $20.

| Source | Targets | Routes | Jobs per round |
|---|---:|---|---:|
| Websites | 30 URLs, 10 publishers | Direct HTTP; both article extractors | 30 |
| RSS | 12 feeds | Baseline acquisition/parser | 12 |
| Google News | Six multilingual queries | Google News RSS | 6 |
| Telegram | Six public channels | Public preview and Telethon | 12 |

**21 rounds, six hours apart, spanning 120 hours: 1,260 planned acquisition jobs.** These are repeated observations, not 1,260 independent sources. One job at a time per scheduler, at most two concurrently across the core and Telegram schedulers. RSS/Google/Telegram request limits are ten items and one page; the public Telegram preview may contain more raw posts. Media is outside acceptance scope. Telegram uses a rolling 30-day window; the website URL roster remains fixed.

## Persistence and evidence

The VPS user cron service is active. Two user-owned cron entries check every five minutes. A file lock prevents duplicate dispatchers; stable run IDs and frozen configurations resume existing work. Completed schedules create completion markers and do not fetch again. This survives SSH logout and restarts through cron, without weakening AppArmor or changing the firewall. The user systemd manager lacked lingering, so it is not relied on.

VPS campaign directory: `~/work/distilled.news/evaluation/acquisition-benchmark/data/campaigns/stage3-free-20260927/`.

Data directories: `data/stage3-free-20260927-core` and `data/stage3-free-20260927-telegram`. Reports are saved under each directory's `reports/` folder. Local [status snapshot](stage3-free-20260927/status.json) records actual anchors, job states and round start lateness. Refresh with `python documentation/testing-evidence/check-stage3-free.py` from this repository. Raw data stays on the VPS.

First round completed: all 12 Telegram jobs and all 48 core jobs produced reports. Website labels: 27 `AUTO_UNVERIFIED` and three `AUTO_FAIL` per extractor. RSS, Google and Telegram results are `SOURCE_UNVERIFIED`, not quality passes. No server-cost allocation is configured; provider budget for these schedules is zero.

## Interpretation and outstanding work

Monitor HTTP/access failures, extraction errors, empty inventories, changing output counts, latency, resource pressure and missed schedule times. Saved artifacts allow replay and comparison without refetching. After downtime, the scheduler can catch up overdue rounds; those observations must be identified by lateness and cannot be counted as evenly spaced reliability samples.

Independent source-reference review and some Stage 2 quality failures remain open; starting this soak does not close them. Paid providers have a separate bounded schedule linked above. Official X API, Bright Data, production deployment and exhaustive recall assessment are excluded. A five-day pilot provides limited operational evidence, not a large-scale reliability guarantee.

To stop, remove only the two crontab lines tagged `distilled-stage3-free-20260927`, then issue `python -m bench stop --data-dir DATA_DIRECTORY --run-id SCHEDULE_ID` for each scheduler from the activated VPS benchmark environment. Schedule IDs are `stage3-free-20260927-core-schedule` and `stage3-free-20260927-telegram-schedule`. An in-progress round may finish before the scheduler exits.
