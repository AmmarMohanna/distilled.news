# Unchanged V3 evaluation on the collected twenty-feed QA dataset

## Result

Current V3 code `f6bacb5353e4e651ca7501127b74ea7eda600369` on `feat/v3-factual-reliability` automatically generated, natively verified/repaired, persisted and separately read back a **six-item briefing from twenty distinct acquired articles**. No prompt, model route or implementation was changed for this result. The dataset branch was fetched for inspection, never merged.

- Actual inference: **$0.0723856**, four calls, 43,624 input / 1,496 output tokens.
- Full local application request: **39.94 seconds**; through separate database reopen/read-back: **41.11 seconds**.
- V3 engine: **24.159 seconds**, including editor, verifier, one targeted repair and recheck.
- Edition: `029007b4e89be6e4392cd810775c10e826b7a020fc5b1a65bee70f5665ed2b28`.
- All 20 original bodies, titles, URLs and publication timestamps matched isolated local storage; six source citations survived reader projection.
- **Delivery/persistence passed; a clean factual-quality pass did not.** The Uzbekistan signing date is unsupported by the source's weekday context; the Roman lead has old-report/date-grounding concerns.

Full unedited text: [briefing](../benchmarks/results/v3-twenty-feed-evaluation/briefing.md). [Briefing with source links](../benchmarks/results/v3-twenty-feed-evaluation/briefing-with-sources.md). [Exact metrics](../benchmarks/results/v3-twenty-feed-evaluation/summary.json).

## Read-only corpus selection

Dataset branch ref: `codex/twenty-feed-dataset`, fetched revision `5b2dd90`. Its config identifies source-collection QA D1 `f34f4399-1e3b-4d4f-ba17-564e54e9f941` and R2 bucket `distilled-news-qa-v3-raw`. Only SELECT queries were issued against that D1. D1 already retained the acquired full article bodies, so no R2 download or mutation was necessary. No source feed was resumed, modified or deployed.

Preferred **AI Research and Deployment** had only nine COMPLETE article revisions/nine URLs. **Space and Astronomy** had 27 COMPLETE revisions representing 26 canonical URLs, so it supplied the realistic larger workload. The selected source feed is `qads_20261021_08`. Its original interest statement was passed unchanged:

> Track mission milestones, launch outcomes, spacecraft operations and significant astronomy findings. Distinguish a planned launch from a completed launch and a scientific hypothesis from an observation. Keep uncertainties and mission dates. Skip image-of-the-day posts, anniversaries and celebrity space coverage without a substantive development.

Selection removed one repeated acquisition, four older backlog articles, one video summary and one image-only caption. The remaining 20 distinct full-text records total **81,701 characters**, with retained publication timestamps **October 18-21, 2026**. All were marked FULL_ARTICLE/COMPLETE and had successful transport, extraction and extraction-complete flags. No topic-based filtering removed weather, wildlife or other off-topic text before V3. The real input therefore tested relevance selection as well as writing.

Original text, title, canonical URL, publication/acquisition/acceptance timestamps, publication-date provenance, source ID, feed-source ID, source item key, observation/acquired/revision IDs and body SHA-256 are exported in the local corpus. No timestamp was corrected to improve the run. A post-run review found one COMPLETE-marked Japanese article largely encoded after two readable opening paragraphs; that limitation is recorded rather than silently repaired or substituted. Thus these are20 complete-labelled acquired records, not a claim that every publisher body is pristine.

Source feed and all 20 selected original revision JSON records were read back unchanged after evaluation. Their original source/feed identifiers are mapped to isolated local revision identifiers; the namespaces differ, while evidence bytes and provenance remain traceable. Raw source exports and private owner metadata stay in `.local-reports/v3-twenty-feed-evaluation/`; the committed manifest excludes article bodies and owner information.

## Execution and persistence

Existing normalization/intake -> acquired local storage -> current V3 editor -> verifier -> native targeted repair -> recheck -> publication -> separate reader read-back.

The existing authenticated QA handler was invoked **locally**, backed by the retained isolated evaluation D1 at `C:/Users/HP/AppData/Local/Temp/dn-e2e-a7c40e1ec8b5b888`. A new isolated evaluation feed (`qa-v3-twenty-feed-space`) uses a five-day replay window, October 17-22 UTC, so all selected articles are eligible. Existing product scheduling and initial-backlog rules were not changed. This is a closed-corpus evaluation window, not a real scheduled five-day feed or acquisition-to-delivery test. Prior published context is empty.

The native editor selected six articles and explicitly omitted 14. All 20 were offered to V3 and accounted for in its output; nothing was silently lost during import. This mechanical coverage does not prove all editorial decisions correct. There were no chunk/consolidation calls, no dropped final items and no operator rewrite. Original full text remains in local storage. The generated reader JSON matched a separate database reopen/read exactly.

| Stage | Model | Tokens in/out | Provider latency | Actual USD |
|---|---|---:|---:|---:|
| Editor | openai/gpt-4.1 |22,705 /1,258|10.963s|0.0554740|
| Verifier | openai/gpt-4.1-mini |11,195 /119|3.655s|0.0046684|
| Targeted repair | openai/gpt-4.1 |4,698 /101|3.130s|0.0102040|
| Recheck | openai/gpt-4.1-mini |5,026 /18|3.430s|0.0020392|

