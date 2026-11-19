# Funded validation of briefing accounting and quality fixes

19 November 2026. Branch `fix/briefing-accounting-and-quality`, starting at `e4825675`.
User authorized a new **$5 maximum** for live validation, fixes and tests. No deployment was authorized or performed.

## What ran

Actual GPT-4.1 requests through OpenRouter, using the existing qualification runner and append-only financial journal. Two retained production windows (Lebanon in Arabic, AI Industry Watch in English), their original eligible sources, reporting boundaries, reader histories, V4 editorial routing and source-binding verifier were used. These are exposed failure cases, not an independent test set. Original published results and failed evaluator records were preserved.

Exact settled responses were reused only when model, system, user, output allowance and schema matched. Changed requests received separate identities. There were three versioned runs: initial qualification, diagnosed-fix follow-up, then final review/claim-inventory checks. Every failed attempt remains in the artifacts.

| Result | Original retained publication | Candidate generation |
|---|---:|---:|
| Lebanon stories / whitespace-delimited words | 3 / 127 | 3 / 72 |
| AI stories / whitespace-delimited words | 1 / 147 | 6 / 584 |
| AI explicit update links | Not measured here | 2 |
| Lebanon unaccounted sources | 91 revisions withheld with the failed original batch | 53 sources explicitly carried forward in the new generation |

The source counts above come from different model responses, so their difference is **not** a controlled estimate of the recovery policy's effect. The preceding exact-response replay separately established recovery of valid selected drafts without paying for changed downstream requests.

The AI candidate retained the Microsoft coding-model and supply-chain dataset stories previously removed by consolidation. It also retained other developments and linked Gemini and chip-design updates to prior items. This came with substantially longer output. A launch-led Gemini headline still does not foreground its delta. More stories and explicit update metadata alone do not demonstrate better distillation or absence of repetition.

## Live-discovered defects and fixes

- **Incomplete novelty decisions:** AI initially failed safely after two replies assessed only one of six drafts. Explicit-link requests now put the contract in the system message, enumerate required indices and enforce response count/shape at the provider boundary. The same actual engine input then completed with six items. Legacy frozen requests retain their previous bytes.
- **Reader-item/citation ambiguity:** The first correction duplicated item zero instead of assessing all five items. Another claimed an attached citation was missing. V4 requests now explicitly map every reader index and citation attachment; corrections additionally enumerate adverse concern-resolution requirements. Neither attachments nor mappings force a supported verdict.
- **False omission:** An initial candidate review marked the drug-raids development omitted despite item one covering it. The revised mapped review recognized D9 as covered. This is one corrected observed failure, not a measured general false-positive reduction.
- **Reservation/schema mismatch:** History-audit admission previously counted the generic schema rather than the actual history schema. Admission now includes the same schema used by the provider request; a regression reproduces the mismatch and verifies its repair.
- **Accounting visibility:** Qualification outcomes now expose actual paid usage even when generation throws. Future provider generation headers are retained when available. Previous paid and UNKNOWN records are unchanged.

## Evaluator outcomes, including failures

The retained missing-item assessment's first new correction failed with `DUPLICATE_ITEM`; the mapped follow-up passed validation. The retained citation contradiction did **not** achieve a valid correction: initial output remained contradictory, and two later outputs cleared the prior concern without the required explicit resolution explanation. They remained rejected; no historical failure was changed to a pass.

Candidate diagnostics used the same previously grounded, candidate-blind inventory. It is a **partial retained-input inventory**, not an independently verified exhaustive reference set.

| Candidate diagnostic | Completed extracted-claim support / citations | Conservative inventory coverage | Qualification |
|---|---|---|---|
| Lebanon, latest mapped review | 3/3 supported, 3/3 cited | 2/8 covered; uncertainty bounds 2/8–5/8 | Three history disagreements; independent extraction audit flagged one possible inventory mismatch |
| AI, completed pre-mapping review | 6/6 supported, 6/6 cited | 5/7 covered | Only six extracted claims despite much richer prose; claim completeness not established |
| AI, final mapped review | **Failed: connection interrupted** | Not measured | UNKNOWN provider operation; no automatic replay |

