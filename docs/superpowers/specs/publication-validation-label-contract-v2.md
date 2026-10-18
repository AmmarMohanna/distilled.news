# Publication validation — LABEL CONTRACT, revision 2

**Normative review format; not runtime implementation or completed labels.** Preserve the original 49 IDs, initial packet and any v1 labels. Create a new revision-2 answer file; never overwrite or silently reinterpret the original.

## Provenance and completeness

Each review records `reviewer`, `reviewedAt`, `provenance`, `previouslyReadAudit`, `modelAssistanceUsed`, `evidenceInspected`, `sourceManifestSha256` and `cases`. Provenance is one of `INDEPENDENT_HUMAN`, `HUMAN_ASSISTED`, `AI_ASSISTED`, `INVESTIGATOR`, `CONTROLLED_FIXTURE`. Human forwarding of AI-generated judgments does not make them independent human labels.

`evidenceInspected` identifies the actual files/digests and scope: self-contained controls, complete saved source/draft appendices, or incomplete materials. The current AI-assisted review explicitly did not inspect those appendices and leaves S-cases unreviewed. Its provisional S-case triage remains in feedback, not the answer dataset.

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

Every factual assertion actually written is in scope, including an optional fact chosen by the writer. A matching quote alone does not prove the reader's attribution, causation or temporal claim.

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

- `COMMUNICATED` requires same-story reader spans conveying that proposition faithfully; source/fact-ID echoes cannot serve as reader witnesses.
- `OMITTED` requires inspection of the complete relevant reader scope, with `omissionScopeWitnesses` identifying its digest/draft/story. A missing story can be demonstrated by the full draft's inventory. Do not invent a matching reader quote for absent content.
- `OPTIONAL + OMITTED` creates no support error and no mandatory coverage failure. `REQUIRED + OMITTED` derives a separate `MISSING_MANDATORY_COVERAGE` error.
- `UNRESOLVED` materiality or communication stays unresolved. An absent optional item is not a fictional reader assertion with `support=SUPPORTED`.

Witnesses identify an artifact file/hash and source revision or draft/claim, exact quoted text where present, and offsets where available. Offsets must reproduce the quote exactly. Full-scope absence witnesses identify the scope examined rather than fabricate a nonexistent substring. Supplied control text can be its own hashed source/draft scope; saved S-cases need their actual appendices.

## Derived case outcome

The evaluator, not a legacy aggregate field, derives:

1. `NEGATIVE` when a reviewed case contains a definite unsupported/distorted reader claim, or a definite `REQUIRED + OMITTED` proposition.
2. `UNRESOLVED` when a reviewed case has an unresolved relevant judgment or conflicting judgments without a definite consistent finding sufficient to settle the case.
3. `POSITIVE` only when review is complete, every in-scope reader assertion is supported, every required proposition is faithfully communicated, and no unresolved judgment affects acceptance.

Unreviewed and partial cases remain outside final gold scoring and are counted explicitly. A case may have true surviving claims **and** a material coverage error. Preserve both facts; do not collapse them into a misleading claim-support label.

**Regression examples, not new review labels:** T08 can record supported road reopening and a separate required-but-omitted bridge closure. S16 can record no matching reader claim for a deferred material Meta development. T21 permits the reviewed terminal punctuation variant; T22 changes quotation words. Existing aggregate T08 `meaning=ERROR` needs deliberate split adjudication; it cannot become `support=ERROR` for the true road sentence automatically.

## Semantic verdicts and measurements are separate

This file defines gold/review labels, not provider verdicts. Keep actual model operation IDs, compatible-input manifests and result receipts in a separate evaluation record. Controlled-port responses are test fixtures, never provider evidence. The current AI-assisted 24-case summary is not independent gold and not an importable full per-case revision-2 file.

For each label stratum, report reviewed/partial/unreviewed and source availability. For independently reviewed positives/negatives, report the intersection with actual compatible semantic verdicts and all `ACCEPT/REJECT/UNRESOLVED` decisions. Count false acceptance only for `ACCEPT` on a gold negative, false rejection only for `REJECT` on a gold positive, and unresolved outcomes separately. Missing compatible verdicts are unverified coverage, not safe approvals or zero error rates.
