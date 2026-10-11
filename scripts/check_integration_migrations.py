"""Offline reconciliation checks for both contributor migration histories.
Wrangler identifies applied migrations by full filename, not numeric prefix.
No remote database, tokens, renaming, or migration-history rewriting is used.
"""
from pathlib import Path
import sqlite3
ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "apps" / "worker" / "migrations"
SOURCE = {"0046_connector_item_fingerprints.sql", "0047_mail_oauth_tokens.sql"}
UI = {"0046_explore_featured.sql", "0047_web_push.sql"}
FORWARD = "0048_browser_push_lease.sql"
def run_scenario(label, initial):
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    names = sorted(p.name for p in MIGRATIONS.glob("*.sql"))
    def apply(name):
        if db.execute("SELECT 1 FROM d1_migrations WHERE name=?", (name,)).fetchone():
            return False
        db.executescript((MIGRATIONS / name).read_text(encoding="utf-8-sig"))
        db.execute("INSERT INTO d1_migrations(name) VALUES(?)", (name,))
        db.commit()
        return True
    if initial:
        for name in names:
            if int(name.split("_", 1)[0]) <= 45 or name in initial:
                apply(name)
        db.execute("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at) VALUES('preserved-owner','p@example.invalid','p@example.invalid','preserved','user','fixture-hash','2026-10-11','2026-10-11')")
        db.execute("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at) VALUES('preserved-feed','preserved-owner','preserved','Preserve this feed','integration','2026-10-11','2026-10-11')")
        if initial == SOURCE:
            db.execute("INSERT INTO connector_item_fingerprints VALUES('preserved-feed','source','canonical','item',1,'fixture-fingerprint',1)")
            db.execute("INSERT INTO mail_oauth_tokens VALUES('OUTLOOK_GRAPH',1,'fixture-iv','fixture-encrypted-value','2026-10-11')")
        else:
            db.execute("UPDATE briefings SET explore_featured=1 WHERE id='preserved-feed'")
            db.execute("INSERT INTO push_subscriptions(endpoint,account_id,subscription_json,last_notified_at,created_at) VALUES('https://fcm.googleapis.com/fixture','preserved-owner','{}','2026-10-11','2026-10-11')")
        db.commit()
    pending = [name for name in names if apply(name)]
    assert set(SOURCE | UI | {FORWARD}).issubset({r[0] for r in db.execute("SELECT name FROM d1_migrations")})
    assert len(list(db.execute("SELECT name FROM d1_migrations"))) == len(names)
    assert "explore_featured" in {r[1] for r in db.execute("PRAGMA table_info(briefings)")}
    assert {"lease_token", "notification_version"}.issubset({r[1] for r in db.execute("PRAGMA table_info(push_subscriptions)")})
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not list(db.execute("PRAGMA foreign_key_check"))
    schema = list(db.execute("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))
    if initial:
        assert db.execute("SELECT title FROM briefings WHERE id='preserved-feed'").fetchone()[0] == "Preserve this feed"
        if initial == SOURCE:
            assert db.execute("SELECT fingerprint FROM connector_item_fingerprints").fetchone()[0] == "fixture-fingerprint"
            assert db.execute("SELECT ciphertext FROM mail_oauth_tokens").fetchone()[0] == "fixture-encrypted-value"
        else:
            assert db.execute("SELECT explore_featured FROM briefings WHERE id='preserved-feed'").fetchone()[0] == 1
            assert db.execute("SELECT lease_token,notification_version FROM push_subscriptions").fetchone() == (None, None)
    assert not any(apply(name) for name in names), "replayed migration name was reapplied"
    print(f"PASS {label}: {len(names)} tracked filenames; {len(pending)} pending applied; integrity/FKs/data/replay checked")
    db.close()
    return schema
if __name__ == "__main__":
    schemas = [run_scenario("fresh", set()), run_scenario("source history", SOURCE), run_scenario("frontend history", UI)]
    assert schemas[0] == schemas[1] == schemas[2], "histories did not converge to the same schema"
    print("PASS all three histories converge without renaming deployed migrations")
