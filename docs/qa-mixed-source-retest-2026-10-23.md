# Mixed-source QA retest — October 23, 2026

Test window: 13:14:00–13:23:53 Asia/Beirut (2026-10-23T10:14:00.273Z–2026-10-23T10:23:53.961Z UTC).

The same five QA dataset feeds and 25 approved sources were resumed and restored to paused. This run used ordinary Cron and queue scheduling: no initial manual control-queue trigger, no individual poll wakes, no direct provider probes, and no replacement paid-operation identities. No application code or deployment budgets were changed.

## Result

All 25 sources began at least one fresh fetch run. The first recorded fetch began 190 seconds after resumption (2026-10-23T10:17:10.044Z).

The run persisted **399 source observations** and **54 additional article/post bodies**: 14 from observations collected in this run and 40 from older backlog. Observations/bodies are not necessarily unique stories. 19 sources handed off new observations.

| Feed | Observations | Bodies retained | From fresh observations |
| --- | ---: | ---: | ---: |
| لبنان وبلاد الشام | 73 | 1 | 1 |
| Global Economy | 52 | 3 | 0 |
| الصحة العامة والأبحاث الطبية | 77 | 39 | 12 |
| Asia-Pacific Briefing | 134 | 10 | 1 |
| Open Source and Developer Tools | 63 | 1 | 0 |

## What the retest establishes

- Automatic collection pickup worked without operator wakes. The initial delay and remaining capacity waits still need attention; this result does not establish a consistent latency guarantee.
- RSS, Google News, Telegram and X produced observations. ADB’s website now collected through direct HTTP and handed off observations; its article-acquisition tail did not complete before cleanup.
- L’Orient Today was still waiting on helper BACKPRESSURE and had no new website observations. Global-economy Google News also remained pending/backpressured without new observations.
- All three LinkedIn sources remained blocked. A newly saved Apify HTTP 403 response again returned `platform-feature-disabled` / `Monthly usage hard limit exceeded`. The user’s external Apify limit increase was not confirmed during this run. This result cannot be treated as a post-increase LinkedIn test. The application’s positive USD 15 allowances remained unchanged.
- GitHub Blog RSS was freshly attempted and again ended BLOCKED with no observations. The known valid-XML/CDATA DOCTYPE guard defect was not changed between runs.
- Many other collection jobs had already handed off pages but remained PENDING for pagination or downstream intake. They were not labelled complete just because upstream HTTP succeeded.

## Comparison with the first run

| Measure | First run | Retest |
| --- | ---: | ---: |
| Manual individual collection-job wakes | 14 | 0 |
| New observations | 463 | 399 |
| Retained bodies | 147 | 54 |
| Bodies from fresh observations | 99 | 14 |
| Additional selected-source reservations | $1.81 | $1.58 |

The second run revisited already-collected sources and deduplicated previously seen material. Lower acquisition counts do not, by themselves, show a throughput regression. These short operational runs are not controlled performance benchmarks or factual-accuracy evaluations.

## Source outcomes

Poll states are taken from the final active snapshot; counts include final in-flight completions during pause restoration.

