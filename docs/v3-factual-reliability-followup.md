# V3 factual reliability follow-up

## Outcome

Branch `feat/v3-factual-reliability` starts exactly at `2f69242e4bab526db61ae022466b8d78fafa0c3d`. The editor -> verifier -> targeted repair architecture remains intact. No deployment, notifications, additional product calls, company/vulnerability keyword rules, or model-routing changes were made.

**The requested material-error rejection criterion is not achieved.** The retained failures are now reproduced and traced, and missing temporal context plus a misleading numeric hint are corrected. But the bounded real validation still falsely approves the three full bad outputs. More passing plumbing tests do not override that result. The new branch is an evidence-backed partial correction, not a qualified factual-reliability fix.

## Exact retained failure diagnosis

| Failure | Origin and subsequent behavior | Evidence |
|---|---|---|
| Anthropic source-relative today | Editor correctly wrote October18. Verifier falsely rejected that date and requested today. Repair followed the wrong note; re-verification approved it. | Retained operations `3092f96d...` verify, `80322ba4...` repair, `3f5494dd...` recheck; complete IDs and outputs saved. |
| Replit date/clarification sequence | Editor assigned October16 to the Disrupt statement and compressed a later clarification into that statement. The footer supplies original publication time, not that event time. Verifier returned ok. | Original body distinguishes onstage Thursday, after Disrupt, weekend clarification, and original-publication footer. |
| Security exploitation scope | Editor placed disclosed NVIDIA and patched Samsung flaws inside an active-exploitation including-list. Consolidation copied it unchanged. Verifier returned ok. | Source distinguishes active PAN-OS ransomware, researcher-disclosed possible NVIDIA exploitation, and patched Samsung RCE. |
| Google/Microsoft joint attribution | Same editor paragraph shared guidance and bounty predicates across both actors; consolidation preserved it; verification approved. | Source separately attributes Chrome bounty changes to Google and post-quantum certificate guidance to Microsoft. |

These are semantic false approvals/rejections, not invalid IDs or JSON failures. The earlier repair-numbering bug is separate: the preserved fix maps local subset indices back to original source owners and passes both existing and new sparse-subset tests.

The verifier and repair requests lacked the reporting cutoff that the editor received. Also, numeric hints searched only article bodies: an otherwise supported October18 anchor was flagged as missing18 even though the source header provided that date. Those are demonstrated input defects; their removal does not establish that the model will judge meaning correctly.

## Focused implementation

`packages/briefing/src/engine.ts` passes the existing reporting-window end into verification and repair. Numeric hints include the same title/publication metadata already offered as evidence. They remain hints, not semantic gates.

`packages/briefing/src/prompts.ts` labels publication timestamps as metadata, distinguishes statement/clarification timing, explains shared-predicate/list scope and actor/action ownership, protects ordinary compression and optional omissions, and tells repair to check fallible problem notes rather than blindly copying them. Repair receives the same cutoff as verification. The source text itself is unchanged.

No context inference, source summarization, new agent, mandatory call, claim schema or special-case factual rule was introduced. The added scope instructions did **not** demonstrate better rejection in this run. The temporal context change did make the revised mini verifier accept the correctly anchored Anthropic control, but it continued accepting the bad today version.

## Fixtures and offline regressions

`packages/briefing/test/fixtures/v3-factual-reliability.json` contains three exact saved full source bodies, original URLs/publication metadata and SHA-256 hashes, the generated headlines/bodies and engineering-reviewed alternatives: four incorrect examples and seven corrected/concise controls. The fourth incorrect example is the exact joint-attribution sentence excerpted from the full security item. The sources are distinct and hashes are checked. Labels are engineering assessments, not independently human-labelled gold.

Tests cover source integrity, cutoff propagation, removal of the metadata-date false hint, sparse repair indices/source ownership, ordinary two-call and four-call flows, evaluation scoring and exact replay of the observed semantic failures. No test uses a keyword checker as a substitute for semantic verification. Mocked verdicts test plumbing only. Recorded-response tests explicitly expect the real false approvals, preserving the unresolved failure rather than calling it fixed.

The scorer initially overcounted malformed responses because it required issues arrays on ok replies. V3 defaults missing issues to empty. The scorer was corrected to match that behavior and all saved replies were rescored without another paid call. Raw responses were not changed. Duplicate/missing indices are still separately invalid; redundancy alone earns no credit for detecting an incorrect factual claim.

