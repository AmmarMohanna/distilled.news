# V2 article-first understanding

Implemented on `feat/parallel-cloudflare-event-reconciliation`, starting from
`4e02e8f`. No deployment, merge, routing change or external publication.

V2 now gives its existing semantic construction call the complete original title,
body and revision metadata, including publication time and source identities.
It does not run deterministic sentence-claim extraction or eligibility filtering
before that call. No additional extraction model call was added.

## What changed

`source-passages.ts` indexes exact title/body paragraphs without determining
meaning. A paragraph may contain several sentences, quotations or developments;
it is a reference anchor, not an atomic claim or event boundary. Sources with no
paragraph breaks remain complete: a title reference and a body reference. The
existing multi-destination construction format lets the model associate one
passage with several independent developments rather than forcing a false merge.

The model interprets attribution, modality, conditions, timing, quantities,
negation, background and occurrence identity from the article. Construction
receives no regex role, certainty or attribution hints. Lexical retrieval still
orders existing event candidates; it does not decide their semantic identity.
Independent review of consequential event relationships remains mandatory.

All-background/no-development answers are accepted only for the neutral passage
path with complete reference coverage. They complete intake without invented
events. This also works through packet continuation and development-level
reconciliation. Existing bounded repair, packet concurrency and reconciliation
are reused; there is no new orchestration framework.

V2 also skips the preliminary JEV relation/effect stage. No JEV call per sentence,
claim or article has been added. Construction still makes semantic identity and
epistemic-effect decisions; knowledge remains distinct from publication memory.

Canonical persistence selects this source index using the prepared matchers.
It retains AI-assigned passages even if their text would match an old teaser,
promotion or question regex. New construction replaces prior ownership for the
same revision rather than carrying old sentence claims back into the current
event. Historical propositions and receipts remain retained. Evidence from
other supporting revisions remains available.

## What remains, and why

`claims.ts` remains for historical receipts, legacy non-V2 behavior and shared
span/record types. `ClaimMention` and `Proposition` are existing storage/reference
formats; their names no longer imply sentence extraction in V2. Neutral records
carry unspecified compatibility fields, not inferred certainty or attribution.
Those placeholders are not supplied as semantic hints to construction.

Source content, coordinates, content hashes, provenance, source ownership,
canonical ID validation, CAS fencing, leases, retries, paid-operation recovery,
editorial coverage checks and publication verification remain. Exact source
passages become source-grounded propositions, and the existing editorial step
interprets meaningful facts and selects source subspans. Construction does not
ask the model to rewrite facts or generate unnecessarily atomic sentences.

Reference coverage proves no source text was removed by preprocessing. It does
**not** prove that the model notices every important fact or selects the correct
event. A shared passage is evidence, not a claim that all its facts belong to
each development; editorial and factual verification still must interpret the
source accurately. Those semantic quality obligations are not replaced by span
or schema validation.

## Retained-evidence evaluation

See [sanitized measurements](../benchmarks/results/article-first-2026-10-21.json).
The same immutable Laplace, Replit and Anthropic corpus was used, with evidence
hash `d8651e44c878a0738b3b5d5fc5ad4d7f330e3b43d18b279c9e30ba3c109f77c6`.

| Source | Original sentence units | Originally prefiltered | New references | Non-whitespace source coverage |
| --- | ---: | ---: | ---: | --- |
| Laplace | 48 | 0 | 2 | Complete |
| Replit | 32 | 0 | 2 | Complete |
| Anthropic | 9 | 0 | 2 | Complete |

These saved bodies have no blank-line paragraph boundaries. All qualifiers and
cross-sentence context remain in their original body reference. Offline schemas
have 25 enum entries per source, below the 1,000-enum limit. This removes the
sentence-classification dependency and reduces reference bookkeeping; it is not
evidence of better model accuracy, lower inference cost or faster publication.
The original extractor did not filter units from these particular three sources.

Controlled multilingual and multi-sentence tests include an apparent promotional
lead followed by substantive conditional reporting, a question title, Arabic and
Chinese negation, shared passage ownership and altered-source rejection. These
are honestly labeled synthetic integrity tests, not paid multilingual model
qualification or human-reviewed news labels.

