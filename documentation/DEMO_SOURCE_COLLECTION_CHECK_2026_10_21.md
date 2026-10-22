# Demo source-link checks — 2026-10-21

Dataset: **40 feeds, 200 source assignments, 159 distinct inputs**. Branch: `codex/twenty-feed-dataset`. Initial live pass: 2026-10-21T12:44:17.464Z; source/article pass completed 2026-10-21T12:45:15.004Z. Recheck times are retained in the JSON.

## Scope

Public GET requests from the local diagnostic environment, followed by the current branch's actual RSS/Google News parser. This is not a deployed Cloudflare ingestion or end-to-end feed test. No accounts, feeds, source enrollments, provider operations, AI calls, budgets or deployments were changed. Public social page availability does not establish authenticated/API collection.

All 159 distinct inputs were checked once. The 12 initial failures were checked again; ReliefWeb also received an HTML Accept-header variant. Initial sandbox-only DNS failures are excluded: they affected every host and did not represent source availability. No HTTP 429 was observed.

## Results

| Family | Distinct inputs | Observed result |
| --- | ---: | --- |
| RSS | 46 | 45 parsed initially; MIT timed out initially, then returned HTTP 200 with 50 normalized entries. All 46 parsed across the pass and recheck. |
| Google News | 40 | All parsed, non-empty; 15 had zero items in the diagnostic 15-day freshness window. |
| Websites | 33 | 23 HTTP-success responses; six 403, three 404, one 406, all reproduced. Content extraction/discovery not verified. |
| Telegram | 2 | Both public previews accessible, 20 visible post elements each. Telethon/session collection not tested. |
| X profiles/searches | 23 | All public pages returned HTTP success. Provider collection and actual post retrieval not tested. |
| LinkedIn company/profile | 15 | 14 company pages HTTP-success; Bill Gates public profile returned 404 twice. Apify collection not tested. |

These counts distinguish HTTP/parse success from full content acquisition. No normalizable-entry loss or more-than-one-day future dates were observed in successfully parsed responses.

## Reproducible failures by link

