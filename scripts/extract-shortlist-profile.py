"""Extract one Feed's deterministic shortlist inputs from a trusted D1 SQL export.

Local only; the source export is read-only. The filtered database is a profiling
fixture, not a replacement backup. No article text, prompts or credentials are
printed. Existing output files are never overwritten.
"""
import argparse
import hashlib
import json
import pathlib
import re
import sqlite3
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('export', type=pathlib.Path)
parser.add_argument('--feed-id', required=True)
parser.add_argument('--output', required=True, type=pathlib.Path)
parser.add_argument('--expected-sha256')
args = parser.parse_args()
source, target = args.export.resolve(), args.output.resolve()
if target.exists() or source == target:
    raise SystemExit('PROFILE_OUTPUT_ALREADY_EXISTS_OR_IS_SOURCE')
with source.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
if args.expected_sha256 and digest != args.expected_sha256.lower():
    raise SystemExit('PROFILE_EXPORT_HASH_MISMATCH')
tables = {'v1_feeds', 'v1_intake_scopes', 'v1_evidence', 'v1_revisions',
          'v1_inputs', 'v1_intake_receipts', 'v1_feed_documents'}
excluded = {'semantic_intents', 'semantic_results', 'semantic_settlements',
            'salience_intents', 'salience_results', 'model_intents', 'model_executions',
            'editorial_proposals', 'semantic_construction_work', 'semantic_construction_progress'}

def statements():
    pending = []
    with source.open(encoding='utf-8-sig', newline='') as stream:
        for line in stream:
            pending.append(line)
            if line.rstrip().endswith(';'):
                sql = ''.join(pending)
                if sqlite3.complete_statement(sql):
                    yield sql.strip()
                    pending = []
    if ''.join(pending).strip():
        raise RuntimeError('PROFILE_INCOMPLETE_EXPORT')

def table_name(sql, create=False):
    pattern = (r'^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?([\w]+)' if create
               else r'^INSERT INTO\s+["`\[]?([\w]+)')
    match = re.match(pattern, sql, re.I)
    return match.group(1) if match else None

started = time.monotonic()
db = sqlite3.connect(target)
try:
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA foreign_keys=OFF')
    indexes = []
    for sql in statements():
        if table_name(sql, create=True) in tables:
            db.execute(sql)
        if table_name(sql) in {'v1_feeds', 'v1_intake_scopes'} and args.feed_id in sql:
            db.execute(sql)
        index = re.match(r'^CREATE (?:UNIQUE )?INDEX\s+.+?\s+ON\s+["`\[]?([\w]+)', sql, re.I)
        if index and index.group(1) in tables:
            indexes.append(sql)
    db.commit()
    scopes = [row[0] for row in db.execute('SELECT id FROM v1_intake_scopes WHERE feed_id=?', (args.feed_id,))]
    if not scopes or db.execute('SELECT count(*) FROM v1_intake_scopes WHERE feed_id<>?', (args.feed_id,)).fetchone()[0]:
        raise RuntimeError('PROFILE_SCOPE_MISSING_OR_AMBIGUOUS')
    needles = [args.feed_id, *scopes]
    for sql in statements():
        table = table_name(sql)
        if table not in tables or table in {'v1_feeds', 'v1_intake_scopes'} or not any(n in sql for n in needles):
            continue
        if table == 'v1_feed_documents':
            kind = re.search(r"VALUES\s*\('([^']+)'", sql, re.I)
            if not kind:
                raise RuntimeError('PROFILE_UNKNOWN_DOCUMENT_INSERT_SHAPE')
            if kind.group(1) in excluded:
                continue
        db.execute(sql)
    for sql in indexes:
        db.execute(sql)
    db.commit()
    counts = {table: db.execute('SELECT count(*) FROM ' + table).fetchone()[0] for table in sorted(tables)}
    print(json.dumps({'scope': 'local retained-export profiling fixture; not a replacement backup',
                      'sqlSha256': digest, 'tables': counts, 'ownedScopes': len(scopes),
                      'bytes': target.stat().st_size, 'elapsedSeconds': time.monotonic() - started,
                      'providerCalls': 0, 'remoteChanges': 0}))
finally:
    db.close()
