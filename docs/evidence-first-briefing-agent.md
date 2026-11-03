# Evidence-first briefing candidate � offline implementation

Status: **IMPLEMENTED, OPT-IN, NOT QUALIFIED FOR ADOPTION**. V4 remains selected; V7 and its rejected qualification experiment are preserved. Starting revision: `89bea66`; implementation commit: `49c3ee4`; branch `ghada/v3-editorial-distillation`. No deployment, real provider request, grant/hold change or notification occurred. Actual additional charges: **$0**. Mocked usage is not a financial charge or quality measurement.

## What changed

`generateBriefing(..., {architecture: 'evidence-first-v1'})` selects the candidate. Absence of this option follows the original V4/V7 engine. No environment flag, production routing change, framework, dependency, additional AI stage or database migration was added.

The existing editor/verifier sequence remains:

1. The application materializes bounded read-only evidence tools from the caller's authorized immutable snapshot. The editor sees all supplied title/body passages, source identities, timestamps, revision metadata and previous reader coverage.
2. In its existing call, the editor writes items plus development records: occurrence, essential claims, exact supporting quotations/passages, conditions, attribution, uncertainty, temporal status and relationship to earlier coverage. Grouped `left_out` decisions account for excluded sources without requiring publication of them.
3. Code validates identities, one-to-one item/record membership, prior references, exact quotes, offsets, source ownership and schema. It reconstructs item citations from the validated proofs. The existing source-accounting diagnostic is reused. Unaccounted sources remain recoverable and are not classified as irrelevant or important merely because they are missing.
4. The verifier receives original evidence AND the fallible editor records, prose, exact proof resolutions, exclusions and accounting diagnostics. Findings must identify the actual offending prose or record claim and a valid passage owned by that item. Redundancy findings reference supplied reader memory. Source-linked coverage concerns hold affected sources/items; they do not invent a missing story.
5. At most one targeted repair and one recheck. Repairs cannot add developments, expand source scope, change prior relationships or change importance. The recheck includes original evidence and fallible earlier draft/finding context. Unresolved affected items are held; unrelated verified items can survive. Evidence removed from a surviving repaired item is carried, not silently lost.

Normal nonempty input: **two `ModelPort.complete` calls**, including a correctly empty editorial result. Maximum: **four**, even when the caller supplies `maxRepairs: 99`. Empty input uses zero. Malformed JSON is held without `callJson`'s automatic corrective resend. Provider/admission/uncertainty errors propagate unchanged; only a dedicated local contract-error class can be converted into a held result.

Output ceilings match the original stages: editor 4,000 tokens, verifier 3,000, repair 3,000, recheck 3,000. No model-selected continuation or unrestricted tool loop is implemented. These are **host-driven tools**, resolved before/between the existing model calls, not evidence that the model learned autonomous tool selection.

## Tool and evidence boundaries

Implementation: `packages/briefing/src/evidence-tools.ts`; full stage instructions and implementation: `packages/briefing/src/evidence-agent.ts`.

Tools expose sources, exact passages, quoted-passage resolution, previous reader coverage, revision references, provenance and source accounting. All returned values are detached copies. Tool reads/returned characters are bounded (1,000 reads, 2,000,000 serialized characters). Passages preserve original supplied bytes/whitespace and use UTF-16 offsets; boundaries avoid splitting surrogate pairs. SHA-256 identifies the supplied title/body, separately from a declared upstream content hash. Quotes crossing adjacent passages are supported; fabricated, mixed-owner, discontiguous and ambiguous quotes are rejected.

Revision lookup groups only explicit evidence identity within the same owner, never a shared URL. `historyLimitedToInput: true` is intentional: these tools cannot discover absent historical bodies. The Worker supplies current revision provenance; it does not load all historical revisions or change current-revision eligibility. Supporting an older body requires the caller to supply it explicitly. Likewise reader-memory completeness is limited to the existing caller's authorized history query, not an unlimited knowledge graph.

Evidence larger than the configured editor/verification request bounds is deferred intact, not silently truncated or split into more model calls. This is a deliberate limitation of this two-call candidate and must be measured on larger workloads. The tools do not browse, acquire sources, modify source records or publish.

The Worker integration is programmatic only: the optional final argument to `prepareV3Window` freezes the architecture and candidate-only provenance into a distinct input fingerprint. Existing snapshots/hashes keep their old shape. Recovery retains the chosen architecture. Actual execution uses the existing durable provider port with retries disabled, native admission/reservation/settlement, captured receipts, fencing, source checks and publication projection. Structured audit data is saved with the V3 result; it is not inserted into a new canonical graph.

## What preprocessing actually showed

The package defaults to a 40-character minimum, but the product Worker already overrides it to **one character**. It would be incorrect to attribute the retained S13 omission to that default. S13 reached the original editor and was omitted in its raw response.

The old preparation does fold same-URL articles even with near-duplicate matching disabled. A labeled synthetic revision regression reproduces changed text being hidden. The candidate preserves short, title-only and same-URL inputs, allowing semantic judgment to inspect them. It does not relax ingestion/freshness/security policies upstream.