| Feed | Source/type | Observations | Retained bodies | Status/evidence |
| --- | --- | ---: | ---: | --- |
| لبنان وبلاد الشام | [Google News: Lebanon Syria Jordan public services electricity](https://news.google.com/rss/search?q=Lebanon+Syria+Jordan+public+services+electricity&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 20 | 1 | PENDING; fetched via google_rss |
| لبنان وبلاد الشام | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/middle_east/rss.xml) (rss_feed) | 20 | 0 | PENDING |
| لبنان وبلاد الشام | [rss.dw.com](https://rss.dw.com/xml/rss-ar-all) (rss_feed) | 30 | 0 | PENDING |
| لبنان وبلاد الشام | [@BBCArabic](https://t.me/BBCArabic) (telegram_channel) | 3 | 0 | DONE; fetched via telegram_telethon |
| لبنان وبلاد الشام | [today.lorientlejour.com](https://today.lorientlejour.com/) (web_page) | 0 | 0 | PENDING / BACKPRESSURE |
| Global Economy | [LinkedIn: linkedin.com](https://www.linkedin.com/company/the-world-bank/) (linkedin_company) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; Apify monthly hard limit |
| Global Economy | [@IMFNews](https://x.com/IMFNews) (x_profile) | 2 | 0 | PENDING; fetched via x_twitterapi_io |
| Global Economy | [Google News: global economy inflation central bank trade](https://news.google.com/rss/search?q=global+economy+inflation+central+bank+trade&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 0 | 2 | PENDING / BACKPRESSURE |
| Global Economy | [lemonde.fr](https://www.lemonde.fr/economie/rss_full.xml) (rss_feed) | 20 | 0 | DONE |
| Global Economy | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/business/rss.xml) (rss_feed) | 30 | 1 | PENDING |
| الصحة العامة والأبحاث الطبية | [LinkedIn: linkedin.com](https://www.linkedin.com/in/billgates/) (linkedin_profile) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; Apify monthly hard limit |
| الصحة العامة والأبحاث الطبية | [@WHO](https://x.com/WHO) (x_profile) | 17 | 1 | PENDING; fetched via x_twitterapi_io |
| الصحة العامة والأبحاث الطبية | [Google News: public health clinical trial disease outbreak](https://news.google.com/rss/search?q=public+health+clinical+trial+disease+outbreak&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 20 | 1 | PENDING; fetched via google_rss |
| الصحة العامة والأبحاث الطبية | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/health/rss.xml) (rss_feed) | 20 | 28 | PENDING |
| الصحة العامة والأبحاث الطبية | [sciencedaily.com](https://www.sciencedaily.com/rss/top/science.xml) (rss_feed) | 20 | 9 | PENDING |
| Asia-Pacific Briefing | X: Asia Pacific trade infrastructure lang:en (x_search) | 18 | 3 | PENDING; fetched via x_twitterapi_io |
| Asia-Pacific Briefing | [Google News: Asia Pacific elections trade infrastructure security](https://news.google.com/rss/search?q=Asia+Pacific+elections+trade+infrastructure+security&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 10 | 0 | PENDING; fetched via google_rss |
| Asia-Pacific Briefing | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/rss.xml) (rss_feed) | 29 | 6 | DONE |
| Asia-Pacific Briefing | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/asia/rss.xml) (rss_feed) | 17 | 1 | DONE |
| Asia-Pacific Briefing | [adb.org](https://www.adb.org/news) (web_page) | 60 | 0 | PENDING; fetched via website_http |
| Open Source and Developer Tools | [LinkedIn: linkedin.com](https://www.linkedin.com/company/github/) (linkedin_company) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; Apify monthly hard limit |
| Open Source and Developer Tools | [Google News: open source software release developer tools licensing](https://news.google.com/rss/search?q=open+source+software+release+developer+tools+licensing&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 30 | 0 | PENDING; fetched via google_rss |
| Open Source and Developer Tools | [github.blog](https://github.blog/feed/) (rss_feed) | 0 | 0 | BLOCKED; known parser guard defect |
| Open Source and Developer Tools | [phoronix.com](https://www.phoronix.com/rss.php) (rss_feed) | 30 | 1 | PENDING |
| Open Source and Developer Tools | [@telegram](https://t.me/telegram) (telegram_channel) | 3 | 0 | DONE; fetched via telegram_telethon |

## Accounting and cleanup

Additional exposure reserved for the selected sources was **$1.58**. These are conservative reservations, not verified invoices. The shared daily ledger ended at $7.09 against its $15.00 limit. Historical spending and uncertain-outcome fences were retained.

All five test feeds were verified paused after restoration. No briefing was manually triggered. Pending canonical collection/acquisition work was retained, not deleted. The temporary error-log tail was stopped. No SSH access was used for this retest.

Evidence is retained under `.local-reports/mixed-collection-retest-20261023/`: manifest, before/final-active/after-restoration snapshots, summary, live Cron configuration and the newly retained Apify error response. The minute Cron schedule and all relevant activation flags were confirmed configured. No captured error-tail records establish neither the absence of errors nor a latency guarantee.
