# V1 downstream runtime checkpoint

This checkpoint integrates the existing downstream lane; Appendix C of
`ARCHITECTURE_v1.md` and the parallel implementation agreement remain authoritative.
No shared connector wire contract, JEV policy or source authorization is changed.

## Existing paths integrated

- The existing processing queue and maintenance relay execute durable reassessment
  and briefing requests. Publication uses stored selected evidence and exact immutable
  support. Recovery settles an already published request without reopening synthesis;
  blocked synthesis requests do not consume the two eligible briefing relay slots.
- Trusted runtime enrollment maps an already approved RSS product source into a
  canonical Source/FeedSource and feed configuration. Every enabled source in a feed
  must be explicitly switched before that feed can publish through this path.
  Legacy polling skips only explicitly enrolled, allowlisted v1 sources.
- Product configuration, source revocation, account disable and feed deletion fence
  in-flight downstream writes. Historical feed revisions and published support remain
  readable; owner-authorized withdrawal hides an edition without rewriting it.
- Browser fallback reuses the existing bounded runtime and validated workflows for
  the exact candidate. Workflow ownership, candidate identity and accepted content
  are checked; bounded verifier/artifact references persist with acquisition provenance.

Migrations: `0039_v1_product_sources.sql` adds catalog/bindings/enrollment guards;
`0040_v1_product_lifecycle.sql` adds product revocation/deletion fences;
`0041_v1_briefing_outbox.sql` permits durable request settlement;
`0042_v1_feed_versions.sql` retains exact published configuration snapshots.

## Runtime boundaries

`V1_DOWNSTREAM_ENABLED` is off by default. `V1_DOWNSTREAM_FEED_SOURCE_IDS` must
contain at most ten explicitly selected source IDs. Enrollment and explicit briefing
routes require the existing runtime bearer authorization. Public edition/evidence
routes expose only published exact support; withdrawal requires the feed owner.

`V1_BROWSER_ACQUISITION_ENABLED` is off by default. Browser use requires the
existing container executor; model fallback additionally requires configured model,
provider, credentials and positive pricing. It has no external discovery authority.
`V1_SYNTHESIS_MODEL_ENABLED` retains its existing independent opt-in.

This local seam supports already approved RSS sources. Publication windows currently
use closed UTC intervals, with weekly windows starting Monday. Legacy timezone and
time-of-day scheduling are not implemented by this seam. Delivery jobs are durable
publication outbox records; an actual notification consumer and the edition UI remain
outside this checkpoint. No deployment or remote migration is performed here.

## RSS handoff and proof

`prepareRssHandoff` adapts the existing RSS connector output into the frozen handoff
and scoped R2 payloads. It consumes connector-owned durable run identity, sequence,
coverage and safe progress; it does not poll, allocate sequences or advance checkpoints.
Declared RSS language metadata supports plain/CDATA values and missing metadata
remains unknown. RSS text is represented as an excerpt with its actual completeness.

The local full-migration D1/R2 integration test covers acquisition, reassessment,
grounded extractive publication, idempotent replay, retained public citations after
feed deletion, and authorized withdrawal. Its allocator/checkpoint tables are explicitly
test-owned fixtures, not a production connector implementation.

The opt-in live RSS proof was previously run against BBC World RSS: two real items,
two evidence revisions, two grounded stories, zero model calls. Collection was partial;
no checkpoint advancement was claimed for the two-item truncated feed. Normal tests
skip that external proof. This is local persistence proof, not deployed proof.

Production connector polling, continuation, durable run allocation/checkpoint CAS and
provider-specific authoritative rechecks remain the connector owner's integration work.

## Verification

See the checkpoint completion report for exact command results and isolated failures.
The unrelated existing source-text browser guard rejects `.dispatchEvent(` in the
WebSocket-denial shim in `packages/agent-runtime/src/browser.ts`; that file and guard
are unchanged by this checkpoint. No assertions or timeouts were relaxed.

All commands below ran from the repository root with Corepack pnpm 10.12.1:

| Command | Result |
| --- | --- |
| `corepack pnpm --filter @distilled/worker typecheck` | Passed, repeated after final code fixes. |
| `corepack pnpm typecheck` | All seven workspace package checks passed after final code fixes. |
| `corepack pnpm --filter @distilled/contracts test` | 44 passed. |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intake src/v1-intelligence src/v1-downstream-runtime.test.ts src/container-web-operator-browser.test.ts src/migrations-clean.test.ts --maxWorkers=1` | Final focused run: 18 files; 94 passed, 1 optional live-RSS test skipped. |
| `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` | 56 files; 304 passed, 1 optional live-RSS test skipped. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/source-acquisition-orchestrator.test.ts test/production-source-acquisition-service.test.ts test/production-web-operator-adapter.test.ts --maxWorkers=1` | 20 passed. |
| `corepack pnpm --filter @distilled/browser-bridge exec vitest run --maxWorkers=1` | 82 passed. |
| `corepack pnpm test` | Root scripts 4, contracts 44, core 43, connectors 100, web 5 passed. Agent-runtime 264 passed, 2 opt-in tests skipped, 1 existing browser source guard failed. Recursive execution stopped there; worker and browser-bridge were completed separately as above. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/trusted-browser-api-guard.test.ts --maxWorkers=1` | Same deterministic existing guard failure reproduced in isolation. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/browser.integration.test.ts -t 'actively closes an isolated browser context' --maxWorkers=1` | 1 passed, 56 filtered out. |

The full real-Chromium browser integration file passed all 57 tests in the workspace
run. An earlier separately launched browser/acquisition run had 76 passes and a
lease-abort polling assertion timing failure; its isolated rerun passed unchanged.
Two engine cases exceeded their existing 5-second deadlines during the first
concurrent focused run. Both passed unchanged in isolation and in the final full
worker run. They are classified as resource-contention timing failures, not hidden
functional failures. The source-text guard remains a deterministic unrelated failure.

Concrete relay regressions were reproduced before their fixes. The added browser
provenance regression exposed the strict persistence schema omission; both the
schema and internal type were corrected and all ten acquisition tests then passed.
