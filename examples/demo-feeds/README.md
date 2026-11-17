# Forty public demo feeds

`feeds.json` contains 40 complete feed-creation payloads for a varied demo
account: 24 English, 10 Arabic and 6 French outputs. Each feed has a focused
interest profile, explicit exclusions, five mixed source inputs and a daily
schedule. Each retains two checked RSS inputs and adds a Google News query
plus two topic-related social or website sources. Output language can differ
from the languages of its sources.

## Source coverage

| Source kind | Assignments | Input example |
| --- | ---: | --- |
| RSS | 80 | `rss: https://www.nasa.gov/feed/` |
| Google News | 40 | `news: space mission launch astronomy discovery` |
| Telegram channel | 7 | `t: bbcarabic` |
| X profile | 13 | `x: NASA` |
| X search | 10 | `x: semiconductor chip fabrication lang:en` |
| LinkedIn company | 15 | `https://www.linkedin.com/company/nasa/` |
| LinkedIn profile | 2 | `https://www.linkedin.com/in/billgates/` |
| Website | 33 | `https://www.ipcc.ch/` |

There are 200 source assignments and 159 distinct inputs. All 40 feeds contain
at least three source kinds. `source-mix.json` lists the kinds per feed;
`source-catalog.json` maps each input to its parser kind, consuming feeds,
requirements and verification status. Assignment counts describe input intent:
website approval may discover RSS, and canonical duplicate sources can merge.

X and LinkedIn entries exercise Apify-backed sources. X can also use a
configured TwitterAPI.io route. `advanced-source-examples.json` adds two raw
`apify:` examples using the branch's existing X and LinkedIn actor IDs. These
are advanced configuration examples, not additional feeds: the current product
editor rejects generic `apify_actor` inputs, so they are excluded from
`feeds.json`. No runtime allowlist or API was changed to admit them.

## Required source setup

| Family | Deployment requirements |
| --- | --- |
| RSS | Normal source approval and connector enrollment; optional full-article enrichment can need the private execution service. |
| Google News | Native RSS route; optional Apify fallback needs its credential and an authorized budget. The branch constructs queries with English/US defaults independently of output language. |
| Telegram | `SOURCE_EXECUTION_SERVICE`, `SOURCE_EXECUTION_URL`, `SOURCE_EXECUTION_TOKEN`, an authorized helper session and runtime channel-ID resolution. No channel IDs or session credentials are fabricated by this dataset. |
| X | Credential for the selected Apify or TwitterAPI.io route, authorized provider budget, operation ceiling and normal connector admission. |
| LinkedIn | `APIFY_API_TOKEN`, authorized `linkedin_apify` budget and operation ceiling. Public profile URLs remain candidates until provider access succeeds. |
| Website | Private source execution service and token when the URL remains a website; optional Zyte fallback has separate credentials and budget. An advertised RSS feed can be selected instead during approval. |

These settings are requirements, not secrets supplied in the dataset. A valid
input is not proof of provider approval, account identity, recent activity or
collection success. Feed creation validates all source plans before saving;
missing Telegram or website setup can prevent the complete feed from being
created. Source/provider and inference budgets stay under deployment control.

Prepared on 2026-10-21 from `feat/parallel-cloudflare-event-reconciliation`
at `ac6299f`, on the new branch `codex/twenty-feed-dataset`.
Preparation does not create accounts, feeds, source enrollments or paid jobs.

## Feed catalogue

| # | Feed | Output | Daily time (Asia/Beirut) |
| --- | --- | --- | --- |
| 1 | لبنان وبلاد الشام | Arabic | 07:00 |
| 2 | Middle East Developments | English | 07:05 |
| 3 | العمل الإنساني والنزوح | Arabic | 07:10 |
| 4 | Global Economy | English | 07:15 |
| 5 | AI Research and Deployment | English | 07:20 |
| 6 | Cybersecurity Watch | English | 07:25 |
| 7 | Digital Rights and Platforms | English | 07:30 |
| 8 | Space and Astronomy | English | 07:35 |
| 9 | Climate and Environment | English | 07:40 |
| 10 | Energy and Infrastructure | English | 07:45 |
| 11 | الصحة العامة والأبحاث الطبية | Arabic | 07:50 |
| 12 | Science Worth Knowing | English | 07:55 |
| 13 | Europe : décisions et conséquences | French | 08:00 |
| 14 | Africa: Governance and Development | English | 08:05 |
| 15 | Asia-Pacific Briefing | English | 08:10 |
| 16 | الغذاء والمياه والزراعة | Arabic | 08:15 |
| 17 | Education and Universities | English | 08:20 |
| 18 | Culture, patrimoine et création | French | 08:25 |
| 19 | أهم تطورات الرياضة | Arabic | 08:30 |
| 20 | Économie et politiques publiques | French | 08:35 |
| 21 | Open Source and Developer Tools | English | 08:40 |
| 22 | Semiconductors and Computing Hardware | English | 08:45 |
| 23 | Transport and Mobility | English | 08:50 |
| 24 | Housing and Urban Services | English | 08:55 |
| 25 | Oceans and Marine Systems | English | 09:00 |
| 26 | Wildlife and Biodiversity | English | 09:05 |
| 27 | Earthquakes and Natural Hazards | English | 09:10 |
| 28 | اقتصاد الشرق الأوسط وشمال أفريقيا | Arabic | 09:15 |
| 29 | العمل والأجور وحقوق العمال | Arabic | 09:20 |
| 30 | الإتاحة وحقوق الأشخاص ذوي الإعاقة | Arabic | 09:25 |
| 31 | الحوكمة والمساءلة العامة | Arabic | 09:30 |
| 32 | North America: Policy and Society | English | 09:35 |
| 33 | Latin America and the Caribbean | English | 09:40 |
| 34 | Justice et libertés publiques | French | 09:45 |
| 35 | Archéologie et histoire matérielle | French | 09:50 |
| 36 | Elections and Democratic Institutions | English | 09:55 |
| 37 | Media and Information Integrity | English | 10:00 |
| 38 | Supply Chains and Shipping | English | 10:05 |
| 39 | كرة القدم: قرارات ونتائج حاسمة | Arabic | 10:10 |
| 40 | Associations et société civile | French | 10:15 |

