# Durable downstream handoff: first implementation milestone

Branch: `codex/v1-downstream-pipeline`, based on frozen shared contracts at `8ca0859`.
The worker module `apps/worker/src/v1-intake/index.ts` implements the direct async
`CandidateIntakePort`. It is available for integration; existing production routes and
polling have not been switched. No new HTTP endpoint, queue consumer, provider calls or
deployment are included.

## Migration coordination

**Downstream reserves `0035_v1_intake_evidence.sql`.** The connector owner must use a
different migration number and reconcile numbering before integration. This migration
creates additive `v1_*` tables and does not repurpose the legacy briefing/source tables.
Applying the migration is necessary before calling the new module. Feed configuration
integration must provision/update its authorized scope records and disable/delete them
as part of Feed lifecycle changes. This module is not yet wired to legacy Feed deletion.

## Backend setup and connector call

```ts
import { handoffConnectorBatch } from '@distilled/contracts';
import {
  V1IntakeStore, createCandidateIntakePort, acceptAcquiredContent,
  type IntakePolicy, type IntakeScope
} from './v1-intake';

const store = new V1IntakeStore(env.DB);
// Run only at the trusted feed configuration boundary, never from a request's claims.
await store.registerScope(approvedScope as IntakeScope);
const port = createCandidateIntakePort(store, policy as IntakePolicy);
const response = await handoffConnectorBatch(port, connectorRequest);
```

The connector still owns payload/SourceObservation/CollectionCoverage persistence,
fetch-run sequencing, pagination, provider rechecks and safe-checkpoint CAS. Downstream
persists an immutable copy of each acceptance input for retry/audit, not another source
fetch history. A request has at most 500 observations/proposals. Handoff identity is
scoped to FeedSource; observation and acquired-content IDs must be globally unique.
Reuse the exact immutable input and IDs after uncertain/lost responses. Changing its
contents returns `IDEMPOTENCY_CONFLICT`. Canonical comparison sorts object keys and
observation/proposal rows, preserving other array order. Terminal receipts never change;
repeated batches can return a newer receipt after explicit quarantine resolution.

`registerScope` is internal provisioning, not source approval. Identity cannot be rebound.
Changing restrictions requires an increasing Feed revision; deleted scopes cannot be
reactivated. Do not let untrusted callers invoke registration or supply a replacement
policy. There is no per-request tenant identity parameter because this is a trusted
backend service port, not a public transport.

## Required policy adapters

- `now()` returns a UTC timestamp; `version` records the intake policy.
- `factsFor(observation)` supplies independently authorized query validation facts such
  as account identity. Observation publisher/date fields plus these facts enforce configured
  restrictions. A violation rejects; a required unknown field quarantines. Date bounds
  use `[startTime, endTime)`. Topical relevance remains downstream scoring.
- `orderingFor(observation)` returns a registered reliable scheme comparator. Return
  `null` when revisions are incomparable; never sort opaque values lexically.
  `authoritativeReplacementAllowed` must come from a connector-specific runtime check.
  Setting it based solely on an observation's Boolean is insufficient. It authorizes
  explicit deletion, mixed-revision replacement and representation downgrade only when
  `authoritativeCurrentState` is also true.
- `verifySuppliedContent(observation)` reads authorized immutable payload storage and
  recomputes `hashContent` using the declared representation and completeness. Return
  `undefined` when bytes have not been independently checked. Return matching verified
  metadata only after successful validation; contradictory verification rejects the request.

Policies may be invoked again after transaction contention. Make adapters repeatable,
bounded and read-only; do not allocate fetch sequences or perform unbounded external
calls inside them. Cache immutable verified payload reads per invocation where useful.

## Durable effects and extraction completion

Accepted UPSERT: stable candidate plus exact observation-bound `ACQUIRE` outbox job.
Replay: only when equality with current accepted content is independently provable;
advance winning ordering metadata without revision/reassessment. Rejected/stale work
has a terminal receipt. Quarantine persists unresolved receipt and recheck work.
Verified ordered DELETE creates a tombstone and `REASSESS` job without creating a
candidate for acquisition. Absence from a result set never deletes evidence.

After acquisition, call `acceptAcquiredContent(store, content, policy)`. `content` carries
the stable candidate ID, exact source observation ID, an immutable acquired-content ID,
validated representation/completeness, nonempty body and acquisition provenance. Reuse
that acquired-content ID and immutable result on retry; another ID for the same observation
cannot create another promotion effect. This function recomputes the normalized content
hash and atomically rechecks current ordering, including changes made during extraction.
It writes one of promotion, current-content replay, stale suppression or durable conflict.
Completed extraction marks its ACQUIRE job DONE, including stale/conflicting outcomes.
It never modifies an earlier intake receipt or checkpoint.

`listPendingJobs(feedSourceId)` inventories pending, non-exhausted jobs; it does not claim
a lease, apply `nextAttemptAt`, or execute them. The later queue/executor milestone must
implement due-time filtering, leases and delivery retries. Returning `durable:true` proves
the job is stored, not that an executor is deployed. Read immutable input by observation
ID for acquisition; never acquire whichever observation happens to be latest on a candidate.

Atomicity uses a FeedSource-wide scope epoch and a transactional guard in `D1.batch`.
A stale scope/configuration snapshot aborts before effects and retries with current state.
Candidate, receipt and required outbox effects commit together. Database/adapter diagnostics
are sanitized to typed handoff errors. No payloads/secrets are returned in error messages.

