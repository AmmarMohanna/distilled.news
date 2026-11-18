# Language-independent source-bound verification candidate

**Latest beta follow-up:** V2 fixes the unusable inventory interface with deterministic reader/evidence bindings and independent source-only person/role extraction. The final 14 development controls pass, but a full-engine Aoun replay still withholds the story after contradictory review/repair. **Global activation remains NO-GO.** New campaign cost $2.4846556 of $5, historical unknown hold $0.012416 preserved. See [beta results and remaining blocker](../evaluation/briefing-quality/reports/beta-source-bindings-20261118/REPORT.md). Earlier V1 implementation and negative qualification below are historical; their artifacts are unchanged.

This supersedes adding further Arabic name/role exceptions. Implemented on `fix/briefing-identity-and-evaluation`; not deployed or enabled. Initial implementation used no paid inference; the separately authorized qualification below has now run. This is a new verification contract, **not a demonstrated improvement in model accuracy**.

**Real-model follow-up (2026-11-18): NO-GO.** The subsequently authorized $2 qualification completed ten paired cases: the candidate produced zero usable factual assessments because inventory validation exhausted its correction. All six valid controls were withheld. A targeted missing-span diagnostic follow-up also failed, then stopped on an uncertain provider response. Known cost $0.0284192 plus $0.012416 unresolved reservation. Keep the flag disabled. See [the full qualification](../evaluation/briefing-quality/reports/source-bindings-20261118/REPORT.md); earlier statements below describe the pre-qualification implementation, not current empirical results.

## Actual execution

The existing V3 engine/V4 editor, models, source accounting, novelty, targeted repair, supported-core coverage gate and publication transactions remain. For a new frozen input with `identityFidelityPolicy: source-bound-claims-v1`, its verifier batch uses:

1. **Reader-only facet inventory.** The existing verifier model receives every complete headline/body, independently of evidence, reader history and earlier judgments. It extracts atomic factual facets, with complete actor identities, roles, actions, places, amounts/units, dates, attribution, negation and uncertainty. Exact reader spans bind each facet to the actual text.
2. **Source-bound assessment.** The same configured verifier model receives the full reader text, frozen facets and original cited source title/body. It assesses every facet against exact source quotations, independently checks whether the inventory missed substantive assertions, and assesses each attached citation. Prior text may establish repetition only, never facts.

This is separation of requests and information, **not independent model-family corroboration**. Both stages remain fallible model judgments. The engine requires repair or withholding for contradictions, unsupported/uncertain facets, and incomplete/uncertain inventories. Healthy siblings remain publishable. Repaired prose gets a new reader-only inventory and full verification; old facets cannot authorize altered text.

## What code can and cannot establish

Code enforces exact reader/source quotations, no unexamined reader text, valid item/facet identities, every assessment exactly once, citation membership, accounting for each attached citation, and consistent top-level decisions. It cannot prove that a quoted passage entails a claim or that a model split all compound assertions correctly. Character-span coverage is explicitly **not semantic claim completeness**. A whole paragraph labeled one atomic facet can satisfy mechanical coverage; the second assessment must catch that error, and could miss it. This remains an empirical qualification question.

No name-length limit, Arabic role dictionary, surname-presence shortcut or office-holder table is used in this path. Legitimate translations, multi-token names and aliases are semantic evidence questions rather than string equality requirements. The parser does not automatically repair identities or promote uncertainty to support.

A top-level `ok` cannot mask negative facet decisions, incomplete inventories or textual issues. One bounded unusable-output correction per stage is inherited from `callJson`. Within the same unchanged assessment, correction cannot upgrade an originally adverse facet/item to approval. A genuine prose repair is a distinct request/input and must be re-inventoried. Unknown provider/payment failures propagate rather than being mistaken for malformed output. Exhausted received-output failures become unresolved affected batches, use existing bounded repair/withholding, and cannot produce a false QUIET result.

