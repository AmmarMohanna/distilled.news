# V3 selective database reads

Branch: ghada/v3-selective-database-reads. Base: 594c5ce.

## First retained change
V3 preparation now reuses the existing revisionEvidenceIds store helper instead of fetching every previously published full revision individually. It returns only immutable revision/evidence identities, preserves the same feed-scope join and ignores missing revisions just as before. Queries contain at most 90 IDs. No source evidence, history selection, unresolved carry logic, frozen request identity, accounting or prompts change.

For N distinct previously-used revision IDs, this lookup changes from N full-revision queries to ceil(N/90) identity-only queries. At 181 references that is 181 versus 3 queries; zero references still need zero queries. This is a bounded-query-count calculation, not a measured live latency or rows-read improvement. Total preparation still grows with other retained-history reads.

## Validation
A regression first failed against the old implementation because it issued individual revision reads. It then compares the complete prepared snapshot/fingerprint with a young baseline after adding 181 irrelevant missing historical references and asserts use of the batched helper. Existing store tests cover actual revision identity, duplicate/missing IDs, empty inputs and foreign feed isolation. Existing V3 window tests cover publication, updates/late discovery, ordering and settled-call recovery. This is a first narrow optimization, not completion of the wider scaling work.

## Remaining work
Attribute shared document-list queries to callers before ranking total load. Separate eligible reader prose from all-time published-evidence membership and unresolved work. Preserve the existing relevance algorithm, old corrections, withdrawal semantics and ordered carry resolution. Benchmark young/aged feeds with equal new content, quiet maintenance and sustained read traffic; record database rows/bytes/duration and session/feed p50/p95. No deployment or paid inference is part of this change.

## Current-evidence observation lookup
Preparation previously selected timing metadata for every revision in the feed, including superseded history. It now loads the same current evidence set first and queries observation timing only for its distinct revision IDs, in batches of 90. No current IDs means no observation query. Source-observation ownership joins and missing-observation fallback to acceptedAt remain unchanged. This reduces returned historical metadata; it does not claim the database performs constant work without a measured plan.

The regression first failed against the old unfiltered query. Full V3 integration tests exercise observation cutoffs, meaningful late discoveries, initial backlog exclusion, pending-window recovery, frozen-operation replay and persistence. The broad publication-memory and ordered carry-result reads remain unchanged; they require a separate exact-equivalence benchmark before refactoring. No live p50/p95 or CPU-reset improvement is claimed.

## Unresolved request projection
Carry-forward preparation now selects only window metadata from requests whose state is not DONE or whose result is DEFERRED. SQL IS NOT deliberately includes a missing/null legacy state, matching JavaScript's previous inequality. The existing JavaScript date comparisons remain unchanged. Failed and old unresolved windows retain eligibility; terminal published/quiet payloads are not returned. Migration 0074 adds a matching partial feed/id index, with an EXPLAIN regression confirming its use. Without that migration the query still works correctly but may scan historical requests.

The fixture compares exact selected windows with the former predicate across pending, failed, deferred, published, quiet and missing-state requests, using large irrelevant request payloads, and checks cross-feed isolation. Initial fixture setup failed because it omitted a required feed revision; that harness error was corrected. This is not a young/aged live performance benchmark. No schema migration or deployment was applied remotely.

## Young versus aged local measurement
Synthetic Miniflare D1 benchmark holds one unresolved window constant and adds 0/100/1000 completed requests with 4 KiB padding each. The old query reads 1/101/1001 rows and returns 134/426534/4264134 serialized bytes. With migration 0074, the selective query reads one row and returns 106 bytes at every size, with identical selected windows. Local duration values are recorded with the artifact; timer-resolution zero does not mean zero execution time. This validates the lookup scaling only, not complete preparation or live session p50/p95. The reproducible test and sanitized measurements are committed.

With the pending request removed and all 1,000 historical requests retained, the quiet selective lookup returned no windows and read zero rows.

## Carry-history projection investigated and not retained
A local candidate projected only resolved/carried source IDs from historical V3 outputs using correlated json_each expressions. It avoided returning reader prose and preserved a sampled later-resolution case, but still parsed all historical result documents and introduced several JSON traversals per result. No evidence established reduced database CPU or work proportional to unresolved items. Because the incident is database CPU resets rather than response bytes alone, this candidate was removed from product code instead of treating smaller output as a successful optimization. Experiment source and logs remain local.

The next required step is a candidate-identity-driven carry query or measured incremental representation, with exact old-history fold equivalence. That design must account for later resolutions, same-window ordering and old unresolved evidence; simply truncating results would lose recovery eligibility. The last validated implementation remains unchanged by this experiment.

