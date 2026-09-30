# Connector-facing v1.5 interface

Implementation branch: `feat/source-connectors-v15`, based on `feat/web-operator-runtime-v1` at `606f7d3`. This document freezes the adapter boundary, not the downstream canonical schema.

## Pipeline and ownership

`connector -> ConnectorCandidateProposal -> Candidate Intake -> CandidateItem -> Acquisition Router -> AcquiredContent -> NormalizedEvidenceItem`

The new code lives in `packages/connectors/src/acquisition`. The exported `ConnectorCandidateProposal` deliberately does not replace the browser runtime's existing `CandidateProposal`. Candidate Intake's owner maps this narrow interface to canonical contracts. No Web Operator, live X, semantic dedup, Event/Storyline or intelligence code is changed.

## Durable handoff

1. Fetch a bounded batch and return coverage, retry, telemetry and a checkpoint proposal.
2. `handoffConnectorBatch` persists each immutable payload through `PayloadStore`.
3. Emit proposals with tenant/resource-scoped candidate identity, revision identity, payload digest and `suppliedPayloadRef`.
4. Require a durable intake receipt for every proposal, including previously accepted observations.
5. Advance the checkpoint using compare-and-set against its prior version.

Payload/intake failures cannot advance the checkpoint. A crash after acceptance causes safe replay only when the intake implementation honors its idempotency contract. A failed checkpoint CAS returns `checkpointAdvanced: false`; reload state before retrying. Orphan payload retention belongs to storage maintenance.

The intake binding must atomically deduplicate observation keys and upsert by candidate key. It must order revisions and preserve tombstones. A resource-wide lock must serialize polling, revision rechecks and provider alternatives; checkpoint CAS alone does not prevent stale content overwriting a newer edit. These requirements are contracts, not a claim that D1 integration already exists.

`reuseSuppliedPayload` verifies the digest and upstream identity and returns deterministic provenance. It does not invent model/tool IDs or coerce the browser compatibility `AcquiredContent`. The Acquisition Router binding must map this envelope to the canonical deterministic variant. Feed text/news listings are never silently upgraded to full articles; a full-article request still requires article acquisition.

## Source behavior

| Connector | Identity and incrementality | Coverage/checkpoint behavior |
| --- | --- | --- |
| RSS | Native GUID/Atom ID, otherwise article URL; committed ETag/Last-Modified | Finite feeds remain partial. Validators advance only after all bounded work is accepted; capped/rejected entries prevent validator advancement. |
| Google News | RSS identity; query and locale determine resource registration | Listings are partial content, not article bodies. Same conditional-fetch contract as RSS. |
| Telegram public | Registered numeric channel ID plus message ID; filter previously seen IDs | Latest preview cannot prove continuity. Never advances the shared message cursor or infers deletion from absence. |
| Telethon adapter | Same numeric channel/message identity; oldest-first polling after message ID | Cursor proposal only for ordered polling. Exhaustion means the current polling boundary, not complete historical coverage. Separate bounded rechecks never advance the poll cursor. |

Use one canonical numeric peer-ID convention during registration for both Telegram alternatives. Usernames are locators, not identity. Media-only records may advance the Telethon polling cursor without creating text candidates, consistent with text-only product scope. Explicit deletion evidence may produce a tombstone; unavailable messages alone are not proof of deletion.

RSS entries lacking usable dates/identity are not silently accepted: they leave coverage partial and suppress validators. Capped feeds currently require a larger bound or operator handling; this implementation does not claim RSS pagination/backfill. Changes to Google query/locale or feed URL require a new resource or reset checkpoint.

## Required runtime bindings

- `HttpPort`: enforce allowed public destinations, redirect checks, response size and timeout limits; normalize response header names to lowercase.
- `TelethonPort`: authorized account service, verified channel identity, bounded oldest-first pages, explicit exhaustion, retry/rate-limit classification and actual request/cost telemetry. Session/login secrets never enter proposals.
- `PayloadStore`: immutable tenant-scoped durable storage, authorization on reads, retention policy.
- `CandidateIntakePort`: durable canonical acceptance, atomic idempotency, revision/tombstone ordering.
- `CheckpointStore`: durable versioned CAS under a source lock. Persist explicit validator clearing when fields are undefined.

The scheduler handles retry delays and does not checkpoint retry outcomes. HTTP 429 exposes bounded Retry-After; transport/server failures are transient; authorization failures are separate. Latency is measured per adapter call. Direct HTTP provider cost is zero, excluding hosting; unknown Telethon cost is null, never fabricated.

## Validation and rollout status

The adapters and coordinator are executable library code. Runtime bindings above, canonical CandidateItem/AcquiredContent/NormalizedEvidenceItem mapping, scheduling and deployment are pending the shared integration layer. Existing production ingestion has not been switched to this path.

New tests are synthetic fixtures and in-memory port doubles: persistence ordering, failures, replay, tenant isolation, edits, CAS conflicts, supplied-payload integrity, conditional RSS, capped coverage, rate limits, Google locale, shared Telegram identity, bounded polling and rechecks. They do not establish live durability or operational reliability.

No new live provider calls or paid runs were made for this change. Existing benchmark evidence remains separate under the testing workflow; raw provider output and credentials are not part of these commits. Neither Telegram alternative is declared the winner. A live comparison must use matched channel/message windows and measure text coverage, gaps, edits, authorization failures, rate limits and latency independently of fetch success.