The Lebanon audit objected that an extracted earthquake claim included 2026 while the reader text gave only day/month. This is an audit warning about representation, **not** a verified false published claim or a proven omitted reader fact. It is preserved as a possible audit false positive. History diagnostics also disagree on whether the army statement is substantively new; prior reader text contains a known historical role error, so matching broad roles/topics cannot establish event identity.

No 100% support score above certifies factual correctness: all are conditioned on model-extracted claims; inventories and judgments remain fallible. No accuracy/F1, statistical superiority, or population-wide quality claim is justified by these two windows. Original negative research findings remain valid.

## Financial result

- **35 new dispatches: 34 settled, one UNKNOWN.**
- Confirmed settled receipts: **$2.130978**.
- New unresolved conservative reservation: **$0.658358**, not a confirmed charge.
- Maximum current campaign exposure: **$2.789336 / $5**.
- Unspent authorization after reserving uncertainty: **$2.210664**.
- Settled tokens: **998,753 input; 33,196 output**. UNKNOWN usage is unavailable and excluded from these token counts, not treated as zero usage.
- Historical **$0.012416** hold remains separate and unchanged.

UNKNOWN operation `9465782a-70c8-4017-ba23-bde98988b678`, request SHA-256 `f162b3d08c9e43fff6badd212607aeb86c9f3ede60f69fc84d875acae54f725e`, received HTTP 200 headers before its body connection terminated. No complete response or generation ID was retained, so receipts cannot currently reconcile its cost. The reservation remains held and the campaign stopped. Do not resend this ambiguous operation.

Generation execution times included exact historical-response reuse: Lebanon 49.084 s initially and 5.041 s for the narrowed follow-up; AI 24.806 s for the failed attempt and 92.863 s for the successful follow-up. These are **not cold full-pipeline latency estimates**. Individual paid-request costs, latency, generation IDs, token usage and hashes are in `measurements.json`.

## Product reads, tests and CI

After a transient local network interruption, read-only checks returned HTTP 200 for both production feeds and staging Lebanon. Production latest editions remained 10:00:28 UTC (Lebanon) and 10:11:47 UTC (AI); staging Lebanon had reached 13:30:22 UTC. This confirms current read availability, not execution of the undeployed candidate.

- Engine: **514 tests passed**.
- Evaluator: **160 tests passed** on the complete final rerun.
- Changed engine/evaluator/Worker TypeScript checks passed.
- One evaluator run was disrupted by a host interruption: six timeouts and one cascading duplicate-fixture failure; the unchanged suite then passed. No assertions or timeouts were weakened.
- GitHub on preceding commit `e4825675`: Briefing evaluation passed; Project checks failed before application tests in three browser-dependent jobs because Ubuntu APT index retrieval failed during Playwright dependency installation. Other listed fixture jobs passed. This is an observed CI environment failure, not a confirmed code regression. New-head CI is recorded separately by GitHub.

## Reproduction and evidence

Run the existing runner against each frozen private run directory, once only:

```text
node <bundle-of-evaluation/briefing-quality/qualify-source-bindings.ts> run <new-frozen-run-directory>
node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts
cd packages/briefing
node node_modules/vitest/vitest.mjs run
```

Private immutable requests, responses, original snapshots and run plans are retained under `.local-reports/integration/live-fixes{,-followup,-final}-20261119/`. Do not rerun those started directories. `measurements.json` records plan/case/journal/outcome hashes, source snapshot hashes and sanitized financial receipts. Raw articles, account secrets and private operational payloads are not committed.

## Decision

**NO-GO for claiming all quality issues are solved or enabling this candidate automatically.** The incomplete-novelty failure is repaired and the AI selection loss is demonstrably reduced in this case. However, Lebanon still carries 53 unaccounted sources, factual-claim completeness remains uncertain, the citation correction is not reliable, and the final AI assessment is unresolved. No deployment or additional paid retry was performed. The shortest safe next step is receipt reconciliation and staging qualification of the candidate under separate deployment approval, while treating editorial/evaluator warnings as unresolved rather than hiding them.
