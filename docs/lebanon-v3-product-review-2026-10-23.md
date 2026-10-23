# Lebanon feeds: V3 product review — 2026-10-23

## Assessment
V3 delivers useful curation, translation and some consolidation, but the current evidence does not establish a consistently trustworthy distillation product. Publication is functioning and inexpensive on this small corpus. Editorial relevance and qualifier accuracy remain inconsistent; terse Telegram posts are often expanded with repetitive or low-value prose rather than made easier to read.

Snapshot: 20:47 Beirut, with public endpoint read-back around 20:52. Both feeds show seven editions. Their newest published window closed at 20:14:53; English published 20:18:10 and Arabic 20:18:11. The 20:44:53 window is empty in both retained inputs (no acquired articles), with zero inference calls. This does not independently establish that the upstream channel had no new news.

## Scope and measurements
Read-only assessment of the retained inputs, results, actual editor/verifier responses, publication, delivery and financial settlement records for these two public staging feeds. No new paid inference, deployment, feed mutation or notification was triggered.

Each feed processed ten consecutive 30-minute windows from creation at 15:44:53 through 20:44:53 Beirut. Seven windows per feed had acquired input and published; three had no acquired articles and used zero calls. There are 15 distinct Telegram source posts, identically offered across the two feeds. The largest input window has four short posts. This is not a 20-article, multi-source or long-article scalability test.

| Metric | English | Arabic |
|---|---:|---:|
| Published editions | 7 | 7 |
| Reader items | 8 | 7 |
| Model calls | 24 | 18 |
| Settled inference USD | 0.0528756 | 0.0475080 |
| Median deadline-to-publication | 138.056s | 192.193s |
| Minimum / maximum deadline-to-publication | 75.739 / 311.079s | 62.071 / 266.061s |
| Median V3 intelligence span | 14.087s | 13.550s |
| V3 span range | 10.468–67.498s | 12.435–37.818s |
| Editions using repair | 3 | 1 |

All 42 reservations have reported settlements, totaling $0.1003836. No unsettled inference is present for these feed IDs in the read-back. These are feed-generation charges, excluding separate experiments and acquisition/provider costs. Ten of fourteen editions took the normal two calls. The other four added seven repair/reverification cycles in total. Both Brent editions needed six calls for a one-line underlying report; not every extra call produced meaningful reader value.

All seven editions in each feed published in chronological window order. Publication took about one to five minutes after cutoff, not hours. Intelligence itself accounts for only part of that delay; the remainder was not attributed to a specific component by this review. Do not label the difference pure scheduling overhead without a full phase trace.

All fourteen delivery records now read DONE and have browser-push acceptance receipts. These initially accumulated while push was broken and were accepted after the redirect fix around 20:28. This is not proof of timely fresh-window push delivery or device display. The 20:44 empty window does not provide a fresh nonempty push-timing test.

## What works as news distillation
- Keeps the electricity cutoff decision, the affected public entities and the November 2 effective date in both languages. This serves the stated Lebanon public-service interest.
- Combines Telegram posts 107629 and 107630 into one Qantara item per feed rather than repeating the explosion twice.
- Keeps the Qantara explosion, later Barashit strike and future warning as separate developments where selected. No obvious false merge is evident in these published items.
- Drops the restaurant incident in Beijing and the Dammam airport report as outside the feed's Lebanon focus.
- Does not repeat already published stories across these seven editions without an update. This small set has limited real repeated/update evidence, so it does not prove robust novelty handling generally.
- Publishes readable English and Arabic, retains source references, and produces no artificial edition when no source evidence is acquired.

## Confirmed weaknesses

### Qualifier error that passed verification
Latest source post 107637 says: “إذا هاجمت الولايات المتحدة وإسرائيل إيران مرة أخرى” (if the United States **and** Israel attack Iran again).

English body preserves the conjunction. Arabic headline uses “هجوم أمريكي **أو** إسرائيلي” and body uses “من الولايات المتحدة **أو** إسرائيل” (an American **or** Israeli attack). That broadens the reported trigger. The original wording does not establish that either actor acting alone meets the condition.

