# Bounded verification recovery

Branch: `fix/briefing-verification-recovery`, based on `origin/main` at `97839efe`.

## Incident and diagnosis

Read-only inspection of retained Lebanon-2 requests on 2026-11-17 found that the
18:00 and 18:30 Beirut editions ended `DEFERRED / V3_VERIFICATION_REJECTED`.
Their retained results contained no approved items. This was not a QUIET decision.
Request identities:

- 18:00: `13b21d19a8d7b44cf22873f932897b3868e1de09adaea7a9a7b1e8ca0b758ef9`
- 18:30: `a449e4585d9ce0582cd0f24771f40506829922ca6d7f05b670cc500c2d738bad`

The source revision was `aa6ca8b0-dca0-479f-aa5e-b4af58fe1f51`.

The selected army story repeatedly failed over an arrest count and the scope of
illegal-entry allegations. The source distinguished a wanted suspect and separate
subgroups with different alleged conduct. A subgroup's grounds must not apply to
all detainees, and ambiguous headline totals must not be resolved by guessing.

The repair prompt contained the current draft and latest complaint but not the
complete sequence of failed drafts and complaints. Verification received only the
immediately preceding review. That permits oscillating counts and scopes instead
of recovering a useful, independently supported central development. This is a
concrete recovery gap, not proof that every verifier complaint was correct.

## Change

New product snapshots freeze `feed.verificationRecoveryPolicy: supported-core-v2`
into their fingerprint. Retained snapshots without the marker keep their existing
prompt bytes. Refreshing superseded, unstarted evidence preserves its policy.
Previously completed requests, results, financial records and UNKNOWN operations
are not reopened or modified.

V2 supersedes the initial supported-core candidate: the original suspect-only
regression accepted a materially incomplete story. That was an inadequate
acceptance criterion. Removing disputed aggregate counts is allowed; dropping
independently supported material groups, actions or developments is not.

Repairs retain full fallible history and must preserve material source-supported
developments, actor/group scopes, uncertainty and conditions. Factually approved
repaired items undergo a separate editorial coverage check using the existing
editor model. It inventories material developments from cited evidence and checks
reader spans. Original drafts and reviews are not authoritative references. The
check considers interests, cutoff and actual prior reader history, rather than
requiring every incidental or already-known fact. Each decision requires valid
item indices, item-bound source references, exact original-source quotations and
exact reader quotations. `preserved` cannot pass with an empty inventory or a null
reader span. Incomplete or uncertain coverage drops the item with
`EDITORIAL_RECOVERY_COVERAGE` and carry-forward evidence; a fully rejected window
is recorded as `DEFERRED / V3_EDITORIAL_COVERAGE_INCOMPLETE`, distinct from factual
verification failure; verified complete sibling
stories can still publish. Missing or fabricated proofs cannot authorize publication.

V1 and unmarked frozen inputs retain their original prompts and call sequence.
New product snapshots freeze V2 into their identity; refreshing an unstarted
snapshot preserves whichever policy it originally had. Existing completed results,
paid records and UNKNOWN holds are untouched.

There are still at most two repair attempts by default. V2 adds an editorial
coverage call per source-sized batch of factually approved repaired items, through
the same durable model port, spending admission and provider-receipt accounting.
It does not run for unrepaired items, rejected repairs or frozen V1 inputs. Normal
JSON-format correction can use the existing bounded parser retry. Actual additional
cost/latency have not been measured with paid calls; these checks require deployment
and financial authorization before live qualification. No new source-accounting or
transaction architecture is introduced.

## Verification and limits

The source-derived regression fixture is a paraphrase of the retained statement,
not an untouched benchmark or a real-model replay. Scripted model responses test
history, local-index association, bounded attempts, rejection/carry-forward,
verified-sibling publication and unmarked prompt compatibility. Worker regressions
check input fingerprinting, fresh snapshot activation, retained snapshot replay and
existing financial/publication recovery guarantees.

Commands:

```sh
node node_modules/vitest/vitest.mjs run --root packages/briefing --config vitest.config.ts
node node_modules/vitest/vitest.mjs run --root apps/worker --config vitest.config.ts src/v1-intelligence/v3-window.test.ts
pnpm -r typecheck
```

Prior validation passed before this revision; updated offline results are recorded
with the final commit. Current regressions include factual approval of an incomplete
rewrite rejected by editorial coverage, all groups retained in a successful rewrite,
uncertain/fabricated coverage proofs and complete-sibling publication. `git diff --check` also passed. These are offline
checks, including mocked provider receipts, not newly incurred model charges.

No paid inference, live data mutation or deployment was performed for this fix.
Offline tests establish integration and safety behavior, not improved model success
rates. The separate editorial model is fallible and may still miss material
developments or misjudge their relevance; valid quotations alone do not establish
complete semantic coverage. A separately authorized source-preserving replay is needed before claiming
that these particular failures recover with real models. Deployment remains a
separate action; existing deferred editions are intentionally unchanged.


## Final P1 revision verification

- CI-equivalent runner: all six groups pass, including 396 briefing tests and
  119 evaluator tests, Python evaluation, exporter tests and both typecheck groups.
- All workspace typechecks pass; Worker types pass again after final status routing.
- Full Worker publication file: 106 of 107 cases passed on the initial concurrent
  run; the unchanged USAGE-receipt recovery case timed out at its existing 30s
  limit. It passed in isolation in 7.9s. Six final targeted checks pass, including
  V1/V2 freezing, legacy replay, fresh activation and the two new retained-result
  deferral tests (the file now contains 109 cases).
- The initial evaluator run also hit its unchanged five-second queue-test timeout
  under concurrent heavy checks; the sequential CI-equivalent rerun passed.
  No assertions or timeout limits were weakened.

These are offline functional/financial regression results, not measured editorial
accuracy or real-provider latency/cost. Both paid-model validation and deployment
remain unperformed.


## Exhausted coverage-output isolation

A coverage check's two received but unusable replies no longer abort unrelated
verified publication. Only `BriefingOutputError` (exhausted JSON/schema correction,
with no uncertain provider outcome) is isolated at the affected repaired batch.
Those repaired items are withheld with `EDITORIAL_RECOVERY_COVERAGE: unusable after
correction` and `carry:true`; unrelated approved stories and other usable coverage
batches continue. An entirely withheld briefing remains rejected/deferred, never
QUIET. The reason omits the raw reply excerpt.

Provider, uncertain-payment, admission and scope errors are rethrown unchanged.
No provider request bytes, frozen policy, operation identities, financial records,
retry counts or model calls change. Historical completed results remain unchanged.
Regressions cover malformed JSON, forged source/reader proof, complete siblings,
continued checking of another repaired batch, known received-call metering, and
provider/accounting errors during a correction. No deployment or paid inference
was performed for this follow-up.

Follow-up validation: all six CI-equivalent check groups pass, including 404
briefing tests (19 recovery regressions), 119 evaluator tests, exporter/Python
checks and evaluation typechecks. The changed briefing package typecheck and
`git diff --check` also pass.
