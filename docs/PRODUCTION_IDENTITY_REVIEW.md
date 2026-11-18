# Production identity and evaluator assurance review

18 November 2026. Branch `fix/briefing-identity-and-evaluation`, based on main `a712773e`.

Implementation commits: `56d67078` (publication identity guard) and `4575920e` (evaluator audit, retained-response regressions and replay tool).

This was a read-only production investigation plus local implementation and offline verification. No production news, annotations, financial rows, deployments or dashboards were changed. No paid inference was initiated.

## First introduction of the two errors

The active editions have `engine: v3` and use the V4 editor followed by occurrence-novelty review and factual verification. The older extracted-proposition/editorial-plan publication path did **not** generate these errors. The original frozen inputs, paid response records and published text establish the following trace:

| Edition, Beirut time | Cited evidence | First erroneous stage | Subsequent approval |
|---|---|---|---|
| Lebanon, 08:00 | Three Annahar posts say `سلام`, with no first name establishing `نجيب سلام` | GPT-4.1 editor adds `رئيس الحكومة نجيب سلام` in the headline | Novelty review repeats the name; GPT-4.1-mini verifier returns `ok`, no issues |
| Lebanon, 10:00 | Lebanese Forces article explicitly identifies `الرئيس جوزيف عون` | GPT-4.1 editor writes `قائد الجيش جوزيف عون` in the body | Novelty review repeats that role; GPT-4.1-mini verifier returns `ok`, no issues |

The first mechanism is unsupported identity completion from a surname. The second changes a role despite explicit contradictory source wording. They originate in editorial composition and survive fallible verification; adding checks only to the legacy proposition extractor would miss the actual path.

Original operation IDs, per-stage recorded costs and SHA-256 hashes of the captured artifacts are in [manifest.json](../evaluation/briefing-quality/reports/production-identity-20261118/manifest.json). Full original bodies remain in private retained storage/local diagnostic capture; reduced public-source diagnostic fixtures are committed separately and explicitly labeled as reduced, not a replacement for the originals.

## Evaluator false assurance and failures

All four original assessments were replayed against their full original snapshots and inventories, without inference. All original validation outcomes reproduced.

| Job prefix | Actual retained response | Diagnosis / disposition |
|---|---|---|
| `b9913bae` | Claim 0 explicitly includes `نجيب سلام` and labels it supported; reported support 4/4 | This is an incorrect support judgment, **not** failure to extract that particular name. A separate source-binding check detects it. Original score and paid response preserved. |
| `7767deaa` | Three reader items; only item 0 receives judgments or claims | `MISSING_ITEM_JUDGMENT` is correct. No score. Provider response schema now also requires exactly the reader-item count; duplicate/invalid indices still fail runtime validation. |
| `dca430f8` | Assesses a Pierre Bou Assi story from source S49 rather than the actual item; that source is not attached to item 0 | `NO_CITED_SUPPORT` is correct. Response is also incomplete. No score, no fabricated citation repair. |
| `e6d39b3c` | All claims supported, but two factual warnings complain that attributed tourism figures lack independent corroboration or are only a union position | `UNBOUND_REVIEW_FINDING` is correct: those warnings do not agree with an adverse structured claim judgment. They do not establish that the accurately attributed statements were falsely reported. No score; original warnings retained. |

No failed assessment was made to pass. The citation/consistency validators were not relaxed. No correction requests were sent. These legitimate failures remain unresolved model-output failures until a separately authorized, versioned correction can provide valid evidence.

Claim support is now explicitly scoped to `extracted_non_uncertain_claims_only`. A 4/4 result neither proves atomic extraction completeness nor certifies the complete briefing. Compound extracted sentences can also hide unassessed facets.

## Implemented safeguards

