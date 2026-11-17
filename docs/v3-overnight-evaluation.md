# V3 overnight implementation and evaluation

## 1. Executive summary

**V3 works end-to-end locally and in isolated Cloudflare QA.** One local edition and six remote editions were generated, verified by the native pipeline, persisted and separately read back. Another remote window correctly completed QUIET with zero calls. Production and existing product staging were not deployed or rerouted; no reader notifications were sent.

The corrected three-article edition contains Replit, Anthropic and Laplace separately with correct source ownership: **29.80 seconds, four calls, $0.0159808**. A larger trial offered 20 distinct full articles and persisted nine items: **96.08 seconds, ten calls, $0.2605756**. Source integrity checks passed for **35/35 same-feed deliveries**, comparing full body, title, URL and publication timestamp.

**Functional delivery is not a clean quality pass.** Independent AI-assisted review found temporal errors in the AI edition and material active-exploitation overstatement in the larger security roundup. These passed native verification. A separate real repair-numbering bug initially lost two developments; it is now fixed and regression-tested. Do not promote this run as fully qualified public publication.

Actual inference: **$0.3587004 across 31 calls, zero unsettled task charges**. Cloudflare incremental invoice cost is unavailable; $1 remains conservatively reserved, giving **$1.3587004 total exposure** against the $20 authorization. All 54 pre-existing held financial records remain unchanged. Next: targeted verifier/repair regression work using the retained bad outputs, without another product stage or model-comparison exercise.

## 2. Starting repository state

Branch `feat/parallel-cloudflare-event-reconciliation`; base `ec0ecce5d6e8ca0f62ced9c5cff4c72bb3122462`. V3 was already merged and integrated with fixed-window scheduling. The existing feature worktree preserved unrelated root-workspace changes.

Implementation commits, solely authored/committed by Ghada Al Danab: `c9d28c2` full evidence/date guidance; `3970f6d` isolated QA with existing accounting; `f7bb73e` serialized bounded QA sends; `ff43f53` source-safe subset repair/verification numbering. No merge or production action occurred.

## 3. Investigations and decisions

Read-only R2 sampling inspected 13 objects across seven prefixes following a 12-key inventory. They contain mixed snapshots, provider JSON, RSS/XML and normalized records; excerpts are not assumed full articles. No whole-bucket download or original write. One broad query timed out; bounded reads succeeded.

Retained QA D1 supplied 100 recent plus 40 longest revisions: **130 unique bodies, 40 above 6,000 characters, maximum 193,826**. This deliberately biased sample is not prevalence data. Old trimming removes **1,181,490 characters**. Independent review found material experimental conditions and forecast uncertainty discarded from the middle of a 33,539-character Anthropic research article (offsets 12,789-15,269).

Shared default is now finite **250,000 characters**, retaining every observed body. Existing batching and provider context/cost admission remain; no AI preprocessing. Product V3 already explicitly retained full text. Roughly four characters/token implies about 295,000 additional input tokens per full sample pass ($0.59 editor/$0.12 verifier uncached input); this is an estimate excluding outputs, repeated prompts and repairs, not a measured old/new benchmark. No speed saving is claimed.

History sample: 18 editions across ten feeds, 1-9 communicated items each. Exact communicated-text replay retained relevant targets. **Keep 21 days / max16 / four recent plus relevance.** Real histories do not qualify recall above the cap. Older reminders are not inherently wrong; no event graph or expanded memory was added.

## 4. Code changes

`packages/briefing/src/prepare.ts`: full-evidence default and middle-content regression. `prompts.ts`: source-relative date anchoring, publication-vs-statement timing and repair guidance; real results show prompts alone are insufficient. `engine.ts`: local model-facing subset numbers mechanically map back to immutable draft/source owners. The regression reproduces repair returning 0/1 for original flagged items 1/2.

