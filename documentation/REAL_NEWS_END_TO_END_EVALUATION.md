# Real news source-to-briefing evaluation

Status: the October 20 real evaluation is executed and financially settled. Neither primary route produced a publishable briefing. A separate shared-input writing/verification control returned model ACCEPT on both routes, but AI-assisted source review found quality concerns. No new task is qualified for unattended publication.

The corpus is three unchanged saved acquired articles: Laplace (6,319 body characters, 48 ClaimMentions), Replit (3,884, 32), and the Anthropic public-benefit-fund article from the successful private V2 publication (1,185, 9). The private corpus has a shared hash; public metadata and model admission measurements are in `benchmarks/news-end-to-end-preflight.json`. Saved acquisition timestamps are historical, not new fetch latency. This is a representative initial case study, not a statistically representative news-quality score.

## Measured results — October 20, 2026

The initial natural-routing comparison reached canonical construction for all three articles, then failed editorial validation on both providers. Cloudflare needed one construction repair. Both stores retained all 89 ClaimMentions with exact owned source coordinates. This is evidence retention, not correct grouping: OpenRouter merged the Anthropic fund announcement into the Replit model-switch event, while Cloudflare created separate events for article-update notices and supporting/context facts. Both linked Replit to the Laplace storyline. Findings are AI-assisted source review, not independently labelled merge/split rates.

| Initial primary comparison | OpenRouter GPT-4.1 | Cloudflare unified GPT-4.1 |
|---|---:|---:|
| Construction calls, including repairs | 3 | 4 |
| Editorial calls | 1 | 1 |
| Actual provider cost | $0.143186 | $0.229590 |
| Cumulative active processing until rejection | 203.10 s | 952.91 s |
| Useful primary briefing | None | None |

Both original editorial replies failed `UNDISPOSED_PARENT_FACT`. The explicit whole-parent-reference variant then passed strict editorial decoding for OpenRouter after recovery of its complete saved stream; Cloudflare still omitted dispositions. OpenRouter's subsequent writer-input check rejected an approved timestamp ending at `p.m.` without its adjoining `PT.` qualifier. No primary writer call was made and no evidence boundary was relaxed. The original OpenRouter transport callback failure remains a reproducibility/recovery blocker even though the retained stream and exact generation metadata established its complete result and charge.

Including the separately identified compact variants and all failed attempts, the primary arms consumed 5 calls/$0.253618/OpenRouter and 6 calls/$0.363158/Cloudflare. Cumulative active pipeline effort was 270.78 s and 1,240.11 s respectively; elapsed time since import was 2,935.88 s and 2,423.00 s, including interleaving and investigation pauses. Neither has a time-to-useful-briefing measurement. These are failed case-study observations, not clean production throughput estimates. Local database statement counts were 552 reads/433 writes and 509 reads/462 writes, with zero observed CAS conflicts. Counts exclude the remote accounting API and separate operator-recovery work. Recorded exclusive-turn durations were 117.36 s and 535.93 s, including editorial inference and financial confirmation under the existing briefing turn.

To exercise writing and factual verification despite those blocked primary plans, a separate **AI-curated shared-input control** supplied four developments/12 exact source-grounded facts from the same articles to both routes. Its input hash is `90a85b638f55b04fccf631ee1700aae55567636bd3809582d60d8bc3bf8bbe15`. It does not test autonomous construction or editorial selection, does not reuse an OpenRouter verdict as a Cloudflare verdict, and does not commit an edition or publication memory.

| Shared-input control — actual paid calls | OpenRouter | Cloudflare |
|---|---:|---:|
| Writer response and validation | 6.282 s / $0.015242 | 12.566 s / $0.013908 |
| Verifier response and validation | 20.479 s / $0.041918 | 31.912 s / $0.040040 |
| Total provider cost | $0.057160 | $0.053948 |
| Application V2 verifier decision | ACCEPT | ACCEPT |
| Reader words | 421 | 415 |

