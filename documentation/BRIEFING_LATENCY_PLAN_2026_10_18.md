# Briefing latency implementation plan and execution record

Goal: reduce source-observation-to-grounded-publication time on the existing
`backend-briefing-review` branch, preserving recovery commit `68ce2a76` and migrations
0059–0061. Only `apps/worker/wrangler.staging.toml` authorizes remote changes.

The user's detailed engineering brief is the specification and authorizes execution
through deployment. This record uses the writing-plans, systematic-debugging,
test-driven-development and executing-plans workflows without another approval gate.

## Design

The queue currently wraps semantic preparation and canonical review in the same
feed write turn. Separate these phases behind `V1_REVIEW_PREPARATION_ISOLATED`.
Maintain durable work leases, provider intent/reservation/settlement identity and
the canonical engine's feed/scope CAS. Acquire the feed write turn only for engine
consumption and rematch bookkeeping. Work-scoped semantic leases may overlap for
different review identities, but must exclude duplicate identities and legacy
feed-wide owners. Keep existing transport capacities unchanged for rollout.

Read an authorized feed/scope snapshot before context loading and revalidate it
before starting paid preparation. Revalidate feed revision and exact evidence,
event and storyline versions during canonical consumption. Stale decisions defer
with durable rematches; uncertain paid outcomes never authorize another call.

Optimize repeated retained-membership scans with a transaction-local version
index that incorporates staged memberships. Preserve complete candidate recall;
do not prune by age or remove historical provenance. Cache feature computation
within one preparation only. These optimizations need no migration. A subsequent
explicitly owner-approved $50-to-$51 append-only financial amendment required
additive migration 0062; it was separately tested/backed up and applied only to staging.

Use one aggregate structured timing record per review/publication execution and
one per model operation. Stage totals, counts, CAS conflicts and admission waits
contain opaque IDs and numeric diagnostics only. No source text/prompts/payloads.
Aggregate percentiles offline; do not write a D1 row per timing stage.

## Tasks

- [x] Fetch the exact existing remote branch into an isolated worktree, preserving
  the dirty main checkout. Read project/recovery/runtime/deployment documentation.
- [x] Establish retained baseline, deterministic retained-graph and lock-contention
  probes; read live staging versions/configuration, migration history, integrity,
  retained counts and model latency. Initial full runs were interrupted during
  development; the frozen release run below supplies full regression coverage.
- [x] Add failing race tests for slow preparation, duplicate/sibling leases,
  canonical turn contention, source revocation and stale graph consumption.
  Implement the phased runtime and short write admission. Preserve legacy default.
- [x] Add failing membership-index tests covering historical/current versions,
  staged writes, retries and foreign scope; benchmark before/after and implement.
- [x] Add stage instrumentation with schema/privacy tests; instrument admission,
  review, model authorization/provider/settlement, transaction and publication.
  Add a reusable percentile summarizer for redacted structured logs.
- [x] Run focused and full regression suites, repository typechecks/builds,
  explicit staging dry run and independent final correctness review.
- [x] Verify live staging config/resources/rollback/assets. If migration becomes
  necessary, locally test it, export/verify staging backup and inspect ledger first.
  Preserve live bindings/secrets/assets and all existing financial authority.
- [x] Deploy staging only, verify implementation/version/assets, run bounded live
  acquisition/review/publication attempts and inspect queues/accounting/integrity.
  Roll back application for serious regression; never erase financial/history data.
- [ ] Successfully publish a complete new real-model briefing and measure its
  end-to-end latency. Blocked by current financial authorization, accepted review
  backlog and unresolved coverage/unknown-outcome dependencies; do not claim success.
- [x] Record measured versus expected improvements, quality/coverage, actual
  costs, blocked provider comparisons, deployment/rollback IDs, and remaining work.
  Make small logical commits and push only backend-briefing-review.

## Review focus

1. Concurrent acquisition changes accepted evidence during a paid call: reject
   stale consumption but settle reported cost and retain receipt.
2. Two reviews prepare NEW_EVENT from one graph: serialize commits and defer stale
   sibling decision; never silently merge or lose evidence.
3. Lease expiry/replacement and worker interruption: old owner cannot mutate graph
   or release replacement; UNKNOWN provider outcome cannot be retried blindly.
4. Historical correction/multi-development support remains discoverable through
   the entire retained graph and exact immutable revisions.
5. Unavailable/rate-limited sources and protected corrections stay visible; no
   incomplete coverage is converted to QUIET or silently represented as complete.

## Execution notes

Final continuation: cache/replay/exposure code `f7fcfa1` and the subsequently
measured recovery-query fix `8a451ae` were pushed and deployed only to staging.
The final Worker is `45f475b8-0d2a-4da3-9b44-bffc113ffdcb`. Full final Worker CI
passes 1,635 cases (11 skipped), typechecks/build pass, and eight pre-existing
browser E2E failures remain. The approved append-only $51 cap is active after
verified backup and migration 0062; all 44 original unknown holds remain intact.
Actual synthesis and repair ran, but factual prechecks rejected both drafts.
**End-to-end publication acceptance is BLOCKED, not complete.** See the
[final validation record](BRIEFING_FINAL_VALIDATION_2026_10_18.md) for exact stage
times, actual costs, evidence checks, backlog/DLQ counts and remaining priorities.

- Workspace: `.review-tmp/backend-briefing-review`; base `68ce2a76c36adc1060ef908bd5fd6f9c61074bd1`.
- Locked install succeeded (230 packages); no dependency changes requested.
- Baseline full Worker suite started before product edits; output is ignored local
  evidence under `.local-reports/briefing-latency/`.
- Ruling: retain one intelligence transport slot until live measurements justify
  expansion. Safe overlap capability does not itself justify higher paid concurrency.
- Ruling: do not invent a partial-publication timeout. Preserve current truthful
  pending/blocked/deferred semantics until schedule and live coverage evidence can
  support a compatible policy; assess this explicitly in the final report.
- Implemented and focused-tested the phased runtime, exact dependency fences,
  membership index, identity-only authorization and structured timing/reporting.
- Source baseline is retained staging history plus deterministic paired fixtures.
  A bounded predeploy tail had no completed transaction sample; no fresh review
  p50/p95 is invented. Live paired D1 authorization-query samples are recorded.
- Full local backup/restore and additive recovery-migration preservation checks
  passed; staging migrations 0059–0061 applied with fresh pre/post retained counts.
- Initial full Worker verification was interrupted after development continued
  against cached modules. The frozen release run is authoritative, uses one test
  worker with 30s default test/hook timeouts, and completed. Runtime code remained
  frozen during it. Original failures and successful reruns are recorded rather
  than relabeling the initial command green. The later metadata optimization has
  separate complete affected-file coverage and fresh typechecks/staging dry run.
- Independent review findings fixed: receipt identity accounting, paid settlement
  visibility after rejected consumption, queue correlation and integrated paid
  response/sibling preparation races. No Critical graph-integrity issue was found.
- First staging deployment: `52bdd0b` / `2d8f4495-3233-4841-9f5b-5918be2023ec`.
  Six hours of live profiling confirmed publication shortlist/database work remained
  substantial and current GPT authorization could not admit new calls.
- Metadata follow-up: `082b65e` / `7ec08976-c164-461d-886f-9b29d48d4688`.
  Batch correction identities and project historical shortlist policy metadata;
  preserve staged writes, foreign-scope rejection, complete caches and CAS fences.
  All 133 affected cases pass across documented runs/reruns; deployment bindings
  are unchanged. See the linked publication profile for measurements and limits.
