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
