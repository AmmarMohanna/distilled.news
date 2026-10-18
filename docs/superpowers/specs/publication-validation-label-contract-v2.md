# Publication validation — LABEL CONTRACT, revision 3 (v2 label schema)

**Normative review format; not runtime implementation or completed labels.** Preserve the original 49 IDs, initial packet and any v1 labels. Create a new revision-2 answer file; never overwrite or silently reinterpret the original.

## Provenance and completeness

Each review records `reviewer`, `reviewedAt`, `provenance`, `previouslyReadAudit`, `modelAssistanceUsed`, `evidenceInspected`, `sourceManifestSha256` and `cases`. Provenance is one of `INDEPENDENT_HUMAN`, `HUMAN_ASSISTED`, `AI_ASSISTED`, `INVESTIGATOR`, `CONTROLLED_FIXTURE`. Human forwarding of AI-generated judgments does not make them independent human labels.

`evidenceInspected` identifies the actual files/digests and scope: self-contained controls, complete saved source/draft appendices, or incomplete materials. The first AI-assisted review lacked appendices; the revision-2 review reports inspection of the full bundle. Keep those reviews distinct. The latter supplies 49 case-specific outcomes in prose, but its complete witness-label JSON is not available locally. A reported review is not an imported, validated answer dataset. See the [review receipt](../../../documentation/PUBLICATION_VALIDATION_R2_REVIEW_RECEIPT_2026_10_18.md).

A case starts with:

```json
{
  "id": "S01",
  "reviewState": "UNREVIEWED",
  "readerScopesInspected": null,
  "claims": null,
  "requirements": null,
  "reason": null
}
```

`reviewState` is `UNREVIEWED`, `PARTIAL`, or `REVIEWED`. Null judgments mean no adjudication. `UNRESOLVED` is a substantive judgment after inspecting sufficient materials and identifying an ambiguity; it must not replace absent review. Partial files retain all 49 cases and null untouched cases. Completion requires identifying all in-scope assertions/requirements, witnesses and reasons; empty arrays alone never make an unreviewed case pass.

## Reader-claim support

Each `claims` item identifies the exact reader assertion and its declared source/draft scope:

```json
{
  "claimId": "review-local-id",
  "readerText": "Exact reader assertion",
  "support": "SUPPORTED",
  "errorKind": null,
  "facets": [],
  "sourceWitnesses": [],
  "readerWitnesses": [],
  "reason": "Reviewer explanation"
}
```

`support` is `SUPPORTED`, `ERROR`, or `UNRESOLVED`; actual witnesses are required for a completed judgment. For `ERROR`, `errorKind` is `UNSUPPORTED_ADDITION` or `DISTORTED_FACT`, with affected facets: `IDENTITY`, `SUBJECT_PREDICATE`, `QUANTITY_UNIT_BOUND`, `TIME_ROLE`, `ATTRIBUTION`, `MODALITY`, `NEGATION`, `CAUSATION`. A correct number attached to the wrong subject is an error. Missing required information is recorded under requirement coverage instead of falsely labeling a surviving true assertion unsupported.

Within the declared evaluation scope, every factual assertion actually written is in scope, including an optional fact chosen by the writer. A case-specific review adjudicates its named propositions, not every unrelated sentence in an inspected story. Runtime edition acceptance still requires verification of ALL reader-facing factual assertions. A matching quote alone does not prove attribution, causation or temporal support. Record the draft/story identity for each judgment; do not merge an original and repair into one reader claim.

## Requirement communication and materiality

Each `requirements` item identifies a source proposition, not just a category or numerical token:

```json
{
  "propositionId": "source-fact-or-review-local-id",
  "sourcePropositionText": "Exact proposition at issue",
  "editorialRequirementId": null,
  "materiality": "REQUIRED",
  "communication": "OMITTED",
  "sourceWitnesses": [],
  "readerWitnesses": [],
  "omissionScopeWitnesses": [],
  "reason": "Why this proposition is required and absent"
}
```

`materiality` is `REQUIRED`, `OPTIONAL`, `NOT_NEWS`, or `UNRESOLVED`. `communication` is independently `COMMUNICATED`, `OMITTED`, or `UNRESOLVED`. These review labels do not themselves change the canonical editorial plan or authorize deletion/deferment.

Requirements operate at proposition granularity. A shared source sentence may license several independently disposed propositions: S03 preserves the Bee price but omits optional competitor comparisons; S05 preserves the dollar estimate and uncertainty but omits optional sterling conversion. Record separate proposition IDs/text and judgments even when they share an exact source span. Never mark the entire compound source sentence omitted or mandatory on that basis. Preserve actor, predicate, units, qualifiers and context while decomposing; blind token or sentence splitting is not adjudication. Canonical mappings retain parent fact/revision/span identity and distinguish proposition-level dispositions without rewriting legacy IDs.

