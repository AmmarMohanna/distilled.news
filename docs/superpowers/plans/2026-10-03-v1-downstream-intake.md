# V1 durable intake and evidence acceptance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execute in this session; review the whole change before integration.

**Goal:** Implement the user's durable connector handoff and evidence acceptance boundary so the connector owner can integrate against actual D1 persistence.

**Architecture:** Add an isolated backend module implementing the existing `CandidateIntakePort`. Store intake outcomes, observation-bound outbox work, evidence ordering state, revisions, tombstones and conflicts in D1. Use conditional writes inside transactional D1 batches, with reload/retry after contention; do not rely on JavaScript read/compare/write for concurrency safety.

**Tech Stack:** TypeScript, existing Cloudflare D1/Queues/R2 infrastructure, Zod and `@distilled/contracts`, Vitest and Miniflare. Use `corepack pnpm` (package manager version 10.12.1).

**Spec:** `documentation/ARCHITECTURE_v1.md`, especially Appendix C1–C6 and C10–C12; `documentation/PARALLEL_IMPLEMENTATION_AGREEMENT.md`; exported contracts at baseline commit `8ca0859`.

## Global constraints

- Wire version is `distilled-v1`; maximum 500 observations/proposals per handoff.
- Keep shared wire types and ordering policies unchanged. Coordinate any required changes with the connector owner.
- FeedSource identity is the scope; URLs are locators, not a replacement for stable item keys.
- Receipts become checkpoint-resolved only with the required durable effects. Intake never advances a source checkpoint.
- Acquisition jobs reference exact observations. Recheck ordering when acquired content finishes.
- Never infer deletion from absence, use completion time to order revisions, or collapse A -> B -> A.
- Do not enable new production polling, change existing source routes, deploy, or make paid provider calls in this milestone.
- Published evidence support remains immutable. This milestone adds storage foundations; publication retention integration follows later.
- The connector owner persists payloads, observations and coverage, allocates fetch sequences and controls polling/checkpoints. Downstream stores its own immutable acceptance input for retry/audit; that does not transfer connector ownership.
- Reserve migration `0035_v1_intake_evidence.sql` for this lane; communicate this reservation before either lane integrates migrations. Recheck the latest migration number before execution.

## Review focus

1. Lost response after commit: identical handoff retry must return durable receipts without duplicating work (Task 2).
2. Concurrent acceptances for one item: no conflicting receipt/current state or orphaned retry job (Tasks 2 and 4).
3. Source disabled/deleted during processing: atomic scope guards prevent new intake and promotion effects (Tasks 1 and 4).
4. Unknown ordering or richer existing content: preserve canonical evidence and keep unresolved work explicit (Tasks 3 and 4).
5. Connector-persisted hash versus acquired content: recompute content hashes and never treat unverified metadata as usable evidence (Tasks 3 and 4).

## Deliverable and subsequent order

This plan covers the first independently testable milestone of the user's part, not the entire application. It exposes the agreed handoff binding plus durable acceptance. Subsequent plans implement acquisition/outbox execution, evidence roles and Events/Storylines, scoring and selection, bounded synthesis/grounding/publication, then product UI and retention integration. The first integrated RSS edition requires both lanes and the later intelligence/publication milestones.

## Files and ownership

New worker module: `apps/worker/src/v1-intake/`.

- `types.ts`: internal scope, supplied/acquired-content and job types; no competing wire schema.
- `policy.ts`: source restriction and representation eligibility decisions.
- `canonical.ts`: deterministic JSON comparison of immutable requests.
- `store.ts`: D1 persistence and conditional transactional writes.
- `intake.ts`: the `CandidateIntakePort` binding.
- `evidence.ts`: post-acquisition acceptance and conflict lifecycle.
- `index.ts`: explicit exports for backend callers.
- `test-utils.ts`: Miniflare database setup and authorized synthetic scope fixtures, used only by tests.
- `store.test.ts`, `intake.test.ts`, `evidence.test.ts`: real D1 integration tests.
- `apps/worker/migrations/0035_v1_intake_evidence.sql`: additive tables, indexes, lifecycle constraints.
- `documentation/V1_DOWNSTREAM_HANDOFF.md`: exact integration calls and milestone status.