In the six retained real comparison cases, the existing Worker-style preparation retained every supplied article: 15/15 in each Lebanon case, 4/4 in each AI case and 3/3 in each evolving casualty case. None of their supplied bodies is under 40 characters. No actual source loss in these six cases is claimed.

## Offline evidence and tests

New tests cover immutable/bounded tools, exact ownership/quotes, cross-passage and Arabic text, source revisions, silent accounting gaps, grouped exclusions, empty briefings, distinct records sharing a source, invalid prior IDs, missing/orphan records, wrong-item findings, record-only factual challenges, oversized input, provider error propagation, malformed repair responses, the four-call ceiling, unresolved-item holds and repair source carry.

A local Worker/D1 integration test invokes the candidate through native durable operations, persists a reader edition, reads its exact headline back, verifies two succeeded reported-usage operations, and repeats the request without more calls, duplicate editions/delivery jobs or feed-pointer changes. Responses and reported $0.001 receipts in that test are **mocked**, not real model or financial evidence.

An explicit negative test supplies a structurally valid record and a false `ok` verdict for incorrect prose. It demonstrates that the output can still pass: exact references and structured records **do not establish factual truth**. `semanticTruthEstablished:false` is always recorded. No model factuality, Arabic quality, coverage improvement, false-positive rate, actual inference cost or generation latency is established by these tests.

Retained fund/METR, fixed-versus-ranged quantity, future-versus-completed timing, headline-only controls, S13 and distinct strike cases remain source-linked regression evidence. Existing tests replay the retained false approvals and false rejections. They are not reclassified as successful detection by this candidate.

## Frozen comparison, not executed

`benchmarks/evidence-agent/offline-plan.json` stores identical original inputs/histories, provisional expectations, exact editor requests and hashes for V4, V7 and this candidate. `comparison.ts` prepares the plan offline and offers a provider-agnostic runner requiring the existing admitted port and durable evidence sink; it does not contain credentials or its own HTTP provider adapter.

Six English/Arabic cases include the retained Lebanon window (including S13), multi-source fund/METR evidence, and genuinely evolving conflicting casualty reporting with exact earlier reader coverage. The latter are stronger temporal/multi-source probes, but are already inspected retained sources, **not unseen or human-labeled gold**. Other reserved security, same-company and quiet cases remain available for a later transfer selection.

| Case (each language) | Full title/body chars | V4 editor request chars | V7 | Candidate |
|---|---:|---:|---:|---:|
| Lebanon | 2,088 | 13,459 / 13,458 | 10,066 / 10,065 | 12,464 |
| AI multi-source | 14,647 | 22,570 / 22,569 | 19,177 / 19,176 | 19,283 |
| Evolving casualties | 344 | 8,442 / 8,441 | 5,049 / 5,048 | 4,549 |

These are deterministic **editor input sizes**, not tokens, cost or full-pipeline latency. Lebanon is approximately 24% larger than V7 at this stage; the 10% full-pipeline target is therefore not assumed satisfied. Record output, verifier overhead, caching and repairs need actual measurement.

Proposed finite matrix: 6 cases � 3 variants = 18 pipelines; 36 normal calls, **72 maximum**, including one possible repair/recheck pair per pipeline. No paid judge, retry or publication. Each variant receives the same original input, history, model routing, temperature from the shared port and stage output ceilings. Existing V4/V7 preprocessing differs from the new architecture and is explicitly measured, not concealed as an identical prompt-only experiment. The runner stops at four calls rather than silently extending baseline JSON retries.

**This is not paid execution approval.** Before execution: freshly check pricing, calculate worst-case exposure for all captured requests and repair bounds, establish a fresh explicit scope/expiry and use native financial admission per operation. All costs and semantic measurements remain null until observed. Stop on uncertain outcomes. No earlier authorization is reused.

Record factual support, intended-error detection with valid passage/rationale, false rejections, important-development retention, false merges/splits, repetition/updates, Arabic/English usefulness, words/essential information, actual token usage, distinct operations, repairs, settled costs/unknown exposure and end-to-end latency separately. Source acknowledgment alone is not recall, and a non-ok verdict alone is not intended-error detection. Ambiguous judgments remain unresolved. Do not promote if material factual/coverage regressions persist, or if measured efficiency is unacceptable.

## Verification and next step

Briefing suite: **203/203 passed** (43 files). Worker V3 window suite: **53/53 passed**, including recovery, accounting, source revocation, scheduling and the candidate persistence/replay test. Both briefing and Worker TypeScript checks pass. The candidate integration test was also rerun against the final implementation. Local detailed logs are under `.local-reports/evidence-agent/` (not committed).

Recommendation: **EVALUATE; DO NOT PROMOTE**. The bounded architecture and durable integration are implemented. Real semantic reliability and the cost/latency target remain unproven. The next step is a freshly priced, explicitly authorized comparison, not another deployment or prompt-only V7 experiment.