## Empty-current-evidence preparation
V3 now obtains the same current evidence set before reading historical carry results or resolving historical revision identities. If that set is empty, neither read can affect the final articles, so both are skipped. Publication reader history remains unchanged, and the snapshot/fingerprint is identical. The nonempty path retains the original carry fold and historical identity semantics. This is not an early return that marks pending work complete, changes a job state, releases a hold or drops old evidence; when evidence becomes current later the normal path still runs. A regression first reproduced unnecessary reads, then checks exact snapshot equivalence and absence of both calls. This reduces quiet preparation work but does not bound all remaining history reads.

## Publication visibility join
Preparation now joins edition rows to same-feed publication_status rows and returns only PUBLISHED edition payloads. It replaces two application reads (all statuses and all editions) with one joined read, retaining edition-ID order before the existing createdAt sort and the exact JavaScript window cutoff. A fixture compares complete returned objects with the original filter across published, withdrawn, missing-status and foreign-status records; with padded editions it verifies returned payload is below one third of the old full-edition transfer. Mutable visibility is not cached.

This is not an age cutoff or newest-16 limit: all published editions still contribute to all-time used-evidence identity and existing reader-memory selection. It is a narrow payload/roundtrip improvement, not a claim that published-history work is now bounded. No new index, deployment, paid calls or financial changes.

## Whole-preparation baseline after retained fixes
A second synthetic Miniflare benchmark runs real prepareV3Window with one unchanged current article, no additional unresolved work, and 0/100/500 old published editions outside reader memory. It verifies identical article inputs and identical selectPrior output; raw prior snapshots intentionally differ. Measured all() reads grow from 7 to 208 to 1008 rows, with 1172/128471/637671 returned bytes. First() queries are excluded from this instrumentation, so these are not complete database totals. Single local elapsed measurements were approximately 183/211/253 ms; they are not production latency distributions.

This exposes the remaining issue despite the successful unresolved-window lookup benchmark: full published reader prose still crosses the database boundary even when the model ignores it. The required next change is to separate age-eligible reader prose from all-time used revision/evidence identity, preserving the shared memory-policy boundary and invalid-date behavior. A newest-16 SQL limit is not equivalent to relevance ranking. Carry-forward history must remain independent. No claim of constant-work full preparation is justified yet.

## Separate reader prose from publication identity
The product preparation path now reads published-edition headers and evidenceRevisionIds for all history, then fetches story prose only for editions eligible under the same shared priorMemoryCutoff used by selectPrior. The cutoff is anchored to the reporting-window end, matching publishProductV3Window's engine clock, not preparation wall time. Metadata keeps all old evidence identity and window information; carry-result history is independent and unchanged. Invalid publication dates remain eligible exactly as before, and the boundary is inclusive. Relevance scoring still sees all eligible reader prose before selecting up to 16 items.

Raw newly prepared snapshots no longer include expired prior prose, so their fingerprints can differ from previous code. This is intentional: no expired prose was sent to the model under the old default policy either. Previously frozen snapshots and settled operation identities are reused unchanged. Snapshot equivalence tests on ordinary/current history and the full frozen-recovery suite continue to apply; the age benchmark compares effective selected memory and article inputs rather than incorrectly demanding unchanged expired raw prose.

The header query still reads metadata proportional to all published editions. This reduces payload growth, not all history-related CPU or rows-read growth. It does not resolve the remaining ordered carry-history scan, nor establish live session/feed latency or reset elimination. No migration, paid calls or deployment.

The repeated identical synthetic aging fixture now returns 1172/12171/56171 bytes at 0/100/500 old editions, versus baseline 1172/128471/637671 bytes. At 500 editions this is about 91% less transferred data. Measured rows remain 7/208/1008, confirming that all-time metadata still scales with history. Separate-run elapsed times are not a controlled latency comparison. The test preserves identical current articles and model-selected prior; boundary, invalid-date and old-identity tests pass. Validation: 26 worker tests across three files, 109 briefing tests, and worker typecheck passed.

## Safety audit and bounded live reads
Review found a split-read race: retention could delete a memory-eligible edition between header and prose reads, and the implementation substituted empty stories. A failing regression reproduced this and the method now throws TEMPORARY_UNAVAILABLE for missing/non-array stories instead of silently weakening reader memory. This does not retry inference or release accounting holds. Three publication-history regressions and worker typecheck pass after the fix.

Read-only staging probes for homepage, session and both public Lebanon feeds returned 200. Actual baseline/header/prose SQL queries on the same 12 publications per feed (24 total) returned equal evidence memberships and reader prose. All sampled editions were within the memory horizon, so live testing does not establish old-date boundary behavior; those cases remain synthetic tests. Evidence hashes and probe timings are saved in live-safety.json. No remote mutations, paid calls, deployment or notifications.

Readiness: suitable for further isolated integration/load validation, not a demonstrated complete production-scale fix. Remaining risks include all-time metadata growth, ordered carry-history scans, incomplete path attribution and lack of sustained aged-feed load tests with page/session p50/p95. Existing published snapshots and financial guards remain unchanged.
