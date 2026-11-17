# External testing results — living record

Last updated: 2026-09-26. Add future batches and source families here without replacing earlier findings.

This file records observed results, the reasons behind their labels, and remaining work. The [execution log](../VPS_TESTING_EXECUTION_LOG.md) records setup and commands; the [testing guide](../EXTERNAL_TESTING_A_TO_Z.md) describes the wider plan.

## Repository contents

Only top-level summaries and Python review/automation scripts are versioned here. Raw publisher copies, API responses, binary captures, generated reports, console logs and temporary patches remain local and are excluded by `.gitignore`. Links to those artifacts are intended for the local evidence workspace and will not resolve in a fresh clone. Never force-add live credentials, authenticated sessions or raw third-party datasets.

## Current position

- **Paid Stage 3 started after authorization:** [budgets and controls](STAGE3_PAID_STATUS.md). The clarified ceiling is $20 per alternative independently. Existing lower execution allowances remain: X alternatives $12.60 combined, Google News $5.04, LinkedIn $3.36, Zyte websites $1.89. These are reservation allowances, not actual charges. Existing free schedules continue.

- **2026-09-27: Stage 3 free-route monitoring is running.** [Schedule, scope and limitations](STAGE3_STATUS.md): 21 rounds over five days, ending with the October 2 morning round. Stage 2 remains partially accepted; its listed sample sizes total **410**, not 510. The legacy `controlled-510-v1` ID is retained for evidence continuity.

- **Latest expanded results:** [Stage 2 status](STAGE2_STATUS.md). Playwright 30 attempts, X alternatives 100 evaluated records per provider, LinkedIn 35/40 requested records now collected and reviewed for field preservation. Apify controlled charges total $0.1727. Full suite 228 passed. Earlier pending-status notes below describe their historical checkpoints; use this status page for current state.

## Stage 2 review continuation ? 2026-09-26

- **Unwanted text:** both extractors retain two consent/adblock instruction paragraphs in France24 targets 2 and 3. Exact publisher-DOM matches are recorded in [boilerplate review](controlled-510-v1/web-boilerplate-review.json). This is a confirmed cleanup failure, separate from paragraph completeness. Other inspected footer/navigation markers had no hits; that is not exhaustive contamination clearance.

- **Google News:** six matched RSS/Apify query pairs returned identical sets of ten exact URLs, 60 overlaps total. Final provider-reported Apify charge **$0.0573** (six runs at $0.00955), reconciled in the existing ledger. This is not independent completeness verification. The local report now reflects reconciliation. Evidence: [billing and overlap](controlled-510-v1/google-closeout.txt).
- **Website body checkpoints:** 380 publisher-DOM paragraphs of at least 100 characters checked per parser across 27 accessible articles. Trafilatura preserved 380/380; Readability 378/380, missing the introductory paragraph on France24 targets 1 and 2. Matching ignores whitespace and Unicode format controls, but retains letters and diacritics. Short paragraphs, lists, headings, decks outside the inspected containers and contamination remain outside this checkpoint. No full-body gold PASS inferred. [Review](controlled-510-v1/web-paragraph-review.json).
- **Website metadata:** both extractors match a publisher title variant for 27 accessible pages. Exact publication timestamp matches: Readability 23; Trafilatura 17. Trafilatura preserves only the day for all three DW and three Al Jazeera targets. Seven pages have no timestamp reference in the inspected metadata, including the three Le Monde challenges. Lack of a metadata reference is unverified, not a parser failure. [Checkpoints](controlled-510-v1/web-checkpoints.json).
- **Telegram:** fixed benchmark classification of empty landing pages: RT now emits `public_preview_has_no_message_inventory`. Saved HTML replay confirms the issue with zero network requests. The code does not claim the channel is empty or that missing posts were recovered. Full VPS suite **226 passed**. Benchmark-only change; no production deployment. [Replay/tests](controlled-510-v1/telegram-preview-fix.txt).
- Exact unresolved/fixed checkpoints are recorded in [failed-checkpoints.json](controlled-510-v1/failed-checkpoints.json). Website mismatches caused solely by invisible formatting were reviewer normalization differences, not lost content; the review was corrected accordingly.

Stage 2 is **not complete**: Playwright awaits administrator firewall verification; expanded Zyte needs billing/budget reconciliation; expanded X-alternative and LinkedIn collections remain pending the documented terms/scope checkpoints; full-body reference and unwanted-text review remains incomplete. Stage 3 has not started. Existing passing preservation checks do not clear those blockers.


- [TwitterAPI.io?Apify saved-pilot comparison](X_ALTERNATIVES_COMPARISON.md): TwitterAPI.io replay passed 240 field checks on 40 records; Apify existing checkpoints cover 160 records including repetitions. Different capture times prevent a coverage winner; no new paid collection.

- X terms review: [internal testing scope and permission-request draft](X_TERMS_TEST_SCOPE.md). Three synthetic X normalization cases passed on the VPS; no additional API requests or spend. Expanded comparative collection remains pending written clarification.

## Controlled campaign update ? 2026-09-26

Stage 2 has started with user authorization after the usage reset. Stage 3 has not started. Media is excluded. Captures were run directly through the benchmark while independent references remain pending; they are not completed acceptance runs through the guarded campaign wrapper.

| Family | Evidence collected | Status / exact remaining checkpoint |
|---|---|---|
| Websites | 30 articles across 10 publishers; two extractors | Each extractor: 27 AUTO_UNVERIFIED, 3 AUTO_FAIL. Three Le Monde challenge pages failed body checks. Independent full-body/title/date references remain pending. |
| RSS | 12 feeds, 119 sampled entries; both parsers replayed against identical saved XML | 24 parser/feed comparisons pass sampled field checks after the date fix. ESA supplied nine items; France24 French repeated one URL. This checks preservation of feed fields, not article completeness or uncapped recall. |
| Google News | Six matched queries, English/Arabic/French; RSS 60 results and Apify 60 results | All 12 jobs completed, still SOURCE_UNVERIFIED. Result-set overlap subsequently checked at 60/60 URLs and billing reconciled to $0.0573; independent publisher truth/completeness remains pending. |
| Telegram | Six eligible channels, 50 API posts; official Telegram had no posts in the frozen window | 38 common posts passed text/date/URL comparisons. BBC Persian overlap 8/10; two API IDs absent from the public capture. RT public capture was a landing page with no posts, versus API 10. Empty-window Telegram is not a quality pass. |
| X / LinkedIn | Earlier pilots retained separately | Expanded collection pending usage-authorization checkpoints; no new expanded runs. |

### Bugs, scope gaps and verification

- Fixed Python feedparser date fallback: use `updated_parsed` only when `published_parsed` is absent; retain `date_source` provenance. DW exposed the missing-date case. Regression tests cover published precedence, updated fallback, and neither date. VPS suite: **224 passed**. No production deployment.
- Telegram public normalization does not itself apply the API item/window cap. The audit applies the frozen window and latest-ten scope explicitly. RT's landing page needs an explicit unavailable-preview classification; do not score its empty output as complete.
- Initial Telegram target `NASA` was an invalid username choice; `durov` failed the API public-broadcast-channel check. Preserve these attempts as selection/access limitations. BBC Persian and AlArabiya were added without erasing them.
- Fault suite: **21/21 passed**; synthetic checks validate the harness, not provider reliability.
- Browser batch has not launched: current administrator firewall verification is pending. Zyte expanded run remains pending budget reconciliation. Server monthly cost remains unconfigured.
- Approximately 100 independent reviews are a target, not a completed count. Five-day monitoring has not started.

Evidence: [feed review](controlled-510-v1/feed-review.json), [Telegram audit](controlled-510-v1/telegram-audit.json), [website report](controlled-510-v1/web-report.json), [Google matched report](controlled-510-v1/google-matched-report.json), and the runner/log files in this directory. Preserve historical pilot results below.


- Stage 2 is underway; see the controlled campaign update below. Stage 3 is not running.

- Stage 1 is in progress. The five-article direct HTTP batch has been acquired, extracted and reviewed against publisher references.
- This is one acquisition route with two extractors, not completion of all website routes or all Stage 1 sources.
- CNN was scored on the VPS. The other four references were prepared and scored locally against the downloaded report. Their VPS labels remain AUTO_UNVERIFIED until the references are attached and the run is rescored there.
- Website extraction code was not changed during the website review. RSS fixes and their local/VPS replay evidence are recorded below.

| Source / comparison | Confirmed current status | Still pending |
|---|---|---|
| Websites: Direct HTTP, Trafilatura vs Readability | Five articles reviewed; six PASS and fourteen PARTIAL across repetitions in the combined local assessment; exact failed checkpoints recorded below | Four reference attachments/rescoring on VPS not confirmed; Zyte reviewed: 8/10 captures; Guardian rejected twice by Zyte with HTTP 451 Domain Forbidden. Bright Data skipped by user; Playwright standard reviewed: Al Jazeera/Trafilatura improves to PASS; CNN returns error content on original and retry runs; scoring crash fixed and verified on VPS |
| RSS: platform parser vs Python feedparser | Six feeds tested; confirmed media, summary and limit issues fixed; saved-feed replay reports 48 comparisons with zero failed checks locally and on VPS | Formal reference scoring and production deployment not confirmed |
| Google News: RSS vs Apify | Matched VPS pilot completed: 4/4 captures each, 20 items/job; saved XML/JSON field checks passed; repeated-headline fix verified | Publisher URL resolution, independent completeness references and formal scoring; matched pilot billing reconciled at $0.0802 |
| Telegram: public-page scraper vs Telethon | Two public channels / 40 distinct posts matched across two repetitions. Public-page live run returned 4/4 after fallback fix; Telethon conversion replay passed 4/4 locally and on VPS; VPS suite 219 passed | Formal scoring labels unchanged; larger reliability sample, media downloads and production deployment not verified |
| X profiles: Apify and official X API functional checks | Apify NASA/BBCWorld: 4/4 captures, 80 records, $0.02; normalization fixes verified. Official API: five NASA posts, saved-response text/author/date/link checks passed | Independent completeness; official API production integration; same-ID correction fix local only; performance comparison not cleared; Bright Data skipped |
| X search: Apify and official X API functional checks | Apify: four captures, 80 records, $0.02. Official API: ten posts, including two long-form posts; all field-preservation checkpoints passed | Official search billing reconciliation (estimated $0.05), independent completeness and broader testing |
| X profiles/search: TwitterAPI.io | Approved pilot: 20 NASA profile records + 20 search records; all top-level text/author/date/link preservation checks passed; no within-page duplicates; user reports 600 credits ($0.006) | Authorization for production use unverified; nested repost/quote content, independent completeness, dedicated provider integration |
| LinkedIn companies/profiles: Apify vs Bright Data | Apify returned 10 company + 10 profile posts. Parser initially dropped all 20; fix retains all 20 and passes 120 saved-response checkpoints locally and on the VPS. Provider-reported charges $0.0381 | Production deployment pending; nested repost semantics, independent completeness, broader reliability and production usage authorization unverified. Bright Data skipped |

Photos/videos are out of acceptance scope per the professor's direction relayed by the user. Historical media findings are retained but do not block completion. Oxylabs was researched, not added as an approved test route. The user approved continuing planned tests on 2026-09-26; this is bounded by discussed budgets, not unlimited spending or production deployment authorization.

### LinkedIn initial functional pilot — 2026-09-26

Two paid runs were submitted, with a provider-side `maxTotalChargeUsd=0.05` per run and ten requested posts per target. No retry runs, schedules, comments or reactions were requested. [Inputs](linkedin-pilot-inputs/README.md), [runner](linkedin-pilot-run.py), and [saved-response verification](linkedin-pilot-001/after-fixes.json) are recorded locally. Raw responses remain under `/home/distilled-bench/.local/share/distilled-bench/linkedin-pilot-001/` on the VPS; the initial inspection log also contains one sample per actor.

| Target | Actor/run | Returned | Before fix | After local fix | Provider-reported charge |
|---|---|---:|---:|---:|---:|
| Microsoft | harvestapi/linkedin-company-posts / CK0sNLm2gnigyz7VL | 10 | 0 | 10 | $0.02005 |
| Satya Nadella | harvestapi/linkedin-profile-posts / l0cqMdZNhqkFHEWMB | 10 | 0 | 10 | $0.01805 |

Exact failed checkpoints: the existing LinkedIn normalizer did not accept `linkedinUrl` or nested `postedAt.date` / `postedAt.timestamp`, so its required URL/date checks rejected every record. It also lacked nested `author.name` and `contentAttributes[].hyperlink` mappings. These are now supported locally, preserving original-author attribution for reposted content rather than substituting the monitored account. Legacy formats remain supported; undated records are still rejected.

Offline replay against both saved responses retains 20/20 records, with zero within-target duplicate URLs and all 120 checkpoints passing: retained record, text, original author name, provider publication date, original URL and attribute links. The connector suite passes 82 tests; connector TypeScript checking passes. No further actor runs were needed. Code changes are in `packages/connectors/src/apify.ts` and its regression tests.

