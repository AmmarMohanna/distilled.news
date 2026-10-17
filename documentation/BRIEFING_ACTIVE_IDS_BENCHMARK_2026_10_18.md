# Active evidence authorization read benchmark

Target: existing staging D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459` only.
Seven paired, alternating-order, read-only samples, 2026-10-17 around 23:36 UTC.
No provider/model request, source permission change or state reset occurred.

The largest active staging feed contains 2,137 revisions. The old semantic-operation
authorization and post-response checks each loaded every item/revision JSON body
just to construct a revision-ID set. The replacement selects IDs from the same joins.

| Metric | Full item/revision read | Active revision-ID read |
|---|---:|---:|
| Server SQL p50 | 27.4696 ms | 8.2019 ms |
| Server SQL p95 (sample maximum) | 31.6913 ms | 8.5638 ms |
| Authenticated API round-trip p50 | 779 ms | 400 ms |
| Authenticated API round-trip p95 | 1,447 ms | 652 ms |
| D1 reported rows read per query | 4,285 | 4,285 |
| Returned value characters | 3,523,492 | 76,932 |
| Exact revision-ID coverage | 2,137 | 2,137 |

All seven pairs matched exact ID sets. This is not review latency, not a real-model
benchmark, and not proof of reduced billed D1 row reads. The API transport differs
from a Worker's D1 binding. The small sample does not establish a sustained p95 SLA.

## Reproduction

For a full restored local snapshot, run the read-only numeric-reporting replay:

```powershell
python scripts/benchmark-active-evidence-ids.py <restored-staging.sqlite3>
```

For the staging API measurement, execute the following two queries through the
authenticated staging D1 query API, binding the exact same authorized Feed ID.
Capture result rows in memory only; emit numeric timings, selected-value lengths
and ID equality, never the article/item JSON. Alternate query order on successive
pairs, take seven samples, and use the nearest-rank p50/p95 with sample counts.

```sql
-- Full read, matching the prior active-evidence authorization path.
SELECT e.json AS item, r.json AS revision
FROM v1_evidence e
JOIN v1_intake_scopes s ON s.id=e.feed_source_id
JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId')
WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE'
  AND json_extract(s.json,'$.enabled')=1
  AND json_extract(s.json,'$.deletedAt') IS NULL;

-- Optimized read: identical scope/state/revision joins, no article bodies.
SELECT r.id
FROM v1_evidence e
JOIN v1_intake_scopes s ON s.id=e.feed_source_id
JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId')
WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE'
  AND json_extract(s.json,'$.enabled')=1
  AND json_extract(s.json,'$.deletedAt') IS NULL;
```

Compare sorted IDs from parsed `revision.id` against the second query's `id`.
If active evidence changes between the two reads, report that pair as changed
context; do not silently count it as a coverage success or a regression.

Focused regression coverage includes source disablement, deletion, foreign Feed
isolation, stale source/Feed CAS, replacement during a billed callback, UNKNOWN
outcomes, reported settlement after lease loss, and exact paid-result reuse.
The comparison does not replace canonical CAS or financial authorization.
