# Publication validation contract v2 - implementation and offline evaluation

18?19 October 2026. Branch: `backend-validation-contract`. The user explicitly authorized this implementation and offline evaluation after review. **Disabled by default; no inference spending, remote mutation, deployment, activation or push.** This report supersedes earlier refinement-only status for local execution, not the independent holdout or live acceptance gates.

## Confirmed problem and resulting behavior

The frozen audit found editorial normalization expanded three explicit mandatory facts into 181 requirements, including navigation/background details. Its original 24-control investigator suite rejected five valid wordings and let five invalid wordings through deterministic prechecks. These are small-corpus findings, not production error rates. The later AI-assisted review changes T09 to unresolved for an unsupported outlet type; the frozen original fixture remains unchanged.

V2 represents exact propositions separately from parent facts, with justified REQUIRED / OPTIONAL_CONTEXT / DEFERRED / provenance-backed NOT_NEWS dispositions. Optional comparison prices and duplicate currency conversions no longer implicitly require the essential product price or qualified dollar estimate to be treated as omitted. Novelty and attribution-role IDs do not automatically become mandatory. Every source word must be covered by a disposition, and protected facts stay whole and required when selected, or whole and deferred. Whole-claim factual verification still covers every optional fact actually written.

The default is `LEGACY`. `V1_PUBLICATION_VALIDATION_CONTRACT=EVIDENCE_GROUNDED_V2` selects the new path only if explicitly configured later. No Wrangler configuration sets it. Disabling the flag fences retained v2 selections before any new writer call; enabling it does not reinterpret or bypass a retained legacy selection/paid boundary. Existing legacy normalization, prompt text/schema, intent/result identities and tests remain in place.

## Implementation and safety

- `editorial-requirements.ts` validates complete proposition dispositions, exact UTF-16 parent spans, ownership, explicit materiality reasons, correction links and protected non-demotion. The projection carries parent fact/revision support into writer facts; required IDs refer to propositions, not all siblings sharing a parent.
- `news-proposition-eligibility.ts` / `shortlist-v2.ts` create a separate immutable derived shortlist. Trusted parser/reviewed boundaries can exclude navigation from eligible news; raw article evidence stays unchanged. Ambiguous flattened metadata remains unresolved and cannot be selected as approved fact merely by its date or Published token. Historical sources, claim-extractor identities and graph membership are not rewritten. This release applies navigation eligibility before editorial selection; it does not perform upstream graph cleanup or change already-paid semantic review questions.
- `editorial-plan-v2.ts` makes a separate versioned editorial question through existing durable financial admission. Full-context/schema admission failures wait; no pruning, hidden fallback or extra planner repair is added. Already-started legacy questions for the same window block a new purchase under v2. Plans retain proposition-specific pending work.
- `publication-prechecks.ts` preserves exact support, ownership, story, fact-ID and URL gates. Ambiguous quantity/date/qualifier alarms route to existing reservation-gated complementary verification, never directly to acceptance. The existing source-bound proven action-strength negative guard remains hard (T14), as do changed quotation words (T22); neither was a reviewed positive. Quote matching permits only delimiter typography and terminal comma/period presentation; changed words remain blocked, ambiguous/nested reader quotations remain unresolved. Possessive apostrophes do not create imaginary quotations. A complete matching source quotation is not invalidated by a different incomplete source quotation.
- `publication-validation.ts` combines whole-claim judgments with required-proposition facets and actual same-story reader witnesses. Consistent negative evidence rejects; conflicts, missing/incompatible verification and bad witnesses remain UNRESOLVED. Optional facts actually communicated participate in conflict checks, and the v2 wire decoder accepts their exact same-story reader witnesses without requiring them to be mandatory. Each packet must be complete independently; overlapping positive packets cannot supply another response's missing checks. Offered novelty uncertainty and conflicting packet novelty remain unresolved before repair admission. Optional novelty ownership uses the full same-story fact inventory; an omitted optional proposition need not acquire a missing check once actual novelty/correction delivery is established. Missing bridge/Meta coverage is separate from support for surviving true prose; overlapping failures are not independent quality errors.
- `publication.ts` binds exact source/context/selection hashes, draft JSON UTF-8 bytes without Unicode normalization, full packet/prompt question including a hash of actual serialized provider messages/schema/output limit, versions, language, model/provider/route and editorial requirements into the v2 operation scope. Persisted manifests link operation ID, reservation ID, intent/settlement tokens and authoritative result hash. Cached projections are compared against the settled response and its original manifest. Missing compatibility cannot initiate a replacement purchase. Existing reservation, uncertain-outcome recovery, leases and CAS/source revalidation remain authoritative.
- Canonical publication requires the persisted ACCEPT decision in the same feed transaction as the edition. Proposition work resolves only against its own compatible accepted reader spans and the committed edition/candidate; sibling stories, a window closing, age and ordinary target-wide resolution cannot clear it. Deferred-only v2 windows use the existing DEFERRED result, never verified QUIET.
- V2 has no extractive verification bypass, new repair opportunity, model switch or concurrency change. A conflict/unavailable verifier cannot buy a repair. A consistent rejection can use only the existing single repair allowance. Three additive immutable document kinds and versioned JSON fields need no D1 schema migration. Spending caps/holds and source permissions are untouched.

