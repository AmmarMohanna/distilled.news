# Shared v1 contracts

`@distilled/contracts` is the connector/intake/downstream boundary for parallel work.
The normative baseline is [Architecture v1 Appendix C](../../documentation/ARCHITECTURE_v1.md).
The [working agreement](../../documentation/PARALLEL_IMPLEMENTATION_AGREEMENT.md)
defines responsibility and the handoff protocol.

Exports:

- `types.ts`: Appendix C wire types, including immutable evidence/event references and assessments.
- `schemas.ts`: strict Zod runtime validators, receipt invariants and assessment-reference checks.
- `handoff.ts`: versioned async `CandidateIntakePort.acceptBatch`, request/response validation,
  typed errors and receipt checks for an independently proven contiguous prefix.
- `ordering.ts`: pure ordering decision helper with an injected registered revision comparator.
- `hashing.ts`: shared `text-v1` normalized content hash and exact-byte payload SHA-256.
- `fixtures.ts`: reusable synthetic handoff and ordering vectors.
- `acceptance-cases.json`: all C12 cases and expected outcomes, for both integration lanes.

Consumers add `"@distilled/contracts": "workspace:*"` when integrating. Existing production
connectors and workers have not been switched to these types in this commit. The existing
connector-local `CandidateIntakePort` is a legacy interface; adapt it rather than confusing
it with this package's `acceptBatch` port.

```ts
import { handoffConnectorBatch, type CandidateIntakePort } from '@distilled/contracts';
const response = await handoffConnectorBatch(intake, batch);
// Only the connector can prove which observation IDs fall through its proposed safe cursor.
// Advance via durable checkpoint CAS only after validating that prefix's receipts.
```

Validation proves shape and internal consistency, not storage durability, source authenticity,
query authorization, egress safety, or transaction atomicity. Production bindings must enforce
those properties. `durable: true` is the trusted intake implementation's post-commit assertion.
There is no in-memory implementation pretending to be a production database.

Run `corepack pnpm --filter @distilled/contracts typecheck` and
`corepack pnpm --filter @distilled/contracts test` with the declared pnpm version.
The tests establish library decisions and boundary validation only. C12 restart/replay,
concurrent allocator/CAS, retained publication, payload storage and provider checks require
binding-level tests against the actual D1/R2/provider implementation before acceptance.
Mock-port repeat calls do not establish durable idempotency.
