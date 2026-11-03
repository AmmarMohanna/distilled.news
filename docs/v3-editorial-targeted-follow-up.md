# Independent editorial improvements — offline follow-up

## Outcome

V4 remains selected. V6 is not promoted. No paid inference or deployment was performed. One runtime change is retained: the diagnostic-only prepared-source accounting audit, documented in [source accounting](v3-source-accounting.md). Three independent prompt candidates are frozen offline; none has demonstrated model-quality gains or is enabled. A combined candidate is deliberately unavailable until independent gains exist.

## 1. Deterministic accounting

New results identify prepared refs absent from both raw editor `items` and `left_out` as `unaccounted`. The retained V6 response yields six gaps, including S13. Some other gaps are optional or off-topic; no importance or irrelevance verdict is inferred. Explicit exclusions and valid empty briefings remain valid. The result field is optional for legacy compatibility, and existing saved results are not backfilled or reinterpreted.

Exact-response replay retains the same requests, calls and selected reader text. A focused local Worker/D1 test confirms the diagnostic persists, publication succeeds and duplicate delivery reuses settled operations. No extra model call, database query, automatic repair or new publication barrier is introduced by the audit. Its local 1,000-iteration microcheck is recorded separately and is not a live latency estimate or throughput qualification.

## 2. Independent candidates

All are single appended instructions against the exact frozen V4 system; input text, model, temperature, JSON mode, token caps and retry settings are held fixed. `auditTargetedPair` rejects drift in any other field or use of a V6 baseline. Existing V4/V5/V6 system text is untouched.

| Candidate | Variable | Status |
|---|---|---|
| `explicit-source-accounting` | Every input ref in items or grouped left_out, with a short reason; exclusions remain allowed | Prepared, not model-tested |
| `useful-information-density` | Main change plus essential evidence; omit optional elaboration while preserving uncertainty/conditions | Prepared, not model-tested |
| `quantity-and-commitment` | Distinguish fixed conditional quantity from up-to range, and future commitment from completed allocation | Prepared, not model-tested |

The source-accounting instruction is not a requirement to publish every source or enumerate every fact. One article can describe several developments; complete article-reference bookkeeping does not establish complete important-news coverage. The density rule does not reward unsupported analysis, more citations or fewer words at any cost. The verifier rule is general, with no company-specific or vulnerability keywords and no deterministic semantic filter.

## 3. Factual error and false-positive controls

`quantity-commitment-cases.json` freezes 14 provisional cases:

- Two exact retained problematic fund outputs: V6's “up to 5%” and V4's completed-present roughly 20% wording.
- Accurate fixed conditional commitments, future totals, announcement-versus-execution language, existing prior pledges, a headline-only update and natural Arabic controls.
- Four clearly labelled synthetic controls using three fictional source documents: genuinely up-to quantities, an explicitly completed transfer, and incorrect range/completion variants.
- One ambiguous use of “committed” with an approval caveat; it is excluded from automatic accuracy rates rather than forced into an error/pass label.

There are four provisional fix labels, nine ok labels and one unresolved case. These are engineering expectations, **not human gold**. Offline tests preserve exact quotations, hashes and the two recorded all-ok product-verifier responses. They do not prove that the new instruction catches the errors or avoids false positives. New isolated/batched verdicts are unmeasured.

The prepared verifier comparison has one English and one Arabic batch for V4 and the candidate: **four calls total** covering all fourteen cases. English batch controls intentionally include identical wording with different cited evidence; verdict/index association must be checked. These are controlled multi-item verification fixtures, not a coherent real reader edition. Expected verdicts and case IDs are stored outside the model input. The ambiguous case is visible to the model but excluded from automatic correct/error scoring.

## 4. Independent evaluator audit correction

The legacy reviewer system text is preserved as `LEGACY_EVALUATOR_SYSTEM`. The updated request explicitly requires exact evidence in missing/unresolved coverage entries. Mechanical audit version `source-evidence-v2` now:

- Requires source evidence for material, problem or unresolved findings, including repetition/wasted-reading claims.
- Requires missing/unresolved coverage to cite a source belonging to that expected development with a nonempty exact quotation.
- Rejects omission findings linked to an unrelated article even when the quoted text exists.
- Retains exact-quotation checks; no whitespace/apostrophe normalization silently turns a paraphrase into a quote.
- Preserves unresolved judgments; reference validity never becomes a semantic truth certificate.

The retained Arabic review, previously marked mechanically accepted despite its evidence-free omission coverage, now fails `COVERAGE_EVIDENCE_REQUIRED`. The retained English paraphrased quotations remain rejected. Offline counterexamples cover empty evidence, invented quotes, genuine but wrong-source quotes, malformed/duplicate output coverage and valid uncertain evidence. Historical review artifacts and original audit results are preserved; the new audit outcome is recorded separately rather than overwriting history.

## 5. Reproducibility and experiment order

Run `corepack pnpm exec vitest run --config benchmarks/editorial-targeted.vitest.config.ts` to reconstruct exact private requests and hashes from the frozen corpus. The offline preparation contains:

- 36 editor requests: baseline/accounting/density for 12 English/Arabic cases. Twelve requests are development comparisons; 24 are reserved-transfer preparation, not execution permission.
- Four baseline/candidate verifier requests, using fixed source-linked examples and identical model settings.
- No combined candidate and no provider executor in this preparation test.

Sources, prior reader text and provisional expectations are unchanged. Reserved sources were inspected previously and are not a genuinely unseen-source holdout.

Suggested first paid stage, only after fresh explicit approval: the **four mini-verifier calls**, no editor reruns or external evaluator needed to score these provisional factual controls. At the public catalogue check on November 3, GPT-4.1 mini remained $0.40/$1.60 per million input/output tokens. The planning upper bound is $0.029904, before final native request admission; a proposed $0.05 cap leaves conservative framing headroom. Pricing, authorization expiry, provider headroom and native reservations must be checked again before any request. No grant was created in this task.

Editor candidates should then be compared independently on development cases, followed by source-specific offline review and reserved transfer for any credible gain. Full-pipeline baseline/candidate tests must include the unchanged other prompts, actual verification and every repair, with one variable changed per comparison. Only after both independent editor candidates show gains should a combined candidate be prepared. Do not infer acceptance from accounting completeness alone.

## 6. Metrics and acceptance

The machine-readable offline summary is `benchmarks/editorial-distillation/targeted-offline-2026-11-03.json`. Actual new calls/cost are **0 / $0**. Candidate semantic quality, model latency, full-pipeline cost, repair frequency, important-news recall, false merges, repetition and unsupported-claim rates remain **null/unmeasured**, not zero. The audit adds zero calls, but no production latency or cost gain is claimed.

Acceptance remains no material factuality, grouping or important-development recall regression, with meaningful useful-understanding gains and at most 10% measured full-pipeline cost/latency increase. Count editor, verifier, repair and recheck together; separate external evaluation overhead. Do not extrapolate quiet/normal/saturated recurring cost from one batch. The normal product model-call sequence and the existing isolated performance campaign are unchanged.

No prompt candidate is retained in active routing, and no production, ordinary staging, live feed data, accounting history or notification settings were changed.

## Validation

155 briefing tests passed across 34 files; briefing and Worker TypeScript checks passed. The focused Worker/D1 publication, diagnostic read-back and duplicate-delivery test passed (one executed, 51 unrelated cases deselected). Offline preparation and strict request-pair audits passed. These tests validate bookkeeping, immutable evidence and experiment isolation; they do not measure candidate semantic quality. Original failed development-test logs and final passing logs remain private under `.local-reports/editorial-targeted/` and `.local-reports/v6-comparison/`.
