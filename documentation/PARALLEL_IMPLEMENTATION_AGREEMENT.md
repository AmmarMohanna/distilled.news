# Parallel implementation agreement

Baseline: `feat/source-connectors-v15`, starting from `4c49aa9` plus this shared-contract
commit. Architecture v1 Appendix C is normative. Use separate working branches.

## Shared package and change ownership

The shared package is `packages/contracts` (`@distilled/contracts`). Both lanes use its
exported types, strict runtime validators and acceptance fixtures. Contract changes require
coordination and an explicit versioned change; neither lane changes ordering, scope,
checkpoint resolution or retention independently. The downstream owner coordinates D1
migration numbering and shared schema changes; each lane writes its own migrations.

## Connector/source owner (friend)

- Provider adapters and HTTP/Telethon/authentication integration; query and upstream identity,
  original publisher identity and stable FeedSource item keys.
- Durable fetch-run records and FeedSource-scoped sequence allocation shared by poll,
  refresh and provider alternatives; allocate before fetching.
- Immutable payload storage with authorized reads, source observations and coverage.
- Pagination, continuation, provider restrictions/validation inputs, bounded retries,
  source revisions, authoritative deletion evidence and authoritative recheck adapters.
- Source polling scheduler and durable checkpoint store/CAS. Checkpoint advancement consumes
  downstream receipts and independently proven cursor continuity.
- Connector/provider evaluation and acquisition cost/latency reporting.

## Candidate/downstream owner (user)

- Feed/Source/FeedSource configuration, source recommendation/verification/approval UI.
- Candidate Intake: enforce query restrictions, canonical identity, eligibility,
  stable candidate records, durable intake receipts and observation-bound retry jobs.
- Acquisition Router/Web Operator integration, supplied-payload reuse, atomic evidence
  ordering recheck, revisions, tombstones, conflicts and reassessment.
- Evidence roles/dedup, Events, Storylines, scoring, selection, bounded synthesis,
  grounding, editions and retained-support/correction lifecycle.
- Follow, Star, publication notifications, frontend and downstream evaluation.
- Conflict orchestration: request the friend's authoritative recheck adapter, persist
  unresolved state and apply canonical acceptance. A connector does not promote evidence.

## Exact handoff interface

V1 transport is a direct asynchronous service port inside the backend:

```ts
CandidateIntakePort.acceptBatch(request: ConnectorHandoffRequest)
  => Promise<ConnectorHandoffResponse>
```

The connector calls exported `handoffConnectorBatch(port, request)`, which validates both
sides. This defines no HTTP endpoint or queue consumer. If a process boundary becomes
necessary, agree on its authenticated adapter without changing these payload semantics.

Request: `contractVersion: "distilled-v1"`, opaque stable `handoffId`, one coverage record,
all observations for that bounded fetch batch, and proposals for valid UPSERT observations.
Maximum 500 observations/proposals; providers fetch within that bound and preserve continuation.
All observations belong to the same coverage scope/run/sequence. DELETE has no proposal.
An unproposable observation still appears in observations so intake can durably reject or
quarantine it. No row may disappear merely because it failed validation inputs.
`discoveryRunId` equals `fetchRunId` at this boundary. Proposal identity, locators, hints,
payload reference and representation must agree with the referenced observation.

Response: same version and handoff ID, `durable: true`, exactly one valid scoped current
receipt per observation. Return only after receipt plus required candidate/retry, tombstone/
reassessment, or quarantine state commits. No blanket batch acceptance. Mixed terminal and
quarantined outcomes are allowed. Source checkpoint progress is not returned by intake.

Receipt updates: a repeated batch can return the newer current receipt if quarantine was
resolved; terminal decisions are immutable. Re-delivery cannot repeat canonical effects.
The intake binding stores handoff identity scoped to the feed/FeedSource and compares the
canonical request (not ordinary JSON property order). Same identity with different immutable
contents throws `IDEMPOTENCY_CONFLICT`; observation identity also protects effects across
different retry batches. Coverage/payload persistence belongs to the connector lane.

Errors: `INVALID_REQUEST`, `INVALID_RESPONSE`, `IDEMPOTENCY_CONFLICT`, `SCOPE_DENIED`,
`TEMPORARY_UNAVAILABLE`. Typed error messages contain no raw payloads or secrets.
Only `TEMPORARY_UNAVAILABLE` is automatically retryable. A lost response/transport failure
is uncertain: reload/read durable state or retry the exact batch with the same handoff ID,
under bounded backoff. Never assume failure means nothing committed. An invalid response
blocks checkpoint progress and needs investigation; do not silently accept it.

Retry ownership: connector retries handoff and checkpoint CAS; downstream retries acquisition,
evidence processing, event work and publication. Downstream requests authoritative rechecks;
connector performs the read and returns a newly sequenced observation. Failed later work
does not roll back an already safely advanced source checkpoint.

Checkpoint advancement requires all receipts through the independently proven contiguous
cursor to be resolved. `isIntakePrefixResolved` only checks receipts; it cannot prove provider
continuity, compare opaque cursors, authenticate source evidence, or write a checkpoint.
CAS conflicts require reload/revalidation, not blind overwriting.

## Runtime validation conventions

IDs are nonempty opaque strings; sequences/versions are safe positive integers; scores are
finite [0,1]; timestamps are UTC ISO strings; unknown fields fail strict validation. Hashes
are lowercase SHA-256. `payloadHash` hashes exact payload bytes with exported `sha256`;
`contentHash` uses exported `hashContent` and `CONTENT_HASH_POLICY = "text-v1"`: SHA-256
of the JSON array `[policy, representation, normalizedTitle, normalizedBody]`, with NFKC,
whitespace collapse and trim, preserving case. Provider/fetch metadata is excluded.
Both lanes use this same normalization before comparing supplied/acquired content.
Never infer replay by comparing hashes from different representations/normalization policies.
Registered revision comparators must verify reliability, scheme and authority. Source
revision values are not sorted lexically by default. Representation richness and authoritative
replacement checks remain runtime-owned prerequisites to atomic promotion.

## Integration and verification

First milestone: one RSS source -> durable observations/payload -> intake receipt -> safe
checkpoint -> acquired evidence -> Event -> grounded edition. Use the shared synthetic
fixtures before live testing. Both lanes implement the full C12 fixture catalogue against
their actual storage/providers; library tests are not proof of D1/R2 durability.

Coordinate worker entry points, environment bindings, queues, package exports and deployment
configuration. Explicitly switch off old polling for each migrated source to avoid duplicate
old/new ingestion. Reuse existing browser runtime; coordinate cross-lane changes.

Before live testing/deployment, name the deploy owner, environment, authorized credentials
and provider budgets. This agreement does not authorize extra paid provider calls. A Git
push of these contracts is not a production deployment.