No changes to connector implementations, existing processor dispatch, public routes or deployment bindings in this plan.

### Task 1: Persistence and authorized scope foundations

**Files:** Create migration, `types.ts`, `store.ts`, `test-utils.ts`, `store.test.ts`.

**Interfaces:**
- Produces `V1IntakeStore` constructed with `D1Database`.
- Produces internal `IntakeScope { feedId: string; feedSourceId: string; sourceId: string; feedRevision: number; enabled: boolean; deletedAt?: string; restrictions: QueryRestrictions }`.
- Produces `QueryRestrictions { startTime?: string; endTime?: string; publisherIds?: string[]; accountIds?: string[] }` and runtime `ValidationFacts { accountId?: string }`. Account facts come from an authorized connector adapter; missing facts never imply a match.
- Produces `registerScope(scope: IntakeScope): Promise<void>` and `getScope(feedSourceId: string): Promise<IntakeScope | undefined>`. Registration is an internal trusted provisioning boundary, not an unauthenticated endpoint. Feed configuration integration is a later milestone.
- Produces test fixture `createIntakeDatabase(): Promise<{ db: D1Database; dispose(): Promise<void> }>` and `seedIntakeScope(store: V1IntakeStore): Promise<void>`.

- [ ] Write tests `scope survives a new store instance`, `scope cannot be rebound to another feed or source`, and `disabled or deleted scope cannot accept work`. Assert actual database contents, not mock invocation counts.
- [ ] Run `corepack pnpm --filter @distilled/worker test -- src/v1-intake/store.test.ts`; confirm failures show missing persistence behavior.
- [ ] Add indexed tables for scope, handoff identity, immutable acceptance inputs, candidates, intake receipts, observation-bound outbox jobs, evidence identity/current state, evidence revisions/tombstones, acceptance receipts and conflicts. No cascade deletion of retained evidence. Use unique item keys and observation-effect keys, not unique historical content hashes.
- [ ] Implement scope registration/read and guard primitives. Registering configuration does not authorize arbitrary request-provided feed/source identity.
- [ ] Run the focused test command and worker typecheck; expect success.
- [ ] Commit migration, types, persistence and tests: `feat: add v1 intake persistence foundations`.

### Task 2: Durable idempotent handoff and accepted retry jobs

**Files:** Create `canonical.ts`, `intake.ts`, `intake.test.ts`; extend store.

**Interfaces:**
- Consumes Task 1 scope/store, shared request/response schemas and `HandoffError`.
- Produces `createCandidateIntakePort(store: V1IntakeStore, policy: IntakePolicy): CandidateIntakePort`.
- Produces `IntakePolicy { version: string; now(): string; factsFor(observation: SourceObservation): Promise<ValidationFacts>; orderingFor(observation: SourceObservation): Promise<OrderingPolicy>; verifySuppliedContent(observation: SourceObservation): Promise<VerifiedSuppliedContent | undefined> }`.
- Produces `VerifiedSuppliedContent { representation: RepresentationKind; contentCompleteness: ContentCompleteness; contentHash: string }`. Verification reads authorized immutable payload bytes and uses `hashContent`; a connector flag alone is insufficient.
- Produces `canonicalRequest(request: ConnectorHandoffRequest): string`, sorting object keys and treating observation/proposal lists by their stable identities; preserve meaningful nested array order.
- Store produces `listPendingJobs(feedSourceId: string): Promise<DownstreamJob[]>`, where `DownstreamJob { id: string; feedId: string; feedSourceId: string; observationId: string; kind: 'ACQUIRE' | 'REASSESS' | 'AUTHORITATIVE_RECHECK'; state: 'PENDING' | 'RUNNING' | 'DONE'; attempts: number }`.