OpenRouter's first complete control execution took 117.91 s, including authorization/accounting orchestration. Cloudflare needed metadata-only recovery after its OAuth credential expired during billing polling: its two active attempts totalled 347.16 s, excluding operator pauses. Its original writer billing/scope-wait sub-timings were not durably returned and are explicitly marked unavailable. The 0.736 s OpenRouter and 0.248 s Cloudflare writer timings on resume are cached-result reuse, not new model latency. Separate paid-operation response timings above come from the original calls. No clean unattended Cloudflare control latency is established.

**ACCEPT did not establish good briefing quality.** Both drafts changed agents *being developed* into an existing automatic capability and substituted *advanced* for source *high-level* traffic operations. Cloudflare additionally omitted the required paragraph's ARR non-disclosure detail and changed early-stage partner work into discussions. These are AI-assisted factual-support/coverage concerns requiring independent review, not a certified invalid-ACCEPT rate. Both preserved the 2027 forecast versus current revenue mix and the fund's share allocation, conditional increment and ownership structure. The curated input itself omitted the antecedent of Replit's disputed termination assertion and required overlapping Laplace explanations, limiting correction clarity and concision. Complete findings are in [the quality report](../benchmarks/news-end-to-end-quality.json).

All **15 calls settled for $0.727884**, with $2.2068431 in cumulative conservative reservations, below the approved 24-call/$2.50 bounds. [The read-only ledger audit](../benchmarks/news-end-to-end-accounting.json) confirmed all five original grants and all 50 original holds unchanged, zero new unconfirmed operations, and $65.6207170953 lifetime actual-plus-held exposure under the unchanged $73 ceiling. Actual usage cost excludes prepaid-credit purchase fees; no purchase or auto-top-up was performed by this run. No Worker deployment, external publication, notification or merge occurred.

[Machine-readable results](../benchmarks/news-end-to-end-results.json) keep primary metrics and downstream controls separate. Execution-scope tags and a hash-bound companion index prevent control calls from contaminating primary cost/latency totals. Global accounting includes every paid call. Public reports exclude reader prose, raw responses and source bodies; private artifacts remain under `.local-reports/news-end-to-end`.

No new configuration qualifies for unattended publication. Keep the last known-good OpenRouter settings available; leave the new Cloudflare tasks gated. Required next engineering checks are occurrence-level grouping, complete editorial dispositions and connected source context, writer qualifier preservation, and verifier sensitivity to the observed strengthening/omissions. Real parallel packet reconciliation, concurrent Cloudflare actual-dollar settlement, repeated-source/update/correction lifecycles and independent human quality labels still require qualification beyond this cohort.

## Execution

`benchmarks/news-end-to-end.ts` calls production semantic preparation, canonical intelligence processing, V2 shortlist projection, V2 comparative editorial planning, adaptive scoring, writing, factual verification and local edition commit. It accepts existing provider ports and an already isolated, acquired store; it does not change model qualification. The runner uses real semantic work leases and feed-write turns, including the existing exclusive briefing turn. The operator transport freezes each actual request and installs a separately bounded immutable per-request grant within the user-approved workflow, preserving durable reservations, exact identities, receipts and unknown-outcome fences. No live entrypoint is enabled merely by setting a provider name. Local test grants are never valid remote spending authority.

Per-article canonical changes remain sequential so later sources see existing occurrences and correction evidence. Packet inference uses configured bounded concurrency where genuinely needed. The compacted Laplace/Replit schemas now fit directly; their length alone does not justify a gratuitous reconciliation call. A separate packet stress variant can cap offered packet units while retaining complete source context, but must be labelled a controlled workload rather than a discovered provider limitation.

The pipeline checkpoints shortlist, editorial plan, selection, edition and final measurement. Wrapping `synthesize`, `verify` and `repair` measures the full application-level calls; `WRITE_VERIFY_LOCAL_COMMIT` measures their enclosing durable publication path and must not be added to child timings. The measured outer wall clock includes every stage and checkpoint within the run. An optional acquisition callback includes immutable snapshot import. A failed or empty pipeline has null time-to-useful-briefing, not an artificially low success latency. Live fetch and scheduled publication-window waiting must be separately measured and explicitly included in any future observation-to-delivery claim.