The retained Arabic editor response introduced the change. The factual verifier returned `ok` with an empty issues array. This is a concrete false acceptance, not a frontend translation or rendering defect. It is an assistant source-entailment judgment, not an independently human-labelled accuracy score. Do not infer a global error rate from this small sample.

### Inconsistent editorial scope
The 19:47 English / 19:48 Arabic pair received identical four posts. English includes the imminent airstrike warning, while Arabic explicitly omits it because it is an intention rather than an executed action or new decision. Both retain electricity supply news. Consequential source-attributed warnings about the Lebanese front can be useful before execution.

The earlier two Karak incident posts explicitly identify Jordan and were omitted as outside Lebanon. The later bare “moment of the attack on the church in Karak” caption was published by both feeds, without adding a sourced Lebanon connection. The sequence strongly suggests a context/relevance leak around the same reported incident, although this review does not independently identify the video or geolocate it. A lack of country wording in a later caption should not itself make an unrelated incident relevant.

The latest Gulf cable-threat report is included, whereas earlier US/Iran diplomatic or threat statements were excluded for lacking a direct Lebanon connection. Broader regional security can reasonably interest this reader; the defect is not automatically that one specific regional item is wrong to include. The boundary between Lebanon-focused consequential regional news and generic regional headlines is not applied consistently enough to assure the reader's intended coverage.

The earlier military-drill edition adds an unsourced explanation of Lebanon implications. The tested interest-grounding change addressed that observed failure, but historical published text remains as generated. This review spans prompt revisions, not a controlled trial of a single version.

### Output is often longer without adding understanding
Short posts are frequently expanded into a headline followed by essentially the same sentence plus publication dates, generic source wrappers or unavailable-detail lists. The Brent source is a one-line price update; the English publication repeats its headline and adds the source date. This is more translation/repackaging than useful compression.

The concise-writing guidance was deployed before the latest cable report. Its Arabic output still adds “لم تذكر المصادر تفاصيل عن توقيت أو مدى تنفيذ هذه الخطط” (sources did not specify timing or extent of implementation). That contributes little here. The existence of the instruction does not prove model compliance.

The current frontend separates headline and body correctly; that resolves visual hierarchy but does not remove semantic repetition or improve editorial selection.

### Source-supported is not independently confirmed
All collected evidence here comes from one Telegram channel, including its quotation attributed to Reuters. Source traceability is working, but neither a citation nor a verifier approval establishes the channel's underlying claims as true. No independent Reuters article, video authentication, market-price check or second-source corroboration was performed in this read-only assessment.

## Priorities
1. Qualifier-sensitive factual reliability: use the retained latest AND/OR error as a real false-acceptance case, paired with accurate concise controls. Avoid location/company keyword rules or claiming another generic prompt sentence solves semantic reasoning.
2. Stable relevance and importance judgments across languages and abbreviated follow-up posts. Establish small reviewed inclusion/omission examples before selecting a change; do not assume another instruction will help. The recent paid warning-selection comparison showed no measurable improvement and its candidate was reverted.
3. Shorter writing when source evidence is already short. Preserve meaningful attribution, uncertainty, time and conditions; avoid filling an item with metadata or repeating the headline.
4. Evaluate the next naturally occurring nonempty window for deadline-to-push acceptance after the notification fix. This is separate from editorial quality and should not trigger extra inference merely to create a test window.

Do not redesign V3 or add more stages based on this review. The useful baseline is real; the main work is improving central editorial decisions and source-faithful wording, not proving that another JSON response or successful persistence is a good briefing.

## Evidence
Ignored local artifacts: `.local-reports/lebanon-feeds/review-current/records.json`, `windows.json`, `sources.json`, `metrics.json`, `latest-model-and-ledger.json`, and the English/Arabic public API snapshots. These preserve exact text, source URLs, decisions and timings. The review is assistant source review, not a blinded human evaluation.

Public feeds:
- https://distilled-news-staging.distillednews-platform.workers.dev/product-proof/lebanon-news/
- https://distilled-news-staging.distillednews-platform.workers.dev/product-proof/lebanon-news2/

Key source posts: https://t.me/lebanonnews2/107637 (latest condition), /107636 (electricity), /107635 (warning), /107623 and /107624 (Jordan context), /107628 (later caption), /107629 and /107630 (Qantara overlap).