## Reproducible offline results

Run from the worktree root:

```powershell
node --test scripts/validate-validation-labels.test.mjs
corepack pnpm exec vitest run --config scripts/vitest.validation-audit.config.ts
corepack pnpm exec vitest run --config scripts/vitest.validation-contract.config.ts
corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1
corepack pnpm -r typecheck
corepack pnpm --filter @distilled/web build
corepack pnpm --filter @distilled/worker exec wrangler deploy --dry-run --config wrangler.staging.toml
```

The saved-corpus replay requires ignored private artifacts. On a public clone without them it is explicitly skipped; the portable negative/positive importer tests remain runnable. The whitelisted manifest pins source bytes and validates LF Unicode-code-point witness offsets and exact declared sections. Completed labels are kept as unchanged private copies, not published article bodies. The [source-free result artifact](../benchmarks/validation-contract-offline-results.json) and [label manifest](../benchmarks/validation-contract-evaluation-manifest.json) separate label provenance, routing, costs and missing semantic coverage.

| Measurement | Observed result |
|---|---|
| Label import | R2: 49 cases, 235 exact witness occurrences/113 scopes. R3: 49 cases, 243/113. Zero mismatches. Occurrences include repeated witnesses. |
| Saved case labels | 17 positive / 4 negative / 4 unresolved, case-specific and AI-assisted. |
| Control labels | 11 positive / 12 negative / 1 unresolved (T09). |
| V2 hard rejection on reviewed positive controls | 0 of 11. This is routing, not final factual accuracy. |
| V2 automatic approvals from prechecks | 0. |
| Four unchanged saved drafts | All reach NEEDS_SEMANTIC; factual warning counts 37, 37, 6, 0. Legacy audit prechecks stopped three of these four. No edition is certified by this replay. |
| Compatible v2 provider verdicts | 0 of 49 cases; all 49 have missing compatible verdict coverage. Two legacy verification documents are historical only. |
| Final false acceptance / false rejection | UNMEASURED (null counts), not zero. There is no label-plus-compatible-verdict scored intersection. |
| Label uncertainty | 5 case-specific unresolved labels. Missing model verification is reported separately from those evidence ambiguities. |
| Independent human holdout | 0 cases available. AI-assisted and earlier owner-assisted/investigator strata are not pooled as independent gold. |
| New inference calls / provider spend | 0 / $0. Controlled test-port usage is not provider spending. |

Controlled regression ports demonstrate ACCEPT for a supported duration paraphrase, rejection of missing material coverage, both directions of claim/facet conflict, optional-written-fact conflict, foreign/source-only witness rejection, exact compatibility mutations, protected work retention and no duplicate paid operation on retries. A D1-backed fixture publishes and replays once; its conflicting counterpart stays unpublished, buys no repair, and does not reissue verification on retry/route mismatch. These are deterministic implementation tests, not measured semantic-model quality.

## Verification cost and time

A dry offline transport/admission calculation for the four frozen drafts fits one GPT-4.1-mini verification packet each:

| Frozen draft | Full serialized request bytes | Configured reservation ceiling |
|---|---:|---:|
| Attempt A original | 188,232 | $0.1277216 |
| Attempt A repair | 188,214 | $0.1277144 |
| Attempt B original | 20,686 | $0.0607032 |
| Attempt B repair | 20,873 | $0.0607780 |

These diagnostics deliberately retain frozen legacy editorial requirements and exact support context; they do not represent a newly inferred v2 editorial plan. They measure v2 transport size under that frozen workload, not provider latency, actual bill or a guaranteed future plan cost. Calls were not authorized or executed. Final v2 planner requirement counts, provider cost and live lock-time impact remain unmeasured.

Configured absolute ceiling remains $0.458352 per fitting verification packet; three stories with worst-case pair fallback across original plus one repair allow at most six packets/$2.750112 under that descriptor. Actual packet sizes, capability overrides and durable reservation authority decide admission. Cost/latency diagnostics use existing aggregate instrumentation and transaction boundaries; no new exclusive turn is added. Planned/cached packet counts, reservation ceilings and verification wall time complement existing new-provider-call and receipt-cost counters. Reused receipt cost is not new spend. The long publication feed turn remains unchanged; no latency improvement is claimed.

## Local commits

- `d54825a`: provenance-aware label import and scoring.
- `dba430f`: explicit propositions and durable editorial work.
- `cc6e505`: default-off publication and paid-receipt compatibility.
- `655fb2e`: incomplete verification/conflict handling and optional reader witnesses.
- `93007da`: saved-draft offline replay and source-free results.
- `506ea16`: reviewed novelty uncertainty/conflict and optional ownership fixes.

