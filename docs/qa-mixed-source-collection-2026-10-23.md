# Mixed-source QA collection and acquisition — October 23, 2026

Test window: 12:55:54–13:05:32 Asia/Beirut (2026-10-23T09:55:54.965Z–2026-10-23T10:05:32.601Z UTC).

Five existing QA dataset feeds, each with five different sources, were temporarily resumed. All five were restored to their original paused state. The two existing qa-admin feeds were not modified. No code, budgets or paid retry fences were changed for the test.

## Result

- 463 newly persisted source observations; these are not necessarily unique stories.
- 147 additional retained article/post bodies: 99 from observations collected during this run and 48 from older backlog.
- 19/25 sources handed off observations during the run; one additional source obtained a fresh provider snapshot without a completed observation handoff.
- This was a partial-success operational test, not an all-sources-green result or a factual-accuracy evaluation.

| Feed | Source observations | Bodies retained | From fresh observations |
| --- | ---: | ---: | ---: |
| لبنان وبلاد الشام | 160 | 41 | 23 |
| Global Economy | 92 | 13 | 13 |
| الصحة العامة والأبحاث الطبية | 86 | 41 | 40 |
| Asia-Pacific Briefing | 72 | 43 | 16 |
| Open Source and Developer Tools | 53 | 9 | 7 |

## Findings

1. RSS and Google News supplied observations and retained text. X profiles (@IMFNews and @WHO) and the Asia-Pacific X search produced fresh snapshots/observations. Telegram successfully used Telethon for both channels; a successful channel read does not guarantee a newly retained post.

2. Playwright/Zyte fallback paths were exercised. The L’Orient Today website collected through `website_zyte`; several Google News article acquisitions also retained `website_zyte` provenance. Direct HTTP and the private anonymous HTTP helper also retained evidence. The test did not force every source through every fallback.

3. All three LinkedIn sources were blocked. Their retained Apify HTTP 403 response says `platform-feature-disabled`: **Monthly usage hard limit exceeded**. The application reports this under `AUTH_REQUIRED` / `PROVIDER_REPAIR_REQUIRED`, which does not explain the actual quota problem. Increasing this application’s allowance does not raise the external Apify account’s monthly limit. No failed paid submission was reset or resubmitted for diagnosis.

4. GitHub Blog RSS returned HTTP 200 with valid XML and ten RSS items, but collected no observations. Offline replay against the saved response found ten HTML `DOCTYPE` strings, all inside CDATA. `normalizeRssSnapshot` rejects any `DOCTYPE`/`ENTITY` substring before XML parsing, so this valid embedded HTML trips the broad guard and becomes UNKNOWN/BLOCKED. This is a confirmed ingestion defect; it was diagnosed, not changed, during this test.

5. ADB’s website was still waiting with BACKPRESSURE at the active checkpoint. Public-health Google News obtained a fresh Google RSS snapshot but its observation handoff remained pending. Other sources showed pagination, INTAKE_BUSY and helper-capacity waits. These are incomplete states, not proof of permanent publisher failure.

6. Dispatch was uneven. Fourteen existing due, unleased collection jobs were explicitly woken through the ordinary collection queue during the test. Their immutable provider run identities, current source revisions and financial fences were preserved. These results therefore do not establish unattended scheduling throughput.

## Source-level evidence

Poll states below are from the last snapshot while feeds were active. New observation/body counts include final in-flight completions recorded during pause restoration. A PENDING poll may already have handed off pages.