## Frozen rollout and costs

`BRIEFING_SOURCE_BINDINGS_ENABLED=true` selects the new policy for **new** product snapshots. The marker is part of their fingerprint and paid request identity. The flag was not added to staging or production config and has not been enabled anywhere. Retained old snapshots keep original request bytes and their previous policy. The Arabic heuristic remains only for those legacy inputs and the disabled fallback; it is bypassed entirely by the general candidate.

Normal verification changes from one request to two per batch. A simple edition with one editor and no other optional stages therefore changes from two calls to three. Repairs repeat both general verification steps. Worst-case output limits are 6,000 inventory tokens and 8,000 assessment tokens per request; these are response bounds, not measured consumption. Each stage has at most one unusable-output correction. All calls use the existing durable operation, receipt and spending machinery. No new model, transport, separate financial ledger or provider retry policy was added.

Actual additional paid cost, latency, semantic miss rate and false-positive rate are **unmeasured**. The extra inventory request omits sources, but the assessment output is larger than the old yes/no verifier; a lower cost cannot be assumed. No claim that this is worth its overhead is made before funded, versioned qualification on retained development cases and independent controls. Account funding alone is not financial authorization.

## Evaluator

The current claim-inventory audit is language-independent. It checks item presence mechanically and retains `not_independently_established` unless the separately enabled semantic audit assesses whole reader-text completeness. It does not infer completeness or source support from an Arabic regex. Old Arabic diagnostics are explicitly named `auditLegacyArabicClaimInventory` and remain available only for historical fixtures/replay. Original reports, scores, paid responses and rejection states are unchanged.

The existing optional independent completeness request compares full reader text with extracted claims, blind to their support verdicts and scores. It can identify a missing identity, quantity or qualification across languages, but cannot validate factual support by itself. A model-complete result remains `model_checked_not_certified`. The original false pass extracted the wrong name and judged it supported: completeness alone would not solve it. The new publication evidence-assessment contract must still demonstrate better semantic judgments in real calls.

## Verification and limits

Offline tests cover full-text inventory binding, complete multi-token identities, multiple languages and paraphrases, overlapping factual facets, quantities/negation/time, fabricated or unattached quotes, unchecked citations, missing/duplicate decisions, inconsistent approvals, preservation of adverse judgments, provider failures, malformed-output isolation, re-inventory after targeted repair, withholding and healthy siblings. These are parser/orchestration/control tests with recorded or mocked responses, not real-model accuracy measurements.

A local D1 integration test confirms new-policy fingerprinting, three durable accounted stages, and no additional model calls on duplicate publication delivery. Existing V4 replay parity remains verified. Full old evaluator replay preserves all four original outcomes; it tests historical compatibility, not the unperformed new model campaign.

Verified locally for this change: **466/466** briefing tests (22 for the new contract), **145/145** evaluator tests, **3/3 targeted** V3-window integration tests (109 other cases skipped in that targeted invocation), and briefing/application-Worker/evaluator-Worker typechecks. The previously completed full durable-window suite is historical evidence; it was not rerun in full for this disabled candidate. These counts are software verification, not model accuracy scores. GitHub CI is reported separately.

```sh
pnpm --filter @distilled/briefing test
pnpm exec vitest run --config evaluation/briefing-quality/vitest.config.ts
pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/v3-window.test.ts -t 'freezes .* into a distinct input|opts new windows into general'
pnpm --filter @distilled/briefing typecheck
pnpm --filter @distilled/worker typecheck
pnpm exec tsc --noEmit -p evaluation/briefing-quality/worker/tsconfig.json
```

Before enabling: qualify both production Arabic failures plus multilingual valid controls through real requests under a separately approved finite cap; inspect original and corrected responses, abstentions, false positives, missing facets, settled costs and latency. A semantic model can still approve an unsupported assertion even with exact source quotes. No claim of universally correct or failure-free publication is justified.
