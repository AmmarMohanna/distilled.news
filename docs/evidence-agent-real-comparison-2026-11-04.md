# Evidence-first candidate: authorized real comparison - 2026-11-04

**Decision: REVISE; do not promote. Keep V4 selected.** All 18 frozen pipelines were attempted. The candidate accepted only 3/6 cases and was more expensive. It has a useful single-case verifier result and better qualification wording in one held Arabic draft, but does not establish a reliable, efficient replacement.

## Scope, accounting and method

- User-approved ceiling: $7, 72 calls; native admission request bound: 64,000 bytes. No retries, judges, deployment, reader publication or notifications.
- Executed application revision: `8a80d2f`; six identical frozen English/Arabic inputs, histories and shared model settings across V4, V7 and `evidence-first-v1`. Rotating variant order reduces, but does not eliminate, ordering effects.
- Models freshly checked: GPT-4.1 editor/repair ($2 input / $8 output per million tokens); GPT-4.1 mini verifier/recheck ($0.40 / $1.60).
- **39 distinct paid calls; $0.2491448 actually settled; $1.3829152 cumulative conservative reservations; zero unsettled/uncertain operations for this run.** These are inference charges; incremental D1 API usage was not separately metered and is not presented as zero. Existing native full-pipeline authorization, reservation, provider limits and settlement were used in the isolated QA ledger. No historical grant, operation, hold, schema or account ceiling was rewritten.
- The provider key-usage delta independently matched the settled run cost. Absolute shared-key allowance values remain in private local evidence and are reported to the owner separately; they are not historical personal-spending attribution.
- Full requests, provider bodies, intent records, receipts and append-only send/pipeline records: `.local-reports/evidence-agent/trial20261104/`. Safe responses, hashes, per-call usage, ledger rows and final results: `benchmarks/evidence-agent/trial-results-2026-11-04.json`.
- Full reader-facing texts: `benchmarks/evidence-agent/trial-outputs-2026-11-04.md`. Source-linked assessment: `trial-review-2026-11-04.json`. All semantic judgments are **AI-assisted engineering review, not human ground truth or an independent paid judge**. Unresolved issues remain unresolved.

A local runner-launch problem was corrected before any database mutation or inference. Wrangler then refreshed expired OAuth securely; the CLI's subsequent IPv6/network failure did not invalidate the refreshed token. The ledger was reached over the existing IPv4 adapter. No model request was sent while accounting access failed.

## Execution results

`accepted` means the existing engine returned verified items, **not** that a reader edition was published. This comparison deliberately performed no publication or reader-storage mutation.

| Variant | Accepted / attempted | Calls | Repair/recheck pairs | Actual USD | Sum of pipeline wall time |
|---|---:|---:|---:|---:|---:|
| V4 | 5/6 | 16 | 2 | 0.0754548 | 66.686 s |
| V7 | 6/6 | 14 | 1 | 0.0597840 | 58.736 s |
| Evidence-first | 3/6 | 9 | 0 | 0.1139060 | 66.025 s |

Failed candidate cases stop before the verifier. Fewer calls and zero accepted words there are **failures**, not cost/conciseness wins. Do not compare the total timings as equivalent completed workloads.

| Case | V4 | V7 | Candidate |
|---|---|---|---|
| Lebanon English | accepted, 9.263 s | accepted, 9.120 s | accepted, 12.462 s |
| Lebanon Arabic | accepted, 9.072 s | accepted, 8.854 s | accepted, 12.139 s |
| AI English | accepted after repair, 17.502 s | accepted, 10.305 s | held after editor, 13.117 s |
| AI Arabic | accepted, 10.888 s | accepted, 10.837 s | held after editor, 15.483 s |
| Casualty English | rejected after repair, 13.330 s | accepted after repair, 13.199 s | accepted, 7.864 s |
| Casualty Arabic | accepted, 6.631 s | accepted, 6.421 s | held after editor, 4.961 s |

Times include inference plus local/native accounting round trips and tool/engine work. Separate observed provider HTTP totals are saved. They are saved-evidence replay times, not fresh acquisition-to-delivery latency. One sample per case is not a latency percentile or a scalability result. V4 received 3,968 cached input tokens; V7/candidate received none.

## Confirmed failures, distinguished correctly

### 1. Quote-format failure, not evidence of a false event merge

Both AI candidate responses contained non-verbatim quotations. Four citations failed exact lookup: one English Replit citation, and three Arabic METR/Replit citations. They inserted ellipses, spliced sentences or changed wording while claiming to be exact source excerpts. These strings do not occur verbatim anywhere in the supplied originals.

The deterministic guard correctly held them. But one invalid claim citation currently rejects the entire editor envelope, including other developments that might be usable. The candidate did not reach verification or targeted repair in either case. **This is a demonstrated delivery/contract defect, not successful semantic detection and not proof the events were merged.** Raw drafts in all three variants still separated fund, METR and Replit.