1. **Source-bound Arabic identity admission:** a narrowly scoped mechanical check covers whole candidate name spans after the supported Arabic president, prime-minister and army-commander role forms. It compares only the item's cited source title/body. A surname-only source cannot authorize a newly supplied first name; another person's title cannot authorize that role for the named person. Arabic diacritics/alef variants, role synonyms and the observed Joseph spelling variants are handled. There is no table of supposedly current office-holders. The follow-up review below addresses multi-token name boundaries and absent surnames.
2. **Existing recovery path:** an unbound name/role is sent to targeted repair even if the model says `ok`. It is not automatically replaced. If still unbound after existing repair attempts, the affected story is withheld with evidence carried forward; approved siblings remain publishable. No extra normal-path model stage is added.
3. **Frozen input policy:** new product windows include `arabic-person-role-v1` in their fingerprint. Retained unmarked snapshots keep their existing behavior and request bytes. Recovery preserves the predecessor's policy rather than silently upgrading a paid input.
4. **Separate claim-inventory audit:** deterministic checks identify items without claims and unassessed named identities, and report identity/source-binding issues separately from original support judgments. Absence of a detected issue remains `not_independently_established`, never "complete".
5. **Optional independent assessor:** `CLAIM_INVENTORY_AUDIT_ENABLED=true` enables one additional accounted request comparing the full reader text with extracted claim text, blind to support verdicts, source inventories and existing scores. It checks omitted identities, roles, numbers, timing, qualifications and other facets; missing facets require exact reader quotations. Missing rows, fabricated quotes and contradictory audit labels fail validation. A model says only `model_checked_not_certified`; it cannot upgrade a negative factual verdict. The flag has not been enabled in any environment.
6. **Payment and failure preservation:** the optional stage uses the existing append-only reservation/settlement and immutable response machinery. Invalid received responses retain their settled costs and fail without metrics; uncertain provider outcomes are not replayed. Existing reports are not rescheduled or overwritten by this work.

This guard detects both demonstrated errors in the original retained generation outputs. That is **2 known development defects detected**, not an accuracy estimate or evidence of general superiority. Tests include legitimate controls, falsely approving verifiers, withholding, repaired output, sibling preservation, legacy request parity and frozen-input identity.

## Usefulness and collection qualification

The actual AI interests prioritize foundation models, technical breakthroughs, products, efficiency, infrastructure and regulation, with independently verified results ahead of speculation. A long discussion of biological adult intelligence amplification has a weak direct fit; speculative timeline modeling requires clear attribution; a self-reported SID benchmark is not independent verification. Four of five reviewed stories citing LessWrong warrants inspecting which relevant developments were available and excluded, **not** imposing a publisher quota. No complete-input omission rate or editorial superiority is claimed here.

The Lebanon interests explicitly include public services, electricity and health. Retained editor exclusions call installation of generator meters routine, while the same input contains MEA's new aircraft and service developments. These are concrete candidates for selection review, not automatically "important" ground truth. A short headline can be sufficient; a longer body repeating it does not establish usefulness. These findings do not justify speculative prompt changes in this patch.

One Lebanon 04:00 opportunity was `DEFERRED / INCOMPLETE_INTAKE_COVERAGE`, not a verified quiet window. Both inspected feeds have collection/acquisition problems, so their published input cannot be described as comprehensive. On The Wire/Almodon/DeepMind extraction issues were observed in the earlier snapshot; main already contains a separate source-discovery fix, whose production recovery is not established by this investigation.

Read-only financial inspection found one NOW Lebanon Zyte operation, `4ef71274...`, status -1, no payload, failure phase `RESPONSE_HEADERS`, no reconciliation request ID and no acknowledgement. Its $0.05 ceiling is an **unresolved conservative hold, not a confirmed charge**. It was not cleared, resubmitted, disabled or treated as source completeness. Existing partial-input evaluation labels remain intact.

## Reproduction and cost

```sh
pnpm exec tsx evaluation/briefing-quality/replay-identity-diagnostics.ts <private-retained-artifact-directory>
pnpm --filter @distilled/briefing test
pnpm exec vitest run --config evaluation/briefing-quality/vitest.config.ts
pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/v3-window.test.ts
pnpm --filter @distilled/briefing typecheck
pnpm --filter @distilled/worker typecheck
pnpm exec tsc --noEmit -p evaluation/briefing-quality/worker/tsconfig.json
```