| Input | Error | Affected feeds | Interpretation |
| --- | --- | --- | --- |
| [https://today.lorientlejour.com/](https://today.lorientlejour.com/) | HTTP_403 | لبنان وبلاد الشام | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://reliefweb.int/](https://reliefweb.int/) | HTTP_406 | العمل الإنساني والنزوح | Request rejected; also reproduced using an HTML Accept header. |
| [https://www.linkedin.com/in/billgates/](https://www.linkedin.com/in/billgates/) | HTTP_404 | الصحة العامة والأبحاث الطبية; Associations et société civile | Public request returned not found; revalidate the locator. This does not prove provider-level unavailability. |
| [https://www.afdb.org/en/news-and-events](https://www.afdb.org/en/news-and-events) | HTTP_403 | Africa: Governance and Development | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://www.consilium.europa.eu/en/press/press-releases/](https://www.consilium.europa.eu/en/press/press-releases/) | HTTP_403 | Europe : décisions et conséquences | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://www.unesco.org/en/news](https://www.unesco.org/en/news) | HTTP_404 | Education and Universities | Public request returned not found; revalidate the locator. |
| [https://www.oecd.org/en/about/news.html](https://www.oecd.org/en/about/news.html) | HTTP_403 | Économie et politiques publiques | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://www.noaa.gov/news](https://www.noaa.gov/news) | HTTP_403 | Oceans and Marine Systems | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://www.iadb.org/en/news](https://www.iadb.org/en/news) | HTTP_403 | Latin America and the Caribbean | Direct request forbidden; response alone does not establish which runtime fallback will work. |
| [https://unctad.org/news](https://unctad.org/news) | HTTP_404 | Supply Chains and Shipping | Public request returned not found; revalidate the locator. |
| [https://www.gatesfoundation.org/ideas/media-center/press-releases](https://www.gatesfoundation.org/ideas/media-center/press-releases) | HTTP_404 | Associations et société civile | Public request returned not found; revalidate the locator. |

## Transient failure

- [https://news.mit.edu/rss/topic/artificial-intelligence2](https://news.mit.edu/rss/topic/artificial-intelligence2): initial **ETIMEDOUT**, second request **HTTP 200**, 50 parsed entries. Preserve as a transient observation, not a permanently broken RSS source.

## Successful Google responses with no recent items

These are freshness warnings, not collection or XML errors. Returned publication dates place every parsed item outside the preceding 15 days as of the check. This can yield no eligible recent evidence despite HTTP success. Queries contain several ungrouped terms; relevance and the benefit of rewriting them were not measured here. The dataset constructs all queries with English/US defaults, including French output feeds.

| Query | Parsed items | Feed |
| --- | ---: | --- |
| news: Middle East diplomacy ceasefire sanctions | 74 | Middle East Developments |
| news: humanitarian aid displacement refugee protection | 80 | العمل الإنساني والنزوح |
| news: privacy encryption surveillance platform regulation | 79 | Digital Rights and Platforms |
| news: scientific discovery research replication materials physics | 53 | Science Worth Knowing |
| news: Asia Pacific elections trade infrastructure security | 80 | Asia-Pacific Briefing |
| news: education school university funding learning policy | 78 | Education and Universities |
| news: cultural heritage restitution museum policy | 12 | Culture, patrimoine et création |
| news: housing rent homelessness urban planning | 81 | Housing and Urban Services |
| news: biodiversity wildlife habitat conservation | 79 | Wildlife and Biodiversity |
| news: earthquake volcano natural hazard confirmed impact | 47 | Earthquakes and Natural Hazards |
| news: Middle East North Africa economy trade public finance | 79 | اقتصاد الشرق الأوسط وشمال أفريقيا |
| news: disability accessibility transport digital inclusion | 76 | الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| news: United States Canada court public policy services | 79 | North America: Policy and Society |
| news: Latin America Caribbean governance trade infrastructure | 78 | Latin America and the Caribbean |
| news: justice libertes publiques reforme decision tribunal | 2 | Justice et libertés publiques |

## Sampled discovery-link access

One first available link per successfully parsed input, deduplicated by URL: **82 links**, comprising **42 direct RSS article links** and **40 Google News intermediary links**. All returned HTTP 200 without the diagnostic title-based challenge signature. The Google final hosts remained `news.google.com`: **publisher resolution was not established**. HTTP success does not prove full text, correct extraction, absence of a paywall/login shell, or grounding. The initially timed-out MIT source was not in this article sample.

## Every input

| Kind | Input | Initial observation | Recheck | Affected feeds |
| --- | --- | --- | --- | --- |
| google_news | news: actively exploited vulnerability ransomware data breach | 97 parsed entries | — | Cybersecurity Watch |
| google_news | news: Africa governance infrastructure regional trade | 77 parsed entries | — | Africa: Governance and Development |
| google_news | news: archaeology excavation dating heritage discovery | 79 parsed entries | — | Archéologie et histoire matérielle |
| google_news | news: artificial intelligence research model evaluation regulation | 76 parsed entries | — | AI Research and Deployment |
| google_news | news: Asia Pacific elections trade infrastructure security | NO_ITEMS_IN_15_DAY_WINDOW | — | Asia-Pacific Briefing |
| google_news | news: biodiversity wildlife habitat conservation | NO_ITEMS_IN_15_DAY_WINDOW | — | Wildlife and Biodiversity |
| google_news | news: civil society charity regulation philanthropy outcomes | 33 parsed entries | — | Associations et société civile |
| google_news | news: climate emissions adaptation environmental policy | 78 parsed entries | — | Climate and Environment |
| google_news | news: cultural heritage restitution museum policy | NO_ITEMS_IN_15_DAY_WINDOW | — | Culture, patrimoine et création |
| google_news | news: disability accessibility transport digital inclusion | NO_ITEMS_IN_15_DAY_WINDOW | — | الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| google_news | news: earthquake volcano natural hazard confirmed impact | NO_ITEMS_IN_15_DAY_WINDOW | — | Earthquakes and Natural Hazards |
| google_news | news: education school university funding learning policy | NO_ITEMS_IN_15_DAY_WINDOW | — | Education and Universities |
| google_news | news: election certified results electoral court administration | 79 parsed entries | — | Elections and Democratic Institutions |
| google_news | news: electricity grid energy infrastructure storage | 33 parsed entries | — | Energy and Infrastructure |
| google_news | news: European Union court regulation elections policy | 80 parsed entries | — | Europe : décisions et conséquences |
| google_news | news: food security drought water agriculture | 35 parsed entries | — | الغذاء والمياه والزراعة |
| google_news | news: football federation disciplinary tournament confirmed result | 72 parsed entries | — | كرة القدم: قرارات ونتائج حاسمة |
| google_news | news: France francophone economy budget employment public services | 21 parsed entries | — | Économie et politiques publiques |
| google_news | news: global economy inflation central bank trade | 74 parsed entries | — | Global Economy |
| google_news | news: housing rent homelessness urban planning | NO_ITEMS_IN_15_DAY_WINDOW | — | Housing and Urban Services |
| google_news | news: humanitarian aid displacement refugee protection | NO_ITEMS_IN_15_DAY_WINDOW | — | العمل الإنساني والنزوح |
| google_news | news: journalism media ownership information integrity | 79 parsed entries | — | Media and Information Integrity |
| google_news | news: justice libertes publiques reforme decision tribunal | NO_ITEMS_IN_15_DAY_WINDOW | — | Justice et libertés publiques |
| google_news | news: labour wage employment worker rights strike | 88 parsed entries | — | العمل والأجور وحقوق العمال |
| google_news | news: Latin America Caribbean governance trade infrastructure | NO_ITEMS_IN_15_DAY_WINDOW | — | Latin America and the Caribbean |
| google_news | news: Lebanon Syria Jordan public services electricity | 74 parsed entries | — | لبنان وبلاد الشام |
| google_news | news: Middle East diplomacy ceasefire sanctions | NO_ITEMS_IN_15_DAY_WINDOW | — | Middle East Developments |
| google_news | news: Middle East North Africa economy trade public finance | NO_ITEMS_IN_15_DAY_WINDOW | — | اقتصاد الشرق الأوسط وشمال أفريقيا |
| google_news | news: ocean marine pollution fisheries coastal protection | 80 parsed entries | — | Oceans and Marine Systems |
| google_news | news: open source software release developer tools licensing | 80 parsed entries | — | Open Source and Developer Tools |
| google_news | news: privacy encryption surveillance platform regulation | NO_ITEMS_IN_15_DAY_WINDOW | — | Digital Rights and Platforms |
| google_news | news: public health clinical trial disease outbreak | 100 parsed entries | — | الصحة العامة والأبحاث الطبية |
| google_news | news: public procurement audit transparency corruption court | 77 parsed entries | — | الحوكمة والمساءلة العامة |
| google_news | news: rail aviation transport mobility infrastructure | 70 parsed entries | — | Transport and Mobility |
| google_news | news: scientific discovery research replication materials physics | NO_ITEMS_IN_15_DAY_WINDOW | — | Science Worth Knowing |
| google_news | news: semiconductor fabrication chip export controls | 100 parsed entries | — | Semiconductors and Computing Hardware |
| google_news | news: shipping port freight supply chain disruption | 92 parsed entries | — | Supply Chains and Shipping |
| google_news | news: space mission launch astronomy discovery | 81 parsed entries | — | Space and Astronomy |
| google_news | news: sport tournament regulation sanctions results | 22 parsed entries | — | أهم تطورات الرياضة |
| google_news | news: United States Canada court public policy services | NO_ITEMS_IN_15_DAY_WINDOW | — | North America: Policy and Society |
| linkedin_company | https://www.linkedin.com/company/african-development-bank/ | HTTP 200; collection unverified | — | Africa: Governance and Development |
| linkedin_company | https://www.linkedin.com/company/asml/ | HTTP 200; collection unverified | — | Semiconductors and Computing Hardware |
| linkedin_company | https://www.linkedin.com/company/fao/ | HTTP 200; collection unverified | — | الغذاء والمياه والزراعة |
| linkedin_company | https://www.linkedin.com/company/github/ | HTTP 200; collection unverified | — | Open Source and Developer Tools |
| linkedin_company | https://www.linkedin.com/company/inter-american-development-bank/ | HTTP 200; collection unverified | — | Latin America and the Caribbean |
| linkedin_company | https://www.linkedin.com/company/international-energy-agency/ | HTTP 200; collection unverified | — | Energy and Infrastructure |
| linkedin_company | https://www.linkedin.com/company/international-labour-organization/ | HTTP 200; collection unverified | — | العمل والأجور وحقوق العمال |
| linkedin_company | https://www.linkedin.com/company/iucn/ | HTTP 200; collection unverified | — | Wildlife and Biodiversity |
| linkedin_company | https://www.linkedin.com/company/microsoft/ | HTTP 200; collection unverified | — | AI Research and Deployment |
| linkedin_company | https://www.linkedin.com/company/nasa/ | HTTP 200; collection unverified | — | Space and Astronomy |
| linkedin_company | https://www.linkedin.com/company/the-world-bank/ | HTTP 200; collection unverified | — | Global Economy |
| linkedin_company | https://www.linkedin.com/company/un-habitat/ | HTTP 200; collection unverified | — | Housing and Urban Services |
| linkedin_company | https://www.linkedin.com/company/unesco/ | HTTP 200; collection unverified | — | Education and Universities; Culture, patrimoine et création |
| linkedin_company | https://www.linkedin.com/company/unhcr/ | HTTP 200; collection unverified | — | العمل الإنساني والنزوح |
| linkedin_profile | https://www.linkedin.com/in/billgates/ | HTTP_404 | HTTP_404 | الصحة العامة والأبحاث الطبية; Associations et société civile |
| rss_feed | rss: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom | 15 parsed entries | — | Earthquakes and Natural Hazards |
| rss_feed | rss: https://feeds.arstechnica.com/arstechnica/index | 20 parsed entries | — | AI Research and Deployment; Cybersecurity Watch; Semiconductors and Computing Hardware |
| rss_feed | rss: https://feeds.bbci.co.uk/news/business/rss.xml | 53 parsed entries | — | Global Economy; Transport and Mobility; Housing and Urban Services; اقتصاد الشرق الأوسط وشمال أفريقيا; العمل والأجور وحقوق العمال; Supply Chains and Shipping |
| rss_feed | rss: https://feeds.bbci.co.uk/news/education/rss.xml | 23 parsed entries | — | Education and Universities |
| rss_feed | rss: https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml | 25 parsed entries | — | Culture, patrimoine et création |
| rss_feed | rss: https://feeds.bbci.co.uk/news/health/rss.xml | 56 parsed entries | — | الصحة العامة والأبحاث الطبية |
| rss_feed | rss: https://feeds.bbci.co.uk/news/science_and_environment/rss.xml | 40 parsed entries | — | Space and Astronomy; Oceans and Marine Systems |
| rss_feed | rss: https://feeds.bbci.co.uk/news/technology/rss.xml | 21 parsed entries | — | Digital Rights and Platforms; Semiconductors and Computing Hardware; الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/africa/rss.xml | 34 parsed entries | — | Africa: Governance and Development |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/asia/rss.xml | 17 parsed entries | — | Asia-Pacific Briefing |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/europe/rss.xml | 22 parsed entries | — | Europe : décisions et conséquences |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/latin_america/rss.xml | 17 parsed entries | — | Latin America and the Caribbean |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/middle_east/rss.xml | 36 parsed entries | — | لبنان وبلاد الشام; Middle East Developments |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/rss.xml | 36 parsed entries | — | Asia-Pacific Briefing; Transport and Mobility; Earthquakes and Natural Hazards; North America: Policy and Society; Elections and Democratic Institutions |
| rss_feed | rss: https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml | 21 parsed entries | — | North America: Policy and Society |
| rss_feed | rss: https://feeds.bbci.co.uk/sport/football/rss.xml | 76 parsed entries | — | كرة القدم: قرارات ونتائج حاسمة |
| rss_feed | rss: https://feeds.bbci.co.uk/sport/rss.xml | 73 parsed entries | — | أهم تطورات الرياضة |
| rss_feed | rss: https://github.blog/feed/ | 10 parsed entries | — | Open Source and Developer Tools |
| rss_feed | rss: https://krebsonsecurity.com/feed/ | 10 parsed entries | — | Cybersecurity Watch |
| rss_feed | rss: https://news.mit.edu/rss/topic/artificial-intelligence2 | ETIMEDOUT | HTTP 200; 50 entries | AI Research and Deployment |
| rss_feed | rss: https://rss.dw.com/xml/rss-ar-all | 45 parsed entries | — | لبنان وبلاد الشام; اقتصاد الشرق الأوسط وشمال أفريقيا; الحوكمة والمساءلة العامة |
| rss_feed | rss: https://www.carbonbrief.org/feed/ | 12 parsed entries | — | Climate and Environment |
| rss_feed | rss: https://www.eff.org/rss/updates.xml | 50 parsed entries | — | Digital Rights and Platforms; Media and Information Integrity |
| rss_feed | rss: https://www.eia.gov/rss/todayinenergy.xml | 19 parsed entries | — | Energy and Infrastructure |
| rss_feed | rss: https://www.france24.com/ar/rss | 24 parsed entries | — | Middle East Developments; العمل الإنساني والنزوح; أهم تطورات الرياضة; الحوكمة والمساءلة العامة; كرة القدم: قرارات ونتائج حاسمة |
| rss_feed | rss: https://www.france24.com/fr/rss | 24 parsed entries | — | Europe : décisions et conséquences; Économie et politiques publiques; Justice et libertés publiques; Elections and Democratic Institutions |
| rss_feed | rss: https://www.lemonde.fr/economie/rss_full.xml | 20 parsed entries | — | Global Economy; Économie et politiques publiques |
| rss_feed | rss: https://www.nasa.gov/feed/ | 10 parsed entries | — | Space and Astronomy |
| rss_feed | rss: https://www.nature.com/nature.rss | 75 parsed entries | — | Science Worth Knowing |
| rss_feed | rss: https://www.phoronix.com/rss.php | 32 parsed entries | — | Open Source and Developer Tools |
| rss_feed | rss: https://www.sciencedaily.com/rss/top/science.xml | 60 parsed entries | — | الصحة العامة والأبحاث الطبية |
| rss_feed | rss: https://www.theguardian.com/business/energy-industry/rss | 20 parsed entries | — | Energy and Infrastructure |
| rss_feed | rss: https://www.theguardian.com/business/supply-chain-crisis/rss | 20 parsed entries | — | Supply Chains and Shipping |
| rss_feed | rss: https://www.theguardian.com/culture/rss | 65 parsed entries | — | Culture, patrimoine et création |
| rss_feed | rss: https://www.theguardian.com/education/rss | 16 parsed entries | — | Education and Universities |
| rss_feed | rss: https://www.theguardian.com/environment/oceans/rss | 20 parsed entries | — | Oceans and Marine Systems |
| rss_feed | rss: https://www.theguardian.com/environment/rss | 25 parsed entries | — | Climate and Environment; الغذاء والمياه والزراعة; Wildlife and Biodiversity |
| rss_feed | rss: https://www.theguardian.com/environment/wildlife/rss | 20 parsed entries | — | Wildlife and Biodiversity |
| rss_feed | rss: https://www.theguardian.com/global-development/rss | 45 parsed entries | — | العمل الإنساني والنزوح; Africa: Governance and Development; الغذاء والمياه والزراعة; العمل والأجور وحقوق العمال; Latin America and the Caribbean; Associations et société civile |
| rss_feed | rss: https://www.theguardian.com/law/rss | 20 parsed entries | — | Justice et libertés publiques |
| rss_feed | rss: https://www.theguardian.com/media/rss | 13 parsed entries | — | Media and Information Integrity |
| rss_feed | rss: https://www.theguardian.com/science/archaeology/rss | 20 parsed entries | — | Archéologie et histoire matérielle |
| rss_feed | rss: https://www.theguardian.com/science/rss | 28 parsed entries | — | Science Worth Knowing; Archéologie et histoire matérielle |
| rss_feed | rss: https://www.theguardian.com/society/charities/rss | 20 parsed entries | — | Associations et société civile |
| rss_feed | rss: https://www.theguardian.com/society/disability/rss | 20 parsed entries | — | الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| rss_feed | rss: https://www.theguardian.com/society/housing/rss | 20 parsed entries | — | Housing and Urban Services |
| telegram_channel | t: bbcarabic | HTTP 200; collection unverified | — | لبنان وبلاد الشام; اقتصاد الشرق الأوسط وشمال أفريقيا; الحوكمة والمساءلة العامة; كرة القدم: قرارات ونتائج حاسمة |
| telegram_channel | t: telegram | HTTP 200; collection unverified | — | Digital Rights and Platforms; Open Source and Developer Tools; Media and Information Integrity |
| web_page | https://reliefweb.int/ | HTTP_406 | HTTP_406 | العمل الإنساني والنزوح |
| web_page | https://rsf.org/en/news | HTTP 200; collection unverified | — | Media and Information Integrity |
| web_page | https://today.lorientlejour.com/ | HTTP_403 | HTTP_403 | لبنان وبلاد الشام |
| web_page | https://unctad.org/news | HTTP_404 | HTTP_404 | Supply Chains and Shipping |
| web_page | https://unhabitat.org/news-and-stories | HTTP 200; collection unverified | — | Housing and Urban Services |
| web_page | https://www.adb.org/news | HTTP 200; collection unverified | — | Asia-Pacific Briefing |
| web_page | https://www.afdb.org/en/news-and-events | HTTP_403 | HTTP_403 | Africa: Governance and Development |
| web_page | https://www.aljazeera.com/middle-east/ | HTTP 200; collection unverified | — | Middle East Developments |
| web_page | https://www.archaeological.org/news/ | HTTP 200; collection unverified | — | Archéologie et histoire matérielle |
| web_page | https://www.canada.ca/en/news.html | HTTP 200; collection unverified | — | North America: Policy and Society |
| web_page | https://www.cisa.gov/news-events/cybersecurity-advisories | HTTP 200; collection unverified | — | Cybersecurity Watch |
| web_page | https://www.consilium.europa.eu/en/press/press-releases/ | HTTP_403 | HTTP_403 | Europe : décisions et conséquences |
| web_page | https://www.echr.coe.int/ | HTTP 200; collection unverified | — | Justice et libertés publiques |
| web_page | https://www.eff.org/updates | HTTP 200; collection unverified | — | Digital Rights and Platforms |
| web_page | https://www.fao.org/newsroom/en | HTTP 200; collection unverified | — | الغذاء والمياه والزراعة |
| web_page | https://www.gatesfoundation.org/ideas/media-center/press-releases | HTTP_404 | HTTP_404 | Associations et société civile |
| web_page | https://www.iadb.org/en/news | HTTP_403 | HTTP_403 | Latin America and the Caribbean |
| web_page | https://www.icao.int/Newsroom/Pages/default.aspx | HTTP 200; collection unverified | — | Transport and Mobility |
| web_page | https://www.idea.int/news | HTTP 200; collection unverified | — | Elections and Democratic Institutions |
| web_page | https://www.iea.org/news | HTTP 200; collection unverified | — | Energy and Infrastructure |
| web_page | https://www.ilo.org/news | HTTP 200; collection unverified | — | العمل والأجور وحقوق العمال |
| web_page | https://www.ipcc.ch/ | HTTP 200; collection unverified | — | Climate and Environment |
| web_page | https://www.iucn.org/news | HTTP 200; collection unverified | — | Wildlife and Biodiversity |
| web_page | https://www.nature.com/news | HTTP 200; collection unverified | — | Science Worth Knowing |
| web_page | https://www.noaa.gov/news | HTTP_403 | HTTP_403 | Oceans and Marine Systems |
| web_page | https://www.oecd.org/en/about/news.html | HTTP_403 | HTTP_403 | Économie et politiques publiques |
| web_page | https://www.olympics.com/ioc/news | HTTP 200; collection unverified | — | أهم تطورات الرياضة |
| web_page | https://www.transparency.org/en/news | HTTP 200; collection unverified | — | الحوكمة والمساءلة العامة |
| web_page | https://www.unesco.org/en/culture | HTTP 200; collection unverified | — | Culture, patrimoine et création |
| web_page | https://www.unesco.org/en/news | HTTP_404 | HTTP_404 | Education and Universities |
| web_page | https://www.usgs.gov/news | HTTP 200; collection unverified | — | Earthquakes and Natural Hazards |
| web_page | https://www.w3.org/WAI/news/ | HTTP 200; collection unverified | — | الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| web_page | https://www.worldbank.org/en/region/mena | HTTP 200; collection unverified | — | اقتصاد الشرق الأوسط وشمال أفريقيا |
| x_profile | x: CISACyber | HTTP 200; collection unverified | — | Cybersecurity Watch |
| x_profile | x: EU_Commission | HTTP 200; collection unverified | — | Europe : décisions et conséquences |
| x_profile | x: FIFAcom | HTTP 200; collection unverified | — | كرة القدم: قرارات ونتائج حاسمة |
| x_profile | x: IMFNews | HTTP 200; collection unverified | — | Global Economy |
| x_profile | x: NASA | HTTP 200; collection unverified | — | Space and Astronomy |
| x_profile | x: Nature | HTTP 200; collection unverified | — | Science Worth Knowing |
| x_profile | x: NOAA | HTTP 200; collection unverified | — | Oceans and Marine Systems |
| x_profile | x: Olympics | HTTP 200; collection unverified | — | أهم تطورات الرياضة |
| x_profile | x: OpenAI | HTTP 200; collection unverified | — | AI Research and Deployment |
| x_profile | x: UN | HTTP 200; collection unverified | — | Middle East Developments |
| x_profile | x: USGS | HTTP 200; collection unverified | — | Earthquakes and Natural Hazards |
| x_profile | x: WHO | HTTP 200; collection unverified | — | الصحة العامة والأبحاث الطبية |
| x_profile | x: WMO | HTTP 200; collection unverified | — | Climate and Environment |
| x_search | x: archaeology excavation discovery lang:en | HTTP 200; collection unverified | — | Archéologie et histoire matérielle |
| x_search | x: Asia Pacific trade infrastructure lang:en | HTTP 200; collection unverified | — | Asia-Pacific Briefing |
| x_search | x: disability accessibility policy lang:en | HTTP 200; collection unverified | — | الإتاحة وحقوق الأشخاص ذوي الإعاقة |
| x_search | x: economie budget emploi France lang:fr | HTTP 200; collection unverified | — | Économie et politiques publiques |
| x_search | x: election certified results court lang:en | HTTP 200; collection unverified | — | Elections and Democratic Institutions |
| x_search | x: justice libertes tribunal reforme lang:fr | HTTP 200; collection unverified | — | Justice et libertés publiques |
| x_search | x: rail aviation transport disruption lang:en | HTTP 200; collection unverified | — | Transport and Mobility |
| x_search | x: semiconductor chip fabrication lang:en | HTTP 200; collection unverified | — | Semiconductors and Computing Hardware |
| x_search | x: shipping port freight disruption lang:en | HTTP 200; collection unverified | — | Supply Chains and Shipping |
| x_search | x: United States Canada public policy court lang:en | HTTP 200; collection unverified | — | North America: Policy and Society |

## Feed-level coverage of these checks

A feed listed without errors is not a passed end-to-end feed. Warnings can overlap failed inputs.

| Feed | Persistent failing inputs | Stale Google queries |
| --- | ---: | ---: |
| لبنان وبلاد الشام | 1 | 0 |
| Middle East Developments | 0 | 1 |
| العمل الإنساني والنزوح | 1 | 1 |
| Global Economy | 0 | 0 |
| AI Research and Deployment | 0 | 0 |
| Cybersecurity Watch | 0 | 0 |
| Digital Rights and Platforms | 0 | 1 |
| Space and Astronomy | 0 | 0 |
| Climate and Environment | 0 | 0 |
| Energy and Infrastructure | 0 | 0 |
| الصحة العامة والأبحاث الطبية | 1 | 0 |
| Science Worth Knowing | 0 | 1 |
| Europe : décisions et conséquences | 1 | 0 |
| Africa: Governance and Development | 1 | 0 |
| Asia-Pacific Briefing | 0 | 1 |
| الغذاء والمياه والزراعة | 0 | 0 |
| Education and Universities | 1 | 1 |
| Culture, patrimoine et création | 0 | 1 |
| أهم تطورات الرياضة | 0 | 0 |
| Économie et politiques publiques | 1 | 0 |
| Open Source and Developer Tools | 0 | 0 |
| Semiconductors and Computing Hardware | 0 | 0 |
| Transport and Mobility | 0 | 0 |
| Housing and Urban Services | 0 | 1 |
| Oceans and Marine Systems | 1 | 0 |
| Wildlife and Biodiversity | 0 | 1 |
| Earthquakes and Natural Hazards | 0 | 1 |
| اقتصاد الشرق الأوسط وشمال أفريقيا | 0 | 1 |
| العمل والأجور وحقوق العمال | 0 | 0 |
| الإتاحة وحقوق الأشخاص ذوي الإعاقة | 0 | 1 |
| الحوكمة والمساءلة العامة | 0 | 0 |
| North America: Policy and Society | 0 | 1 |
| Latin America and the Caribbean | 1 | 1 |
| Justice et libertés publiques | 0 | 1 |
| Archéologie et histoire matérielle | 0 | 0 |
| Elections and Democratic Institutions | 0 | 0 |
| Media and Information Integrity | 0 | 0 |
| Supply Chains and Shipping | 1 | 0 |
| كرة القدم: قرارات ونتائج حاسمة | 0 | 0 |
| Associations et société civile | 2 | 0 |

## Next verification needed

1. Check the deployed helper/provider path for the reproduced 403/406 responses; public GET failure alone does not establish fallback failure.
2. Revalidate the four public 404 locators before changing dataset inputs.
3. Evaluate recent-result query variants for the 15 stale Google queries and test publisher URL resolution separately.
4. Exercise Telegram, X and LinkedIn through the deployment’s authorized providers, with operation receipts and per-source errors. Their collection is unverified by this public-link run.
5. Then trace source approval, collection, article extraction, review and publication in QA.

Reproduction: `node scripts/check-demo-source-links.mjs`; recheck failures: `node scripts/check-demo-source-links.mjs <saved-directory> --retry-errors`; regenerate this report: `node scripts/report-demo-source-links.mjs <saved-directory>`. Raw response bodies and complete per-request metadata remain in the ignored `.local-reports/demo-source-links/` directory.
