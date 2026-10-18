# Revision-2 AI-assisted review receipt - 18 October 2026

**Status: design refinement only. No implementation, paid inference, deployment, or remote mutation authorized or performed.** Work remains on `backend-validation-contract`. This receipt records the supplied review; it does not certify any edition or model accuracy.

## Evidence received and locally checked

The later review reports complete inspection of REVIEW, sources, drafts, specification, implementation plan and label contract. Its provenance is **AI_ASSISTED**, unblinded, with prior audit exposure. It supersedes the earlier incomplete review only as a separate, stronger reviewer account; it does not become independent human gold.

All six supplied file SHA256 values and the original packet manifest SHA256 match the preserved local revision-2 bundle:

| Artifact | SHA256 |
|---|---|
| REVIEW.md | `f96b9b7467f62037710a3a99ccd22f948b1e5c0bab4e954a4b929c06a943bd10` |
| sources.md | `4ef70245899c6e53656566b454dca6467cd0620d90bd39fb292d63937458384a` |
| drafts.md | `ecab91c7ff980555ae1c5cecb67786bba3fd412790d9265247203697d034f116` |
| SPECIFICATION.md | `a7ffd9155a48ca9a98cc37ec22e841d34da6cfa7ba7d4ddc9e3338dfc6a2397c` |
| IMPLEMENTATION_PLAN.md | `f621ab83b90fc4bdb1e7f894f1f19557901d94713a99fb07cdad221cef2ca918` |
| LABEL_CONTRACT.md | `fdcb214cbadf2ee6ebbb52c75aeb3005ef15f0373cd9a5482d3873e8e5a7a833` |
| Original packet manifest | `2dc94a09d68ca6829d4d6d9b7b27a86718ef5c0185137d7af3d3d7fc5b02e5c9` |

These identify the previously delivered revision 2, not the subsequently refined revision-3 documents. Originals and blank templates remain unchanged.

The visible S01 source witness E08 `[23710,23823)` and reader witness D01S02 `[4606,4688)` reproduce exactly after CRLF-to-LF conversion, with Unicode code-point offsets. They do not reproduce at those offsets against the raw CRLF text. Both supplied story-scope hashes also reproduce: D01S02 `ffc06674481f3d83c706c4315f4b6ae95e40577defc8cef5a44ae0833f77312c`; D02S02 `76f24e7881d1ec339330972f63eb966303b6ac8e9534578641fcb234ff5328c9`. Serialization is UTF-8 of LF-normalized section content after its heading newline through immediately before the next section heading, retaining whitespace. This is an explicit review-artifact coordinate profile, not a change to runtime draft/evidence identity.

S01's generic scope note about a missing proposition does not establish omission: the visible Panay assertion survives and its precise timing remains unresolved. Only actual requirement/communication records can establish a coverage failure.

**Import limitation:** the pasted JSON stops inside S01 and is not a valid complete JSON document. The named complete and batch `PUBLICATION_VALIDATION_LABELS_R2_*.json` files were not found in the available workspace. No complete witness-label file was imported; the claimed 237 validated witness occurrences remain reviewer-reported, not locally verified. Do not manufacture the absent records from this summary. A complete answer file or valid complete chunks are needed for full import validation.

## Reported case outcomes (not semantic verdicts)

| Dataset | Case-specific positive | Negative | Unresolved |
|---|---:|---:|---:|
| Saved S01-S25 | 17 | 4 | 4 |
| Controls T01-T24 | 11 | 12 | 1 |

These are reported reviewer judgments, not runtime decisions, error rates or edition certification. For saved-case regression triage, a confirmed error in either original or repair makes the aggregate case negative. Preserve draft-specific outcomes: S12's repaired legal scope is communicated even though the original fails coverage.

| Saved cases | Reported judgment / reason |
|---|---|
| S01, S25 | Unresolved: precise event dates not established by Thursday/report timestamps. |
| S02 | Positive: interview venue optional; substantive position survives. |
| S03 | Positive: Bee price survives; competitor comparisons optional. |
| S04, S06, S11, S13 | Positive: navigation publication metadata is not a news requirement. |
| S05 | Positive: dollar estimate/uncertainty survives; GBP conversion optional. |
| S07 | Positive: owner-reviewed 10,000+ rendering; not a general plus-bound rule. |
| S08 | Positive: precise $74.99 body consistent with rounded $75 headline. |
| S09 | Positive: quotation words/attribution survive presentation changes. |
| S10 | Negative: Thursday data release assigned Friday report date in both drafts. |
| S12 | Negative: original omits material legal scope; repair restores that coverage. |
| S14 | Unresolved: 320+ versus strict over 320 needs notation evidence/policy. |
| S15 | Positive: over two days expresses duration. |
| S16 | Negative: independent Meta development absent; retain pending material work. |
| S17 | Unresolved: explicit release year not established by selected proposition. |
| S18 | Negative: repair assigns Davies-Jones advice to Bertin. |
| S19 | Positive: section-heading number need not be repeated. |
| S20 | Positive: terminal quotation period presentation; attribution remains separate. |
| S21 | Positive: quote typography/original and faithful paraphrase/repair. |
| S22, S23, S24 | Positive: accolade, old view count and prior release year optional. |