VPS follow-up: the LinkedIn function alone was synced using an exact old-function match and a private backup, leaving other parser functions untouched. VPS replay also retains 20/20 records and passes 120/120 checkpoints; the benchmark Python suite passes all 223 tests. [Sync/replay script](sync-linkedin-fix.py) and [VPS verification](linkedin-pilot-001/vps-verification.txt) record this step. No provider API requests or additional charges were incurred. The fix is now in the benchmark VPS checkout; production is not deployed. Full replay evidence is saved privately as `linkedin-pilot-001/vps-verification.json` alongside the original responses.

Billing was re-read after completion: $0.0381 total. The profile dataset has ten records but its reported charged post-event count is nine; record that provider-reported difference without assuming future free results. Account-tier post pricing is $0.002 with a $0.00005 start event, distinct from the advertised starting price for higher tiers. Initial completion metadata showed only the start charge; that initial value is superseded by the later billing read.

Limitations: four company records and four profile records have repost attribution; five profile records contain nested repost objects. Top-level preservation passes, but full nested content and original-vs-repost timestamp semantics are not independently verified. No independent LinkedIn page reference, completeness/recall claim, long-term reliability result or legal authorization is established. Photos/videos remain outside acceptance scope. This is a small functional pilot, not a production-readiness result.

### TwitterAPI.io initial functional pilot — 2026-09-26

User confirmed credits recharged and explicitly authorized testing. [Runner](twitterapi-io-pilot.py) made exactly two single-page provider requests, without retries or pagination: `/twitter/user/last_tweets` for NASA with replies excluded, and `/twitter/tweet/advanced_search` for `"James Webb telescope" -filter:retweets`, Latest. Each returned 20 records and advertised a next page, which was not followed. [Checkpoint evidence](twitterapi-io-pilot-001/verification.txt) contains counts, per-record boolean checks and raw response hashes; raw content and normalized output remain private under `/home/distilled-bench/.local/share/distilled-bench/twitterapi-io-pilot-001/` on the VPS.

The existing TypeScript X normalizer was reused offline as a schema-compatibility check, not as a production TwitterAPI.io connector. All 40 records retained; zero within-page duplicate IDs; all 240 checkpoints passed for required fields, top-level text, author username, publication date, original post link and expanded entity links. The profile page includes seven nested repost objects; the search page includes two nested quoted-post objects. Their full content and attribution are not established by top-level preservation checks and remain unverified. Independent completeness, relevance, edit histories and repeated-run reliability remain untested. Media is out of scope.

Integration gap: the reused normalizer still labels source.provider as `apify`; TwitterAPI.io requires its own provider wiring before production use. This pilot does not deploy or enable it. No parser changes were made in this run.