- `COMMUNICATED` requires same-story reader spans conveying that proposition faithfully; source/fact-ID echoes cannot serve as reader witnesses.
- `OMITTED` requires inspection of the complete relevant reader scope, with `omissionScopeWitnesses` identifying its digest/draft/story. A missing story can be demonstrated by the full draft's inventory. Do not invent a matching reader quote for absent content.
- `OPTIONAL + OMITTED` creates no support error and no mandatory coverage failure. `REQUIRED + OMITTED` derives a separate `MISSING_MANDATORY_COVERAGE` error.
- `UNRESOLVED` materiality or communication stays unresolved. An absent optional item is not a fictional reader assertion with `support=SUPPORTED`.

Witnesses identify an artifact file/hash and source revision or draft/claim, exact quoted text where present, and offsets where available. Offsets must reproduce the quote exactly. Full-scope absence witnesses identify the scope examined rather than fabricate a nonexistent substring. Supplied control text can be its own hashed source/draft scope; saved S-cases need their actual appendices.

Make witness coordinates explicit: the artifact hash (`sha256` in the supplied witness format) pins original bytes; declare `textView`, `offsetUnit`, half-open `[start,end)` semantics and scope serialization separately. The two supplied S01 spans reproduce with CRLF converted to LF and Unicode code-point offsets, without any other normalization. Its complete-story scope hashes reproduce over UTF-8 of that LF text after the section heading newline through immediately before the next section heading, retaining all intervening whitespace. These are review-artifact coordinates, not runtime evidence offsets or normalized draft identity. Never substitute them for exact runtime byte hashes. Legacy answer files missing coordinate metadata need an explicit validated import profile, not guessed offsets. A generic scope note about missing text is not an omission verdict: S01 has surviving Panay prose with unresolved timing.

## Derived case outcome

The evaluator, not a legacy aggregate field, derives:

1. `NEGATIVE` when a reviewed case contains a definite unsupported/distorted reader claim, or a definite `REQUIRED + OMITTED` proposition.
2. `UNRESOLVED` when a reviewed case has an unresolved relevant judgment or conflicting judgments without a definite consistent finding sufficient to settle the case.
3. `POSITIVE` only when review is complete, every in-scope reader assertion is supported, every required proposition is faithfully communicated, and no unresolved judgment affects acceptance.

Unreviewed and partial cases remain outside final gold scoring and are counted explicitly. A case may have true surviving claims **and** a material coverage error. Preserve both facts; do not collapse them into a misleading claim-support label.

Derive per-draft outcomes first. For saved-case regression triage only, report an aggregate NEGATIVE if either inspected original or repair contains a confirmed error, preserving which version failed. S12 remains a negative regression case because the original omits legal scope; that does not label the repaired scope omitted. A case-specific POSITIVE is not story/edition certification. Whole-edition acceptance must evaluate the entire edition independently. Declare this aggregation policy in the evaluation record; do not confuse review uncertainty with runtime packet conflict resolution.

Keep label disagreements versioned: T09 in the later AI-assisted review is UNRESOLVED because generic report metadata does not establish the outlet is a newspaper. The older positive fixture remains frozen as historical investigator evidence. A future fixture using "report" must get a new version and digest; never silently repair the historical input or pool the conflicting labels.

**Regression examples, not new review labels:** T08 can record supported road reopening and a separate required-but-omitted bridge closure. S16 can record no matching reader claim for a deferred material Meta development. T21 permits the reviewed terminal punctuation variant; T22 changes quotation words. Existing aggregate T08 `meaning=ERROR` needs deliberate split adjudication; it cannot become `support=ERROR` for the true road sentence automatically.

## Semantic verdicts and measurements are separate

This file defines gold/review labels, not provider verdicts. Keep actual model operation IDs, compatible-input manifests and result receipts in a separate evaluation record. Controlled-port responses are test fixtures, never provider evidence. The reported AI-assisted 49-case summary is not independent gold; the incomplete pasted JSON is not an importable full witness-label file. Reviewer judgments are not saved semantic verifier outputs.

For each label stratum, report reviewed/partial/unreviewed and source availability. For independently reviewed positives/negatives, report the intersection with actual compatible semantic verdicts and all `ACCEPT/REJECT/UNRESOLVED` decisions. Count false acceptance only for `ACCEPT` on a gold negative, false rejection only for `REJECT` on a gold positive, and unresolved outcomes separately. Missing compatible verdicts are unverified coverage, not safe approvals or zero error rates.
