"""Read-only local SQLite replay of full shortlist versus policy projection.

Uses the largest retained shortlist unless --id is supplied. Emits measurements
and coverage checks only. It is not a remote D1 or model inference benchmark.
"""
import argparse
import json
import math
import pathlib
import sqlite3
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('database', type=pathlib.Path)
parser.add_argument('--id')
parser.add_argument('--samples', type=int, default=7, choices=range(1, 32))
args = parser.parse_args()
with sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True) as db:
    db.execute('PRAGMA query_only=ON')
    identity = args.id
    if not identity:
        row = db.execute("SELECT id FROM v1_feed_documents WHERE kind='shortlists' ORDER BY length(json) DESC LIMIT 1").fetchone()
        if not row:
            raise RuntimeError('NO_RETAINED_SHORTLIST')
        identity = row[0]
    times = {'full': [], 'metadata': []}
    lengths = {}
    for sample in range(args.samples):
        values = {}
        for mode in (['metadata', 'full'] if sample % 2 else ['full', 'metadata']):
            started = time.perf_counter()
            columns = 'id,feed_id,json' if mode == 'full' else "id,feed_id,json_extract(json,'$.policyVersion')"
            row = db.execute("SELECT " + columns + " FROM v1_feed_documents WHERE kind='shortlists' AND id=?", (identity,)).fetchone()
            if not row:
                raise RuntimeError('SHORTLIST_NOT_FOUND')
            policy = json.loads(row[2]).get('policyVersion') if mode == 'full' else row[2]
            values[mode] = (row[0], row[1], policy)
            times[mode].append((time.perf_counter() - started) * 1000)
            lengths[mode] = len(row[2] or '')
        if values['full'] != values['metadata']:
            raise RuntimeError('POLICY_OR_OWNERSHIP_MISMATCH')

def percentiles(values):
    ordered = sorted(values)
    return {label: ordered[math.ceil(len(ordered) * p) - 1] for label, p in [('p50', .5), ('p95', .95), ('p99', .99)]}

print(json.dumps({'environment': 'local-readonly-sqlite', 'samples': args.samples,
                  'identicalPolicyAndOwnership': True, 'providerCalls': 0,
                  'selectedValueCharacters': lengths,
                  'durationMs': {mode: percentiles(values) for mode, values in times.items()}}, indent=2))
