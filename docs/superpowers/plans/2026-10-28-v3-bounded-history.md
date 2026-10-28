# V3 bounded history and cold diagnostics

Goal: remove per-preparation full result-history reads while retaining exact carry semantics, and reclaim live working space using verified existing R2 archival.
Architecture: derived per-result/per-evidence carry index, queried only for current revision IDs. A projection view/insert trigger keeps canonical result writes and cache atomic; a ready marker prevents partial backfill use. Application replay preserves original stable ordering by result ID then windowEnd.localeCompare. Existing canonical results and financial records remain unchanged.
Tech stack: existing Worker, D1 and R2; no new queues, AI stages, models or paid calls.

- [x] Reproduce carry-history reads; add equivalence, ordering, same-result carry precedence, scope, inactive evidence, missing migration, interrupted backfill and young/aged regressions.
- [x] Implement derived index plus bounded, resumable backfill; prove full prepared-input/fingerprint equivalence. New/unready feeds fail closed or use the original full fold until ready.
- [x] Validate existing storage maintenance against real metadata and failure/rollback tests; improve only demonstrated safety issues, then enable its bounded archival of unpaid diagnostic copies. Do not rewrite original article revisions, settled receipts, grants or holds.
- [x] Benchmark identical history workloads, including quiet periods. Rerun V3 publication/recovery, storage, provider and type checks.
- [x] Review, commit/push as Ghada only; under existing authorization apply only tested staging schema/backfill/config, run bounded read-back and archive verification. No production changes or paid evaluation.

Ruling: completed V3 snapshots are much smaller in the diagnostic sample than unpaid semantic waits. Reuse the existing hash-verified archive path first rather than speculatively replacing immutable source or paid-operation payloads. All archived originals remain in R2. Allocation reported by D1 may not shrink; freed pages can be reusable, and no VACUUM/free-space claims will be invented.
Ruling: retain global model RPM/concurrency configuration. Provider paid-throughput qualification remains blocked on a new explicit bounded spending authorization; continue all independent engineering.
Review focus: exact old carry ordering including tied/late results; carry wins if also resolved in one result; missing/disabled sources; interrupted index population and concurrent inserts; R2 corruption, quota/write failures and uncertain paid outcomes.
