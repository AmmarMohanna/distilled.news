# Deployed QA dataset test — October 21, 2026

Target: https://distilled-news-sources-qa.distillednews-platform.workers.dev. Branch `codex/twenty-feed-dataset`, application commit `ac6299f`. Version `57a2c26b-4199-4455-a1fc-75a462de0027`. Dataset files and diagnostic runners were uncommitted working-tree additions.

## What actually ran

The branch and rebuilt frontend were deployed to sources QA. All previous secret bindings, the fresh QA D1 database `f34f4399-1e3b-4d4f-ba17-564e54e9f941` and R2 bucket `distilled-news-qa-v3-raw` were preserved. Current provider ceilings/caps were retained, not replaced by larger values from the old checked-in QA config. Required collection/intelligence/acquisition consumers and the private execution binding were attached. No migrations were pending; the extra existing V3 migration was retained. Previous version for rollback: `b078c074-2d32-450a-be33-fbaae36f23ed`. Staging and production were not deployed.

Build checks: Worker typecheck passed; frontend build passed; Worker dry-run passed; focused feed API/backend/QA endpoint tests **28/28 passed**. Deployed frontend HTML matched the local build; configured variables and retention of all prior secrets were verified.

A dedicated QA owner was created through normal setup. **40/40** atomic `POST /api/me/feeds` requests succeeded, approving **200/200** source assignments. Source collection then ran through the deployed Cron, real queues, provider adapters, private helper and durable intake. Reader, health, connector-health and pipeline-trace APIs were read for diagnostics. No direct source GET results are substituted for these measurements. No synthetic news, direct feed inserts, financial grant resets or unknown-hold reconciliation was performed.

## API speed

Measured from this client; includes network RTT, Worker processing, D1 and upstream verification where the API awaits it. Cold/warm states are mixed; this is one 40-feed batch, not steady-state load capacity.

| Endpoint | Samples | Median | p95 |
| --- | ---: | ---: | ---: |
| Create feed | 40 | 3.045 s | 4.206 s |
| Reader API | 160 | 1.472 s | 2.488 s |
| Owner health API | 160 | 1.537 s | 3.117 s |

Feed creation ranged from 2.471 to 5.028 seconds. Two feed creations ran concurrently; total import wall time 71.36 seconds. Approval is not successful collection.

## Background processing observations

Latest bounded read-only backend snapshot: 2026-10-21T13:34:09.319Z. 115/200 source assignments had allocated fetch runs; 96/200 had a batch with durable intake receipts. 808 accepted receipts are retained; these are not unique published stories. Pending sources are unfinished measurements, not successful or failed collection. Detailed API snapshots were captured over time and are not one atomic database read.

| Snapshot UTC | Accepted receipts | Acquisition DONE | Acquisition FAILED | Review DONE |
| --- | ---: | ---: | ---: | ---: |
| 2026-10-21T13:23:01.009Z | 10 | 0 | 0 | 0 |
| 2026-10-21T13:23:45.009Z | 114 | 1 | 5 | 0 |
| 2026-10-21T13:25:21.908Z | 253 | 28 | 17 | 11 |
| 2026-10-21T13:27:32.475Z | 428 | 67 | 19 | 47 |
| 2026-10-21T13:28:45.742Z | 523 | 83 | 21 | 66 |
| 2026-10-21T13:30:21.872Z | 615 | 126 | 25 | 93 |
| 2026-10-21T13:32:19.988Z | 697 | 175 | 26 | 133 |
| 2026-10-21T13:34:09.319Z | 808 | 227 | 29 | 169 |

The final backend snapshot was **12.4 minutes after test start**. **23/40 feeds** had at least one fetch allocated; **17/40 had none observed**. This is a concrete scheduling/queue-progress gap under this 40-feed workload. The sampled logs do not establish its single root cause. The private helper and provider accounts can also be shared with other deployments; competing load was not controlled. No pending case is counted as an upstream-link failure.

## Collection by source family

A receipted batch can be empty or report failure coverage. The non-empty column requires observations as well as durable receipts; it still does not establish full recall or publication.

| Kind | Approved assignments | Fetch started | Receipted batch | Non-empty receipted batch |
| --- | ---: | ---: | ---: | ---: |
| google_news | 40 | 23 | 19 | 19 |
| rss_feed | 81 | 47 | 45 | 39 |
| telegram_channel | 7 | 3 | 2 | 2 |
| web_page | 32 | 16 | 5 | 5 |
| x_profile | 13 | 10 | 9 | 6 |
| linkedin_company | 15 | 11 | 11 | 3 |
| linkedin_profile | 2 | 1 | 1 | 0 |
| x_search | 10 | 4 | 4 | 2 |