- [ ] Write D1 tests: accepted UPSERT returns a resolved receipt with exactly one candidate and acquisition job; fresh store returns the same terminal receipt after a lost-response retry; reordered JSON keys do not conflict; changing immutable content under a reused handoff ID throws `IDEMPOTENCY_CONFLICT`; reused observation ID in another batch cannot repeat effects or change immutable content.
- [ ] Add `Promise.all` concurrent acceptance tests for the same item and same handoff. Assert stable candidate identity and one job per accepted observation, with no effects if the transaction fails.
- [ ] Run the focused intake tests and observe the missing behavior failures.
- [ ] Implement strict request validation, authorized scope checks and canonical request comparison. Persist candidate, immutable observation/proposal binding, receipt and outbox atomically. Return only validated receipts read from committed state. A D1 batch error returns no durable success.
- [ ] Run focused tests and worker typecheck; expect success.
- [ ] Commit: `feat: bind connector handoff to durable candidate intake`.

### Task 3: Query enforcement, ordering, replay, quarantine and deletion

**Files:** Create `policy.ts`; extend intake, store and intake tests.

**Interfaces:**
- Consumes shared `decideObservationOrdering` and Task 2 `IntakePolicy`.
- Produces `validateQueryRestrictions(scope: IntakeScope, observation: SourceObservation, facts: ValidationFacts): 'MATCH' | 'VIOLATION' | 'UNVERIFIABLE'`.
- Produces `resolveQuarantinedObservation(observationId: string, policy: IntakePolicy): Promise<IntakeReceipt>` on the intake binding, reusing the original immutable input and current authorized scope. A terminal receipt is never rewritten.

- [ ] Write tests asserting explicit restriction violation -> `REJECTED/RESOLVED`; missing required publisher/date/account -> `QUARANTINED/UNRESOLVED`; newer feed restriction revision invalidates stale validation assumptions; no proposal -> terminal unsupported/invalid rejection where provable, otherwise missing-validation quarantine.
- [ ] Write tests for comparable older revision -> `IGNORED`; mixed revisions and equal-order differing content -> quarantine; identical verified current content with higher sequence -> replay plus advanced ordering metadata; no verified current content -> acquisition rather than assumed replay.
- [ ] Write tests for authoritative ordered DELETE -> tombstone and reassessment, no new candidate/acquisition job; unverified deletion -> quarantine; delayed old UPSERT cannot resurrect a tombstone; lower completeness cannot overwrite richer content without an independently verified authoritative replacement.
- [ ] Run focused tests and confirm behavior failures.
- [ ] Implement fail-closed restrictions and trusted comparator/replacement policy. Check latest canonical state atomically, use conditional guard/CAS retry on contention, and commit each receipt with its effects. Accepted UPSERT remains acquisition work until final content is available; do not manufacture an ACTIVE evidence revision from a hash. Winning verified replay and deletion advance canonical ordering state.
- [ ] Implement explicit quarantine resolution without changing terminal receipts. A repeated handoff returns current receipts, including resolved quarantine.
- [ ] Run focused tests and worker typecheck; expect success.
- [ ] Commit: `feat: enforce v1 intake ordering and deletion semantics`.

### Task 4: Atomic acquired-content acceptance

**Files:** Create `evidence.ts`, `evidence.test.ts`; extend store and internal types.

**Interfaces:**
- Consumes exact accepted observation binding, canonical state and Task 2 ordering policy.
- Produces `acceptAcquiredContent(store: V1IntakeStore, content: AcceptedAcquiredContent, policy: IntakePolicy): Promise<EvidenceAcceptanceReceipt>`.
- Produces `AcceptedAcquiredContent { id: string; feedId: string; candidateId: string; sourceObservationId: string; representation: RepresentationKind; contentCompleteness: ContentCompleteness; title?: string; body: string; language?: string; publishedAt?: string; canonicalUrl?: string; acquiredAt: string; acquisitionMethod: 'supplied_payload' | 'platform_api' | 'direct_http' | 'browser'; acquisitionProvider?: string }`. Persist provenance and enforce candidate/feed/observation consistency. Transport failures never call this acceptance function.