The replay tool is offline and refuses incomplete settled-response records. Original snapshots and `calls/<id>.json` responses can be downloaded read-only from the existing private evaluator R2 bucket using keys in `eval_jobs`/`eval_calls`; generation input/result and semantic-response records are in the existing production D1 document store. Do not expose secret-bearing headers or lease tokens when collecting artifacts. The committed reduced fixtures independently reproduce the validator outcomes in ordinary CI without production access.

New paid inference: **$0**. Twelve pre-existing evaluator calls across the four cases settled at **$1.419662** total. Six original generation-stage calls across the two defective windows totaled **$0.1304568**. Those are historical costs, not new spending. Optional audit latency/cost and real-model correction success are **unmeasured**; offline mocked transport tests do not qualify either.

Verified locally: full briefing suite **421/421**, full evaluation suite **138/138**, and V3 durable-window integration suite **110/110**. Briefing package, application Worker and evaluator Worker typechecks passed. V4 parity and immutable-request, unknown-payment, source-revocation, partial-publication and duplicate-delivery checks remain passing. No browser/UI behavior changed. GitHub CI status is separate from these local results.

## Remaining limits and release boundary

The mechanical guard is not general NER or semantic entailment: entities outside its recognized Arabic role-led patterns and ambiguous historical roles can escape it. Cross-language transliteration and ambiguous name boundaries are explicit unresolved outcomes, not passes. Conservative source binding can request repair for a legitimate unfamiliar alias. An independent model audit can miss facts or disagree. Neither check proves source truth, full recall, real-world independence or general factual accuracy.

Fresh paid-model qualification of the candidate, correction of the three failed assessments, and any modification/withdrawal of already published news remain unperformed. Deployment and monitoring activation require separate approval. Production and existing dashboards have not been changed.

## Follow-up review: complete Arabic name spans and absent surnames

Both reported bypasses reproduced before correction: changing the final surname in `عبد الفتاح السيسي` or `عبد الله بن سالم`, and inventing `نجيب قنديل` when the evidence mentions only `سلام`, initially yielded no issue. The old two-token parser and absent-surname early return were the causes.

The parser now retains the entire role-led Arabic candidate run, using explicit punctuation and known clause boundaries rather than assuming the first two words are the full name. A changed final surname no longer disappears behind a shared given-name prefix. Supported surname abbreviations must match a suffix of a complete source-bound identity; a shared prefix is insufficient. Unfamiliar trailing prose and unexpected separators produce `ARABIC_NAME_BOUNDARY_UNCERTAIN` when the boundary cannot be resolved from the cited source.

An absent surname no longer causes an early pass. Arabic-source mismatches produce `ARABIC_NAME_UNBOUND`; genuinely unresolved cross-script comparisons produce `ARABIC_TRANSLITERATION_UNRESOLVED`. Both go through the existing repair/withhold path. The evaluator uses the same complete spans and preserves boundary uncertainty as uncertainty, rather than calling it a proven omission from the claim inventory.

Regression coverage includes changed third/fourth tokens, completely absent surnames, shared-prefix truncation, quoted names, unfamiliar prose, unexpected separators, supported multi-token names and surname abbreviations, cross-language abstention, and actual engine withholding despite a falsely approving verifier while preserving a healthy sibling. No inference, deployment or historical-record edits were performed for this follow-up.

Follow-up verification: **435/435** engine tests (including 31 identity cases), **142/142** evaluator tests, and briefing/application-Worker/evaluator-Worker typechecks passed. Full retained-artifact replay preserved all four original outcomes and still identified the two original production substitutions. The previously reported 110 durable-window integration checks were not repeated for this parser-only follow-up. Broader real-model quality and false-positive rates remain unmeasured.
