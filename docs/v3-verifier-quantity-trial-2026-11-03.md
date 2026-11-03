# Quantity/timing verifier candidate — real four-call result

## Decision

**Reject this verifier prompt change; keep V4 unchanged.** It still accepted both retained real fund wording errors, rejected more valid controls, and produced unsafe source-association rationales on synthetic controls. Lower observed cost is not a quality improvement. The accounting and information-density editor candidates remain separate and untested; no combined candidate is prepared.

Exactly four GPT-4.1 mini calls ran under the fresh $0.05/two-hour approval. Native exact-request reservations and settled provider charges total **$0.005852**, with $0 held and zero uncertain outcomes. No editor, repair, independent paid judge, publication, deployment or notification call occurred. Existing historical accounting and holds were unchanged.

## Controlled comparison

V4 and the single appended quantity/commitment instruction saw identical frozen inputs, model, temperature 0.1, JSON mode, 1,500-output-token cap and no retries. The English batch contained 12 fixed cases; Arabic contained two. Full relevant original articles and explicitly labelled synthetic sources were supplied. Expected verdicts stayed outside the model requests.

The 14 provisional labels comprise four repairable errors, nine accurate controls and one ambiguous “committed” case excluded from all accuracy comparisons. These are engineering source judgments, not human gold. Synthetic cases test specific distinctions; they are not real-world quality evidence. This was a batch verification test, not a coherent published briefing or a full V3 run.

| Measurement | Frozen V4 | Quantity/timing candidate |
|---|---:|---:|
| Retained real errors accepted | 2 / 2 | 2 / 2 |
| All labelled errors blocked by a non-ok verdict | 1 / 4 | 2 / 4 |
| Targeted error correctly explained in rationale | 1 / 4 | 0 / 4 |
| Accurate controls incorrectly rejected | 5 / 9 | 6 / 9 |
| False repair requests | 5 | 5 |
| False terminal drops | 0 | 1 |
| Exact item-index coverage | Valid | Valid |
| Actual verifier cost, two calls | $0.0030820 | $0.0027700 |
| Summed model-call wall time | 8.768 s | 6.728 s |

The rationale assessment is separate AI-assisted engineering review against supplied sources. A fix/drop verdict alone does not prove detection of the intended error. Counts are limited to these controls and cannot estimate production accuracy.

## Concrete failures and controls

### Both retained errors still approved

Both versions returned `ok` for the exact V6 “up to 5%” fund headline and the exact V4 “roughly 20% ... are now dedicated” text. The primary source specifies a fixed 5% commitment subject to stockholder approval and describes the combined roughly 20% dedication in future tense. The candidate instruction explicitly targeted these distinctions but did not change their verdicts.

### An apparent synthetic gain does not survive rationale review

For the fictional fixed-5% source, the candidate flagged an “up to 5%” item, but its suggested change was **will -> may**, retaining the unsupported **up to** range. This does not explain or correct the intended quantity error.

For a future/approval-dependent fictional transfer described as already completed, the candidate returned `drop` because it was “about a fictional foundation, not Anthropic.” That is a topic/actor objection, not an explanation of future-versus-completed timing. The same objection also caused it to drop the **valid** completed-transfer control backed by its own separate source. Counting the extra non-ok verdict as an accuracy improvement would be misleading.

### Additional false positives

- The candidate rejected the valid Arabic conditional 5% item because it wanted the discretionary 2% escalator added. That is optional elaboration, not a missing qualification needed to understand the selected 5% commitment.
- It rejected “will commit 5% ... if stockholders approve” in favour of “will propose to commit ... subject to approval,” despite the control already retaining the condition.
- It rejected supported future “will be dedicated ... if approved” in favour of “are expected to be dedicated ... if approved.” The source itself uses future language; this is not a necessary factual repair.
- V4 also falsely rejected concise controls, requesting a body that repeated a condition already present in a complete headline or demanding optional historical percentages. Keeping V4 here does not mean those baseline failures are solved.
- The candidate correctly accepted the existing-pledges control that V4 had unnecessarily flagged, but this isolated positive was outweighed by the new Arabic false rejection and false terminal drop.

The genuinely up-to synthetic source passed both variants. The explicitly completed transfer passed V4 but was incorrectly dropped by the candidate. The ambiguous “committed” case was flagged by both but is excluded rather than counted as a success or error.

## Item/source association

Each response returned every expected index exactly once, within bounds, and the application retained the exact index-to-case mapping. No parsing/index-loss bug was observed. However, the candidate's synthetic-control rationales imported an Anthropic-only topic constraint even though the controls cited different fictional source documents and no such relevance decision was requested. This is an observed semantic context/source-association failure under a mixed controlled batch, not evidence of a database ownership bug or proof of its frequency in real production-shaped briefings. No speculative indexing fix is justified by these responses.

## Cost, latency and repair limits

| Call | Input tokens | Output tokens | Actual USD | Model wall time |
|---|---:|---:|---:|---:|
| English V4 | 2,680 | 709 | $0.0022064 | 7.483 s |
| English candidate | 2,732 | 433 | $0.0017856 | 4.860 s |
| Arabic V4 | 2,069 | 30 | $0.0008756 | 1.285 s |
| Arabic candidate | 2,121 | 85 | $0.0009844 | 1.868 s |

Aggregate candidate cost was about 10.1% lower, mostly alongside shorter English feedback. Arabic cost was higher and latency was 45.4% higher in this one pair. These single-sample direct-call times are not full-pipeline latency or robust percentiles. No actual repairs were executed; false repair requests and a false terminal drop are measured verdicts, not measured downstream spending or repaired text. Full-pipeline cost, repair frequency and unsupported claims after repair remain unmeasured. The candidate fails the quality gate regardless of cost.

## Evidence and validation

- Exact four requests, model outputs, token usage, timings, frozen labels and rationale assessments: `benchmarks/editorial-distillation/verifier-trial-2026-11-03.json`.
- Readable verbatim responses: `benchmarks/editorial-distillation/verifier-responses-2026-11-03.md`.
- Original source/case definitions: `quantity-commitment-cases.json` plus the unchanged corpus.
- Private authorization, native grants/reservations/settlements, generation receipts and append-only send journal: `.local-reports/editorial-targeted/verifier-trial-20261103/`.

All four requests completed without truncation or retry. No extra paid calls remain in this four-call authorization. Do not start editor or external-review experiments using its unspent dollar allowance.

## Next action

Retain the deterministic diagnostic and strengthened independent-evidence audit, but do not activate this verifier instruction. Preserve the negative result. Any next editor-accounting or density comparison needs its own fresh bounded authorization. No combined prompt or model-routing change is justified. Further investigation of verifier reasoning/batch context can reuse these exact saved outputs before proposing another paid test.