Run preparation and offline checks:

```powershell
# Optional: directory containing the private saved evidence snapshots.
$env:DISTILLED_REAL_NEWS_SOURCE_DIR = '<private-source-directory>'
.\node_modules\.bin\vitest.cmd run --config benchmarks/news-end-to-end.vitest.config.ts
.\node_modules\.bin\tsc.cmd --noEmit -p benchmarks/tsconfig.news-end-to-end.json
```

Private full source and manifests are written only under `.local-reports/news-end-to-end`. Tests report corpus unavailability explicitly; a missing private corpus cannot establish readiness. No source body is committed by the importer.

## Review the briefing, not just provider JSON

The review sheet contains six dimensions. Each remains pending until evidence-backed review is performed; lexical checks and provider ACCEPT cannot fill them automatically. Record source identity and exact source quotation, briefing quotation when present, finding, severity and whether review was AI-assisted or independent human review.

| Dimension | Required assessment |
|---|---|
| Importance | Did selection include the main new developments for the specified feed? Were lower-value context and promotions prioritized over material news? Examine every omitted/deferred candidate and rationale. |
| Factual accuracy | Verify every written assertion, quantity, attribution, hedge, causal claim and temporal framing against owned source evidence. Inspect rejected/UNRESOLVED claims and any repairs too. |
| Missing details | Distinguish essential omitted facts from justified compression. Compare the full source and dispositions, not only facts the editor elected to require. |
| Repetition | Examine duplicate coverage within the edition and against the communication ledger. Exact duplicate text is a diagnostic; paraphrases and legitimate correction acknowledgment need semantic review. |
| Corrections | Preserve Replit's later clarification, competing attribution and distinction between a default-model change and continued access. Preserve Laplace's relationship clarification. Source correction evidence is distinct from correcting a prior Distilled edition; add a separately labelled prior-publication lifecycle control rather than inventing one. |
| Attribution and time | Preserve reported claims versus established facts, historical research versus current developments, projected revenue versus achieved revenue, and source-publication date versus event date. |

AI-assisted source-derived expectations for this corpus, **not independent gold labels**:

- Replit: continued access to Anthropic models must survive the initial claim of ending the relationship. Preserve attribution of the contrary partnership account. Revenue changes are separate developments from model preference; a forecast for 2027 must not become current revenue. Avoid repeating the same clarification in separate items.
- Laplace: explain the physical-AI stress-testing product and its method without claiming deployment proves safety. Distinguish research history, current customer/revenue claims and the smart-city pilot. Do not invent an Nvidia investment or ownership relationship. The published clarification is evidence, not proof a Distilled briefing was previously corrected.
- Anthropic: preserve the share commitment, its conditional additional allocation and ownership structure when relevant. Do not turn shares into a cash donation or the optional allocation into an unconditional pledge.

## Authorized execution bounds

Explicitly approved: up to **$2.50 within the original $3 budget**, at most **24 new calls**, GPT-4.1 for strong/editorial/writing/verification on both routes, no Qwen calls, evaluation output caps of 4,096 for construction/writing, 12,288 for editorial partitioning and 8,192 for verification. These are candidate evaluation settings, not a claim of verified Cloudflare maxima; the production candidate caps remain unchanged. Conservative reservations and all unresolved outcomes count toward the cap; maximum per-operation reservation $0.35. Stop before any non-admitted call, exhausted cap, expired scope or unresolved new charge. Record actual pricing/receipts separately from reservation bounds.

Initial matched runs process all three articles into one local briefing per provider. Compare natural direct/packet routing first; run an explicitly labelled packet stress variant or bounded repair only if the remaining call and reservation budget admits it. Do not spend on additional variants before both basic routes have a result. These limits may prevent completion; partial results must remain visible.