## Explicit reconciliation

`port.resolveQuarantinedObservation(observationId, recheckPolicy?)` reevaluates the original
immutable input against current authorized scope and trusted validation facts. It may
transition quarantine to a terminal decision; repeated calls cannot rewrite terminal outcomes.
If source contents change, the connector returns a new sequenced observation instead of
mutating the original input.

`resolveEvidenceConflict` accepts either a trusted authoritative recheck supporting current
content/deletion or a later strictly ordered observation that is already current. A deletion
recheck must have a durable deletion receipt referencing the current tombstone. Recheck identity
alone is insufficient: the module verifies durable input/acceptance and current evidence.
Resolution persists its observation ID and timestamp and completes its recheck job.
`recordRecheckFailure` stores exponential backoff (60 seconds, doubling) for at most five
failed calls. Exhaustion keeps the conflict explicitly unresolved and excludes the job
from automatic pending inventory; an operational review/manual retry policy comes later.
Completion order never resolves a conflict.

## C12 acceptance coverage

The following maps shared fixtures to real D1 tests or the remaining owning integration.
It does not claim that the entire provider-to-published-edition catalogue passes.

| Fixture | Current verification / remaining boundary |
| --- | --- |
| C12-01 winning identical content | Intake and evidence replay watermark tests |
| C12-02 A -> B -> A | Evidence three-revision test |
| C12-03 older comparable revision | Intake revision-precedence test |
| C12-04 equal comparable identical content | Authoritative recheck current-content replay test |
| C12-05 equal comparable conflicting content | Conflict preservation and reconciliation tests |
| C12-06 equal fallback conflicting state | Shared ordering fixtures; D1 equal-sequence conflict test |
| C12-07 unversioned ordering | Evidence delayed-completion and sequence tests |
| C12-08 mixed revision metadata | Intake reliable-versus-unversioned quarantine test |
| C12-09 earlier extraction finishes late | Evidence stale-result test |
| C12-10 conflict revealed after extraction | Conflict test checks original resolved intake survives |
| C12-11 authoritative reconciliation | Keep-current and later-version resolution tests |
| C12-12 allocated sequence then failed fetch | Connector allocator/provider integration remains; no allocation API in downstream |
| C12-13 concurrent poll/refresh/providers | D1 concurrent acceptance tests; shared durable allocator remains connector-owned |
| C12-14 declared representations | RSS, Telegram and listing representation D1 tests; live provider extraction remains |
| C12-15 representation downgrade | Evidence downgrade quarantine test; authoritative provider replacement integration remains |
| C12-16 missing validation fields | Publisher/account/date quarantine tests |
| C12-17 explicit violation | Query rejection tests |
| C12-18 absent listing item | Empty batch D1 test; provider disappearance policy remains connector-owned |
| C12-19 authoritative deletion | Intake tombstone and reassessment test |
| C12-20 old UPSERT after tombstone | Intake stale resurrection test |
| C12-21 newer UPSERT after tombstone | Evidence reactivation and retained tombstone test |
| C12-22 failure before intake commit | Injected D1 failure rolls back batch; checkpoint integration remains connector-owned |
| C12-23 crash after durable terminal receipt | Fresh-store/reordered mixed-batch retries; checkpoint crash/recovery remains connector-owned |
| C12-24 later downstream failure | Durable acquisition/recheck jobs and resolved receipt tests; queue executor, Events and editions follow |
| C12-25 partial collection safe cursor | Coverage preserved in request identity; provider continuity/checkpoint CAS remains connector-owned |
| C12-26 published edition then update | Immutable evidence histories retained; edition reference graph and future claim reassessment follow |
| C12-27 Feed deleted after publication | Scope deletion blocks intake/promotion; legacy Feed lifecycle and retained edition graph integration follow |

Next downstream milestone: connect the durable acquisition outbox to the existing router,
including supplied-payload reuse and bounded retry/lease handling. Then build Events,
Storylines, assessments, selection and grounded immutable editions. Both lanes must
coordinate a deliberate per-source production switch after an integrated RSS fixture passes.

## Verification record

- All 42 new Miniflare/D1 tests pass, including the independently reviewed tombstone
  keep-current reconciliation regression.
- All 44 unchanged shared-contract tests and all workspace TypeScript checks pass.
- The complete worker suite passed 253 tests before the final one-test reconciliation
  fix; the complete 42-test downstream suite and workspace typecheck passed afterward.
  The clean migration-chain test includes the new migration.
- `corepack pnpm test` was run and stopped at the unchanged
  `packages/agent-runtime/test/trusted-browser-api-guard.test.ts` test. Its source-text
  scan flags `.dispatchEvent(` in the existing browser WebSocket shim; the agent-runtime
  package is identical to baseline `8ca0859`. Agent runtime otherwise passed 262 tests,
  with two skipped. This branch does not claim a green full repository suite.
- Browser bridge passed 81 tests and had one temporary-directory cleanup failure in
  `test/bridge.secret-leak.test.ts` during the concurrent broader runs. Rerunning that
  file alone passed all four tests; no browser-bridge files changed.
- An independent whole-change review found one material issue, confirmed by a failing
  regression test and fixed: authoritative deletion can now resolve a pending conflict
  by keeping the verified current tombstone. No other material finding was reported.

No migration was applied remotely and no production deployment or provider call was made.
