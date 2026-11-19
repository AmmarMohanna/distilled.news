# First measured cost reduction candidate

## Decision

Implement **lossless reader-context referencing** as an opt-in candidate, not an activated release. No additional inference, deployment, merge, financial reconciliation or historical record rewrite occurred. The qualified release remains `eb9275fd`; this work is isolated on `perf/briefing-verification-payload`.

The proposed 50% total-cost target is **not demonstrated**. The current change reduces serialized input; actual billed-token, dollar, model-accuracy and cold-latency changes require a separately authorized paired live qualification. Reference resolution is mechanically lossless, but models can still misuse context; passing mocks cannot establish semantic non-inferiority.

## What actually costs money

Successful execution stage receipts, including exact previously paid responses reused in the completed engine run:

| Stage | Arabic Lebanon, 5 stories | English AI, 9 stories |
|---|---:|---:|
| Editor | $0.158434 | $0.141508 |
| Consolidation | $0.011692 | $0.017412 |
| Novelty | $0.032008 | $0.064212 |
| Reader assertion inventory | $0.018634 | $0.053042 |
| Independent source identities | $0.029370 | $0.147210 |
| Source-bound verification | $0.084850 | $0.312502 |
| **Total** | **$0.334988** | **$0.735886** |
| Model calls, including historical reuse | 7 | 14 |

Verification plus its two inventories costs $0.132854 (39.7%) and $0.512754 (69.7%). The earlier informal English estimate of 64% was incorrect. Historical receipts reflect their actual provider billing/cache conditions; these are not new cold-run quotations or representative production averages. Acquisition, separate evaluator, infrastructure, previous failed attempts and unresolved campaign operations are excluded, not assigned zero. Earlier campaign records and holds are unchanged.

## Root cause and implemented change

Each normalized reader facet repeats its complete original headline/body in `claim`. The same text already appears in `items`. All 73 Arabic and 239 English verification facets in these successful requests repeat their associated unit exactly. Repeated context inflates input without adding evidence.

With frozen `verificationInputPolicy: reader-unit-context-v1`, only an **exact** full-unit claim becomes `claimUnit: I<n>.H/B`. Explicit instructions resolve that reference to the full original headline/body before judgment. Facet quote, ID, item/unit, kind, identity/role metadata and all complete sources remain. Nonidentical claims or invalid/mismatched unit associations remain literal. Internal facets, required response schema, proof count, citations, adverse-finding checks, output allowance, model and stages remain unchanged.

Old snapshots without this marker retain the original system/user/schema bytes. New preparation can opt in only when both `BRIEFING_SOURCE_BINDINGS_ENABLED=true` and **`BRIEFING_COMPACT_VERIFICATION_ENABLED=true`**. The latter is absent from deployment configuration and therefore off. Redelivery and unstarted-input recovery use the frozen marker, not the current flag. Do not enable it before live qualification.

## Offline measurements on retained real requests

| Measurement | Arabic | English |
|---|---:|---:|
| Verification user JSON characters, original | 53,461 | 270,895 |
| Verification user JSON characters, compact | 38,699 | 175,747 |
| Verification input characters including system and schema, original | 103,573 | 443,449 |
| Verification input characters including system and schema, compact | 89,348 | 349,912 |
| Affected verification-input reduction | **13.7%** | **21.1%** |
| All execution input characters, original | 414,783 | 1,046,365 |
| All execution input characters, compact | 400,558 | 952,828 |
| All-stage input reduction | **3.4%** | **8.9%** |

Characters include unchanged response-schema serialization and the added reference instructions. They are not token counts. The transport's constant wrapper is excluded from both. `MEASUREMENTS.json` also records UTF-8 byte counts, stage receipts, request hashes and source-payload equality checks. These two exposed windows are development evidence, not an independent test population. No claims, source passages or output proof obligations were removed to obtain these reductions.

## Verification and next gate

- 534 engine tests passed under both the normal configuration and a two-worker rerun, including seven new multilingual round-trip/wire/negative-verdict tests and five receipt/outcome tests.
- Three targeted worker tests passed: default-off gating, snapshot fingerprint/evidence preservation, and both default/compact paid-operation redelivery with flag changes.
- Full publication/recovery suite: 117/117 passed. Two additional parameterized stale-snapshot recovery cases passed separately, preserving both legacy marker absence and compact marker presence under flipped flags. The original predecessor remains unchanged.
- Engine and worker typechecks passed. Review found and resolved a reporting P2 (settled calls did not establish engine success); its negative cases failed before the fix and passed after it. Final review found no remaining important issue.
- One heavily concurrent engine run hit five five-second test timeouts. Removing unnecessary test subprocess launches and rerunning both limited/default configurations produced 534/534 passes without changing assertions or timeouts. The Windows PowerShell wrapper returned 1 for the full worker log's expected stderr warnings, while Vitest reported 117/117 passed; CI is authoritative for cross-platform runner status.
- Additional paid calls and additional cost: **zero**. Existing UNKNOWN operations and financial holds remain untouched.

Before activation, compare default and compact verification on identical retained inputs, preserving separate request identities and all original receipts. Require no new unsupported identity/quantity/modality acceptance, lost adverse findings, missing citation checks, validation failures or material coverage loss. Measure actual input/output tokens, charges, completion and latency; report failures and disagreements. Do not claim a fixed dollar saving from character ratios. Source-only identities must remain candidate-blind.

Further savings should target measured repeated evidence and source-identity work with exact evidence/model/policy invalidation, and verified narrower routing where qualification supports it. Those are **not implemented or authorized for paid testing** here. Removing verification or pruning factual obligations is not this optimization.

## Reproduce without inference

From repository root, using the retained ignored evidence directories:

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/analyze-generation-cost.ts .local-reports/integration/go-final-20261119 lebanon-current
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/analyze-generation-cost.ts .local-reports/integration/go-approved-20261119 ai-current
```

The analyzer validates request hashes and provider/historical cost receipts, rejects unresolved/local-reuse cases it cannot reconcile, and prints only stage metadata and sizes. It makes no network requests and does not write records. Raw source evidence stays private; shared sanitized measurements enable arithmetic verification without exposing reader/source payloads.