All commits are local on `backend-validation-contract`; none were pushed.

## Verification status and remaining gates

| Check | Result |
|---|---|
| Final focused validation and legacy regressions after review | 93 passed / 15 files. |
| New D1 publication integrations | Final 6/6 passed; the original four also passed within frozen broad coverage. |
| Repository scripts | 35 passed, including 7 portable importer tests. |
| Historical audit / offline saved-corpus replay | 2/2 and 1/1 passed, network forbidden. |
| Repository-wide typechecks | Passed after final application edits. |
| Frontend build / final explicit staging Worker dry run | Passed; no configuration activation or upload. |
| Frozen full Worker coverage before final review fixes | All 243 files accounted for, no duplicates/missing files: 1,653 passed / 15 failed / 11 skipped (1,679 tests). All 440 recorded Worker TypeScript hashes unchanged during those runs. |
| Nature of frozen-run failures | 15 test/setup timeouts across 8 files; some setup failures also caused cleanup errors. Strict regression is **NOT GREEN**. No assertion-only failure or memory-limit error observed on frozen code. |

Coverage combines ten complete files (130 passes) retained from a run interrupted by a zero-free-byte disk failure, plus the remaining 233 files (1,523 passed / 15 failed / 11 skipped), explicitly excluding those ten. The remaining run took 3,470.57 seconds. This is verified split frozen-revision coverage, not one uninterrupted successful full-suite invocation. The [source-free regression artifact](../benchmarks/validation-contract-regression-results.json) records every failed case and rerun.

The subsequent code review identified two v2-only correctness gaps: unknown/conflicting novelty could escape the reducer and reach repair, and optional novelty ownership used the mandatory inventory. Both were reproduced before the fix. Added regressions cover no repair/no ACCEPT on missing or uncertain novelty, cross-packet novelty conflicts, permitted optional omission, and optional NEW/ALREADY_COMMUNICATED ownership. These final edits affect only the v2 reducer/decoder plus tests; the above full coverage predates them. Final focused results are 93 pure tests plus six D1 cases passed, repository-wide typechecks passed, and the explicit staging-config Worker dry run passed. The reviewer confirmed both fixes and the optional-omission follow-up with no remaining important defect identified in that narrow diff. These results are recorded separately, rather than claiming a final-revision full green run.

All 15 failures were rerun serially in fresh processes with their original limits. Eleven passed; four still exceeded five seconds: agent outbox relay, durable publication restart, scheduled cron publication, and recovery after edition commit. Each completed its unchanged assertions in a separate extended diagnostic (respectively 2.6, 15.5, 11.1, 9.8 seconds of test-body time; see artifact for exact timings). Extended diagnostic limits were CLI-only (120-second test / 30-second hook); no repository timeout, assertion, financial rule or runtime behavior was changed. Timing varies between runs, and startup/resource pressure is supported by setup failures and the disk exhaustion. A clean comparison on another machine/CI is still needed to attribute all timing variance; do not claim a proven performance regression or complete environmental exoneration. The four strict timing failures remain outstanding.

The earlier 4,042.9-second run (1,653 passed / 13 failed / 11 skipped across 242 files) began before final edits. Seven newly added assertions consumed stale Vite transforms, including a missing export present in committed source. It is retained as diagnostic history, not final-revision acceptance evidence. A fresh run passed all those validation assertions. Five earlier legacy timeout cases also passed in fresh serial reruns. The cron case repeatedly exceeded five seconds alone; a separate 30-second diagnostic completed its unchanged assertions in 8.6 seconds including hooks. No committed timeout or application assertion was relaxed. Passing extended diagnostics must not be reported as strict regression passes.

Local space recovery removed a regenerable dry-run source map and only the redundant 3,653,075,739-byte uncompressed staging backup after streaming the retained `.sql.zst` through decompression and proving exact length/SHA-256 equality (`ccf4b1d34b84d33f0a43d3a83ef23f0a120c6aefd9295ded427aca2626791b8a`). The compressed backup remains unchanged and reconstructs the original bytes. About 3.6 GB was recovered; no database, evidence, receipt or remote state was removed. The verification receipt is retained privately with local test logs. No broader temporary-directory or user-file cleanup was performed.

This implementation does not authorize activation. A representative independently reviewed holdout, actual exactly compatible semantic results with positive ACCEPT examples and false acceptance/rejection/unresolved scoring, observed provider cost/lock time, and a separately authorized staged end-to-end acceptance remain prerequisites. Oversized v2 planner inputs currently defer on context/schema admission rather than reusing legacy cohort judgments or pruning facts. Obsolete protected proposition work stays pending until a separately evidence-backed resolution is possible. Neither inspected real briefing is declared safe to publish.