### 2. Missing update identity, not a factual rejection

The Arabic casualty candidate returned `relation:"update", updates:null` despite supplied reader history. Its prose retained the main numbers, but `INVALID_PRIOR_RELATION` held the entire result. There was no verifier call. The supplied canonical prior ID is long; that is a plausible copying burden, not a proven explanation of why the model emitted null.

### 3. Real baseline false rejections damaged important information

The official Arabic source explicitly reports **6 killed and 28 injured**. Both English baseline verifiers wrongly said the source did not support 28 injured.

V7 repair removed the supported injury count and passed recheck. V4 repair also removed it; its recheck then demanded that same number and rejected the item. The candidate retained both numbers and passed its verifier without repair. This is a concrete useful win on this case. It does not establish generally better semantic discrimination.

### 4. V7 Arabic factual failures remain

The matched V7 Arabic METR item says publication can be blocked in confidentiality/IP cases. The source explicitly denies a publication veto and permits defined redactions instead. The verifier returned `ok`.

Its fund item omits stockholder approval entirely. The source makes the initial 5% commitment conditional on that approval. The verifier again returned `ok`. This is a necessary qualification, not optional background.

Its Replit item places disputing insiders inside Anthropic, an affiliation the article does not establish. Exact item text and original evidence are saved separately in the review.

The candidate Arabic **draft** explicitly retained shareholder approval and correctly distinguished redaction rights from publication veto rights. That is encouraging writing evidence versus this matched V7 response, but the draft was held for quote failures. It cannot count as successful verified delivery.

The held English candidate draft still used "about 20% ... are now dedicated" against conditional/future source wording. That risk was not reviewed semantically: a structural hold must not be credited as an intended factual-error catch.

## Coverage, grouping, novelty and unnecessary reading

- S13 remained a separate prospective-strike announcement in every Lebanon output. Actual Barashit reporting also remained distinct. No incremental candidate grouping/recall gain was demonstrated there.
- Provisional development-presence inspection: V4 15/16, V7 16/16, candidate 9/16 accepted. These counts do not certify factual correctness, complete claim coverage or human-reviewed importance. V7's English casualty item still loses important supported information.
- All versions acknowledge or exclude sources; this does not establish development completeness. Candidate AI cases were held before their accounting could be fully accepted.
- The candidate English Lebanon briefing uses 140 whitespace-delimited words versus V7's 102, preserving the same four developments and frequently repeating the headline in the body. It is not a demonstrated distillation improvement. Arabic: candidate 125 versus V7 129; no meaningful quality gain follows from four fewer words.
- The official casualty update is meaningful new information beyond the retained attack-video briefing. Some outputs label it `new` or omit a valid prior binding. Correct chronology/linking is therefore not uniformly demonstrated.
- The candidate casualty English account includes church context found in other supplied evidence/prior coverage, but not in its cited government statement. Whether its attribution is harmless context or materially misleading remains **unresolved**, not a counted false approval.

## Efficiency

On matched, successfully completed Lebanon workloads, the candidate costs **$0.022002 / $0.0229812**, versus V7's **$0.0109168 / $0.0113864**: approximately twice the cost, with 37% greater pipeline time. This fails the 10% efficiency target on these observations.

Candidate output across nine calls totals 8,539 tokens versus V7's 2,906 across fourteen calls. Structured record/quotation reproduction creates substantial overhead without equivalent additional reader value. Failed AI attempts also consume $0.05588 without an accepted briefing. Do not project these six atypical replay cases as production costs for every feed.

## Validation and engineering conclusion

Validation: **208/208 briefing tests passed**, including the paid-response replay, and the briefing TypeScript check passed. Product Worker code is unchanged by this follow-up (its prior 53-test suite passed). Offline replay, including a simulated 2030 wall clock, reconstructs **every one of the 39 exact request hashes** and final items/holds/usage from saved responses with zero network calls. Native receipts reconcile to 39 unique provider generations and $0.2491448. The benchmark now freezes its clock to each reporting cutoff; replay proves this correction changes none of the executed requests on these cases and prevents future aging from silently changing reader-memory selection.

V4 and V7 product prompts, routing and the experimental candidate are unchanged by the trial. No deployment/promotion or further paid calls were performed.

The smallest next technical revision to evaluate is to remove unnecessary model copying: select stable passage references and let code supply their exact original text; use compact prior-coverage aliases mapped mechanically to canonical IDs. Also isolate invalid development records so one malformed citation cannot discard unrelated valid developments. These address measured contract failures, not semantic truth. They are recommendations, **not implemented or paid-tested fixes in this report**.

Retest factual qualifications, source-specific attribution, valid concise controls and reader value after any such revision. Do not respond with a longer verifier prompt, a new agent or extra routine calls. **Keep V4 selected. Further paid testing needs a fresh bounded approval; the unused $7 is not permission for more experiments.**
