"""Offline checks: preserve applied filenames and upgrade both merge parents."""
from pathlib import Path
from collections import Counter
import sqlite3
from check_v3_source_integration_migrations import history, order

ROOT = Path(__file__).resolve().parents[1]
PARENTS = {'Joud': 'ebe6997e6ef3f604d9c9ab821295394bd91822aa',
           'V3/source': 'f18ef4bc8793bde8daaa95590d5cf5f7743b75eb'}

def run():
    parents = {label: history(ref) for label, ref in PARENTS.items()}
    current = {p.name: p.read_bytes() for p in (ROOT/'apps/worker/migrations').glob('*.sql')}
    for installed in parents.values():
        for name, sql in installed.items():
            assert current[name].decode('utf-8-sig').replace('\r\n','\n') == sql.decode('utf-8-sig').replace('\r\n','\n'), name
    assert set(current) == set().union(*(set(p) for p in parents.values()))
    schemas = []
    for label, installed in {'fresh': {}, **parents}.items():
        with sqlite3.connect(':memory:') as db:
            db.execute('PRAGMA foreign_keys=ON')
            for name in sorted(installed, key=order):
                db.executescript(installed[name].decode('utf-8-sig'))
            if installed:
                db.execute("INSERT INTO accounts(id,email,normalized_email,username,password_hash,role,created_at,updated_at) VALUES('retained-owner','retained@example.test','retained@example.test','retained','unused','user','2026-10-01','2026-10-01')")
            if '0061_daily_collector_budget.sql' in installed:
                db.execute("INSERT INTO connector_daily_provider_budgets VALUES('2026-10-22',5,4.75)")
            if '0067_v3_model_spend.sql' in installed:
                db.execute("INSERT INTO v3_model_spend(id,run_id,feed_id,model,reserved_usd,state,created_at) VALUES('unknown-call','run','feed','fake',0.25,'held',123456)")
            pending = sorted(set(current)-set(installed), key=order)
            for name in pending:
                db.executescript(current[name].decode('utf-8-sig'))
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall() == []
            if installed:
                assert db.execute("SELECT username FROM accounts WHERE id='retained-owner'").fetchone()[0] == 'retained'
            if '0061_daily_collector_budget.sql' in installed:
                assert db.execute('SELECT reserved_usd FROM connector_daily_provider_budgets').fetchone()[0] == 4.75
            if '0067_v3_model_spend.sql' in installed:
                assert db.execute("SELECT state,reserved_usd FROM v3_model_spend WHERE id='unknown-call'").fetchone() == ('held',0.25)
            schemas.append([(*row[:3], row[3].replace('\r\n','\n')) for row in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")])
            print(f'PASS {label}: {len(pending)} pending full filenames; data, unknown holds, integrity and foreign keys preserved')
    assert all(s == schemas[0] for s in schemas)
    print('PASS schemas converge; no applied migration renamed or rewritten')
    print('Shared numeric prefixes:', {n:c for n,c in Counter(order(n)[0] for n in current).items() if c>1})

if __name__ == '__main__':
    run()