`apps/worker/src/v3-qa.ts`: authenticated existing intake/acquired-storage/reassessment/V3 publication/reader path. No public app, collectors, Cron, queues or notifications. `v3-qa-spending.ts`: existing account reservations/settlements, worst-case task admission, durable replies in isolated content D1, exact replay and stop on uncertain charges. QA sends serialize existing concurrent chunks. Focused tests cover separate account/content databases, budget denial and no uncertain resend. `wrangler.v3-qa.jsonc` is the dedicated deployment config.

First real wrapper call settled but lost its reply in a feed foreign-key storage error. Fixed by keeping replies in content D1 and finance in account D1. Its exact charge and failure remain; no semantic response was invented. An exact request-hash match normally settled its local bookkeeping hold from the known account receipt, without modifying old holds.

Initial remote A editor correctly separated all three developments. Repair returned local0/1 for flagged global1/2; old code attached Laplace to Anthropic's source, then verification dropped it. This was **alignment failure, not editor false event merge**. Corrected replay retained all three.

## 5. Local end-to-end results

Edition `92db0acff55d7891aafbae12c59a276f225ba6fc1bd057eb835ccb0832df64f9` persisted and matched a separate persistent-D1 reopen/read. Two stories/two citations. The October18-20 window correctly excluded imported Replit (published October17); it was not an editorial omission. Four calls cost **$0.0157672**; request about20.18s, through separate read-back **20.94s**, excluding historical acquisition. Local database retained.

Exact text: `.local-reports/v3-overnight/local-briefing.md`; response/read-back, complete operation records, independent review and exact-hash financial recovery proof are retained alongside it.

## 6. Staging deployment and verification

Protected URL: `https://distilled-news-v3-overnight-20261022.distillednews-platform.workers.dev`.

Dedicated Worker/content D1: `distilled-news-v3-overnight-20261022`, database `7cbf12c8-8dde-4b25-8f09-cdbba806e0ca`. Separate existing account ledger `ab259bfe-6029-4e20-8cb6-eea6b7a67459` receives only normal financial operations. No source/feed content imported there. No production routes, collection bindings or notification handlers.

Final deployed code `ff43f53`, version `74221a3c-b2f9-4a80-a936-6351ab580dcd`. All endpoints require `V3_QA_TOKEN`; anonymous reads return404. POST `/run` invokes the real application path. GET `/editions/{id}` separately matched the persisted reader projection. This is protected reader-consumable API output, not a public reader page.

Source-less preflight correctly denied with zero calls; approved-source/out-of-window preflight persisted QUIET with zero calls. Paid runs began 22:28:38UTC October21 (01:28:38Beirut October22), after the non-overlapping grant began. Corrected final edition completed22:34:06.868UTC; read-back22:34:07.610UTC.

The controller ran whole workflows automatically; QA intentionally has no timer. This proves application execution/persistence, **not live acquisition-to-deadline scheduling**. Use only `apps/worker/wrangler.v3-qa.jsonc`, never default deployment, for this environment.

## 7. Evaluation results

| Case | Offered/prior | Stored items | Request seconds | Calls | USD |
|---|---:|---:|---:|---:|---:|
| A initial |3/0|1|30.02|4|0.0191680|
| B overlap |4/0|3|21.61|2|0.0151660|
| C1 chronological |2/0|2|17.26|2|0.0100336|
| C2 next window |2/2|2|26.55|4|0.0141512|
| C3 no news |0/4|QUIET|3.89|0|0|
| D larger batch |20/0|9|96.08|10|0.2605756|
| A corrected |3/0|3|29.80|4|0.0159808|

D submitted21 real deliveries/20 unique articles, **474,006 raw characters**, including one identical duplicate. Six editor calls, one consolidation, three verification calls; **146,555 input/5,610 output tokens**. Engine59.13s, publication processing65.73s, complete request96.08s; difference includes normalization/intake/database work, not acquisition.

Independent AI-assisted source reviews (not human gold or external verification of publisher truth):