Times are staggered to spread publication work; they do not impose a provider
budget or guarantee publication at that minute. The scheduler calculates the
first complete reporting window after creation. No `nextBriefingAt`, account
IDs, ownership claims, artificial stars or generated news items are supplied.
Feeds are public, and retention stays at the application's fixed 15 days.

## Create feeds through the current API

On this branch, with `PRODUCT_FEEDS_ENABLED=true`, authenticate as the intended
owner and submit **each array element** as JSON to `POST /api/me/feeds`.
The endpoint saves the feed and approves its `sourceInputs`. Do not send the
whole array as one request. IDs are deterministic and retain the original
`demo20_` prefix for compatibility, with sequence numbers 01–40;
reusing the dataset for the same owner updates those feeds. Use different IDs
for a second account because feed IDs are globally unique. The authenticated
account determines ownership and the username-scoped public URLs.

The endpoint may perform source verification during creation. It does not
accept a seed dataset as a schema or bypass provider authorization. Source
approval, later collection, article acquisition and model publication use the
target deployment's normal bindings, permissions and budgets.

## Deployments using the legacy/V3 scheduled path

`POST /api/me/feeds` returns 503 when `PRODUCT_FEEDS_ENABLED=false`, including
the earlier V3 QA setup. For that path:

1. Submit each object to `POST /api/me/briefings` after removing `sourceInputs`.
2. For each source input, submit
   `{"briefingId":"<feed.id>","input":"rss: https://..."}` to
   `POST /api/me/sources`, using the same authenticated owner session.

These are two different API paths; do not enable the product-feed pipeline
merely to import into V3. Source addition can fetch content and queue work.
The 40-feed set does not increase a deployment's existing model budget.

## Source verification

`source-checks.json` records checks for the 46 distinct RSS URLs in the dataset:
HTTP status, final URL, feed format, feed title, entry count and UTC check time.
Only RSS URLs that returned parseable, non-empty feeds were included. No
article content is bundled. Broken and blocked RSS candidates were excluded.
Added social, search and website inputs passed the branch's actual
`prepareProductSourceInput` validator; their provider access and current
activity were not tested. `source-catalog.json` explicitly labels that status.
All schedules passed the actual `liveScheduleSchema`. Generic Apify examples
passed source parsing and were confirmed to be rejected by the product editor.

Checks ran from the preparation environment. A successful RSS check does not
prove Cloudflare accessibility, full-article access, freshness, source approval
or an end-to-end published briefing. Some sources provide only summaries or
link to subscription articles. Broad regional feeds rely on the interest
profile to select relevant stories; quiet editions are possible.

The mixed dataset requires the relevant social-source credentials and can
incur paid collection, article-acquisition and inference costs when imported.
Preparing it did not run paid providers, join Telegram channels or create live
feeds. Several feeds deliberately share sources to exercise scope isolation
and reuse while applying different interest profiles.

Publisher references include [NASA's RSS directory](https://www.nasa.gov/rss-feeds/),
[BBC World RSS](https://feeds.bbci.co.uk/news/world/rss.xml),
[France 24 RSS](https://www.france24.com/fr/rss) and
[MIT AI RSS](https://news.mit.edu/rss/topic/artificial-intelligence2).
Public locator references include [BBC Arabic on Telegram](https://t.me/s/bbcarabic),
[Telegram's channel](https://t.me/s/telegram), and
[NASA on LinkedIn](https://www.linkedin.com/company/nasa/). These public pages
are locator references, not evidence that the configured provider has approval
or can collect their posts.