- [ ] Write tests: sequence 11 extraction finishing after accepted sequence 12 cannot overwrite current state; identical current content advances ordering without revision/reassessment; A -> B -> A produces revisions 1, 2, 3; replaying one acquired result has one durable acceptance effect; newer eligible UPSERT reactivates a tombstone.
- [ ] Write tests for scope deletion during acquisition, content hash recomputation, provenance linkage, representation downgrade, immutable historical revisions, and concurrent different results with equal ordering metadata preserving current content.
- [ ] Run focused evidence tests and confirm missing behavior failures.
- [ ] Implement recomputed `hashContent`, immutable acquired-result persistence and atomic recheck against latest canonical state. Conditional promotion writes revision, current pointer/order metadata, receipt and reassessment job in one batch. Reload/retry a failed CAS; never return a promotion receipt for a transaction that lost contention.
- [ ] Run intake/evidence tests and worker typecheck; expect success.
- [ ] Commit: `feat: promote immutable evidence with atomic ordering checks`.

### Task 5: Durable post-acquisition conflicts and recheck lifecycle

**Files:** Extend evidence, store and evidence tests.

**Interfaces:**
- Consumes Task 4 acceptance state and shared conflict wire types.
- Produces `resolveEvidenceConflict(store: V1IntakeStore, conflictId: string, resolution: { kind: 'KEEP_CURRENT'; authoritativeObservationId: string } | { kind: 'LATER_OBSERVATION'; observationId: string }, policy: IntakePolicy): Promise<EvidenceRevisionConflict>`.
- Resolution requires durable trusted authoritative-check evidence for KEEP_CURRENT, or an accepted later strictly ordered observation for LATER_OBSERVATION. Caller assertions alone cannot resolve a conflict.

- [ ] Write tests: equal-order differing result -> `QUARANTINED_REVISION_CONFLICT`, one pending conflict and bounded recheck job; original intake receipt remains resolved; repeated failing rechecks preserve explicit unresolved state; trusted keep-current resolution and later ordered acceptance resolve durably; neither completion order nor an arbitrary ID resolves conflicts.
- [ ] Run focused tests and observe missing behavior failures.
- [ ] Persist conflicts and recheck work atomically with acceptance receipts; implement explicit audited resolution. Keep attempt count/backoff state durable. A pending conflict does not erase a terminal intake outcome or modify checkpoint state.
- [ ] Run intake/evidence tests and worker typecheck; expect success.
- [ ] Commit: `feat: persist authoritative evidence conflict resolution`.

### Task 6: Integration exports, acceptance catalogue and handoff documentation

**Files:** Create module `index.ts`, `documentation/V1_DOWNSTREAM_HANDOFF.md`; extend tests only where fixture coverage is missing.

**Interfaces:** Export the named binding, store, acquired-content acceptance and conflict-resolution functions from prior tasks. Documentation identifies trusted scope provisioning and payload/order adapter dependencies; it must not claim production polling or an edition pipeline is already integrated.

- [ ] Map every C12 fixture to a D1/provider/downstream test or an explicit later milestone; do not equate shared pure tests with storage guarantees.
- [ ] Add fresh-store integration coverage for mixed accepted/rejected/quarantined/deleted batches, transactional rollback and disabled scopes. Run the focused command and confirm new assertions fail before fixing missing behavior.
- [ ] Export the binding and document the exact caller setup, pending-job durability, retry handling, migration reservation and remaining connector/provider obligations. Show no unauthenticated HTTP interface.
- [ ] Run `corepack pnpm --filter @distilled/contracts test`, `corepack pnpm --filter @distilled/worker test -- src/v1-intake`, `corepack pnpm typecheck`, and `corepack pnpm test`. Record actual failures by name if existing browser/system dependencies prevent the full suite; no unqualified all-tests-pass claim.
- [ ] Review the whole branch against Appendix C, particularly scope guards, SQL atomicity, replay watermark advancement and retained immutable history. Fix material findings with regression tests.
- [ ] Run `git diff --check` and commit: `docs: publish durable downstream integration contract`.

## Planning self-review

The six tasks cover the first downstream boundary and C1–C6 durability requirements. Intelligence, publication retention integration, queue execution and live provider fixtures are explicitly later milestones. Shared wire schemas are reused; internal provisioning/acquisition types do not redefine the connector handoff. Task 2 depends on Task 1 persistence; Tasks 3–5 share current ordering state, so their implementation and review must agree on conditional transaction guards. Each review-focus failure mode has a named D1 test task.

**Status:** Plan prepared for user review; product implementation has not started. Branch: `codex/v1-downstream-pipeline`, base: `8ca0859`.
