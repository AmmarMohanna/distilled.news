"""Read-only local SQLite replay of full-body vs active-ID authorization reads.

Usage: python scripts/benchmark-active-evidence-ids.py <restored-staging.sqlite3>
No article content is emitted. This is not a remote D1 or provider benchmark.
"""
import argparse
import json
import pathlib
import sqlite3
import statistics
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('database', type=pathlib.Path)
args = parser.parse_args()
db = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
join = """FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id
JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId')
WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE'
AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL"""
feeds = [r[0] for r in db.execute('SELECT DISTINCT feed_id FROM v1_intake_scopes')]
results = []
for feed in feeds:
    baseline, optimized = [], []
    for _ in range(7):
        start = time.perf_counter()
        rows = list(db.execute('SELECT e.json,r.json ' + join, (feed,)))
        old_ids = {json.loads(revision)['id'] for _, revision in rows}
        baseline.append((time.perf_counter() - start) * 1000)
        start = time.perf_counter()
        new_ids = {row[0] for row in db.execute('SELECT r.id ' + join, (feed,))}
        optimized.append((time.perf_counter() - start) * 1000)
        if old_ids != new_ids:
            raise RuntimeError('ACTIVE_REVISION_ID_COVERAGE_MISMATCH')
    if not old_ids:
        continue
    results.append({
        'feedId': feed, 'activeRevisions': len(old_ids), 'samples': 7,
        'baselineMs': {'p50': statistics.median(baseline), 'p95SampleMax': max(baseline)},
        'optimizedMs': {'p50': statistics.median(optimized), 'p95SampleMax': max(optimized)},
        'fullValueBytes': sum(len(a.encode()) + len(b.encode()) for a, b in rows),
        'idValueBytes': sum(len(i.encode()) for i in new_ids),
        'exactCoverage': True,
    })
db.close()
print(json.dumps({'scope': 'local SQLite restored-history replay; zero provider calls; not remote D1 latency', 'feeds': sorted(results, key=lambda r: -r['fullValueBytes'])}, indent=2))