Temperature 0.1; max_tokens 4000 editor,3,000 verifier/repair/recheck; JSONobject response mode. Native engine stage timings include accounting/runtime overhead and are saved separately. Request time includes local intake/storage; through-readback time additionally includes disposal/reopen and account audit. Neither includes original source collection or the time spent exporting/reviewing this corpus. Harness test passed; that asserts actual generation/persistence, not factual perfection.

The verifier flagged the Japan draft's added sentence asserting an imminent launch and an exact as-of date. Targeted repair removed it and recheck approved the remaining source-supported lead. This is an observed successful native repair. It did not catch the Uzbekistan timing problem.

## Source-fidelity review

This is an offline review by the implementing assistant using the saved original articles, not independent human review or external confirmation of the publishers' underlying claims. No extra paid assessment stage was added.

**Readability:** clear headlines and concise paragraphs; six manageable items, no substantial repetition. Some jargon remains, but not enough to obscure the main developments.

**Relevance:** the delivered mission, rover/helicopter and civil-space cooperation items match the original interest. Weather warnings, energy policy, wildlife, school celebrity coverage and image-of-the-day posts were omitted appropriately. Both overlapping Tesla/SpaceX merger reports were explicitly skipped as corporate discussion outside the stated mission focus. Nuclear SkyFall transport and later blade research remain distinct related stories, not a false merge.

**Accuracy:** mixed. The Japan lead, Moon Base rover status, nuclear propulsion development and experimental blade item are generally supported; future/experimental qualifiers remain. Two chronology concerns need human attention:

1. **Uzbekistan signing date:** generated text says October 20. The article's publication/updated date is October 20, but the body places the ceremony "in Samarkand on Monday". October 20, 2026 is Tuesday. The model assigned the article date to the event despite different weekday context. This is unsupported date precision and native verification approved it.
2. **Roman chronology/freshness:** retained metadata says publishedOctober 21, while the original body is datedAugust 31 and describes liftoff on Sunday. The generated text explicitly assigns August 31 as launch date and leads with it as new. The body does expose the older date, and the mission/capabilities are described in the source; nevertheless exact event-date inference and current-news priority are not securely grounded. This is partly an input timestamp conflict, preserved unchanged, and partly editorial handling of old reporting.

**Reasonable completeness:** core facts and key conditions of the six selected developments are largely retained; not every supporting number or partner needs repeating. No clear major selected-story omission was found. CASALS is a **borderline omitted development**: the NASA article describes successful airborne lidar/ML prototype data and planned further maturation. The editor explicitly excludes it as Earth-observation technology rather than a space-mission/astronomy milestone. That is defensible for this narrow interest, but worth human review if broader space technology was intended. It is not labelled an unequivocal completeness failure. Japanese mission detail is limited by the encoded source body; COMPLETE flags alone do not establish pristine evidence.

The exact assessment, quoted source anchors/offsets, source hashes and qualifications are saved in [review.json](../benchmarks/results/v3-twenty-feed-evaluation/review.json). No generated text was corrected after review.

## Authorization and accounting

The existing `v3-overnight-20261022` $20 real-collected-corpus evaluation authorization was still valid and applicable to this same-model isolated V3 trial; it expires `2026-10-22T09:47:21.603Z` (12:47 Beirut). Before requests, the account was audited: cumulative task inference **$0.3860300**, no unsettled task reservation. This single evaluation was bounded to **$0.75 additional conservative exposure** through the existing atomic admission guard, with original expiry, account protections, model identities and uncertain-outcome handling intact. No grant or financial record was reset, renewed or overwritten.

Actual evaluation cost **$0.0723856 / four paid calls**. Cumulative task inference is **$0.4584156**; no unsettled task provider charge. The pre-existing $1 conservative incremental Cloudflare allowance remains, giving cumulative task exposure **$1.4584156**. Cloudflare invoice cost is not yet available. All54 historical held records were compared field-by-field and remain unchanged. No further paid evaluation is running.

## Saved artifacts and boundaries

Committed reviewable outputs: `benchmarks/results/v3-twenty-feed-evaluation/` contains full unedited briefing, source-linked briefing, manifest, source mapping,20/20 integrity checks, native outputs/verdicts/costs, persistence proof, review and summary.

Exact large/private local artifacts: `.local-reports/v3-twenty-feed-evaluation/` contains full original `corpus.json`, source QA snapshots, exact input, request/response operation records and raw provider replies, local D1 read-back, spending audit, authorization check and append-only progress journal.

No V3 source/prompt/config change; no dataset branch merge; no production/source-QA/V3-QA deployment; no source-QA writes, R2 writes, queue resets or reader notifications. The isolated deployed QA baseline remains untouched. This result establishes functioning delivery on a real larger collected batch, **not** clean factual accuracy or reliable live scheduling. The full briefing is provided unchanged for human review rather than repaired to improve the evaluation result.