- A initial: functional pass, important coverage failure from alignment. A corrected: coverage/grouping/provenance pass; temporal fidelity fails. Anthropic still says ?announced today?; Replit statement timing is overprecise and compresses later clarification into the onstage remark. Core financial conditions, continued Anthropic availability,2027 forecast and Laplace pilots remain supported.
- B: duplicate sanctions reporting combined; StPetersburg/Lutsk distinct; uncertainty/attributed counts preserved. Specific terminal-target assertion and historical workforce wording need precision.
- C: subsequent edition avoids repeating the already-delivered waiver, preserves distinct later incidents and attribution. No material merge/missing qualifier found; historical workforce caveat. C3quiet has0calls.
- D: functional pass, **material factual-quality fail**. Active-exploitation list wrongly includes merely disclosed/patched NVIDIA/Samsung flaws alongside actively exploited PAN-OS. Joint Google/Microsoft attribution is ambiguous. Important Anthropic research/SpaceX spectrum reporting omitted while unrelated security items combined; readability/selection uneven.

Defects are retained for focused follow-up; successful persistence does not erase them. No fabricated article served as real-quality evidence.

## 8. Actual spending and latency

Hard authorization$20. Local cap$3; deployed cumulative inference cap remains$8. Fresh underlying account authority allows at most$19 task model exposure plus$1 conservative Cloudflare allowance; it includes original$6.0268524893 held liabilities and expires09:47:21.603UTC October22. No old grant renewed/overwritten.

**$0.3587004 actual /31calls /0unsettled.** Includes initial failed-wrapper$0.007858 and local success$0.0157672. Thirty retained successful replies report **199,666 input/9,228 output tokens**. First lost reply tokens unavailable; exact settled cost preserved. Receipts include cache discounts.

Models GPT-4.1 editor/consolidation/repair, GPT-4.1mini verifier, via OpenRouter; temperature0.1, max_tokens4000 editor/consolidation,3000 verifier/repair, JSONobject output. No model comparison or provider fallback.

Cloudflare invoice cost unknown; $1 reserved. Conservative exposure$1.3587004; remaining$18.6412996. All54 pre-existing held records matched field-by-field. No paid evaluation remains running. Times include serialized QA transport and account overhead; not production-parallelism or acquisition-to-delivery benchmarks. Authorization wait is logged separately.

## 9. Problems discovered

Wrong-database response storage (fixed; one reply lost); unnecessary one-slot local override waiting behind failed bookkeeping (removed without another send during wait); subset repair/source misalignment (fixed); temporal semantic false rejections/acceptances (unresolved); large-roundup scope/attribution failures (unresolved); insufficient real history above16items (unqualified).

Final worker-test rerun could not start because C: was full (`ENOSPC`), before any test ran. Lossless hash-verified compression recovered space without deleting sources/databases. Earlier14 worker integration/accounting tests passed. After subset fix, **37 briefing-package tests and Worker TypeScript passed**. The blocked rerun is not reported as a pass.

## 10. Remaining work and recommended next step

Keep the functioning QA baseline isolated. Use retained temporal/security failures for focused verifier/repair regression, then a small fresh quality validation. No public deployment on this evidence. Timer-driven delivery, multilingual quality and history above16items remain unqualified.

Safe committed generated reader text, exact metrics and independent findings: `benchmarks/results/v3-overnight/`. Full local evidence: `.local-reports/v3-overnight/`:

- `progress.jsonl`: append-only timed actions, failures, recovery and costs.
- authorization, spending, fresh account grant, financial preservation, deployment JSON.
- R2 inventories/samples; retained corpus; truncation/history analyses and independent reviews.
- `stage-*-input.json`, responses/readbacks and fullbriefing Markdown.
- `staging-operation-records.json.gz`: complete lossless export; uncompressedSHA256 `0a459067d7765050a37cb5403af7465b61dfa68efdba4aed82b2e29f0381f2a1`.
- `staging-source-integrity.json`:35/35same-feed checks; `staging-evaluation-summary.json`.

Several larger JSON exports were losslessly gzipped after disk exhaustion; each uncompressed hash is recorded in the append-only log. Use `.json.gz` where the original `.json` export is absent. Credentials/raw large data stay local and uncommitted. Protected API access needs the existing local/server-side task token; none is included here.