Control positives: **T01, T02, T05, T07, T10, T11, T12, T13, T18, T19, T21**. Negatives: **T03, T04, T06, T08, T14, T15, T16, T17, T20, T22, T23, T24**. **T09 is unresolved**: a report timestamp licenses report time, not the outlet type "newspaper". This differs from the earlier positive control label. Preserve the original fixture/label and the disagreement; a future fixture saying "report" requires a new version/digest. T08 preserves a true road sentence while omitting a required bridge closure.

## Design refinements and remaining gates

The [specification](../docs/superpowers/specs/2026-10-18-publication-validation-contract-specification.md), [label contract](../docs/superpowers/specs/publication-validation-label-contract-v2.md) and [implementation plan](../docs/superpowers/plans/2026-10-18-publication-validation-contract-implementation-plan.md) now require:

- Proposition-level requirements with parent fact/revision/span mappings. Mixed sentences cannot make S03's supported price or S05's supported dollar estimate appear omitted when only optional context is absent.
- Separate case, draft and edition scopes; any-version-negative regression aggregation never substitutes for per-draft adjudication or whole-edition verification.
- Explicit witness coordinate/scope serialization and versioned label disagreements, preserving all original artifacts.
- Unchanged exact security/provenance gates, protected corrections, whole-claim plus fact-level verification, conservative conflict/unavailable-verifier handling, immutable operation identity, accounting and CAS/lease fencing.

The full AI-assisted label file still needs import checks. Independent human specification/plan approval, a representative independently labeled holdout, actual compatible semantic verdicts including positive ACCEPT examples, and a separately budget-authorized controlled staging test remain separate gates. Current semantic accuracy, false acceptance/rejection rates, new packet counts/cost and lock-time impact are **UNMEASURED**. No new replay or publication success is claimed. Refinement does not authorize execution.

## Recovery handoff addendum - 18 October 2026

The subsequent user handoff reports recovery of the original complete label JSON in the analysis workspace, preserved unchanged, plus a separate revision-3-aware answer file. This is new reviewer-reported evidence, not reconstruction from the outcome counts or excerpts:

| Reported answer file | Supplied SHA256 | Local access/import |
|---|---|---|
| PUBLICATION_VALIDATION_LABELS_R2_AI_ASSISTED.json | `6bdcef75bc6960906f80c373ebd48d8faabdfc92e488fc7443003395e0cebe5a` | Not available in this repository workspace; hash not locally checked. |
| PUBLICATION_VALIDATION_LABELS_R3_AI_ASSISTED.json | `4e097092cae0ce8cf32c68cce4ada96fb44c9e1bf8de5a095aacc933a9c1db78` | Not available in this repository workspace; hash not locally checked. |

Reported R2 technical checks: **235 exact witness occurrences, 113 scope-hash occurrences, zero mismatches**, with LF-normalized Unicode code-point offsets. This explicitly corrects the earlier report of 237 exact witnesses. These are field occurrences including repeated witnesses, not independent evidence counts. Reported R3 adds four REQUIRED + COMMUNICATED proposition records (S03/S05, two drafts each), retaining optional omissions and adding eight exact-witness occurrences, for an **expected 243**. No complete-file count or R2/R3 structural diff has yet been reproduced here.

The newly pasted T24 fragment was locally checked: REVIEW.md byte hash matches, `[23986,24025)` is the declared exact source line within T24 under the LF/code-point profile, and the supplied complete-control-reader hash matches UTF-8 of the reader sentence without the `Reader:` prefix or trailing newline. The source says 12 injuries; the reader says 40. The case remains negative for a quantity distortion. A related failure to communicate the correct required count is overlapping coverage evidence, not a second independent factual error. Full-label import must retain the claim-level distortion and deduplicate the root error rather than count the requirement record alone as a separate failure.

The label files remain AI-assisted, unblinded and previously exposed to the audit. Their reported recovery does not provide independent gold, compatible provider verdicts, edition certification or execution approval. Original evidence and revision-3 delivery remain unchanged. Local search covered the repository and its review worktree; it does not disprove availability in a separate analysis workspace. Complete file attachments or accessible local paths are needed to reproduce hashes, counts, section ownership, scope serialization and the exact R2-to-R3 additions. No application code, inference, deployment, queue or financial state changed during this check.