## Bounded real validation

The still-valid original authorization expires `2026-10-22T09:47:21.603Z`. A six-call / $0.20 additional-actual ceiling was frozen, with worst-case cumulative reservations capped at $0.5587004 through existing account admission. Four calls compared original versus revised GPT-4.1-mini on identical incorrect/correct batches. Because no incorrect item received fix, no targeted repair was triggered. The final two calls instead compared GPT-4.1 using exactly the revised mini request, changing only model. This repurposing and its rationale were appended before sending; no cap, grant, settlement or historical hold was altered. No further paid trial was run.

| Configuration | Full bad outputs approved (of3) | Other incorrect excerpt | Correct controls flagged (of7) | Pair time | Pair actual cost |
|---|---:|---|---:|---:|---:|
| Original mini |3|redundant, not a factual diagnosis|2|9.785s|$0.0038160|
| Revised mini |3|redundant, not a factual diagnosis|2*|7.518s|$0.0039856|
| Revised GPT-4.1 |3|redundant, not a factual diagnosis|0|8.498s|$0.0195280|

The two definite original-mini false rejections were the correctly anchored Anthropic date and accurate Replit sequencing/paraphrase. Revised mini accepted the Anthropic date but still rejected accurate Replit wording. All four short omission/paraphrase controls were accepted by every setting.

*The other revised-mini flagged control is disputed: the full-security alternative fixes the targeted list/actor errors but retains the original phrase reducing distillation attacks by up to99%, whereas the source measures reduced data harvesting through distillation attacks. Its label is not beyond dispute. Report one definite revised-mini false rejection plus one disputed control, rather than treating all seven labels as unquestionable gold. The raw prespecified score remains available. No post-hoc correction was silently substituted for a tested input.*

The separate attribution excerpt overlaps the full security item, so its redundant verdict is confounded by within-batch duplication; it is not an independent attribution-quality pass. The full paragraph containing that attribution was accepted by all configurations. Single batched diagnostics, with nearby alternatives/overlap, do not establish general model error rates. They do establish continued failure on the retained full bad prose. GPT-4.1 reduced over-rejection in these controls but did not improve error detection, so a routing change is not justified.

Exact model requests, parameters, responses, verdicts, token usage, timing and costs are committed under `benchmarks/results/v3-factual-reliability/`. Temperature0.1, max_tokens3000, JSONobject responses, no automatic evaluation retries. Source payloads are identical between model comparisons. There was no new publication or end-to-end latency test in this follow-up.

## Accounting and operational checks

Additional actual inference: **$0.0273296 across six calls**. Cumulative original task inference: **$0.3860300 across37 calls**. No unsettled task provider charge. The existing $1 conservative Cloudflare allowance remains; total conservative task exposure is $1.3860300. Cloudflare invoice cost is still unavailable. Account protections and original expiry were preserved; all54 pre-existing held records were compared field-by-field and remain unchanged.

The resumed comparison first stopped at a read-only account audit with expired Cloudflare authentication (401), before inference. Refreshing the existing session resolved it; no extra inference retry or permission change occurred. The original six requests were the only new paid sends.

Disk space is available again. The previously blocked14 Worker integration/accounting tests passed, and the final expanded Worker run passed **25tests** including the V3 adapter. All47 briefing-package tests and both package/Worker TypeScript checks passed. The existing repair-numbering fix remains intact. Exact local logs and append-only events are in `.local-reports/v3-factual-reliability/`.

The functioning protected QA Worker remains at deployed code `ff43f53`, version `74221a3c-b2f9-4a80-a936-6351ab580dcd`. This follow-up did not deploy or modify its configuration/resources, public routes or notifications. Original feature branch remains at `2f69242`.

## Conclusion and next step

Retain the small metadata/context correction and the reproducible failure corpus. Do not describe the material factual errors as solved or promote the revised prompts/model to staging. Prompt-only scope guidance and a stronger verifier did not meet the rejection criterion in this bounded test.

The next focused investigation is whether evidence-first, item-specific comparison **inside the existing verifier call** can distinguish the retained errors without increasing false rejections. That has not been implemented or paid-tested here. Do not expand into an event graph, extra AI stage or broad model experiment. The saved failure evidence, precise negative results and unchanged functioning staging provide the baseline for that decision.
