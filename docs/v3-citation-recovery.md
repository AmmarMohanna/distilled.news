# V3 invalid article-citation recovery

## Observed incident

The November 1, 18:00 Beirut Arabic Lebanon window completed at 18:02:20 without an edition. One retained editor response selected two items but used publisher IDs instead of the supplied S-number article labels. The other editor chunk selected no items. `parseDrafts` removed unknown references and silently discarded the selected items, so the engine persisted an empty result and never invoked verification. The two settled calls cost $0.066726. This was not UI caching or a quiet editorial selection.

The exact selected response is retained in `packages/briefing/test/fixtures/v3-invalid-publisher-citations.json`. This is evidence of an output-contract defect; the fixture is not a human factual-accuracy approval of either proposed story.

## Minimal correction

For current prompt formats (4 and later), a selected headline with missing or unknown article citations throws `INVALID_ARTICLE_CITATIONS`. Mixed valid/invalid references also fail: unknown citations cannot simply disappear. Publisher IDs are never automatically mapped to articles because one publisher can supply many articles.

The existing `callJson` mechanism makes exactly one corrective request, asking for the complete corrected selection and explaining the citation error. It has a different request identity and uses normal durable spending admission, settlement and provider coordination. A second malformed response throws. No new model stage, transport retry policy, routing change, prompt rewrite, or additional normal-path call was added. Explicit `items: []` remains valid. Frozen legacy prompt formats retain their existing parsing behavior and all existing prompt bytes remain unchanged.

## Recovery guarantees

- The original settled response remains recorded and is not resent or overwritten.
- The corrective call is a separate accounted operation.
- Verification remains mandatory before publication.
- Replaying a successful window creates no duplicate provider call, edition or downstream delivery job.
- Replaying a twice-invalid window reuses the two settled responses; it does not pay indefinitely or persist an empty success.
- Unknown provider outcomes are still handled by the existing durable adapter and its uncertainty fences; this parser change does not catch or retry transport exceptions.

## Validation and rollout

The regression first failed in six cases and then passed. The briefing package has 123 passing tests, including exact retained-response rejection, missing/unknown/mixed citations, one correction, exhausted correction, and genuine empty output. Three focused Worker tests passed against local D1, including the existing publication/citation replay case and two new durable-accounting tests. Broader Worker/typecheck results are recorded in the private execution logs.

No paid inference or shared-staging deployment was performed for this change. The existing 18:00 window already contains a terminal empty result; it is not automatically reopened or erased. Its recovery requires a separately reviewed operation preserving the frozen input, old result, settlements and window identity. Do not claim the historical briefing was recovered merely because the new parser tests pass.

Private incident requests, exact responses and test logs remain in `.local-reports/leb-repeat-nov1/` and `.local-reports/leb-nov1-missing/`.

Final validation: workspace TypeScript checks passed. The full Worker file passed 43/44 initially; the remaining chunking fixture used an out-of-chunk S1 reference. After correcting that fixture to cite the supplied global article label and explicitly omit its off-topic chunk, all four targeted publication/chunking/citation-recovery tests passed. This fixture correction does not change product behavior or assert factual model quality.
