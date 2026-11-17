# RSS source integration

This connector implementation builds on `feat/source-connectors-v15` at `8ca0859` and
uses the frozen contracts in `documentation/ARCHITECTURE_v1.md` Appendix C and the
parallel implementation agreement. It implements the connector side of RSS collection.
Canonical intake, evidence acceptance, Events and publication remain downstream-owned.

## Implemented backend services

- `RssSourceCollector`: bounded RSS/Atom fetch, normalization, durable snapshot and
  observation batches, validated `acceptBatch` handoff, receipt-gated conditional validators.
- `D1SourceRepository`: transactional FeedSource sequence allocation, one fetch claim per
  run, immutable saved batches, receipt persistence, and versioned checkpoint CAS.
- `R2SourcePayloadStore`: scoped content-addressed raw/supplied payloads, conditional
  immutable writes and integrity verification on reads.
- `BoundedFeedHttp`: request/stream deadlines, response-size limits, manual redirects,
  bounded transient retries, Retry-After handling and request/latency telemetry.
- `D1RssPollScheduler`: persisted jobs, leases and lease fencing, bounded retry scheduling,
  saved snapshot continuation and current-source authorization checks.

These are opt-in backend library services. No Worker entry point, HTTP endpoint, queue
consumer, cron binding or production migration was changed. Existing polling is unchanged.

## Integration boundary

```ts
import {
  sourceSqlFromD1,
  D1SourceRepository,
  R2SourcePayloadStore,
  BoundedFeedHttp,
  RssSourceCollector,
  D1RssPollScheduler
} from '@distilled/connectors';
import type { CandidateIntakePort } from '@distilled/contracts';

// Supplied by the downstream/deployment owner:
// DB, PAYLOADS, durableIntake, authorizedSourceFetch, sourceStillApproved.
const sql = sourceSqlFromD1(DB);
const repository = new D1SourceRepository(sql);
const payloads = new R2SourcePayloadStore(PAYLOADS);
const http = new BoundedFeedHttp(authorizedSourceFetch);
const intake: CandidateIntakePort = durableIntake;
const collector = new RssSourceCollector(repository, payloads, http, intake);
const scheduler = new D1RssPollScheduler(sql, collector, sourceStillApproved);

await scheduler.schedule('stable-poll-job-id', {
  scope: { feedId, feedSourceId, sourceId },
  runId: 'stable-fetch-run-id',
  url: approvedFeedUrl,
  maxItems: 100
}, scheduledUtcTime);

// A future coordinated backend scheduler invokes this bounded service.
await scheduler.runOne();
```

Install `SOURCE_STORAGE_SCHEMA` and `RSS_POLL_SCHEMA` only through a coordinated
numbered migration. They are exported schema proposals, not automatically applied
production migrations. Coordinate resource bindings and migration numbering with the
downstream owner.

The caller authenticates and authorizes Feed/FeedSource access. The scheduler's
authorization callback must check that the source remains enabled/approved, the request
matches its active configuration revision, and old polling has been disabled for that
migrated source. Recheck authorization at intake as well. The HTTP dispatch binding must
enforce source authorization and public-network/DNS egress safety at connection time;
there is intentionally no unrestricted global-fetch fallback. Bind provider credentials
inside the authorized dispatch, not in stored URLs, proposal payloads or logs.

## Persistence and recovery

Allocate a durable sequence before issuing a fetch. The allocator is shared by poll,
refresh and alternative-provider calls for the same FeedSource; a worker-local counter
is never used. Allocation alone has no accepted-content effect. A fetch-run claim stops
two callers from independently fetching under the same observation sequence.

Persist raw bytes and the normalized snapshot, then persist the immutable handoff batch
before calling `handoffConnectorBatch`. Re-delivery loads that exact batch. A lost response
does not imply intake failed; retry with the same handoff ID and content. Intake owns
durable idempotency and canonical effects. Connector tests using a stub intake do not
prove the production intake binding is idempotent.

Each batch contains one coverage record, all its observations, and proposals only for
usable UPSERT observations. Missing identities, missing content and conflicting duplicate
rows remain visible to intake without inventing a valid proposal. Conflicting duplicate
content is preserved in the raw snapshot rather than selected by feed position.

An RSS response is a finite snapshot, not a historical completeness guarantee. Snapshot
continuation uses persisted offsets, not another provider fetch. A conditional ETag or
Last-Modified checkpoint is saved only after every batch of that snapshot has resolved
receipts. Quarantine blocks progress; terminal acceptance/replay/rejection/ignored receipts
may resolve it. Acquisition or briefing completion is not required. A 304 does not prove
historical coverage and leaves the checkpoint unchanged. No historical safe cursor is
invented for RSS.

Checkpoint CAS conflicts are reported and blocked for review/revalidation rather than
blindly overwriting another writer. A crash after intake receipt persistence but before
checkpoint update can replay the saved handoff safely.

