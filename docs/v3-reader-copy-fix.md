# V3 reader-copy fix — October 24, 2026

The retained fix removes narrowly defined trailing reporting boilerplate **before the existing factual verifier sees the text**. GPT-4.1 editing, GPT-4.1 mini verification, source evidence, selection and publication history remain unchanged. No new AI stage or mandatory call was added. Nothing was deployed and no existing edition was edited.

## What worked

- The real local engine generated a clean two-item briefing from the retained three-source window, covering the embassy warning and both strike locations. The final reader text passed the unchanged verifier and was saved/read back locally.
- This run used two calls, cost $0.005100, and took 10.669 seconds including local execution and remote accounting round trips. It is a saved-source replay, **not** fresh acquisition-to-delivery latency or remote application publication.
- Exact retained Arabic bodies lost the unwanted source-date and missing-detail suffixes. A new unchanged factual-verifier call approved all three cleaned items.
- Independent synthetic controls preserved evacuation uncertainty, disputed responsibility, a meaningful corrected date and an explicit no-casualties report. All four were approved. Three genuinely incorrect date, attribution and modality claims remained incorrect after cleanup and were flagged for repair. No false approval or false rejection occurred in this small final seven-control batch.
- Copy editing six retained bodies took a median 0.0027 ms per body and p95 0.0044 ms locally. This CPU microbenchmark is not an end-to-end latency claim. There are no extra provider calls for this operation.

Full reader text and sanitized results: [benchmark artifacts](../benchmarks/results/v3-reader-copy/). Exact requests, responses, hashes and accounting read-back remain under ignored `.local-reports/v3-system-concision/`.

## Why this approach

The editor repeatedly ignored existing instructions. The verifier correctly treated many unwanted comments as style rather than false reporting. Expanding its semantic remit produced false rejections of important uncertainty and attribution. Additional editor reminders, history formatting, a shorter writing prompt and an internal-notes field did not reliably resolve the issue.

Cheaper editor alternatives were evaluated rather than assumed better. Mini and Haiku introduced omissions or unsupported attribution. Luna-low initially produced concise text and largely preserved the controls, but its full engine replay reintroduced “The reports gave no further details.” No model switch or reasoning configuration change was retained.

The actual user input also contains a broad “Use the original source publication dates” style preference. Clarifying it alone did not eliminate missing-detail filler, so that unproven prompt change was not retained either.

## Scope and safety

`reader-copy.ts` performs only suffix deletion against a small set of English/Arabic copy templates. Examples include “No details on casualties or damage were provided,” “The reports gave no further details,” routine “according to a report published…” suffixes, and their covered Arabic forms. It does not classify articles, extract claims, decide relevance or determine factual support.

- It never runs on source evidence or stored publication history.
- It does not delete arbitrary sentences, attribution, event dates, substantive unknowns or entire items. When a publication-date suffix is also the only attribution, it keeps �according to a report� (or the Arabic equivalent) and deletes only the date descriptor, even though the result is less terse.
- Unrecognized wording is left intact. Quoted text and ambiguous clauses outside these narrow templates survive.
- Source references, headlines and reader-history relationships are unchanged.
- Final text is always checked against original evidence. Targeted repairs receive the same cleanup before re-verification; there is no editing after final approval.
- No model prompts changed; `prompts.ts` only accepts the existing version field's new value.

This is a copy policy, not a guarantee against all possible filler or factual errors. Matching routine coverage comments are omitted deliberately; if a sentence contains substantive uncertainty, conditions or additional context beyond the template, it is left for semantic review.

## Recovery compatibility

New product snapshots use the existing `promptVersion` value 3. Frozen version 1/2 snapshots keep their original text and request construction, preserving settled-operation reuse. Historical editions are not rewritten. Tests exercise new-window cleanup, old-window behavior, interrupted result persistence and duplicate delivery.

## Spending

The new $2 authorization covered 30 calls across diagnosis, rejected candidates and final validation. All 30 settled; actual provider-reported charges total **$0.10338115**. Original reservations summed to $0.70208715; there are no unsettled task operations. Prior financial records and holds were not modified. The earlier $0.16 and $0.22 comparisons are separate historical scopes and are not counted as new-task spending.

The run started with an internal 24-call bound; local append-only records expanded it for final cleanup checks and two post-review checks, within the user's $2 authorization and unchanged expiry. No further paid tests are planned. Provider cache hits varied, so the figures do not establish a recurring model-cost reduction. The retained improvement adds no inference requests and removes some verifier input text; baseline inference prices are unchanged.

## Limits and next step

The evidence supports this narrow body-copy fix on the retained cases. It does not establish universal editorial quality. Arabic model output still occasionally mixes the English word “reported” into a headline; this body-only change does not conceal or fix that separate defect. French and unfamiliar paraphrases are unchanged. The Arabic test reused saved editor output with a fresh verifier check rather than claiming a new full Arabic application publication.

The change is local and reviewable. Deploy only after approval; then observe a fresh nonempty English/Arabic window without rewriting old editions. Broader CI work remains a separate task and is not declared complete by these focused checks.

## Code review

An independent coding-agent review identified two important risks before commit: deleting sole report attribution, and a loose Arabic date tail swallowing substantive continuation. The implementation now retains attribution and uses strict month/year matching. Regression tests cover both. This review did not make provider calls or alter sources.

## Focused verification

- Briefing package: 132 tests passed, 22 files.
- Worker V3 window/recovery/publication and runtime tests: 31 passed, two files.
- Briefing and Worker TypeScript checks passed.
- New tests include exact retained copy, substantive-uncertainty controls, source ownership, post-repair re-verification, legacy frozen behavior and paid-operation reuse after interruption.
