# V3 selective database reads

Branch: ghada/v3-selective-database-reads. Base: 594c5ce.

## First retained change
V3 preparation now reuses the existing revisionEvidenceIds store helper instead of fetching every previously published full revision individually. It returns only immutable revision/evidence identities, preserves the same feed-scope join and ignores missing revisions just as before. Queries contain at most 90 IDs. No source evidence, history selection, unresolved carry logic, frozen request identity, accounting or prompts change.

For N distinct previously-used revision IDs, this lookup changes from N full-revision queries to ceil(N/90) identity-only queries. At 181 references that is 181 versus 3 queries; zero references still need zero queries. This is a bounded-query-count calculation, not a measured live latency or rows-read improvement. Total preparation still grows with other retained-history reads.

## Validation
A regression first failed against the old implementation because it issued individual revision reads. It then compares the complete prepared snapshot/fingerprint with a young baseline after adding 181 irrelevant missing historical references and asserts use of the batched helper. Existing store tests cover actual revision identity, duplicate/missing IDs, empty inputs and foreign feed isolation. Existing V3 window tests cover publication, updates/late discovery, ordering and settled-call recovery. This is a first narrow optimization, not completion of the wider scaling work.

## Remaining work
Attribute shared document-list queries to callers before ranking total load. Separate eligible reader prose from all-time published-evidence membership and unresolved work. Preserve the existing relevance algorithm, old corrections, withdrawal semantics and ordered carry resolution. Benchmark young/aged feeds with equal new content, quiet maintenance and sustained read traffic; record database rows/bytes/duration and session/feed p50/p95. No deployment or paid inference is part of this change.