A crash between fetching and saving the first batch leaves an uncertain fetch outcome.
That run must not fetch again under the same sequence. The scheduler starts a fresh run
on recovery; existing accepted content is unaffected. Orphan payloads from this interval
need coordinated garbage collection. Pending snapshots and payloads must not expire before
their handoffs/continuations resolve.

The scheduler makes at most eight attempts per job, then marks it blocked for explicit
repair. Longer provider Retry-After values are persisted and honored without sleeping a
worker for the entire interval. Lease fencing protects job updates; shared intake
idempotency and checkpoint CAS protect duplicate work after lease expiry. Periodic callers
enqueue new job/run identities rather than mutating an old immutable batch.

## Payload and identity semantics

- Native RSS GUID or Atom ID determines `sourceItemKey`; otherwise use the article URL.
  Missing identity uses a run-local invalid-row key solely for rejection/quarantine.
- Keep the original article URL and publisher hostname; the feed URL is not substituted
  for a missing article URL. Relative links resolve against the approved feed base.
- RSS content is conservatively declared `ARTICLE_EXCERPT` with `UNKNOWN` completeness,
  including `content:encoded`; the presence of that field alone does not establish a full
  article. A supplied JSON payload contains title, body, declared representation and
  completeness, and optional canonical URL, publication date and language.
- `payloadHash` uses the shared exact-byte SHA-256 helper; `contentHash` uses the shared
  `text-v1` normalized content helper. They are not interchangeable.
- Missing/invalid publication dates stay missing. Atom `updated` is retained as an opaque
  source revision, never fabricated into a publication date or reliable comparator.
- Collection snapshots set `authoritativeCurrentState: false`. RSS absence never emits
  DELETE. An RSS snapshot refresh is not an authoritative item/deletion recheck.
- No model, tool or browser provenance is invented for this deterministic path.

The downstream normalizer must read the supplied payload with the same hash policy and
apply representation quality and revision ordering at canonical acceptance. Validation
inputs travel in the existing observation/proposal fields; query-bound enforcement remains
intake-owned. Atom/RSS UTF-8 XML and XHTML bodies are covered. Invalid XML, DTD/entity
declarations and non-UTF-8 decoding failures fail closed; encoding conversion and additional
feed dialects need explicit fixtures before support is claimed. HTTP redirects require a
coordinated authorized redirect policy; this implementation returns them without following.

## Verification and remaining work

Synthetic fixtures exercise file-backed SQLite and filesystem payload storage across
repository restarts, plus Miniflare's actual local D1/R2 bindings. The Miniflare test
verifies concurrent allocation uniqueness and runtime-restart persistence. It does not
constitute remote deployment or live publisher testing.

Shared C12 coverage is intentionally split:

| Cases | Connector verification here | Remaining downstream/integration proof |
| --- | --- | --- |
| C12-01 through C12-11 | Shared library fixtures remain unchanged; observations bind exact runs and sequences. | Replay ordering, revisions, conflicts and evidence promotion in durable intake/evidence storage. |
| C12-12, C12-13 | Failed allocations do not advance source checkpoints; shared durable allocator, concurrent local D1 calls and one fetch claim. | Canonical content behavior when later fetching fails; cross-lane concurrency. |
| C12-14 through C12-17 | Honest excerpts; missing data retained; receipt quarantine blocks progress. | Actual restriction enforcement and richer-representation acceptance. |
| C12-18 through C12-21 | Absence never produces deletion. RSS has no authoritative deletion capability. | Authoritative providers, tombstones and resurrection ordering. |
| C12-22, C12-23 | Invalid/uncertain intake response blocks checkpoints; saved handoff survives restart and checkpoint-write failure. | Durable downstream receipts and exactly-once canonical effects under replay. |
| C12-24, C12-25 | Checkpoint gating uses intake receipts only; capped snapshot continuation persists. | Downstream failure recovery through its durable jobs; provider-specific historical cursors. |
| C12-26, C12-27 | Scheduler cancels a disabled/unapproved source before fetching. | Retained support graphs, published corrections and feed deletion lifecycle. |

Next coordinated milestone: connect the real durable `CandidateIntakePort`, install the
agreed schema/bindings in a named test environment, and run one RSS source through evidence,
Event and grounded edition. No new paid provider calls or deployment were performed here.
Google News, Telegram, X, LinkedIn and authoritative recheck adapters have not been migrated
to this runtime in this change. Their existing paths remain available on the baseline.

Run:

```powershell
corepack pnpm --filter @distilled/connectors typecheck
corepack pnpm --filter @distilled/connectors test
corepack pnpm --filter @distilled/contracts test
corepack pnpm -r typecheck
```

Validation on 2026-10-04: 130 connector tests passed, including 30 new RSS/runtime
tests (29 source-runtime cases and one local D1/R2 integration case). All 44 shared
contract tests passed. All workspace typechecks passed; the final normalization
change also passed the connector typecheck. No live publisher or paid provider call
was made. Intake in these connector tests is synthetic; no grounded edition was generated.