| Feed | Source/type | New observations | Retained bodies | Evidence/status |
| --- | --- | ---: | ---: | --- |
| لبنان وبلاد الشام | [Google News: Lebanon Syria Jordan public services electricity](https://news.google.com/rss/search?q=Lebanon+Syria+Jordan+public+services+electricity&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 30 | 5 | PENDING; fetched via google_rss |
| لبنان وبلاد الشام | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/middle_east/rss.xml) (rss_feed) | 25 | 14 | DONE |
| لبنان وبلاد الشام | [rss.dw.com](https://rss.dw.com/xml/rss-ar-all) (rss_feed) | 46 | 19 | PENDING / INTAKE_BUSY |
| لبنان وبلاد الشام | [@BBCArabic](https://t.me/BBCArabic) (telegram_channel) | 3 | 0 | DONE; fetched via telegram_telethon |
| لبنان وبلاد الشام | [today.lorientlejour.com](https://today.lorientlejour.com/) (web_page) | 56 | 3 | DONE; fetched via website_zyte |
| Global Economy | [LinkedIn: linkedin.com](https://www.linkedin.com/company/the-world-bank/) (linkedin_company) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; external Apify monthly hard limit |
| Global Economy | [@IMFNews](https://x.com/IMFNews) (x_profile) | 2 | 1 | DONE; fetched via x_twitterapi_io |
| Global Economy | [Google News: global economy inflation central bank trade](https://news.google.com/rss/search?q=global+economy+inflation+central+bank+trade&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 40 | 4 | PENDING; fetched via google_rss |
| Global Economy | [lemonde.fr](https://www.lemonde.fr/economie/rss_full.xml) (rss_feed) | 20 | 3 | DONE |
| Global Economy | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/business/rss.xml) (rss_feed) | 30 | 5 | PENDING |
| الصحة العامة والأبحاث الطبية | [LinkedIn: linkedin.com](https://www.linkedin.com/in/billgates/) (linkedin_profile) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; external Apify monthly hard limit |
| الصحة العامة والأبحاث الطبية | [@WHO](https://x.com/WHO) (x_profile) | 16 | 14 | DONE; fetched via x_twitterapi_io |
| الصحة العامة والأبحاث الطبية | [Google News: public health clinical trial disease outbreak](https://news.google.com/rss/search?q=public+health+clinical+trial+disease+outbreak&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 0 | 0 | PENDING / BACKPRESSURE; fetched via google_rss |
| الصحة العامة والأبحاث الطبية | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/health/rss.xml) (rss_feed) | 40 | 13 | PENDING |
| الصحة العامة والأبحاث الطبية | [sciencedaily.com](https://www.sciencedaily.com/rss/top/science.xml) (rss_feed) | 30 | 14 | PENDING |
| Asia-Pacific Briefing | X: Asia Pacific trade infrastructure lang:en (x_search) | 17 | 11 | DONE; fetched via x_twitterapi_io |
| Asia-Pacific Briefing | [Google News: Asia Pacific elections trade infrastructure security](https://news.google.com/rss/search?q=Asia+Pacific+elections+trade+infrastructure+security&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 10 | 3 | PENDING; fetched via google_rss |
| Asia-Pacific Briefing | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/rss.xml) (rss_feed) | 28 | 19 | DONE |
| Asia-Pacific Briefing | [feeds.bbci.co.uk](https://feeds.bbci.co.uk/news/world/asia/rss.xml) (rss_feed) | 17 | 10 | DONE |
| Asia-Pacific Briefing | [adb.org](https://www.adb.org/news) (web_page) | 0 | 0 | PENDING / BACKPRESSURE |
| Open Source and Developer Tools | [LinkedIn: linkedin.com](https://www.linkedin.com/company/github/) (linkedin_company) | 0 | 0 | BLOCKED / PROVIDER_REPAIR_REQUIRED; external Apify monthly hard limit |
| Open Source and Developer Tools | [Google News: open source software release developer tools licensing](https://news.google.com/rss/search?q=open+source+software+release+developer+tools+licensing&hl=en-US&gl=US&ceid=US%3Aen) (google_news) | 20 | 0 | PENDING; fetched via google_rss |
| Open Source and Developer Tools | [github.blog](https://github.blog/feed/) (rss_feed) | 0 | 0 | BLOCKED; valid XML rejected by CDATA/DOCTYPE guard |
| Open Source and Developer Tools | [phoronix.com](https://www.phoronix.com/rss.php) (rss_feed) | 30 | 9 | PENDING |
| Open Source and Developer Tools | [@telegram](https://t.me/telegram) (telegram_channel) | 3 | 0 | DONE; fetched via telegram_telethon |

## Accounting and cleanup

Additional provider exposure reserved for the selected sources: **$1.81**. This is conservative reservation accounting, not verified provider billing. The shared daily ledger ended at $5.51 reserved against its $15.00 cap.

The previous spending history and unknown-outcome fences were retained. No briefing was manually triggered. Regular queue recovery was allowed to run; this test does not claim isolation from normal scheduled activity.

All five test feeds were verified paused after restoration. Pending/recoverable collection and acquisition state was retained, not deleted. No user notifications were manually sent.

Supporting before/active/after snapshots, the manifest, provider replies, raw GitHub RSS, offline parser diagnosis, transport wake list and JSON summary are retained locally under `.local-reports/mixed-collection-20261023/`. Secrets, cookies and provider tokens are excluded from this report.
