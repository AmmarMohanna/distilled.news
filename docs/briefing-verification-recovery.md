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

New product snapshots freeze `feed.verificationRecoveryPolicy: supported-core-v1`
into their fingerprint. Retained snapshots without the marker keep their existing
prompt bytes. Refreshing superseded, unstarted evidence preserves its policy.
Previously completed requests, results, financial records and UNKNOWN operations
are not reopened or modified.

With the marker, repairs receive the full history for the affected item, mapped
to the repair subset's local indices. Prior reviews are explicitly fallible context,
not evidence. The final existing repair slot asks for a concise supported core
when optional details remain disputed, preserving essential identity, attribution,
uncertainty, conditions, correction meaning and scope. The verifier checks the
current text against original cited sources and does not demand optional counts
be restored. Wrong counts or identities and materially misleading omissions still
require correction. A proposed core must pass verification; no approval is inferred
from having exhausted repairs. If it cannot pass, evidence remains eligible for
carry-forward under the existing policy. Already verified siblings can publish.

There are still at most two repairs by default. No extra provider calls, model
changes, source-accounting changes, transaction changes or acceptance bypasses
were added. History adds prompt tokens when repairs are necessary.

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

Local validation passed: 389 briefing tests across 62 files; 106 Worker
publication/recovery tests; the three finally edited snapshot tests rerun separately;
and all workspace typechecks. `git diff --check` also passed. These are offline
checks, including mocked provider receipts, not newly incurred model charges.

No paid inference, live data mutation or deployment was performed for this fix.
Offline tests establish integration and safety behavior, not improved model success
rates. A separately authorized source-preserving replay is needed before claiming
that these particular failures recover with real models. Deployment remains a
separate action; existing deferred editions are intentionally unchanged.