At the published $0.15/1,000 returned posts rate, 40 results imply **$0.006 estimated usage** (0.6 US cents). The user subsequently reported 600 credits consumed at $20 per two million credits, also $0.006; this is user-reported billing, not an independent account query. Provider docs: [profile endpoint](https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets), [search endpoint](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search), [pricing](https://twitterapi.io/pricing). No other paid providers were called during that pilot.

Authorization checkpoint: technical pilot passed; authorization for collection and intended public-platform reuse remains unverified. User was given questions to request written provider evidence covering X authorization, storage, LLM summarization, public display, retention and deletion. No provider response has been reviewed. [X terms](https://x.com/en/tos) prohibit scraping without prior written consent; [TwitterAPI.io acceptable-use policy](https://twitterapi.io/acceptable-use) also requires compliance with X terms. These contractual findings do not establish a jurisdiction-specific legal conclusion.

Zyte HTTP is the first paid route run; actual charges await reconciliation. Apify Google News has also run through the console; its output review is recorded below. Stage 2 and Stage 3 have not started. Earlier dated sections preserve what was known at that checkpoint; later verification and fix sections supersede their pending statements. Telegram's public-page parser is existing platform code in `packages/connectors/src/telegram.ts`, reused by the benchmark. Missing video references do not mean the original Telegram videos were deleted; they mean the normalized output omitted them. Video-content understanding is a separate, untested capability.

## What the labels mean

These definitions describe the current article scorer in [bench/score.py](../../evaluation/acquisition-benchmark/bench/score.py). Source-list scoring has different rules and must be documented separately when RSS/social results are added.

| Label | Meaning |
|---|---|
| PASS | Basic validation succeeds; identity checks supplied by the reference succeed; body and title F1 are each at least 90%; required text anchors are present in order; no configured forbidden text appears; publication date matches at the chosen precision. |
| PARTIAL | The output passes basic validation and is recognizably the target article, but at least one quality requirement above fails. It may contain nearly all the article yet retain unwanted text or omit a required introduction. It is not counted as a full PASS. |
| FAIL | With a reference present, the output fails basic article validation. Inspect the validation reasons rather than assuming the cause. |
| FALSE_SUCCESS | Basic validation passes, but identity is wrong, body F1 is below 50%, or every configured anchor is missing. A plausible-looking output is not sufficient evidence of success. |
| AUTO_UNVERIFIED | No independent reference is attached; basic validation passes. This is not a verified PASS. |
| AUTO_FAIL | No reference is attached and basic validation fails. |
| SOURCE_CHANGED | The reference explicitly flags a changed source; the scorer records that condition rather than a normal quality verdict. |

PASS is threshold-based, not a promise of exact text equality. A completed job only means processing finished. INSUFFICIENT_EVIDENCE is a separate group-level gate: an individual PASS does not establish broad reliability or a winning provider.

### Understanding the measurements

- **Precision:** how much extracted normalized word content matches the reference. Extra page clutter reduces it.
- **Recall:** how much reference normalized word content appears in the extraction. Missing content reduces it.
- **Body F1:** combines precision and recall. It is a normalized word-overlap score, not a factual accuracy percentage, exact character comparison, or semantic completeness guarantee.
- **Anchors:** selected beginning/middle/end phrases that must occur in order. A high F1 cannot compensate for a missing required anchor.
- **Boilerplate:** the scorer finds a phrase listed in `must_not_contain`. This only detects configured markers, not every possible unwanted fragment.
- **Date correctness:** compares the final pipeline timestamp. Native extractor date correctness is separately reported and does not itself determine PASS.
- **Date precision:** day-only references check the date only. The current minute-precision implementation allows a five-minute difference; it does not require matching seconds.

## Batch: pilot-web-20260921T085233Z

Acquired on 2026-09-21; independent reference review completed locally on 2026-09-22.

| Setting | Observed scope |
|---|---|
| Acquisition | Direct HTTP only |
| Processing | Trafilatura and Mozilla Readability on saved HTML |
| Inputs | Five articles across CNN, Al Jazeera, Euronews, The Guardian and NASA |
| Repetitions | Two per article: 10 acquisition jobs, 20 extraction results |
| Completion | All 10 jobs complete |
| Repeatability | Article data identical between repetitions for each article/extractor pair |
| Resource stops | None |
| Peak process-tree memory | 433,610,752 bytes, approximately 414 MiB |
| Provider charges | $0 recorded |
| Server cost | Unknown; cost per usable result remains unavailable, not zero |
| Reported p95 combined time | Trafilatura 1,540 ms; Readability 2,838 ms. Small-sample pipeline observations, not isolated parser timing or a general performance conclusion. |

Downloaded source report: `C:\Users\Admin\Downloads\distilled-benchmark-reports\pilot-web-20260921T085233Z\report.json`.

### Results by article

The table combines CNN's existing report score with the four local rescoring files. Each result occurred in both repetitions.

| Article | Trafilatura label | Body F1 | Readability label | Body F1 | Main finding |
|---|---|---:|---|---:|---|
| article-001 — CNN, English | PASS | 99.3% | PASS | 99.3% | Required reference content recovered; small tolerated extras. |
| article-002 — Al Jazeera, Arabic | PARTIAL | 99.3% | PARTIAL | 93.8% | Both retain suggested-story markers; Readability includes substantially more clutter. |
| article-003 — Euronews, French | PASS | 100.0% | PARTIAL | 94.8% | Readability omits the introductory summary and includes byline/date labels. |
| article-004 — Guardian, English | PARTIAL | 98.7% | PARTIAL | 98.7% | Both omit the introductory summary required by the reference. |
| article-005 — NASA, English | PARTIAL | 97.9% | PARTIAL | 95.6% | Both retain non-article resource text; Readability also omits section headings. |

Across five distinct inputs: Trafilatura has two PASS and three PARTIAL; Readability has one PASS and four PARTIAL. Counting both repetitions gives six PASS and fourteen PARTIAL results in the combined local assessment. Repetitions do not increase the number of independent inputs. These are not yet the counts in the unchanged VPS report.

### article-001 — CNN: why both PASS

- Reference: 582-word independently copied main article; unrelated story card excluded.
- Both recover all normalized reference words (recall 100%), with body F1 approximately 99.3%.
- Both retain the short update notice, which the current thresholds tolerate. PASS therefore does not mean an exact copy.
- Trafilatura adds `| CNN Politics` to the title; title F1 remains above the threshold.
- Required anchors, configured unwanted-text checks and final publication timestamp pass.
- Trafilatura's native date is incorrect against the precise reference, but shared page metadata supplies the correct final timestamp. Readability's native timestamp matches.
- Evidence: [initial article transcript](FIRST_ARTICLE_001_2026-09-16.txt), downloaded batch report, and the VPS CNN gold reference.

### article-002 — Al Jazeera: why both PARTIAL

- Reference: 506 words including main paragraphs and section headings; excludes menus, suggested stories, ads and image captions.
- Trafilatura retains `قصص مقترحة` and `list of 2 items`. These trigger the forbidden-text check despite the high body F1.
- Readability retains those markers, unrelated suggested headlines, publication/update labels, captions and `إعلان`. Its paragraphs also run together.
- Both pass the title, required anchors and publication-day checks. The reference supports April 6, 2025 only; the displayed 16:50 is an update time, not independent publication-time evidence.
- Trafilatura's day-only timestamp is a precision limitation, but it does not fail this day-precision reference.
- Actual score blocker for both: `boilerplate: true`.
- Evidence: [reference](article-002/article-002.gold.json), [clean text](article-002/article-002-body.cleaned.txt), [scores](article-002/local-rescore.json), [provenance](article-002/README.md).

### article-003 — Euronews: why Trafilatura PASS and Readability PARTIAL

- Reference: 353 words including the introductory summary and main narrative, excluding byline/date labels, captions, advertisements and related links.
- Trafilatura achieves 100% normalized body precision and recall. Title, anchors, forbidden-text and final date checks pass.
- Readability omits the introductory summary, so the first required anchor is missing. It also retains `Jean-Philippe Liabot` and `Publié le`, triggering the forbidden-text check.
- Actual Readability blockers: `anchors_ordered: false` and `boilerplate: true`.
- Both final timestamps match February 26, 2025 at 11:29 UTC+1 within the scorer's tolerance. Trafilatura's native date does not meet the reference precision; page metadata supplies the correct final date.
- Evidence: [reference](article-003/article-003.gold.json), [clean text](article-003/article-003-body.cleaned.txt), [scores](article-003/local-rescore.json), [provenance](article-003/README.md).

### article-004 — Guardian: why both PARTIAL despite clean text

- Reference: 639 words, including the introductory summary below the headline, consistently with the Euronews reference.
- Both omit that summary, beginning directly with the main narrative. The required first anchor is therefore absent.
- Both exclude the inline related-story card, donation appeal and other configured unwanted text.
- Body precision is 100%; recall is approximately 97.4%. Both final publication timestamps and titles match.
- Actual blocker: `anchors_ordered: false`, not unwanted text or a failed download.
- This verdict depends on the documented requirement to retain the introductory summary. Do not silently remove it from the reference to improve results.
- Trafilatura's native date does not match the precise reference; final page metadata does.
- Evidence: [reference](article-004/article-004.gold.json), [clean text](article-004/article-004-body.cleaned.txt), [scores](article-004/local-rescore.json), [provenance](article-004/README.md).

### article-005 — NASA: why both PARTIAL

- Reference: 910 words including main narrative, three section headings and concluding Webb mission context. Excludes image descriptions/captions, table of contents and download/resource sections.
- Trafilatura retains the image heading and text beginning `The following sections contain links to download`. It recovers all normalized reference words but includes extra content.
- Readability retains image-caption/credit content and download text, and omits narrative section headings.
- Both titles include the site suffix `- NASA Science`; title F1 is approximately 91.7%, which passes the current threshold.
- Both pass required anchors and the publication-day check. The copied page independently supports April 10, 2025, not the exact time. September 21, 2026 is the update date.
- Actual score blocker for both: `boilerplate: true`. Readability's missing headings are an additional observed defect; the three selected anchors do not directly test every heading.
- Evidence: [reference](article-005/article-005.gold.json), [clean text](article-005/article-005-body.cleaned.txt), [scores](article-005/local-rescore.json), [provenance](article-005/README.md).

## Exact checkpoint register

Recorded 2026-09-22 from the downloaded output and local references. These are raw-extraction results; no LLM cleanup has been applied. Checks and matched phrases were verified for both repetitions (0 and 1). The table below shows each pair once.

All ten article/extractor pairs passed basic validation, the 90% body F1 threshold, the 90% title F1 threshold and the final publication-date check at the reference precision. CNN passed its supplied identity check; canonical URL identity was not independently enforced by the four new references.

| Article / extractor | Exact failed PASS checkpoints | Evidence: matched forbidden phrases or missing required anchor |
|---|---|---|
| CNN / Trafilatura | None | PASS under the existing CNN reference. |
| CNN / Readability | None | PASS under the existing CNN reference. |
| article-002 / readability | `boilerplate` expected `false`, observed `true` | Matched: `قصص مقترحة`, `list of`, `إعلان` |
| article-002 / trafilatura | `boilerplate` expected `false`, observed `true` | Matched: `قصص مقترحة`, `list of` |
| article-003 / readability | `boilerplate` expected `false`, observed `true`; `anchors_ordered` expected `true`, observed `false` | Matched: `Jean-Philippe Liabot`, `Publié le`; Missing anchor 1: `Les scientifiques ont exclu que l'astéroïde YR4, dont la probabilité d'impact atteignait` |
| article-003 / trafilatura | None | PASS; all configured checkpoints satisfied. |
| article-004 / readability | `anchors_ordered` expected `true`, observed `false` | Missing anchor 1: `Expert says glimpse of UV light is akin to finding ‘first buried` |
| article-004 / trafilatura | `anchors_ordered` expected `true`, observed `false` | Missing anchor 1: `Expert says glimpse of UV light is akin to finding ‘first buried` |
| article-005 / readability | `boilerplate` expected `false`, observed `true` | Matched: `The following sections contain links to download`, `Illustration: NASA, ESA, CSA` |
| article-005 / trafilatura | `boilerplate` expected `false`, observed `true` | Matched: `The following sections contain links to download`, `Image: Planetary Engulfment Illustration` |

Exact per-repetition evidence and score fields are saved in [checkpoint details](pilot-web-20260921T085233Z-checkpoints.json). These checkpoint details cover the four locally rescored articles; CNN remains supported by its original batch score.

### Diagnostic issues that do not themselves block PASS

- `extractor_date_correct: false` for Trafilatura on CNN, Euronews and Guardian is a native-date diagnostic. Their final `date_correct` checks pass because page metadata supplies the timestamp.
- Al Jazeera's day-only date passes the day-precision reference. Exact publication time remains unverified.
- Readability's missing NASA section headings are observed content omissions, but the selected anchors still pass. The actual NASA label blocker is unwanted text.
- CNN's update notice and title suffix are tolerated by the current reference/thresholds. They are not failed checkpoints.
- Body F1 does not check paragraph layout; Readability's joined Arabic paragraphs are a formatting issue outside the current label gates.
- A PARTIAL may be usable after cleanup, but that is not yet tested. Future LLM cleanup must have its own results, cost and latency; never replace these raw baseline labels with assumed improvements.

### Tracking rule for future runs

For every non-PASS, record the exact field, expected value or threshold, observed value, offending text or missing anchor, affected repetition, evidence path and follow-up status. Separate actual label blockers from other diagnostics. Keep an issue open until a new scored result demonstrates resolution; preserve the original result.

## What we can conclude

Trafilatura produced cleaner content overall in this five-article sample. Neither extractor consistently returned the complete desired article without extras. The principal defects are page clutter, omitted introductory summaries, missing headings and limited native date precision. Shared metadata improves final dates.

This does not establish a production winner. Only five distinct articles and one acquisition route were tested. JavaScript-dependent and redirect-specific coverage has not been established. Browser and paid acquisition methods remain untested in this batch.

The four new references come from independent publisher copies supplied by the user, but unwanted-text markers and anchors were selected after inspecting results. These are pilot diagnostic checks, not a blind unseen evaluation. Freeze reference rules before Stage 2. The four new references do not independently enforce canonical URL identity. Word-overlap metrics also do not prove every sentence is correctly ordered or formatted.

## Remaining actions

- [ ] Transfer article-002 through article-005 gold references to the VPS, attach them to this run and rescore saved results.
- [ ] Preserve the original report alongside the updated report; acquisition does not need to be repeated for reference-only rescoring.
- [ ] Record any agreed extraction fixes separately, then compare a new processing result against this baseline.
- [ ] Continue Stage 1 from the current-status table above; preserve completed RSS and Google News evidence and record unavailable credentials/routes as pending.
- [ ] Resolve server cost before making total-cost comparisons.

## Batch: pilot-rss-20260922T095854Z ? RSS

Recorded 2026-09-22 from the [VPS execution transcript](RSS_PILOT_2026-09-22.txt). Detailed report.json was subsequently inspected locally; findings follow below.

- Scope: six configured feeds (BBC World, BBC Science, Guardian World, NASA, Le Monde and Al Jazeera), two parsers, two repetitions.
- Preflight: both rss_baseline and rss_feedparser READY; unknown server cost WARNING.
- Completed job count: 24. Completion alone does not establish valid items or absence of per-step errors.
- rss_feedparser: 12 SOURCE_UNVERIFIED; reported p95 combined 391 ms.
- rss_baseline: 12 SOURCE_UNVERIFIED; reported p95 combined 1,096 ms.
- Neither candidate has verified unseen inputs; both evidence gates remain INSUFFICIENT_EVIDENCE.
- Peak process-tree RSS: 128,303,104 bytes (approximately 122 MiB); no capacity stops. Sampled maximum host CPU fraction: 0.9123.
- Provider charges: $0; server cost unconfigured, cost per usable result unavailable.
- Config SHA256: `cdc4e1f99d570515f9d22be21000fdc5c1fb9c69c7bd0452ea9abe384f4d49a4`.
- Code SHA256: `81419596ad10839ce93a61d200c68b04c42f4d27764524b3eb0f8ac8ac02d7c4`.

### Exact checkpoint status

SOURCE_UNVERIFIED is not an article PARTIAL or a verified source PASS. Independent source references have not been supplied. Per-feed item counts, parser errors, field differences, duplicate IDs and completeness remain pending inspection of report.json and captured source evidence. No specific feed failure or parser winner can be established from this summary.

### Detailed local inspection ? 2026-09-22

Downloaded report.json inspected. [Per-job checkpoint evidence](pilot-rss-20260922T095854Z-checkpoints.json) includes both repetitions, duplicate URLs, missing-field counts and parser comparisons.

| Feed | Entries per parser per repetition | Baseline HTML-containing text items | Feedparser HTML-containing text items | Baseline / feedparser items with media |
|---|---:|---:|---:|---|
| aljazeera | 25 | 0 | 0 | 0 / 0 |
| bbc_science | 42 | 0 | 0 | 42 / 0 |
| bbc_world | 37 | 0 | 0 | 37 / 0 |
| guardian_world | 45 | 45 | 45 | 45 / 0 |
| lemonde | 16 | 0 | 0 | 16 / 0 |
| nasa | 10 | 0 | 10 | 0 / 0 |

All 24 steps are captured, with no recorded processing errors. No returned item is missing id, url, text or published_at. Both parsers have the same URL multiset and equivalent publication instants in each paired repetition; date string formatting differs but is not a timestamp error. Canonical payload hashes match for all 12 pairs. Normalized item lists are unchanged between repetitions for each parser/feed. Agreement is not independent proof of completeness.

| Checkpoint | Expected / observed | Interpretation / status |
|---|---|---|
| Requested item limit | Supplied config requested max_items=20; BBC World returns 37, BBC Science 42, Guardian 45 and Al Jazeera 25 | Observed limit discrepancy in both parsers and repetitions. Confirm frozen VPS config and RSS limit semantics before fixing. No code changed. |
| Duplicate article URLs | BBC Science has 42 entries but 40 distinct exact URLs for both parsers | Two excess entries by URL; scorer reports duplicates=0 because IDs differ. Keep URL duplicates distinct from duplicate IDs; inspect raw feed before deciding whether entries should be merged. |
| Identity representation | Baseline short generated IDs differ from feedparser feed IDs/URLs | Do not equate differing IDs with missing articles. Match by URL for this diagnostic comparison; canonical identity policy still needs definition. |
| Text representation | Guardian has HTML in 45/45 texts for both; NASA feedparser has HTML in 10/10, baseline in 0/10 | Feed HTML may be valid source content, but is not clean plain text. Needs an explicit output contract/cleanup check; not automatically a source-quality FAIL. |
| Image preservation | Baseline has media on BBC and Le Monde items; feedparser returns empty media there | Candidate difference requiring verification against captured XML; record as pending media fidelity, not a verified scoring failure. |
| Text selection | Le Monde sample: baseline uses an article summary, feedparser uses a photo-caption-like description; NASA baseline uses short plain text, feedparser longer HTML | Verify XML field selection and intended summary/full-content policy before declaring a winner. More text is not automatically better. |
| Independent reference | All 24 results remain SOURCE_UNVERIFIED | No reference-based quality or complete-window recall verdict yet. No time window was configured, so outside_window=0 does not prove freshness filtering. |

Next: retrieve the captured feed XML blobs referenced by the report. Check source fields, counts, GUIDs, dates and media against those snapshots. Do not use a newly fetched live feed as the ground truth for this earlier capture. Website-reference attachment/rescoring on the VPS remains unconfirmed.



### Saved XML verification ? 2026-09-22

The eight distinct raw snapshots were downloaded, hash-verified and independently parsed with Python's standard-library XML parser. All 24 parser/repetition results were compared against their own captured source, not a newly fetched live feed. See [verification method and snapshots](rss-pilot/README.md) and [exact checkpoint counts](rss-pilot/xml-checkpoints.json).

| Checkpoint | Evidence from the XML | Verdict / affected scope |
|---|---|---|
| Captured entry coverage | XML item counts and URL multisets match both outputs for all feeds/repetitions | Verified at snapshot level: no lost or extra feed entries by link multiplicity. Not complete publisher/time-window recall. |
| Publication timestamps | XML pubDate values match all output dates as instants | No mismatched publication instants found. |
| BBC Science repeated URLs | Original feed has 42 items and 40 distinct URLs | Source-originated repetition; neither parser invented it. Deduplication policy remains a separate application decision. |
| Feedparser Media RSS preservation | XML supplies image URLs for BBC World 37/37, BBC Science 42/42, Guardian 45/45 and Le Monde 16/16 entries; route outputs empty media | Confirmed missing media mapping in this benchmark's feedparser route, in both repetitions. Do not attribute this to an inherent limitation of the feedparser library: the wrapper reads enclosures only. |
| Baseline Guardian image URL decoding | All 45 output image URLs contain entity-escaped query separators; they match source URLs only after HTML entity decoding | Confirmed serialization/decoding discrepancy in both repetitions. Images are present, but exact URLs are not preserved. No live image retrieval was tested. |
| Le Monde text field selection | XML contains article descriptions and image captions; feedparser output contains captions for 14/16 entries and preserves the article description for only 2/16. Baseline preserves all 16 descriptions | Confirmed summary-selection problem in the current feedparser route for this sample, both repetitions. |
| Guardian HTML | Feed description itself contains HTML, preserved by both outputs | Source-originated markup, not invented text. Cleanup is needed if the output contract requires plain text. |
| NASA text length/HTML | XML supplies short description plus longer content:encoded HTML. Baseline preserves all 10 descriptions; feedparser selects longer HTML content | Different field policy, not proof that the baseline lost a required full article. Define summary versus full-content requirements before scoring this difference. |
| Requested max_items=20 | Source counts themselves exceed 20 on four feeds; both parsers retain all entries | The supplied limit is not reflected in these outputs. Frozen config verification and limit semantics remain pending; neither parser invented entries. |

Al Jazeera and NASA have no Media RSS URL attributes in these snapshots; absence of output Media RSS images there is not counted as missing source media. Embedded HTML images are a different check, not covered by the Media RSS comparison.

Formal report labels remain SOURCE_UNVERIFIED. These independently verified checkpoints do not silently change them to PASS or PARTIAL. No application or benchmark implementation was modified. Next work is to agree source-field/cleanup expectations and preserve these findings before any fixes or formal reference attachment.

### Fixes and saved-feed retest ? 2026-09-22

User authorized fixes after baseline review. Implemented locally; not yet applied to the VPS or deployed to the platform. Earlier observations and original reports are preserved.

| Confirmed issue | Change | Saved-feed result |
|---|---|---|
| Platform parser returns entity-escaped image URLs | Decode XML/HTML entities in extracted media URLs | Guardian image URLs now match source XML exactly. |
| Python alternative loses Media RSS images | Map media_content and media_thumbnail as well as enclosures; deduplicate identical URLs | Supplied Media RSS images preserved for BBC, Guardian and Le Monde. |
| Python alternative selects captions instead of summaries | Prefer publisher summary; use content only as fallback | All 16 Le Monde descriptions preserved. NASA now also follows a summary-first policy. |
| RSS max_items ignored by benchmark processing | Runner passes the configured maximum into both RSS normalization routes; cap in source order | Counts with max_items=20: BBC World 20, BBC Science 20, Guardian 20, Al Jazeera 20, Le Monde 16, NASA 10. |
| Cap could hide intentional omissions | Add item_limit.maximum/available/returned/omitted to normalization and score output | Omitted entries are visible, and are not misclassified as parser normalization drops. Raw XML remains intact. |

Offline replay: 24 original parser/repetition combinations, each replayed uncapped and capped at 20, for **48 comparisons with zero failed checks**. Independent checks cover source URL multiplicity, entry counts, publication instants, presence of source Media RSS URLs and retention of source descriptions after entity/whitespace normalization. This validates the named fixes on these captures, not every possible feed schema or full article quality.

Evidence: [separate post-fix outputs and checks](rss-pilot/after-fixes.json). Reproducible helper: [replay_rss_pilot.py](../../evaluation/acquisition-benchmark/scripts/replay_rss_pilot.py). It verifies input hashes, makes no network calls and refuses to overwrite an existing output file. Run it with the downloaded report, the directory containing blobs/, and a fresh --output path.

Validation: complete offline Python benchmark suite passed (204 tests); connector RSS/ingestion regression tests passed (61 tests); connector TypeScript type-check passed; git diff whitespace check passed. A [VPS transfer patch](rss-pilot-fixes.patch) contains the implementation fixes, regression tests and offline replay helper; reverse-apply validation succeeded locally. It has not been applied remotely.

Still open: plain-text cleanup policy, article URL deduplication policy, comprehensive source references and formal VPS rescoring. SOURCE_UNVERIFIED labels in the original report are unchanged. No LLM cleanup was added. The item cap change is in the benchmark, not a new platform ingestion cap.

## Adding future results

Append a dated section per batch using this template. Keep actual observations separate from planned work, and record whether results exist locally, on the VPS, or both.

```markdown
## Batch: <run ID> — <source family>

- Acquisition date / review date:
- Config, code version and environment:
- Inputs, routes, parsers and repetitions:
- Independent reference source and scoring policy:
- Execution location / report location / rescoring status:

| Input / repetition | Candidate | Label | Failed checkpoint | Expected / observed | Exact text or missing anchor | Evidence / follow-up status |
|---|---|---|---|---|---|---|

### Findings

What passed, what was partial or failed, and the exact missing/extra/incorrect fields.

### Limits and next actions

Untested candidates, incomplete references, cost gaps, required fixes and follow-up runs.
```

## VPS confirmation ? RSS fix replay

User screenshot confirms the saved VPS file `data/live/reports/pilot-rss-20260922T095854Z/after-fixes.json` reports 48 comparisons and 0 failed checks. The summary was displayed twice; these are not two independent replays. The previous FileExistsError protected the existing evidence from overwrite. This confirms the saved VPS replay result; the VPS pytest summary and deployment to any other platform environment were not supplied. Original source-report labels remain unchanged. Next: Google News RSS pilot; paid Apify comparison remains pending.

## Batch: pilot-google-20260922T125352Z ? Google News RSS

VPS summary received 2026-09-22; [transcript](GOOGLE_PILOT_2026-09-22.txt). Two configured queries (Lebanon electricity and James Webb telescope), two repetitions, google_rss route only. All four jobs complete, all four SOURCE_UNVERIFIED, zero verified unseen inputs and INSUFFICIENT_EVIDENCE. Reported p95 combined time 657 ms, peak process-tree RSS 124,502,016 bytes (about 119 MiB), zero capacity stops and $0 provider charges. Server cost remains unknown.

Config SHA256: `ba6ac918a65e3c908d966ed059dcf009d6f5b967ff47777c60f966235a776b6b`. Code SHA256: `fe3ae1eaee97c9a7a1ba458c96fd62ddf6de34e7ce241468a27e77f22b421acb`.

Detailed checkpoints pending report.json and captured XML inspection: step errors, returned counts and cap, headline preservation, publisher attribution, dates, duplicate IDs/URLs and links. Job completion is not a quality PASS. No paid Apify comparison has run.

### Google News captured-XML checks ? 2026-09-22

Detailed report and two distinct captured XML snapshots inspected locally. SHA256 hashes match report evidence. Standard-library XML parsing was used to compare each selected entry directly with its output. [Checkpoint evidence](google-pilot/xml-checkpoints.json); XML snapshots are saved alongside it.

| Checkpoint | Observation | Result / interpretation |
|---|---|---|
| Job processing | Four captured steps; no recorded processing errors | Execution check passed. |
| Item cap | Each XML has 100 items; each output has the first 20 in source order, with 80 omitted in item_limit | Cap behaves as configured in all four jobs. Source ordering is not guaranteed newest-first. |
| Headline | Output matches XML title after removing the exact trailing publisher suffix | No mismatches across the 80 returned entries, including repetitions. |
| Publisher attribution | Output author matches XML source name | No mismatches. This field represents the publisher, not a journalist byline. |
| Article links | Output URL matches each selected Google RSS link | No mismatches. Links remain Google News URLs; resolution to final publisher pages was not tested. |
| Dates | Output timestamp matches pubDate as an instant | No mismatches. |
| Duplicate IDs / URLs | None within any selected 20-entry output | Does not prove story-level uniqueness. Lebanon results repeat one headline with distinct entry links. |
| Images | No Media RSS elements in the selected XML entries; outputs have empty media | No supplied Media RSS images lost. Other image discovery was not tested. |
| Freshness | Space items roughly 0.79?55.25 days old; Lebanon items 3.45?126.63 days old at capture | Queries did not constrain recency. Correct dates do not mean fresh stories. |
| Geographic relevance | Lebanon electricity includes a headline explicitly about Lebanon, Missouri | Query ambiguity, not a parser invention. Geography/topic relevance needs a separate check. |
| Content depth | Normalized content is headline text | This is discovery data, not independently verified full-article content for summarization. |

Both repetitions used identical snapshot hashes per query. Formal report labels remain SOURCE_UNVERIFIED because no complete source reference was attached. These checks establish faithful parsing of the selected snapshot entries, not search recall, full article accuracy, URL-resolution success, or a provider winner. Paid Apify comparison remains pending. No code was changed during this review.

Optional future search-quality work: retain this baseline and use separately named queries with explicit relevance/freshness requirements if requested. This is outside the current parsing comparison and is not required to pass parsing checks.


### Telegram public-page pilot - 2026-09-22

Run: `pilot-telegram-public-20260922T173925Z`. Downloaded report and both captured HTML blobs inspected locally. [Exact checkpoints](telegram-pilot/checkpoints.json).

| Checkpoint | Observation | Result |
|---|---|---|
| Acquisition deadlines | First attempt for each channel failed with `deadline` after about 45 seconds; no captured evidence | Failed acquisition attempts. Root cause not established; do not count completed jobs as successful fetches. |
| Later repetitions | AjaNews and telegram each returned 20 posts, HTTP 200 | Captured successfully; not a full quality PASS. |
| Snapshot integrity | Both SHA256 values match report artifacts | Passed. |
| Post IDs and order | All 40 output IDs match captured page posts in order | Passed for these snapshots, not full channel history. |
| Publication dates | All 40 timestamps match page time elements as instants | Passed. |
| Video preservation | Official channel HTML contains videos for IDs 441, 442, 443, 444, 446, 447, 448, 450, 451, 453, 455, 456, 459; output has no video references for these posts | Confirmed missing-media issue. Current platform public-page extractor only extracts a photo URL. No fix made in this review. |
| Photos | Official output contains three photo references | Presence observed; photo URL fidelity and completeness not yet independently checked. |
| Full text and links | Not yet independently compared in this review | Pending; no overall parser PASS claimed. |

Original labels remain two UNSCORED and two SOURCE_UNVERIFIED. Provider charges are $0; server cost is unknown. Telethon comparison has not run. Next: inspect text/link/media fidelity, correct confirmed parser omissions, replay these same snapshots, and separately repeat live acquisition to investigate deadline reliability.


### Telegram fixes and offline replay - 2026-09-23

Independent standard-library HTML parsing of the two captured pages confirmed:

- Al Jazeera: all 20 posts matched IDs/order, timestamps, post URLs, whitespace-normalized text, content links and media references.
- Telegram official: all 20 posts had literal `&nbsp;` text and omitted links embedded in their message bodies. These include Telegram post/navigation links authored inside the message and Telegram blog links. Thirteen also lost their video references. Exact affected post IDs and failed fields are in [before-fixes.json](telegram-pilot/before-fixes.json).
- The three returned photo URLs matched the snapshot. Arabic text was checked from UTF-8 data; it was not treated as corrupted based on terminal display.

Changes to existing platform public-page parsing (`packages/connectors/src/telegram.ts`): extract video/src and nested source URLs, retain all photo URLs, decode media entities, deduplicate media, preserve HTTP(S) links inside message text including Telegram links, exclude surrounding widget navigation by restricting link scanning to the message body, and decode nonbreaking spaces. This captures video references only, not video content or transcripts. CDN URL lifetime and media download success were not tested.

[Offline replay helper](../../evaluation/acquisition-benchmark/scripts/replay_telegram_pilot.py) independently checks original or reprocessed outputs against the saved HTML, validates input hashes, and refuses to overwrite existing evidence. Text comparison normalizes whitespace; this is not a byte-for-byte formatting check. Source reference checks cover visible captured posts, not historical completeness or semantic truth.

**After fixes: two captured-page comparisons / 40 posts, zero failed comparisons**, including all 13 video references. [After-fixes evidence](telegram-pilot/after-fixes.json). No network requests were made; the two original deadline failures remain failures and are excluded from parser replay, not erased.

Validation: six Telegram regression tests passed, connector TypeScript checking passed, and changed-file whitespace checks passed. Tests include video-only posts, nested video sources, media deduplication/entity decoding, album photos, message Telegram links, widget-navigation exclusion and unsafe media URL rejection. The full Python suite was not rerun for this connector-only change and replay helper.

[Transfer patch](telegram-pilot-fixes.patch) contains only Telegram connector changes, Telegram tests and the replay helper; reverse-apply validation passed locally. **VPS application/replay and production deployment are not yet confirmed.** Original run labels remain unchanged. Next: apply and replay on VPS, then investigate live-fetch reliability separately and compare with Telethon using a matched collection window.


### VPS confirmation - Telegram fix replay - 2026-09-23

User terminal output confirms the Telegram patch applied without error and the offline replay on the VPS reported **2 comparisons, 0 failed comparisons**. Saved output: `data/live/reports/pilot-telegram-public-20260922T173925Z/after-fixes-20260923T082258Z.json`.

This confirms the updated parser passed the helper checks against the two saved pages on the VPS. The downloaded local baseline contains 40 posts across those pages. The new VPS output file itself has not been downloaded for local inspection. No live acquisition occurred in this replay, so it does not resolve the two original 45-second deadline failures. Production deployment and Telethon comparison remain unconfirmed/not run. Next: a separately named live public-page run using the existing pilot configuration, preserving the original run.


### Telegram live retest - 2026-09-23

Run `pilot-telegram-retest-20260923T082653Z`. [User terminal evidence](TELEGRAM_RETEST_2026-09-23.txt) shows four complete jobs, with **3 SOURCE_UNVERIFIED and 1 UNSCORED**. Reported p95 combined time is 45,010 ms. Provider charges are $0, server cost remains unknown, and no capacity stops were recorded.

The unscored attempt and approximately 45-second timing suggest a repeated acquisition deadline, but the exact channel, step status and reason require the detailed report; this summary alone does not confirm them. Three returned source results still require checks against the newly captured pages. The successful offline replay of the earlier pages does not establish accuracy on these new captures or eliminate acquisition failures. Next: inspect this run's report.json and blobs; preserve it separately from the original run.


### Telegram live retest detailed verification - 2026-09-23

Downloaded `pilot-telegram-retest-20260923T082653Z/report.json` and all three captured blobs inspected. The helper checked the actual saved outputs (`--original`), not a replacement local parsing result: **3 comparisons / 60 returned posts, zero failed comparisons**. IDs/order, post URLs, publication instants, whitespace-normalized text, message links and photo/video references match the captured pages. Payload hashes were verified. [Checkpoint evidence and saved normalized outputs](telegram-pilot/retest-original-checks.json). Repeated channel inputs are not independent sources; formal report labels remain SOURCE_UNVERIFIED.

Exact failed checkpoint: `telegram_official`, repetition 0, acquisition status `failed`, reason `deadline`, duration 45,010 ms, queue time 0, no captured payload. Later official-channel repetition captured 20 posts in 186 ms. Al Jazeera repetitions captured 20 posts each in 94 and 76 ms; their queue waits are separate from these acquisition durations. No processing errors were recorded on captured steps.

Conclusion: confirmed parsing fixes hold on the newly captured pages, but public-page acquisition reliability remains unresolved (3/4 attempts captured in this run). Source code inspection shows the benchmark's connection backend validates resolved IPs but connects only to the first address; this is a possible investigation lead, not a confirmed cause of these deadlines. Next diagnostic: bounded repeated requests from the VPS with DNS/connect/TLS/first-byte timings. No further implementation changes made in this verification.


### VPS connection diagnostic - 2026-09-23

User ran three separate curl requests to `https://t.me/s/telegram` with a 15-second maximum. All returned HTTP 200 from IPv4 `149.154.167.99`.

| Request | DNS seconds | Connect seconds | TLS seconds | First byte seconds | Total seconds |
|---|---:|---:|---:|---:|---:|
| 1 | 0.014458 | 0.224250 | 0.240317 | 0.396591 | 0.417241 |
| 2 | 0.001023 | 0.209300 | 0.222584 | 0.363014 | 0.379650 |
| 3 | 0.001535 | 0.208695 | 0.220180 | 0.374272 | 0.390863 |

Curl timings are cumulative milestones, not separate phase durations. These requests establish successful IPv4 connectivity at diagnostic time; they do not reproduce the benchmark transport or establish the cause of earlier deadlines. Next: compare forced IPv4/IPv6 and Python resolver ordering. Do not label the benchmark timeouts fixed on this evidence.


### VPS address-family diagnostic - 2026-09-23

Forced IPv4 returned HTTP 200 in 0.249268 seconds; forced IPv6 returned HTTP 200 in 0.241998 seconds. Python getaddrinfo returned `2001:67c:4e8:f004::9` first, then `149.154.167.99`. Both families worked at diagnostic time; a consistently broken IPv6 path is not supported by these results. Intermittent failures and benchmark-specific behavior remain possible. Next: bounded requests through bench.network.Http with HTTP transport debug logging; use a diagnostic-only 15-second request deadline without modifying benchmark configuration.


### Benchmark-client connection diagnostic - 2026-09-23

VPS requests through `bench.network.Http` reproduced the failure with a diagnostic-only 15-second deadline. Attempt 1 logged `connect_tcp.started` then cancellation and TimeoutError at 15.02 s, before TLS. Attempt 2 established TCP and TLS and returned HTTP 200 / 127,691 bytes in 0.16 s; attempt 3 reused the connection and returned the same status/size in 0.17 s.

This localizes the observed stall to the connection-setup stage, not parsing or response-body processing. The custom backend performs DNS resolution inside connect_tcp, so this log does not distinguish DNS from the literal-IP TCP connection. It does not prove an IPv6 failure or rate limit. Next: separately time resolver and literal-IP connection calls, retaining public-address validation and bounded diagnostic requests. Response cookie values are intentionally not copied into this record.


### Connection stall localized and benchmark fallback fix - 2026-09-23

User's instrumented benchmark-client run resolved both public addresses immediately (DNS rounded to 0.00 s), then attempted literal IPv6 `2001:67c:4e8:f004::9` on each of three requests. TCP elapsed times were 14.99, 15.01 and 15.01 seconds, each ending in the diagnostic request timeout. IPv4 was never attempted. This confirms a stalled IPv6 TCP attempt in this diagnostic and the benchmark's missing address fallback. The underlying reason this path stalls while earlier forced-IPv6 curl succeeded remains unknown.

Updated `bench/network.py` locally to try resolved, validated public addresses sequentially, with a three-second per-address connection deadline. Validation still rejects the complete DNS answer set if any address is unsafe; the code uses pinned literal addresses and preserves hostname-based TLS. Existing overall request deadlines and caller cancellation remain effective. DNS is not re-resolved during fallback. This is a benchmark HTTP transport change, not a production Cloudflare connector change or a provider-level retry. It can add up to three seconds before trying a second address; it does not establish long-term reliability.

Validation: **210 offline Python tests passed in 24.04 seconds**, including six new cases covering stalled/error/timeout fallback, total timeout, external cancellation and exhaustion of all addresses. Existing infrastructure tests cover rejection of mixed public/private DNS results. Changed-file whitespace check and patch reverse-apply validation passed.

[Connection fallback transfer patch](connection-fallback.patch) contains the benchmark network change and new regression tests only. VPS application and live verification remain pending. Original acquisition failures are preserved; they are not converted into successful results by this local fix. Next: apply patch, run offline tests on VPS and launch a separately named Telegram live run.


### VPS confirmation - connection fallback patch - 2026-09-23

User terminal output shows the first patch check/application completed without errors. Repeating the application then failed because the network hunk was already applied and the new test file already existed. The subsequent VPS offline suite passed: **210 tests in 21.43 seconds**. No rollback or second application is needed. Live acquisition after this patch has not yet been verified; next is a separately named Telegram public-page run. Earlier deadline failures remain in the evidence.


### Telegram live run after connection fallback - 2026-09-23

Run `pilot-telegram-fallback-20260923T093257Z`. [Terminal evidence](TELEGRAM_FALLBACK_2026-09-23.txt) reports four complete jobs and **4 SOURCE_UNVERIFIED**, with no UNSCORED attempts. Reported p95 combined acquisition/processing time is **3,627 ms**, versus 45,010 ms in the preceding retest. Provider charges are $0; server cost remains unknown. No capacity stops recorded.

This small live batch supports successful acquisition after the fallback change; it does not establish long-term reliability or prove which address each request used. All four source results still need independent checks against their new captured pages; no overall quality PASS claimed. Next: run the saved-page verification helper with --original against this new report, then proceed to the Telethon comparison. Earlier failures remain preserved.


### VPS verification - all four fallback-run captures - 2026-09-23

User output confirms `replay_telegram_pilot.py --original` checked the actual saved results of `pilot-telegram-fallback-20260923T093257Z`: **4 comparisons, 0 failed comparisons**. Evidence on VPS: `data/live/reports/pilot-telegram-fallback-20260923T093257Z/verified-20260923T093717Z.json`. That new verification file has not yet been downloaded locally. This confirms the helper's snapshot checks on all four captured outputs; it does not change formal SOURCE_UNVERIFIED labels, establish historical recall, or guarantee long-term connection reliability. The public-page pilot now has successful live acquisition and snapshot verification after fixes. Next: set up private Telegram API credentials and an authorized Telethon session, then compare matched channels/windows. Telethon has not run yet.


### Telethon setup - user confirmation

User confirmed successful interactive login (`session_ready`). Credentials and session remain outside Git on the VPS; no secret values were requested or recorded. Next pilot will read AjaNews and telegram over time windows derived from the verified public-page run `pilot-telegram-fallback-20260923T093257Z`, with serial acquisition to avoid simultaneous use of the session database. Telethon collection results are still pending. Matched windows enable comparison but do not establish public-page history completeness; later edits/deletions and API-only posts must be reported separately.


### Telethon live pilot summary - 2026-09-23

User terminal report for `pilot-telethon-20260923T101559Z` shows four complete jobs and **4 SOURCE_UNVERIFIED**. Reported p95 combined acquisition/processing time is 596 ms; provider charges are $0 and server cost is unknown. Peak sampled process-tree RSS is 76,337,152 bytes; no capacity stops. Configured concurrency is 1.

This establishes returned source results, not quality verification. Detailed report and raw API payload inspection remain pending: counts, time-window coverage/caps, IDs, text, dates, links and media preservation must be compared with raw API responses and the verified public-page batch. The 596 ms summary versus public-page 3,627 ms is descriptive only: transport, concurrency, connection setup and collection times differ, so no general speed winner is declared. Next: download both matched-window reports and captured blobs for comparison. Do not transfer the private credential or session files.


### Telethon matched-post inspection - 2026-09-23

Downloaded API run `pilot-telethon-20260923T101559Z` and public-page run `pilot-telegram-fallback-20260923T093257Z` inspected locally. [Exact per-repetition checkpoints](telegram-pilot/telethon-comparison.json).

- Four API captures contain 20 posts each: 40 distinct posts across two channels, repeated twice. All captured payload hashes match. All raw API IDs, text and publication instants are preserved in benchmark output. No posts fall outside configured windows, and no API result is capped.
- Each API result contains exactly the same post IDs as the corresponding public-page result. Text matches after whitespace normalization and dates match as instants. Ordering differs because API history is newest-first; matching was by ID, not row position. This selected-window agreement is not a full-history recall guarantee.
- **Confirmed benchmark normalization gap:** the generic Telethon conversion omits the normalized `links` field. All 20 official-channel posts (IDs 441-460, in both repetitions) have URL entities in raw API data and links in the public-page output. Link information remains in raw API payloads; this is not evidence that Telegram failed to provide it.
- **Media normalization gap:** API media is retained verbatim as a raw object (or null), rather than the common list of typed media references. The official channel has 13 video documents, three photos and four webpage previews per repetition. Video metadata is present, not lost. Public-page CDN links and API file references are different representations; media download/expiry was not tested and should not be compared as identical URLs.
- Normalized API author is null while the public-page output uses the channel title. Channel identity is present in acquisition metadata, but its mapping into the shared result needs an explicit policy. This is not a missing journalist byline.

Formal labels remain SOURCE_UNVERIFIED. The benchmark conversion in `bench/processing.py` needs explicit Telethon link/media handling before declaring a complete normalized-output comparison. No code changes made during this inspection; next work is to implement that conversion and replay these saved API responses, preserving the baseline. Production Telethon ingestion has not been implemented by this benchmark test.


### Photo/video comparison: public-page scraper vs Telethon

| Question | Public-page scraper | Telethon API |
|---|---|---|
| Media found in the official-channel sample | Three photos and 13 videos per repetition | The same three photos and 13 videos per repetition; API also provides four webpage previews |
| Current benchmark output | Typed media references with direct CDN URLs, after the parser fixes | Raw Telegram media objects retained; shared-format conversion still needed |
| Ease of use today | Easier for downstream code expecting photo/video URLs | Requires API media handling and normalization |
| Media download quality and reliability | Not tested | Not tested |

For this sample, neither method missed the three photos or 13 videos after the public-page fixes. These are repeated observations of the same media, not additional unique media on each repetition. The public-page output is more immediately usable in its current form; that is an implementation-readiness advantage, not proof of superior media quality. Telethon supplied the media information, and the remaining conversion gap belongs to our benchmark code. Direct CDN URLs may expire, while Telegram media objects require appropriate API retrieval; neither retrieval path or its longevity has been validated. No winner is established for download success, resolution, playback or long-term reliability.


### Telethon normalization fixes and local replay - 2026-09-23

Implemented in the benchmark's `bench/processing.py`, not in production ingestion:

- Extract explicit HTTP(S) link entities, including hidden text links and Telegram links. MessageEntityUrl offsets are interpreted as UTF-16 code units so emoji before a URL do not shift extraction. Plain-text HTTP(S) URLs are also retained and deduplicated.
- Normalize photo/document objects into a list of typed references (`photo`, `video`, `animation`, `audio`, `voice`, or `document`) with a string `telegram_id` and `requires_api_download: true`. No CDN URL or Bot API file ID is invented. Unknown media stays visible as unresolved.
- Keep webpage previews separate in `link_previews` rather than counting them as attached photos/videos. Preserve original API media in `raw_media`; empty media becomes an empty normalized list.
- Channel-title/author mapping is unchanged: API author can remain null. Downloading API media, playback quality, reference expiry and production Telethon ingestion remain untested/unimplemented here.

[Replay helper](../../evaluation/acquisition-benchmark/scripts/replay_telethon_pilot.py) reads hash-checked saved API responses and compares the reprocessed result with the previously verified public-page outputs, matched by channel/repetition/post ID. Checks cover post IDs/counts, raw and public text, dates, post URLs, link sets, photo/video type counts, raw-media preservation, API media IDs and preview URLs. Media bytes are not downloaded or compared. Baseline API reports are preserved.

**Local replay: four comparisons, zero failed comparisons** across 80 repeated observations / 40 distinct posts. All 20 official-channel posts now preserve their message links. Each official-channel repetition retains three photo references, 13 video references and four separate webpage previews. [Replay evidence](telegram-pilot/telethon-after-fixes.json).

Validation: **219 offline Python tests passed in 24.25 seconds**, including nine new Telethon tests covering entity offsets/hidden links, supported media types, previews, unknown-media preservation and integration. Changed-file whitespace and patch reverse-apply checks passed.

[Telethon-only transfer patch](telethon-normalization-fixes.patch) contains the conversion changes, regression tests and replay helper; it excludes earlier RSS and connection fallback changes. **VPS application/replay pending.** The public scraper still returns CDN URLs, while Telethon now returns typed API references; this removes the normalization gap for the tested fields but does not establish a media-download winner. Formal source scoring labels remain unchanged.


### VPS confirmation - Telethon normalization replay - 2026-09-23

User terminal output confirms **219 tests passed in 21.46 seconds**, followed by **4 comparisons, 0 failed comparisons** from `replay_telethon_pilot.py`. Saved VPS evidence: `data/live/reports/pilot-telethon-20260923T101559Z/after-fixes-20260923T104450Z.json`. The VPS replay file has not been downloaded locally; confirmation is based on the supplied terminal output.

The selected public-channel comparison now has matching IDs, text, dates, links and media types after fixes, with validation on the VPS as well as locally. This replay used saved responses, not new Telegram requests. It does not change original SOURCE_UNVERIFIED labels, validate media download quality, prove long-term reliability or deploy production Telethon ingestion. Earlier raw failures and baseline conversion gaps remain preserved. Next source candidate: Zyte website acquisition against the existing website sample, pending account/credential setup and an explicit spending cap; no paid request has been made.


### Zyte HTTP pilot summary - 2026-09-23

Run `pilot-zyte-001`: five articles, two repetitions, ten complete jobs. [Terminal evidence](ZYTE_PILOT_2026-09-23.txt). Existing references were picked up by the run; detailed reference identity and score checks await report.json inspection.

| Extractor | PASS | PARTIAL | FAIL | p95 combined ms |
|---|---:|---:|---:|---:|
| Trafilatura | 4 | 4 | 2 | 2700 |
| Readability | 2 | 6 | 2 | 5369 |

Counts include repetitions; twenty extractor outcomes are not twenty distinct articles. Both evidence gates remain INSUFFICIENT_EVIDENCE. A complete job does not by itself mean successful acquisition or valid content. The exact failed articles and reasons are not visible in this summary; do not attribute FAIL to Zyte blocking or extraction without inspecting detailed steps and captured bodies.

The report shows $1.00 in unreconciled reservations and $0.00 reconciled actual charges. **Neither is evidence of the actual bill:** $1 is the reserved benchmark budget, and $0 means actual charges have not yet been recorded. Zyte dashboard usage must be checked and reconciled separately. Trial credit availability remains unconfirmed; screenshot established PAYG account with a $100 spending allowance. Server cost is unknown. No capacity stops; peak sampled process-tree RSS 430,309,376 bytes.

Next: download report.json and blobs, identify exact failed checkpoints, compare with direct HTTP using matching references and account for possible page changes, and inspect provider usage for actual cost. No additional paid requests needed for this review.


### Zyte detailed comparison - 2026-09-23

Downloaded report and saved artifacts inspected; all inspected evidence hashes match. [Exact checkpoints](zyte-pilot/checkpoints.json) records every extraction score, forbidden marker found, missing anchor, direct-output equality, and provider failure per repetition.

| Publisher | Zyte + Trafilatura | Zyte + Readability | Comparison with direct HTTP |
|---|---|---|---|
| CNN | PASS | PASS | Extracted bodies identical to direct HTTP. |
| Al Jazeera | PARTIAL | PARTIAL | Same failure category: suggested-story/list markers remain. Readability also retains advertising text and its body differs between captures. |
| Euronews | PASS | PARTIAL | Bodies identical to direct HTTP. Readability misses the introductory anchor and retains byline/publication labels. |
| The Guardian | FAIL before extraction | FAIL before extraction | Direct HTTP fetched it (both extractors PARTIAL for missing introduction); Zyte refused the domain in both repetitions. |
| NASA | PARTIAL | PARTIAL | Bodies identical to direct HTTP; download/resource text and image labels/captions remain. |

All labels repeat across the two repetitions. Eight of ten Zyte acquisition jobs captured target HTTP 200. Both Guardian attempts instead received **HTTP 451 from the Zyte API**, with type `/download/domain-forbidden`, title `Domain Forbidden`, blockedDomain `theguardian.com`, and detail `Extraction for the domain theguardian.com is forbidden.` This is a provider-side refusal, not a Trafilatura/Readability failure and not evidence that Guardian itself returned 451. Do not retry unchanged requests or interpret the four FAIL extractor rows as four separate acquisition failures.

Of 16 extracted bodies from the eight successful Zyte captures, 14 are byte-for-byte identical to the corresponding direct HTTP body. The two differing bodies are Al Jazeera Readability results. This pilot shows no extraction-quality improvement from Zyte on the tested sample and a coverage loss on Guardian. It does not establish that Zyte is universally worse; collection dates, conditions and difficult-site coverage differ.

Exact failing content checkpoints: Al Jazeera retains suggested-story markers and `list of` in both extractors, plus advertising marker in Readability. Euronews Readability retains `Jean-Philippe Liabot` and `Publie le` (accented in the actual JSON), and misses the first reference anchor. NASA both retain `The following sections contain links to download`; Trafilatura also retains `Image: Planetary Engulfment Illustration`, Readability `Illustration: NASA, ESA, CSA`. The machine-readable checkpoint file preserves exact Unicode strings. Final publication dates pass for all captured articles; native Trafilatura dates for CNN/Euronews need shared metadata correction, as in direct HTTP.

Cost remains unreconciled: the $1 reservation is not the actual Zyte bill. Await dashboard usage evidence before recording actual charges. No code was changed and no new paid requests were made during this review.


### Why Zyte refused The Guardian

Zyte's [official error documentation](https://docs.zyte.com/zyte-api/usage/errors.html) defines HTTP 451 with type `/download/domain-forbidden` as a request for a domain that Zyte API does not allow. Both Guardian attempts in `pilot-zyte-001` returned this provider error, with `blockedDomain: theguardian.com` and the message: "Extraction for the domain theguardian.com is forbidden."

The response and documentation do not explain the underlying reason for this particular domain restriction. A publisher request, agreement or legal restriction has not been established; clarification would require Zyte support. No support request has been sent.

Record this as a **Zyte coverage limitation observed in this pilot**, not an extractor bug or proof that The Guardian itself rejected the request. Direct HTTP fetched the article in the earlier baseline. Repeating the same Zyte request is not expected to address an explicit domain restriction.


### Bright Data onboarding access issue - 2026-09-23

User screenshot of `https://brightdata.com/products/web-unlocker` shows "Sorry, you have been blocked" and "You are unable to access brightdata.com" in the local browser. No cause is shown; geographic restrictions, account eligibility and IP reputation have not been established. No Bright Data account/zone setup or API pilot is confirmed. Record as an onboarding access blocker, not a Web Unlocker acquisition/quality failure. Next: retry the official page in a normal browser window with JavaScript/cookies enabled; if the block persists, use the page's support instructions or defer this candidate while continuing other tests.


### Scope update - Bright Data skipped

User explicitly requested skipping Bright Data after the onboarding website block. Mark Web Unlocker and Bright Data social alternatives as skipped, not failed or completed. No Bright Data API pilot ran. Next active candidate: Playwright isolated browser acquisition using the website sample. Its namespace and browser launch prerequisites still need verification on the VPS; ordinary Chromium startup alone does not verify the isolated variant. No changes to VPS security settings have been requested or applied.


### Playwright standard route preparation - external setup handoff

User reports Copilot diagnosed AppArmor blocking unprivileged namespace setup and left AppArmor enabled. The directly pasted isolated-mode check failed writing `/proc/self/uid_map` with Operation not permitted; no isolated live pilot ran. User reports a benchmark-user nftables firewall was configured and initial blocked-destination/public-HTTPS/DNS/counter checks passed.

Pasted `id` output confirms distilled-bench UID/GID 1000. Active `inet distilled_bench_egress` output chain exempts other socket UIDs, permits TCP/UDP DNS to 127.0.0.53, and rejects the IPv4/IPv6 destination sets listed in the repository guide. IPv4 rejection counter was 2 packets / 120 bytes; IPv6 counter zero. This confirms active rule presence, not reboot persistence or exhaustive address coverage. Dedicated systemd persistence and post-reboot verification remain pending. Continue with browser_standard after readiness checks, preserving AppArmor and other firewall tables.


### Firewall persistence service installed - VPS confirmation

User output confirms `distilled-bench-egress.service` is **enabled** and **active**. SHA256 of `/etc/distilled-bench-egress.nft`: `0c03074ca170d56733ec6aa44ca1c8ae699ea57fd69335bb2b45cb51b840987a`. This verifies current service status and the saved rules fingerprint; reboot persistence and post-reboot connectivity checks remain pending. No live Playwright run has started.


### Post-reboot firewall verification - VPS confirmation

Following the reboot/reconnect instructions, user reports service active, documentation-address request rejected immediately (curl exit 7), public example.com HTTPS HTTP 200, and successful DNS resolution. Active table targets UID 1000 and preserves the local DNS exception. IPv4 reject counter is now 3 packets / 180 bytes; IPv6 13 packets / 936 bytes. The source of the IPv6 counter increments was not separately tested or identified. These checks support reboot persistence and the tested egress behavior, not exhaustive IPv6/address coverage.

Next: create a browser_standard-only configuration for the same five website articles, retaining references and two repetitions, zero provider budget, concurrency 1, and the confirmed host-firewall setting. Run server-check to validate Chromium startup before live acquisition. Isolated mode remains unavailable; AppArmor is unchanged. No live Playwright results yet.


### Playwright server readiness - VPS confirmation

User supplied server-check output for `configs/pilot-playwright.local.json`: ready=true, acquisition_requests=0. Chromium standard launch succeeded, version 145.0.7632.6. Python 3.14.4, Node v24.21.0, Readability, disk/memory checks and synchronized clock are READY. Post-reboot kernel is Linux 7.0.0-31-generic. Server-cost check remains WARNING. Firewall configuration flag is READY, supported by the separately recorded manual checks; server-check itself does not probe private addresses.

The preceding configuration creation raised FileExistsError and preserved the existing file. Live-run instructions include a scope check for five articles, two repetitions, standard browser only and zero provider budget before dispatch. No live Playwright acquisition is confirmed yet.


### Playwright standard live pilot summary - 2026-09-23

Run `pilot-playwright-001`: ten complete jobs, five article inputs with two repetitions. [Terminal evidence](PLAYWRIGHT_PILOT_2026-09-23.txt).

| Extractor | PASS | PARTIAL | FAIL | p95 combined ms |
|---|---:|---:|---:|---:|
| Trafilatura | 4 | 4 | 2 | 4938 |
| Readability | 0 | 8 | 2 | 5346 |

These are extractor outcomes including repetitions, not counts of distinct articles. Complete jobs alone do not establish successful acquisition; exact failed targets/reasons and partial checkpoints await report.json and captured artifact inspection. Both evidence gates remain INSUFFICIENT_EVIDENCE.

Peak sampled process-tree RSS: 704,917,504 bytes (about 672 MiB), including peak Chromium RSS 491,098,112 bytes. No capacity stops were recorded. Provider charges/reservations are zero; server cost remains unknown. Standard browser mode is distinct from the untested isolated variant and is supported by the recorded benchmark-user firewall checks. Browser route resource blocking and load policy affect these results; this is not a test of arbitrary interactive browsing.

Next: download report and blobs, identify exact failing checkpoints and compare with direct HTTP/Zyte. Do not assume the failed website is Guardian based on the previous Zyte result. No fixes or new requests initiated from this summary.


### Playwright detailed comparison - 2026-09-23

Downloaded `pilot-playwright-001/report.json` and saved artifacts inspected, with evidence hashes verified. [Exact checkpoints](playwright-pilot/checkpoints.json); [CNN captured error page](playwright-pilot/cnn-error.html).

| Publisher | Playwright + Trafilatura | Playwright + Readability | Difference from earlier routes |
|---|---|---|---|
| CNN | FAIL in summary; individual score absent | FAIL in summary; individual score absent | Both browser captures contain only Unknown Error despite target HTTP 200. Direct HTTP and Zyte previously yielded PASS. |
| Al Jazeera | PASS, text F1 1.0 | PARTIAL, F1 about 0.965 | Trafilatura improves from PARTIAL in direct/Zyte. Readability retains the advertising marker but has less clutter. |
| Euronews | PASS | PARTIAL | Bodies identical to direct HTTP. Readability misses introduction and retains byline/date labels. |
| The Guardian | PARTIAL | PARTIAL | Browser fetch succeeds, unlike Zyte's domain refusal. Bodies identical to direct HTTP; both omit introductory anchor. |
| NASA | PARTIAL | PARTIAL | Bodies identical to direct HTTP; download/image-related clutter persists. |

Results repeat across both repetitions. Twelve of twenty extractor bodies are identical to direct HTTP: both extractors for Euronews, Guardian and NASA. Browser fetching captured HTTP 200 for all ten jobs, but the two CNN captures are 164-byte rendered documents whose only body text is `Unknown Error` (13 characters), not articles. The cause of that returned error page is not established: no specific anti-bot or network cause should be inferred from the generic text.

A separate benchmark processing problem is visible on CNN: `processing_error: TypeError`, with missing per-extractor scores. Trafilatura returned a null title, Readability an empty title, and both returned the error text. Null-title handling is a possible investigation lead, not yet a verified stack-trace diagnosis. The aggregate FAIL labels therefore must not be represented as fully completed quality-scoring results. Fixing the scorer would improve reporting, not recover the absent CNN article. No code was modified in this review.

This pilot supports selective browser fallback, not browser use for every site: it improved Al Jazeera/Trafilatura but failed to obtain CNN and used more sampled memory (about 672 MiB peak process tree). Collection conditions/times differ, so no universal performance ranking is established. Fonts, images and media requests were blocked by the configured browser route; media loading/playback and arbitrary interactive workflows were not tested. Costs exclude unknown VPS allocation. Next: diagnose and fix the error-page scoring crash using the saved CNN HTML, preserving original evidence.


### CNN scoring crash fixed locally; browser retry pending

Reproduced the actual saved Trafilatura result: `article_validation` attempted `title + " "` with title=None and raised `TypeError: unsupported operand type(s) for +: NoneType and str`. Validator now treats null title/body as empty text. Score normalization also treats None as empty rather than the literal word "None". No error-page content or reference was changed, and browser acquisition behavior remains unchanged.

Re-extracted both saved CNN HTML captures through both parsers: **four scored results, all FAIL**, each with `insufficient_body` and `missing_title`, without a scoring exception. [Replay evidence](playwright-pilot/cnn-after-scoring-fix.json). All 16 previously present non-CNN scores are unchanged under the corrected scorer. Original report is preserved. No new website requests were made locally.

Validation: **223 offline Python tests passed in 42.03 seconds**, including four new null-field regression cases. [VPS patch](cnn-scoring-fix.patch) contains only validator/text-normalization changes, regression tests and [offline replay helper](../../evaluation/acquisition-benchmark/scripts/replay_cnn_error.py); reverse-apply check passed. VPS application and replay remain pending.

User authorized a CNN-only live retry after repairing scoring. Planned scope: article-001 only, standard Playwright route, two repetitions, new run ID `pilot-playwright-cnn-retry-001`, existing firewall requirements, zero provider budget. Other four publishers will not be refetched in this retry. A repeat failure would confirm recurrence, not identify the cause of CNN's generic error page. No retry result yet.


### CNN scoring fix and live retry - verified 2026-09-24

SSH key access was established and the authorized scoring patch applied on the VPS. Full offline suite passed **223 tests in 21.03 seconds**. Re-extracting the original saved CNN captures produced four explicit FAIL scores with `insufficient_body` and `missing_title`, without crashing. The original report was preserved.

New run: `pilot-playwright-cnn-retry-001`, article-001 only, two repetitions, standard browser, zero provider charges. [Downloaded detailed report](playwright-pilot/pilot-playwright-cnn-retry-001/report.json). Both attempts captured HTTP 200 but returned the same 164-byte rendered error page containing only `Unknown Error`. Its verified SHA256, `1bd54414a9d72f3aa0b04aa53a6eadba416a8121a9a58a41ebeaf81bc8ba3102`, also matches the original browser run's error page.

Both extractors on both repetitions now have complete FAIL scores: missing title, insufficient body, text/title F1 0, missing reference anchors and incorrect/missing expected date. No processing_error remains. The scoring bug is resolved; CNN acquisition failure recurred. No specific reason for the generic returned error content has been established. There have now been four CNN browser acquisition attempts across the original and retry runs, not eight (each capture was processed by two extractors).

Direct HTTP and Zyte previously fetched the CNN article successfully; that remains historical evidence, not a simultaneous control for this retry. Do not keep rerunning the unchanged browser configuration. Preserve this as a route-specific observed failure and use the previously successful routes as the pilot baseline. Provider cost is zero for this browser retry; server allocation remains unknown. No production deployment is implied.


### Apify Google News console pilot - 2026-09-24

Actor: `groupoject/google-news-scraper`. This is a manual console run, not a VPS benchmark report. Initial run screenshot showed 150 results, 7 seconds and $0.150 usage. Its input incorrectly split `Lebanon electricity` into two queries (`Lebanon`, `electricity`), plus `James Webb telescope`, with maxItemsPerQuery=50 and Apify proxy enabled. Preserve this as setup evidence, not the matched comparison.

User then supplied output after instructions to use the two intended queries and 20 records each. [Original paste](google-pilot/apify-console-20260924/pasted-output.txt), [inspection copy](google-pilot/apify-console-20260924/output-repaired.json), [checks](google-pilot/apify-console-20260924/checks.json). The paste lacks the final array closing bracket; the inspection copy adds only that bracket. This is a paste-format issue, not evidence of malformed API output. Corrected run ID, actual input, duration and cost have not been provided; do not assign the initial run's $0.150/7 seconds to this output. A $0.10 run cap was instructed but not independently confirmed.

| Checkpoint | Observed result | Interpretation |
|---|---|---|
| Query grouping / count | 20 Lebanon electricity; 20 James Webb telescope | Matches intended output scope |
| Core fields present | 40/40 title, source, sourceDomain, publishedAt, googleNewsUrl and snippet | Field-presence check passes; content accuracy is not independently verified |
| Exact duplicate URLs / titles | 0 / 0 | Does not test semantic story duplication |
| Timestamp syntax / order | All parse; newest-first globally | Timestamp accuracy against original publications remains unverified |
| Clean title | 40/40 retain trailing ` - publisher` | Cleanup difference: our earlier RSS output stripped publisher suffixes; raw actor output retains them |
| Informative summary | 40/40 snippets repeat headline plus publisher after whitespace normalization | These are not independent article summaries or full bodies |
| Publisher article URLs | Only Google News RSS article links returned | Direct publisher URL resolution not demonstrated; sourceDomain alone is not an article URL |
| Images / body | No image or body fields | Absent in supplied output, not evidence of lost images in a captured source |
| Source fidelity | No same-run XML or publisher reference supplied | Not a verified PASS and not proof this actor outperforms RSS |

Date ranges: Lebanon electricity 2026-05-18 through 2026-09-24; James Webb telescope 2026-08-02 through 2026-09-24. No date filter was requested, so older results alone are not parsing failures. Prior RSS and current Apify collection times differ; item-set differences cannot by themselves establish omissions. No platform code changed, production deployment or additional paid requests occurred during this review. Next: capture corrected-run metadata and inspect normalization through the benchmark before judging integration quality.


### Apify corrected-run metadata - screenshot confirmation

User supplied the corrected console run header: **Succeeded, 40 results, $0.040 usage, 3 seconds displayed duration**, timestamp displayed as `2026-09-24 16:19` (UI timezone not established). These measurements belong to the corrected 40-result run, separate from the initial 150-result run ($0.150, 7 seconds). Combined displayed usage across these two runs is $0.190; this does not establish cash charged after free credits. Actor runtime is not directly comparable to the benchmark's end-to-end acquisition and processing timing. Run URL/ID and platform-normalizer replay remain pending. No additional run is needed to inspect the saved output.


### Apify platform normalizer replay - 2026-09-24

User identified corrected run [pxC2ZmG0qbrdjYevE](https://console.apify.com/actors/rnmRHj9TGlD8apCD6/runs/pxC2ZmG0qbrdjYevE). Replayed the supplied 40-record dataset locally through the actual `normalizeApifyDatasetItems` implementation in `packages/connectors/src/apify.ts`, kind=google_news. No network requests or new charges. [Normalized output](google-pilot/apify-console-20260924/normalized.json); [checkpoint results](google-pilot/apify-console-20260924/normalizer-checks.json).

All 40 records retained; zero URL, publisher or timestamp mismatches against supplied actor rows. Confirmed text-quality issue: all 40 normalized messages concatenate the headline with a snippet that repeats the same headline and publisher, and retain the title's publisher suffix. Thus fields are preserved, but redundant text is not cleaned. No media were supplied and none are invented. Google links remain Google links. This is normalization preservation evidence, not independent verification of source facts or full ingestion success. Replay receivedAt is a fixed synthetic fixture (2026-09-24T00:00:00Z), not acquisition evidence; retention/queue behavior was not exercised. No implementation changes made in this check.


### Apify Google News repeated-text fix - local verification

Updated `packages/connectors/src/apify.ts`: remove an exact trailing publisher suffix from the headline, then omit a snippet only if it equals the headline/raw title or headline plus publisher after whitespace normalization. Genuine summaries, including ones starting with the headline, are retained. Only the Google News normalization path changes.

Six regression cases cover repeated snippets, non-breaking spaces, useful summaries, different publisher suffixes and absent publisher metadata. Full connector suite: **77 tests passed**; TypeScript typecheck passed. Saved pilot replay: **40/40 clean headlines, zero dropped records, and every non-text field unchanged**. [After-fix output](google-pilot/apify-console-20260924/normalized-after-fix.json); [checks](google-pilot/apify-console-20260924/after-fix-checks.json). No network requests or additional Apify charges. Original raw and normalized evidence preserved.

Fix is local; VPS application and production deployment are not confirmed. [Focused patch](google-news-text-fix.patch) is available for VPS transfer. Full source-fidelity validation, repeated matched acquisitions and publisher URL resolution remain pending.


### Google News text fix applied and verified on VPS - 2026-09-24

Applied `google-news-text-fix.patch` through the authorized SSH key. VPS replay of the same saved 40 actor rows through the actual patched TypeScript normalizer: **40/40 clean headlines; all serialized non-text fields unchanged**. Existing offline benchmark suite: **223 passed in 24.34 seconds**. [VPS replay and test evidence](google-pilot/apify-console-20260924/vps-replay-validation.txt).

The attempted connector Vitest command on VPS could not start because its test-runner module is not installed there; do not count it as a VPS connector-suite pass. The full 77-test connector suite and TypeScript check passed locally. No new dependencies were installed and no paid acquisition requests were made. Saved replay input files were copied to the benchmark directory as `output-repaired.json` and `normalized.json`. Production deployment remains unconfirmed. This completes the observed duplicate-text correction and VPS replay, not the full controlled RSS-versus-Apify comparison.


### Matched Google News pilot preparation - 2026-09-24

Added `maxTotalChargeUsd` to Apify run submissions, using the route's configured cost ceiling alongside maxItems and timeout. Mock submission test checks cap and item parameters, including no duplicate submission on resume. VPS offline suite: 223 passed in 21.93 seconds. Local Python suite could not start because the local pytest installation lacked its runnable module; VPS tests provide validation. [API cap documentation](https://docs.apify.com/api/v2/actors-runs-post); [patch](apify-cost-cap.patch).

Scope: two queries (Lebanon electricity; James Webb telescope), en/US, two repetitions, max 20 per query, concurrency one. Four RSS jobs plus four Apify jobs; $0.10 provider cap per Apify job and $0.40 total. No proxy, monitoring, analysis or date filter. Actor-level ordering and deduplication may differ from RSS order, so equal settings do not imply identical returned sets.

First run `pilot-google-matched-20260924-001` in shared data/live acquired four RSS jobs, but all four Apify jobs were skipped_budget before submission. The ledger totals prior reservations across runs; the shared ledger exhausted this smaller configured allowance. Preserve this as a setup outcome, not Apify failure. Second run uses a dedicated `data/google-matched-20260924` ledger with the same $0.40 bound and new run ID; earlier reservations remain unchanged. Combined campaign cost must include both ledgers and the two manual console runs.


### Matched RSS versus Apify pilot results - 2026-09-24

Run `pilot-google-matched-20260924-002` in the dedicated ledger completed eight captures: four RSS and four Apify, all with 20 normalized items. [Detailed report](google-pilot/pilot-google-matched-20260924-002/report.json); [saved-payload checkpoint checks](google-pilot/pilot-google-matched-20260924-002/checkpoints.json). Payload SHA256 hashes verified locally. All eight jobs have zero title, publisher, timestamp or URL field errors against their own saved XML/JSON. RSS captures contain 100 raw entries each and retain 20; Apify datasets contain 20 and retain all 20. Corrected headline normalization works in live benchmark processing.

| Comparison | Lebanon electricity | James Webb telescope |
|---|---:|---:|
| Shared URLs among each route's 20 | 17/20, both repetitions | 20/20, both repetitions |
| Apify URLs found in full 100-entry RSS capture | 19/20, both repetitions | 20/20, both repetitions |
| Shared-item title/date mismatches | 0 | 0 |
| Shared-item publisher display-name differences | 2 | 5 |

Publisher differences include domain labels versus display names (e.g. ky3.com versus KY3 and wired.com versus WIRED); each normalizer preserves its own input. They are not evidence of parser corruption. The unmatched Lebanon link does not prove an omission: acquisition location, time, actor selection and ordering differ. Neither route supplied full article bodies, media or resolved publisher article links. RSS preserves source ordering; the actor advertises newest-first ordering. This small sample does not establish broader recall or reliability.

Reported p95 acquisition-plus-processing: RSS 7338 ms; Apify 7105 ms, four jobs per route. This is too little evidence to claim a speed winner and is distinct from Apify console container runtime. All formal labels remain SOURCE_UNVERIFIED and evidence gates INSUFFICIENT_EVIDENCE; manual payload checks do not replace independent completeness references.

Billing remains unreconciled: four Apify jobs each reported usageTotalUsd=$0.00005 in their captured SUCCEEDED metadata. The captured pay-per-event breakdown has one actor-start event and zero article events despite 20 returned items. Therefore do not report these snapshots as the final article bill, or the $0.40 reserved ceiling as money spent. Follow up with finalized provider usage. Original console runs separately showed $0.150 and $0.040. Unknown server cost still prevents complete cost-per-usable-result calculations. No new paid runs are needed to reconcile existing run IDs, which are saved in checkpoints.json.

Practical pilot finding: Apify did not demonstrate richer content than RSS for these two queries. Both preserve headline/date/link metadata; the paid actor returned nearly the same article set. Keep broader source-quality and billing conclusions pending the checks above.


### Matched pilot billing reconciled - 2026-09-24

Read-only follow-up of all four existing actor runs now reports 20 billed article events ($0.02000) plus one actor-start event ($0.00005) each: **$0.02005/run, $0.0802 total provider usage**. [Updated provider metadata](google-pilot/pilot-google-matched-20260924-002/billing-followup.json). This confirms the initial terminal snapshots were not yet fully accounted, not that the actor returned uncharged articles. Provider metadata also confirms maxTotalChargeUsd=0.10 for every job and a common actual build ID `uf9vk53EqC5gLQe3d` (requested tag latest).

Reconciled the four ledger reservations using those provider records and regenerated the report: actual provider usage $0.0802; unreconciled reservations $0. The initial report is preserved as [report-before-reconciliation.json](google-pilot/pilot-google-matched-20260924-002/report-before-reconciliation.json). No new actor runs. This is provider usage, not necessarily out-of-pocket payment after free credits; unknown VPS cost remains excluded. Formal labels and evidence gates remain unchanged.


### X profile Apify pilot - 2026-09-24

Run `pilot-x-profile-20260924-001`, dedicated ledger `data/x-profile-20260924`: planned actor `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`, input from=NASA or BBCWorld, maxItems=20, queryType=Latest, two repetitions per account, concurrency one, 120-second runtime bound. Provider caps $0.10/job and $0.40 total. Four SUCCEEDED captures, 20 records each, 80 records including repeats; p95 combined 17485 ms. All authors matched requested handles. Payload hashes checked. [Original report](x-profile-pilot/pilot-x-profile-20260924-001/report.json), [exact checkpoints](x-profile-pilot/checkpoints-before-fix.json).

| Checkpoint | BBCWorld, each repetition | NASA, each repetition |
|---|---|---|
| Rows kept | 20/20 | 20/20 |
| Text, ID lookup, post URL, author and date preserved against actor payload | No errors | No errors |
| Native media in extendedEntities.media | None supplied | 10 photos, 1 video |
| Media retained by platform | 0 | 0: all 11 references omitted |
| Expanded URLs in entities.urls missing from platform links | 20 across 20 posts | 12 across 12 posts |

Confirmed platform issues: extractXMedia accepts arrays but this actor supplies an object containing a media array; it therefore drops supplied native photo/video references. The helper also labels all accepted entries as photos, a code-path risk for other shapes, not a demonstrated video mislabel in this run because no media survived. X normalization extracts URLs from text but ignores expanded_url entries; t.co links and post links remain, but supplied expanded destinations are omitted. BBC native-media absence does not establish whether card previews are available; card/quoted/reposted content needs separate review. No photo/video download or playback was tested. Independent comparison to the X website/API has not occurred, so formal SOURCE_UNVERIFIED labels remain appropriate.

Follow-up billing confirms $0.005/run, **$0.02 total provider usage**, 20 billed events/run at $0.00025 each, with common build ID F4pzKtwGyAICrJMvo (actor default tag latest0225). [Billing evidence](x-profile-pilot/billing-followup.json). VPS ledger reconciled, no outstanding reservation. Original downloaded report predates reconciliation; [reconciliation log](x-profile-pilot/reconciliation.txt) supersedes its $0.40 reservation. Provider usage may be covered by credit and excludes VPS cost. No claims of complete timeline recall or successful official X API comparison. Next: fix media and expanded-link normalization and replay these saved captures without another paid acquisition.


### X media and expanded-link fixes - local replay verified

Updated the Google/X shared connector file's X-specific paths: expanded_url entries from post entities are retained alongside existing short/post links; nested extendedEntities.media objects and existing array shapes are supported; native photo URLs take priority over t.co links; videos/animations choose the highest-bitrate supplied MP4 (or another supplied stream if no MP4). A thumbnail alone is never labeled as a playable video. An unresolved video with a supplied media ID retains that ID without inventing a download URL. Duplicate references and unsafe added URL schemes are filtered. Quoted/reposted media and card previews are outside this fix.

Full connector suite: **80 passed**, including three regression cases covering nested photo/video variants, expanded link preservation, unsafe schemes, array compatibility, deduplication, animations and unresolved video IDs. TypeScript check passed.

Replayed all four saved captures through the changed platform normalizer: **80/80 records retained; zero failed checks**. Each NASA repetition now retains 10 photo references, one MP4 video reference and all 12 supplied expanded links. Each BBCWorld repetition retains all 20 supplied expanded links; no native media were supplied. Post text, date, URL and author are unchanged against actor data. [After-fix checkpoints](x-profile-pilot/after-fix-checks.json). Before-fix report/captures are preserved. This verifies reference preservation, not media downloading/playback or independent X-source accuracy. No paid calls, production deployment or VPS application occurred in this local fix step.


### X normalization fix applied on VPS - 2026-09-24

User authorized transfer/application. Read the two current VPS files first, generated a focused [X-only patch](x-normalization-fix.patch) preserving the preceding Google News fix, checked it with git apply --check and applied successfully. Saved payload hashes verified before replay. All four captures passed: 80 records retained, 20 photo references and two video references across repeated NASA captures, and 64 expanded links across all captures; zero failed field checks. These counts include repetitions, not distinct media/posts. Text, authors, post URLs and publication times still match the supplied raw actor data.

VPS offline benchmark suite: **223 passed in 24.32 seconds**. Full connector suite and TypeScript validation had already passed locally (80 tests); the connector test runner remains absent on VPS. [VPS verification transcript](x-profile-pilot/vps-fix-verification.txt). Separate replay checks were saved on VPS at data/x-profile-20260924/reports/pilot-x-profile-20260924-001/x-fix-replay-checks.json; the original report and captures remain intact. No paid requests or production deployment. This is reference preservation, not confirmation that the image/video URLs remain downloadable or that their contents are understood.


### Proposed next pilot: X search (not dispatched)

Prepared [reviewable VPS configuration](x-search-pilot/pilot-x-search.proposed.json) for the planned Kaito actor, searchTerms mode, Latest ordering. Two queries: Lebanon electricity and James Webb telescope; two repetitions; actor request and download limit 20 items/job; four jobs total. Provider cap $0.10/run, budget $0.40 total in a dedicated ledger; no new account required. Actor pagination may exceed requested output counts, so 80 retained records is an upper bound for this benchmark, not a promise of 80 unique posts or exhaustive search. No date/language filter and no official-X API comparison yet. User's explicit approval is required before starting this paid pilot, following their preference established after the X-profile run. No live requests made in preparation.


### Approved X search pilot completed

User explicitly approved the prepared paid pilot. VPS run `pilot-x-search-001`, dedicated ledger `data/x-search-pilot-001`, planned Kaito actor, two queries (Lebanon electricity; James Webb telescope), Latest mode, 20 retained items/job and two repetitions; concurrency one, 120-second runtime, $0.10/job provider cap and $0.40 total budget. No date/language filter. All four remote runs succeeded and each returned 20 records. [Original report](x-search-pilot/pilot-x-search-001/report.json); [field checkpoints](x-search-pilot/checkpoints.json).

All 80 records retained, with no within-job duplicate IDs. Hash-verified saved actor payloads match normalized text, post URL, author and timestamps; all supplied expanded URLs are retained. Native media references also match: Webb has 13 photos in each repetition; Lebanon has 5 photos/1 video in the first and 4 photos/1 video in the second. Total across repetitions: 35 photos and two videos, not necessarily unique media. The previously fixed X normalizer passed these live-output checks without further edits. This does not verify media downloading/playback, quoted/reposted/card content, search relevance or exhaustive recall. Formal labels remain SOURCE_UNVERIFIED; evidence gate INSUFFICIENT_EVIDENCE.

p95 acquisition-plus-normalization: 25681 ms across four jobs. Read-only billing follow-up confirmed 20 charged events and $0.005 usage per run; **$0.02 total**. Provider confirms $0.10 cap on each job, common build ID F4pzKtwGyAICrJMvo and default build tag latest0225. [Billing and reconciliation evidence](x-search-pilot/billing-verification.txt). VPS ledger/report reconciled to $0.02, no outstanding reservation; original local report preserves the earlier unreconciled snapshot. Server cost remains unknown and provider usage may be covered by free credits. Official X API is still untested. No production deployment.
### Current scope update — 2026-09-25

### Offline duplicate and edit ingestion checks — 2026-09-25

**Follow-up fix implemented locally:** The same-ID text/link correction failure below is resolved for X profile/search ingestion. Unchanged repeats remain skipped; changed text or links update the raw record and enqueue reprocessing. Older observations are skipped based on receivedAt. Original publication time, permalink, identity and expiration are preserved. Media-only changes do not trigger this text-focused correction flow. D1 updates clear processed_at; briefing evidence now upserts changed content instead of ignoring it. Reprocessing refreshes evidence and deterministic summaries, including affected retained items beyond the usual recent-item context cap, without changing their original publication date. No database migration is required.

Validation: 59 worker tests and 42 core tests passed, worker TypeScript check passed, and [SQLite checks using the repository SQL](check-edit-sql.py) passed. Three X ingestion regression tests cover duplicate collection, correction followed by another identical collection, and corrected text reaching an already published briefing. These replace the earlier characterization expectation. All checks were offline; no paid API calls and no deployment or VPS code sync occurred.

Scope limits: this fixes a later observation with the **same post ID**, not grouping different IDs in an X edit-history chain. Provider delivery of old content with a newer fetch timestamp cannot be identified without a provider revision timestamp. Concurrent refresh races, deletion handling and revision of previously generated editions remain unverified/unchanged. Official-X production ingestion is still not connected. The historical failure evidence follows for traceability.

Executed two [characterization tests](../../apps/worker/src/x-ingestion-functional.test.ts) through the actual worker `refreshSourceById` / `pollApifySourceRuns` path, with synthetic Apify-shaped X records, a mocked fetcher/bucket/queue and InMemoryRepository. No external requests or charges. This is not a replay of the saved official API response: production currently consumes Apify-shaped X items, while the official API normalizer tested above lives in the benchmark. No production official-API adapter was introduced.

| Checkpoint | Acceptance result | Observed behavior |
| --- | --- | --- |
| Sequential repeat of identical post ID | PASS | One stored raw item, one processing enqueue after two ingestions. |
| Changed text with the same post ID | FAIL / capability missing | Existing item is skipped; old text remains and no new processing job is queued. |
| Original publication time and link on repeat | PASS | Both remained unchanged. This does not establish a successful edit update. |
| Concurrent duplicates, edit-history IDs, public briefing revision | NOT TESTED | No claim about these paths. |

Both characterization tests passed because they assert the observed behavior, including the edit limitation; this is **not** an all-pass acceptance result. The failure is in `sources.ts` `persistMessages`: it continues whenever `getRawMessage` finds the ID without checking for changed content. The D1 implementation separately uses `INSERT OR IGNORE`; direct saves are not an update mechanism. Tests use the in-memory repository, not D1 concurrency. No application behavior was changed or deployed. Edit handling requires a separate fix and reprocessing design before this checkpoint can pass.

### Current acceptance scope

User relayed the professor's decision that photos and videos are not required. Media collection, preservation, download and playback are now out of scope for acceptance and further paid testing. Historical media findings remain evidence, but are not current acceptance blockers. Required checks focus on text, author/source identity, publication dates, original links, duplicates and updates; not all have been tested yet.

### Official X search functional check — 2026-09-25

User explicitly approved proceeding. One recent-search request for `"James Webb telescope" -is:retweet`, recency order, max_results 10, requesting text/date/author/link fields and long-form text without media or user expansions. Ten posts were returned and all ten were retained by the existing benchmark X API normalizer. All 50 per-post checkpoints passed: exact expected text, author ID, equivalent date, constructed original post link and expanded entity links. Two posts had long-form text, which was preserved. No partial API errors, dropped records or duplicate IDs within this sample. This checks author IDs, not display names/handles or a deployed production integration.

[Verification output](x-search-functional-001/verification.txt) and [reproducible guarded runner](x-search-functional-run.py). Raw and normalized content remains private on the VPS at `/home/distilled-bench/.local/share/distilled-bench/x-search-functional-001/`. No credentials are in these artifacts. An initial SSH quoting error prevented execution; the corrected runner performed exactly one paid request, with no retries or follow-up pages. A next-page cursor was returned but intentionally not followed. Estimated post-read charge $0.05; actual billing not yet verified. No provider performance metrics were collected.

No failed checkpoints in this sample. Search completeness, relevance, edits/deletions, pagination, duplicate recovery and production ingestion remain unverified. This is a functional integration check, not provider benchmarking. No code fixes were required, and no additional requests are scheduled.

### Official X API functional check — 2026-09-25

This limited integration check supersedes earlier statements that official X API access is untested. It is not a provider performance comparison. User ran an authenticated NASA username lookup followed by a single timeline request capped at five posts. User reported five records, three photo expansions, no partial API errors, and all required ID/text/date/author fields present. Actual billing has not been reconciled; the agreed overall X budget is $25, not an instruction to spend it all.

Offline replay on the VPS used the existing `bench.processing.normalize` X API branch against the saved response. All five records and unique IDs were retained, with zero dropped records and zero failed checkpoints. For each post, exact text, author ID, equivalent publication timestamp, constructed post URL, expanded entity links, and attached media objects matched the saved API data. Three photo references retained their image URLs and alt text. This verifies the benchmark normalizer, not a deployed production integration.

Private evidence is in `/home/distilled-bench/.local/share/distilled-bench/x-functional-001/`: `user.json`, `posts.json`, `normalized.json`, and `normalization-checks.json`. No token or raw post content was copied into this README. The replay made no new X requests. A shell heredoc terminator error occurred after both result files were written; a separate successful read verified the saved check report.

Untested: videos, long-form posts, edits/deletions, pagination, search, independent source completeness, media download/playback, restart recovery, and production ingestion. Empty preview/video-variant fields on photos are not failures. No parser changes were needed for this sample. API access and this check do not establish permission for provider benchmarking or all planned public-content uses.
