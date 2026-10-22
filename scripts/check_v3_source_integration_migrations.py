"""Offline migration union/upgrade checks for the pinned V3 and source parents.

Uses local Git objects and in-memory SQLite only. Never contacts D1 or providers.
"""
from collections import Counter
from pathlib import Path
import json
import io
import sqlite3
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = 'apps/worker/migrations'
BASE = 'ac6299f'
SOURCE = '35883ed'
V3 = '399acc9'


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True).stdout


def history(ref):
    with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', ref, DIRECTORY))) as archive:
        return {Path(member.name).name: archive.extractfile(member).read()
                for member in archive.getmembers() if member.isfile() and member.name.endswith('.sql')}


def order(name):
    return int(name.split('_', 1)[0]), name


def run():
    base, source, v3 = history(BASE), history(SOURCE), history(V3)
    current = {p.name: p.read_bytes() for p in (ROOT / DIRECTORY).glob('*.sql')}
    union = {**source, **v3}
    assert set(current) == set(union), 'Migration filenames were added, dropped or renamed unexpectedly'
    for parent in (source, v3):
        for name, sql in parent.items():
            assert current[name].decode().replace('\r\n', '\n') == sql.decode().replace('\r\n', '\n'), f'Historical migration changed: {name}'
    assert set(source) - set(base) == {'0068_source_execution_admission.sql'}
    assert set(v3) - set(base) == {'0067_v3_model_spend.sql'}
    count = lambda names: {n: c for n, c in Counter(order(name)[0] for name in names).items() if c > 1}
    assert count(current) == count(base), 'The integration introduced a migration number collision'
    schemas = []
    for label, installed in (('fresh', {}), ('source parent', source), ('V3 parent', v3)):
        with sqlite3.connect(':memory:') as db:
            db.execute('PRAGMA foreign_keys=ON')
            applied = set()
            def apply(name):
                if name in applied:
                    return False
                db.executescript(current[name].decode('utf-8-sig'))
                applied.add(name)
                return True
            for name in sorted(installed, key=order):
                apply(name)
            if installed:
                db.execute('INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)', ('preserve-grant', 'test-only-account', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z', json.dumps({'id': 'preserve-grant', 'immutable': True})))
            if '0068_source_execution_admission.sql' in installed:
                db.execute("INSERT INTO source_execution_slots VALUES(0,'held-source-token',123456)")
            if '0067_v3_model_spend.sql' in installed:
                db.execute("INSERT INTO v3_model_spend(id,run_id,feed_id,model,reserved_usd,state,created_at) VALUES('unknown-call','run','feed','test-only-model',0.25,'held',123456)")
            pending = sum(apply(name) for name in sorted(current, key=order))
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall() == []
            if installed:
                assert json.loads(db.execute("SELECT json FROM v1_model_spending_authorizations WHERE id='preserve-grant'").fetchone()[0]) == {'id': 'preserve-grant', 'immutable': True}
            if '0068_source_execution_admission.sql' in installed:
                assert db.execute('SELECT token,lease_until FROM source_execution_slots').fetchone() == ('held-source-token', 123456)
            if '0067_v3_model_spend.sql' in installed:
                assert db.execute('SELECT reserved_usd,settled_usd,state FROM v3_model_spend').fetchone() == (0.25, None, 'held')
            assert not any(apply(name) for name in sorted(current, key=order)), 'Migration replay reapplied a filename'
            schemas.append(db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").fetchall())
            print(f'PASS {label}: {pending} pending migrations; integrity, foreign keys, retained grants/holds and replay checked')
    assert schemas[0] == schemas[1] == schemas[2], 'Upgrade histories did not converge'
    print('PASS V3/source migration union: 0067 and 0068 distinct; historical collisions unchanged; all schemas converge')


if __name__ == '__main__':
    run()