Authorization must be implemented using existing immutable exact-operation scopes after each actual question is frozen, because downstream questions depend on model-produced developments and selections. A preparation-only hash cannot pretend to know those outputs. Existing grants cannot be edited, and overlapping grants are rejected by the ledger. The prior six-call scope ends at 2026-10-20T15:04:35.261Z; a successor must start after it ends. Each new operation must be request-hash-bound before reservation. The separately authorized migration 0066 is installed only in the evaluation ledger: old scopes retain $0.125 per operation; new explicit workflow scopes allow at most $0.35 and atomically count all workflow reservations/calls across grants. Historical grant and hold snapshots matched exactly before/after installation. The approved four-hour workflow window does not reopen old operations or authorize changing old scopes.

Use one financially unresolved call at a time initially. Cloudflare's available actual-dollar billing proof currently requires isolated complete gateway inventory and hourly billing deltas. It can add minutes of financial confirmation delay. Report this delay in actual end-to-end time; do not use serial evaluation billing as evidence of parallel production throughput. Real concurrent Cloudflare settlement remains a qualification blocker until a safe billing proof supports it.

All original 50 holds, historical grants, the $73 ceiling and unqualified publication tasks remain untouched. No external publication, staging/production deployment, notification or merge is permitted by this evaluation.

The 60-second exact-operation grant intervals can introduce evaluation-only scope waits between operations. Record these waits separately and include them in observed wall time; subtracting them gives a diagnostic estimate, not measured production throughput. Initial waiting for the already-active historical scope is outside the timed processing run. Persistent local D1, completed-job checks and existing-edition reuse prevent duplicate-delivery inference.

## Replay harness recovery record

The first launch failed before any paid intent because Miniflare could not open a persistent SQLite database at the long Windows worktree path. Persistence now uses a deterministic short directory under the local temporary directory; saved lineage records its location, and no prior database is deleted.

The article-processing launch then failed closed at editorial scope admission: its replay cutoff equalled its import receipt timestamp, while production requires admission strictly before the cutoff. The replay harness now places the cutoff at least one millisecond after import. Production eligibility rules and immutable source receipts are unchanged. Subsequent runs reuse DONE article jobs and archive prior reports; no completed construction is paid for again.

Report cumulative active processing time, time elapsed since initial import, individual provider response/validation, financial confirmation and evaluation-only scope waits separately. Harness interruption time prevents this run from establishing a clean production throughput figure. The initial failed stage remains part of the record.



## Verification and reproducibility

Final offline checks: 65 worker/publication tests, 12 news benchmark tests and 13 strong-route/billing tests passed. Worker, news benchmark and strong-route TypeScript checks passed. The native Windows test invocation explicitly captured exit zero; expected fault-injection stderr must not be mistaken for a Vitest failure. The new credential fixture verifies a fresh credential is obtained for every billing metadata read.

The benchmark's paid gates default to skipped. `DISTILLED_NEWS_E2E_PAID`, `DISTILLED_NEWS_E2E_EDITORIAL_VARIANT`, `DISTILLED_NEWS_E2E_ROUTES` and `DISTILLED_NEWS_DOWNSTREAM_PAID` are operator-test controls, not production routing variables. The compact editorial policy is an explicit internal option; existing live callers keep the original contract. Recovery tests require separate exact saved-operation flags, issue no inference, and preserve original semantic records. They are not generic permission to release historical holds or replay unknown operations.

After obtaining local artifacts, `node scripts/news-evaluation-bind-controls.mjs` binds the first control run's exact requests without editing original receipts. `node benchmarks/news-end-to-end-results.mjs` performs offline aggregation and rejects private prose fields. `node scripts/news-evaluation-audit.mjs` issues read-only queries against the fixed evaluation ledger and refuses a successful postflight if historical holds/grants, workflow limits or ceiling invariants differ. Full private outputs and prior failed reports are retained; copying the committed sanitized reports alone does not reproduce a real-model evaluation or supply its private corpus.