The revised mini pipeline was run within the original $3/60-call/four-hour
authorization, using an isolated local database and the same evidence:

| Mini path | Actual calls | Actual cost | Terminal wall time | Validated persisted briefing |
| --- | ---: | ---: | ---: | --- |
| Original sentence path | 3 | $0.0227628 | 46.213 s | No |
| Revised article-first path | 4 | $0.0161624 | 39.908 s | No |

The revised run encountered duplicate local group IDs, used a bounded repair,
and then failed independent event-identity review. Retained raw responses and
diagnostics were used; no investigation was restarted from reacquisition. The
speed/cost of a failed run is not an optimization success. No reader text reached
successful verification/persistence, so improved final briefing accuracy,
completeness, novelty handling and reliability are **unproven**.

The specialized revised run was rejected by the account reservation guard before
provider execution. Ledger lookup confirmed no reservation, and the original
local intent explicitly records `providerRequestSent=false`. That intent was
preserved as a pre-send rejection; no financial record or hold was released.
Other account activity had consumed the active grant's exposure allowance. No
grant was extended or altered. The revised specialized comparison therefore has
zero actual model calls and no performance/quality result.

The combined original plus revised comparison ledger has **36 settled calls,
$0.215928029 actual cost and zero unsettled comparison operations** as of
14:42:56 UTC, 21 October. Local application attempt counters can include the
rejected admission; actual-call measurements above use matched sent-operation
receipts and the remote financial ledger.

## JEV availability investigation

The earlier ordinary chat-model catalog query was insufficient to establish JEV
availability. A read-only public request to
`/api/v1/models?output_modalities=decisions` at 14:47:04 UTC returned both
`typesafe/jev-1.13` and `typesafe/jev-1.14`, 262144-token context and advertised
$0.042/M input, $0 output-token pricing. No paid JEV request was made.

[OpenRouter's JEV documentation](https://openrouter.ai/docs/guides/community/jev)
describes the separate Decisions API and typed choice/probability/score output.
That makes it a possible narrow same-occurrence/equivalence challenger, not a
substitute for article understanding or proof of factual correctness. Actual
news-quality calibration, endpoint compatibility and paid accounting remain
unqualified. V2 does not automatically invoke it.

## Verification

61 focused worker regression tests passed, including migration, no-development,
continuation/restart, corrections, publication memory and legacy compatibility.
The retained-source integrity benchmark also passed. Both worker and comparison
TypeScript projects passed. Independent code review's three findings were fixed
and covered by regressions. These checks establish tested mechanical behavior,
not real-model editorial quality.

From `apps/worker`, run the source-passages, semantic-preparation,
semantic-continuation, semantic-persistence, semantic-state, claims,
development-reconciliation and construction-minimal test files. From the root:

```text
node apps/worker/node_modules/typescript/bin/tsc --noEmit -p apps/worker/tsconfig.json
node apps/worker/node_modules/typescript/bin/tsc --noEmit -p benchmarks/tsconfig.v2-configuration.json
node apps/worker/node_modules/vitest/vitest.mjs run --config benchmarks/article-first-evidence.vitest.config.ts
```

The evidence benchmark skips when private saved sources are absent. Paid runs
require the existing explicit authorization flags, an unexpired approved manifest
and successful atomic account admission. The revised runner uses distinct
`-article-first` operation identities and local databases; it does not overwrite
the original comparison responses or promote old-model verdicts across contracts.

**Conclusion:** the semantic preprocessing limitation is removed in V2, with
mechanical grounding retained. Better end-to-end briefing quality has not yet
been demonstrated, so staging remains unchanged.

## Real inference follow-up — 21 October 2026

Real OpenRouter inference subsequently reached verification and private local persistence, but independent source review found repetition, omitted important terms and temporal errors. A fresh paragraph-indexed run also exposed a genuine Anthropic-to-Replit false identity decision in the independent reviewer, stopped by canonical commit. This does **not** establish better briefing quality or qualify deployment. See [the real evaluation and retained-response diagnosis](v2-article-first-real-evaluation.md).