## Per-feed results

Time to fetch starts at the client’s create request, using the earliest persisted fetch-run timestamp. “First receipt seen” is an upper bound at the first diagnostic snapshot that observed durable receipts, not exact provider latency; dash means not yet observed. Source counts are assignments, not distinct upstream links.

| Feed | Create s | Sources fetched / approved | Receipted sources | First fetch s | First receipt seen s | Acquired / failed | Reviewed / pending | Errors observed |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |
| [لبنان وبلاد الشام](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user/) | 3.531 | 5/5 | 4 | 70.4 | 121.6 | 16/2 | 13/3 | CHALLENGE; BACKPRESSURE; INVALID_RESULT; UNSUPPORTED |
| [Middle East Developments](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/middle-east-developments/) | 2.913 | 5/5 | 5 | 72.8 | 121.6 | 8/0 | 7/1 | NETWORK; INTAKE_BUSY |
| [العمل الإنساني والنزوح](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-2/) | 5.028 | 5/5 | 4 | 44.4 | 74.5 | 28/11 | 10/18 | RATE_LIMIT; UNSUPPORTED; INTAKE_BUSY |
| [Global Economy](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/global-economy/) | 3.072 | 5/5 | 5 | 110.5 | 214.8 | 25/1 | 17/8 | AUTH_REQUIRED; NETWORK |
| [AI Research and Deployment](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/ai-research-and-deployment/) | 2.708 | 5/5 | 5 | 153.3 | 211.3 | 9/0 | 9/0 | NETWORK |
| [Cybersecurity Watch](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/cybersecurity-watch/) | 2.589 | 5/5 | 5 | 215.9 | 340.7 | 1/0 | 1/0 | NETWORK |
| [Digital Rights and Platforms](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/digital-rights-and-platforms/) | 3.689 | 5/5 | 4 | 262.3 | 339.0 | 0/0 | 0/0 | BACKPRESSURE; NETWORK |
| [Space and Astronomy](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/space-and-astronomy/) | 3.093 | 5/5 | 5 | 296.9 | 337.9 | 14/0 | 7/7 | INTAKE_BUSY |
| [Climate and Environment](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/climate-and-environment/) | 4.554 | 5/5 | 4 | 377.4 | 408.3 | 4/3 | 4/0 | NETWORK; UNSUPPORTED; INTAKE_BUSY |
| [Energy and Infrastructure](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/energy-and-infrastructure/) | 2.972 | 5/5 | 4 | 326.3 | 407.8 | 9/0 | 4/5 | BACKPRESSURE; INTAKE_BUSY; TRANSIENT_PROVIDER_FAILURE |
| [الصحة العامة والأبحاث الطبية](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-3/) | 3.091 | 5/5 | 4 | 414.7 | 500.8 | 13/0 | 7/6 | INTAKE_BUSY |
| [Science Worth Knowing](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/science-worth-knowing/) | 2.939 | 5/5 | 3 | 439.1 | 499.7 | 11/3 | 6/5 | CHALLENGE; BACKPRESSURE; UNSUPPORTED; TRANSIENT_PROVIDER_FAILURE; INTAKE_BUSY |
| [Europe : décisions et conséquences](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/europe-d-cisions-et-cons-quences/) | 2.471 | 5/5 | 4 | 480.2 | 615.5 | 6/1 | 4/2 | CHALLENGE; UNSUPPORTED; INTAKE_BUSY |
| [Africa: Governance and Development](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/africa-governance-and-development/) | 3.067 | 5/5 | 4 | 57.8 | 99.7 | 5/6 | 5/0 | CHALLENGE; BACKPRESSURE; NETWORK; UNSUPPORTED |
| [Asia-Pacific Briefing](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/asia-pacific-briefing/) | 3.021 | 5/5 | 4 | 132.4 | 194.1 | 13/0 | 13/0 | BACKPRESSURE; NETWORK; INTAKE_BUSY |
| [الغذاء والمياه والزراعة](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-4/) | 3.279 | 5/5 | 5 | 232.5 | 323.2 | 5/0 | 5/0 | NETWORK; TRANSIENT_PROVIDER_FAILURE |
| [Education and Universities](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/education-and-universities/) | 2.824 | 5/5 | 4 | 133.2 | 190.9 | 17/1 | 17/0 | CHALLENGE; BACKPRESSURE; UNSUPPORTED; INTAKE_BUSY |
| [Culture, patrimoine et création](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/culture-patrimoine-et-cr-ation/) | 2.809 | 5/5 | 5 | 304.9 | 392.9 | 0/0 | 0/0 | BACKPRESSURE; NETWORK; INTAKE_BUSY |
| [أهم تطورات الرياضة](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-5/) | 2.905 | 5/5 | 3 | 153.2 | 187.8 | 21/0 | 20/1 | TRANSIENT; CHALLENGE; INTAKE_BUSY |
| [Économie et politiques publiques](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/conomie-et-politiques-publiques/) | 3.010 | 5/5 | 4 | 164.5 | 316.6 | 0/0 | 0/0 | CHALLENGE; NETWORK |
| [Open Source and Developer Tools](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/open-source-and-developer-tools/) | 3.500 | 5/5 | 4 | 240.6 | 315.2 | 7/1 | 6/1 | AUTH_REQUIRED; INTAKE_BUSY |
| [Semiconductors and Computing Hardware](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/semiconductors-and-computing-hardware/) | 3.232 | 5/5 | 4 | 333.6 | 386.6 | 4/0 | 4/0 | NETWORK; INTAKE_BUSY |
| [Transport and Mobility](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/transport-and-mobility/) | 3.264 | 5/5 | 3 | 353.8 | 384.8 | 11/0 | 10/1 | CHALLENGE; INTAKE_BUSY |
| [Housing and Urban Services](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/housing-and-urban-services/) | 2.971 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Oceans and Marine Systems](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/oceans-and-marine-systems/) | 2.721 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Wildlife and Biodiversity](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/wildlife-and-biodiversity/) | 3.021 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Earthquakes and Natural Hazards](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/earthquakes-and-natural-hazards/) | 3.045 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [اقتصاد الشرق الأوسط وشمال أفريقيا](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-6/) | 3.496 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [العمل والأجور وحقوق العمال](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-7/) | 3.120 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [الإتاحة وحقوق الأشخاص ذوي الإعاقة](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-8/) | 3.077 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [الحوكمة والمساءلة العامة](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-9/) | 3.598 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [North America: Policy and Society](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/north-america-policy-and-society/) | 3.014 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Latin America and the Caribbean](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/latin-america-and-the-caribbean/) | 3.253 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Justice et libertés publiques](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/justice-et-libert-s-publiques/) | 4.206 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Archéologie et histoire matérielle](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/arch-ologie-et-histoire-mat-rielle/) | 3.032 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Elections and Democratic Institutions](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/elections-and-democratic-institutions/) | 2.989 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Media and Information Integrity](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/media-and-information-integrity/) | 3.860 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Supply Chains and Shipping](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/supply-chains-and-shipping/) | 2.926 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [كرة القدم: قرارات ونتائج حاسمة](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/user-10/) | 3.633 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |
| [Associations et société civile](https://distilled-news-sources-qa.distillednews-platform.workers.dev/qa-dataset-owner/associations-et-soci-t-civile/) | 2.967 | 0/5 | 0 | — | — | 0/0 | 0/0 | None observed yet |

## Source-specific platform errors

These are adapter/queue/intake outcomes, not inferred HTTP causes. Historical attempts can coexist with a later successful batch. `INTAKE_BUSY` and `BACKPRESSURE` are operational deferrals, not proof that a URL is invalid.

| Feed | Source | Provider/phase | Error | Current receipted batch |
| --- | --- | --- | --- | --- |
| لبنان وبلاد الشام | https://today.lorientlejour.com/ | website_http, website_playwright | CHALLENGE, BACKPRESSURE | No |
| لبنان وبلاد الشام | https://news.google.com/rss/search?q=Lebanon+Syria+Jordan+public+services+electricity&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | INVALID_RESULT, UNSUPPORTED | Yes |
| Middle East Developments | https://feeds.bbci.co.uk/news/world/middle_east/rss.xml | Collection | INTAKE_BUSY | Yes |
| Middle East Developments | https://www.france24.com/ar/rss | Collection | INTAKE_BUSY | Yes |
| Middle East Developments | https://news.google.com/rss/search?q=Middle+East+diplomacy+ceasefire+sanctions&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/rss | ACQUIRE | UNSUPPORTED, INTAKE_BUSY | Yes |
| العمل الإنساني والنزوح | https://www.france24.com/ar/rss | Collection | INTAKE_BUSY | No |
| العمل الإنساني والنزوح | https://news.google.com/rss/search?q=humanitarian+aid+displacement+refugee+protection&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | RATE_LIMIT | Yes |
| العمل الإنساني والنزوح | https://reliefweb.int/ | ACQUIRE | UNSUPPORTED | Yes |
| Global Economy | https://news.google.com/rss/search?q=global+economy+inflation+central+bank+trade&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | AUTH_REQUIRED, NETWORK | Yes |
| AI Research and Deployment | https://news.google.com/rss/search?q=artificial+intelligence+research+model+evaluation+regulation&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Cybersecurity Watch | https://news.google.com/rss/search?q=actively+exploited+vulnerability+ransomware+data+breach&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Digital Rights and Platforms | https://www.eff.org/updates | website_http | BACKPRESSURE | No |
| Digital Rights and Platforms | https://news.google.com/rss/search?q=privacy+encryption+surveillance+platform+regulation&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Space and Astronomy | https://feeds.bbci.co.uk/news/science_and_environment/rss.xml | Collection | INTAKE_BUSY | Yes |
| Climate and Environment | https://x.com/WMO | Collection | INTAKE_BUSY | No |
| Climate and Environment | https://news.google.com/rss/search?q=climate+emissions+adaptation+environmental+policy&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Climate and Environment | https://www.theguardian.com/environment/rss | ACQUIRE | UNSUPPORTED | Yes |
| Energy and Infrastructure | https://www.iea.org/news | website_http | BACKPRESSURE, INTAKE_BUSY | No |
| Energy and Infrastructure | https://www.eia.gov/rss/todayinenergy.xml | Collection | INTAKE_BUSY | Yes |
| Energy and Infrastructure | https://www.theguardian.com/business/energy-industry/rss | Collection | TRANSIENT_PROVIDER_FAILURE | Yes |
| Energy and Infrastructure | https://news.google.com/rss/search?q=electricity+grid+energy+infrastructure+storage&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | Yes |
| الصحة العامة والأبحاث الطبية | https://feeds.bbci.co.uk/news/health/rss.xml | Collection | INTAKE_BUSY | Yes |
| الصحة العامة والأبحاث الطبية | https://www.sciencedaily.com/rss/top/science.xml | Collection | INTAKE_BUSY | Yes |
| الصحة العامة والأبحاث الطبية | https://www.linkedin.com/in/billgates/ | Collection | INTAKE_BUSY | Yes |
| الصحة العامة والأبحاث الطبية | https://x.com/WHO | Collection | INTAKE_BUSY | Yes |
| الصحة العامة والأبحاث الطبية | https://news.google.com/rss/search?q=public+health+clinical+trial+disease+outbreak&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | No |
| Science Worth Knowing | https://www.nature.com/news | website_http, website_playwright | CHALLENGE, BACKPRESSURE, INTAKE_BUSY | No |
| Science Worth Knowing | https://www.nature.com/nature.rss | Collection | TRANSIENT_PROVIDER_FAILURE | Yes |
| Science Worth Knowing | https://www.theguardian.com/science/rss | ACQUIRE | UNSUPPORTED, INTAKE_BUSY | Yes |
| Science Worth Knowing | https://news.google.com/rss/search?q=scientific+discovery+research+replication+materials+physics&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | No |
| Europe : décisions et conséquences | https://www.consilium.europa.eu/en/press/press-releases/ | website_http, website_playwright | CHALLENGE | No |
| Europe : décisions et conséquences | https://feeds.bbci.co.uk/news/world/europe/rss.xml | Collection | INTAKE_BUSY | Yes |
| Europe : décisions et conséquences | https://www.france24.com/fr/rss | Collection | INTAKE_BUSY | Yes |
| Europe : décisions et conséquences | https://news.google.com/rss/search?q=European+Union+court+regulation+elections+policy&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | UNSUPPORTED | Yes |
| Africa: Governance and Development | https://www.afdb.org/en/news-and-events | website_http, website_playwright | CHALLENGE, BACKPRESSURE | No |
| Africa: Governance and Development | https://news.google.com/rss/search?q=Africa+governance+infrastructure+regional+trade&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Africa: Governance and Development | https://www.theguardian.com/global-development/rss | ACQUIRE | UNSUPPORTED | Yes |
| Asia-Pacific Briefing | https://www.adb.org/news | website_http | BACKPRESSURE | No |
| Asia-Pacific Briefing | https://feeds.bbci.co.uk/news/world/asia/rss.xml | Collection | INTAKE_BUSY | Yes |
| Asia-Pacific Briefing | https://news.google.com/rss/search?q=Asia+Pacific+elections+trade+infrastructure+security&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK, INTAKE_BUSY | Yes |
| الغذاء والمياه والزراعة | https://www.theguardian.com/environment/rss | Collection | TRANSIENT_PROVIDER_FAILURE | Yes |
| الغذاء والمياه والزراعة | https://www.theguardian.com/global-development/rss | Collection | TRANSIENT_PROVIDER_FAILURE | Yes |
| الغذاء والمياه والزراعة | https://news.google.com/rss/search?q=food+security+drought+water+agriculture&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Education and Universities | https://www.unesco.org/en/news | website_http, website_playwright | CHALLENGE, BACKPRESSURE | No |
| Education and Universities | https://feeds.bbci.co.uk/news/education/rss.xml | Collection | INTAKE_BUSY | Yes |
| Education and Universities | https://www.linkedin.com/company/unesco/ | Collection | INTAKE_BUSY | Yes |
| Education and Universities | https://news.google.com/rss/search?q=education+school+university+funding+learning+policy&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | Yes |
| Education and Universities | https://www.theguardian.com/education/rss | ACQUIRE | UNSUPPORTED | Yes |
| Culture, patrimoine et création | https://www.unesco.org/en/culture | website_http | BACKPRESSURE | Yes |
| Culture, patrimoine et création | https://www.theguardian.com/culture/rss | Collection | INTAKE_BUSY | Yes |
| Culture, patrimoine et création | https://news.google.com/rss/search?q=cultural+heritage+restitution+museum+policy&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| أهم تطورات الرياضة | https://www.olympics.com/ioc/news | website_http, website_playwright | TRANSIENT, CHALLENGE | No |
| أهم تطورات الرياضة | https://news.google.com/rss/search?q=sport+tournament+regulation+sanctions+results&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | No |
| Économie et politiques publiques | https://www.oecd.org/en/about/news.html | website_http, website_playwright | CHALLENGE | No |
| Économie et politiques publiques | https://news.google.com/rss/search?q=France+francophone+economy+budget+employment+public+services&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Open Source and Developer Tools | https://t.me/telegram | Collection | INTAKE_BUSY | No |
| Open Source and Developer Tools | https://news.google.com/rss/search?q=open+source+software+release+developer+tools+licensing&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | AUTH_REQUIRED | Yes |
| Semiconductors and Computing Hardware | https://feeds.arstechnica.com/arstechnica/index | Collection | INTAKE_BUSY | No |
| Semiconductors and Computing Hardware | https://news.google.com/rss/search?q=semiconductor+fabrication+chip+export+controls&hl=en-US&gl=US&ceid=US%3Aen | ACQUIRE | NETWORK | Yes |
| Transport and Mobility | https://www.icao.int/Newsroom/Pages/default.aspx | website_http, website_playwright | CHALLENGE | No |
| Transport and Mobility | https://news.google.com/rss/search?q=rail+aviation+transport+mobility+infrastructure&hl=en-US&gl=US&ceid=US%3Aen | Collection | INTAKE_BUSY | No |

## Sampled failed article links

These are exact retained acquisition-job failures. `UNSUPPORTED` alone does not identify whether the cause was a listing page, an HTTP error, or another unsupported acquisition path. No exact upstream HTTP status is inferred from that generic code.

| Feed | Article URL | Acquisition error |
| --- | --- | --- |
| لبنان وبلاد الشام | https://energiesmedia.com/jordan-lebanon-natural-gas-supply/ | UNSUPPORTED |
| لبنان وبلاد الشام | https://www.arabnews.com/node/2645351 | INVALID_RESULT |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/18/attacked-from-the-sky-sudanese-goldminers-count-deadly-cost-of-eking-out-a-living-on-the-egypt-border | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/15/afghanistan-drought-hunger-displaced-families-girls-child-marriage-poverty | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/21/el-salvador-crackdown-president-bukele-mass-arrest-allegations-torture-killing-prison | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/16/saudi-arabia-to-execute-man-for-being-at-protests-and-funerals-when-he-was-15 | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/15/the-hidden-costs-of-fracking-boom-in-argentina-linked-to-trail-of-sickness | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/15/senegal-homosexuality-criminalised-anti-lgbtq-arrests-hiv-testing-human-rights-watch | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/17/king-charles-caribbean-winston-churchill-empire-britain-wealth | UNSUPPORTED |
| العمل الإنساني والنزوح | https://www.theguardian.com/global-development/2026/oct/20/panama-canal-environment-water-drought-el-nino-farming | UNSUPPORTED |
| العمل الإنساني والنزوح | https://reliefweb.int/country/cod | UNSUPPORTED |
| العمل الإنساني والنزوح | https://reliefweb.int/country/afg | UNSUPPORTED |
| العمل الإنساني والنزوح | https://reliefweb.int/country/ukr | UNSUPPORTED |
| Global Economy | https://www.reuters.com/world/asia-pacific/malaysia-lifts-2026-growth-forecast-slightly-despite-trade-disruptions-rising-2026-03-31/ | AUTH_REQUIRED |
| Climate and Environment | https://www.theguardian.com/environment/2026/oct/21/energy-secretary-leaning-towards-rejecting-rosebank-oilfield | UNSUPPORTED |
| Climate and Environment | https://www.theguardian.com/environment/video/2026/oct/20/whale-in-wales-amateur-photographer-captures-stunning-footage-video | UNSUPPORTED |
| Climate and Environment | https://www.theguardian.com/environment/2026/oct/20/do-not-be-distracted-by-other-global-crises-nature-cannot-wait-for-a-better-year-we-must-act-now | UNSUPPORTED |
| Science Worth Knowing | https://www.theguardian.com/science/video/2026/oct/20/these-risks-are-real-the-threat-of-ai-bioweapons-video | UNSUPPORTED |
| Science Worth Knowing | https://www.theguardian.com/science/audio/2026/oct/20/these-risks-are-real-the-threat-of-ai-bioweapons-podcast | UNSUPPORTED |
| Science Worth Knowing | https://www.theguardian.com/science/2026/oct/18/research-predict-inflammatory-bowel-disease-decade-before-diagnosis | UNSUPPORTED |
| Europe : décisions et conséquences | https://www.euronews.com/2026/04/21/eu-court-rules-orbans-anti-lgtbq-law-breaches-core-values-calls-on-budapest-to-cancel-it | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/15/the-hidden-costs-of-fracking-boom-in-argentina-linked-to-trail-of-sickness | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/21/el-salvador-crackdown-president-bukele-mass-arrest-allegations-torture-killing-prison | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/18/attacked-from-the-sky-sudanese-goldminers-count-deadly-cost-of-eking-out-a-living-on-the-egypt-border | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/17/king-charles-caribbean-winston-churchill-empire-britain-wealth | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/16/saudi-arabia-to-execute-man-for-being-at-protests-and-funerals-when-he-was-15 | UNSUPPORTED |
| Africa: Governance and Development | https://www.theguardian.com/global-development/2026/oct/15/senegal-homosexuality-criminalised-anti-lgbtq-arrests-hiv-testing-human-rights-watch | UNSUPPORTED |
| Education and Universities | https://www.theguardian.com/news/2026/oct/20/schools-in-england-must-recognise-antisemitism-as-distinct-category-of-harm-report-says | UNSUPPORTED |
| Open Source and Developer Tools | https://www.reuters.com/legal/legalindustry/why-automated-open-source-scans-dont-guarantee-license-compliance--pracin-2026-06-18/ | AUTH_REQUIRED |

## Publication and spending limits of this test

The dataset’s original daily schedules were retained. The API assigned first complete publication boundaries on **October 23, 2026, 07:00–10:15 Asia/Beirut**. All observed reader states were waiting with no published editions. This is not a timed successful-publication benchmark, and “not due” is not a failed briefing. The fresh database also has **zero model-spending grants**; retained API keys alone do not authorize this branch’s model operations. No new AI budget was activated.

Provider operation ceilings/reservations are not invoices or confirmed charges:

| Provider | Recorded operations | Sum of ceilings USD | Operations without saved payload |
| --- | ---: | ---: | ---: |
| linkedin_apify | 24 | 3.000012 | 0 |
| x_twitterapi_io | 18 | 0.18 | 0 |

Source assignment details and API timings are available in the accompanying CSVs. Ignored raw evidence is in `.local-reports/demo-platform-20261021/`: API journal, per-source health/trace responses, bounded backend snapshots, deployment metadata and 45-second Worker tail. Current source errors and unfinished work must not be presented as collection success.

## End of the bounded test

At 2026-10-21T13:34:25.810Z, **40/40 temporary dataset feeds were paused through the normal admin API**, stopping recurring collection after the measurement. Evidence, provider operations, jobs and unknown holds were retained. Pending work is not declared complete and can resume when the test feeds are enabled again. The deployed QA version remains in place.
