"""Offline regression for the exact AI/editorial + source integration migration union.

Run: python scripts/check_ai_source_integration_migrations.py
Requires only Python's standard library and local Git objects. All SQL executes
in :memory: databases; this script does not load credentials, invoke Wrangler,
contact Cloudflare/providers, modify files, or infer live deployment settings.
This checks SQLite compatibility, not D1 service limits or remote migration state.
"""

from collections import Counter
from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import subprocess


ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = "apps/worker/migrations"
BASE = "23c4c49"
RECOVERY = "61c3548"
SOURCE = "9052b56"
AMENDMENT = "0052_model_spending_concurrency_amendments.sql"
SOURCE_ADDITIONS = {
    "0048_connector_scaling.sql",
    "0050_connector_financial_scope.sql",
    "0051_connector_feed_scope_index.sql",
    "0052_connector_relay_lease.sql",
    "0053_connector_uncertain_scope_index.sql",
    "0054_connector_collection_clock.sql",
    "0055_connector_source_execution_claims.sql",
    "0056_connector_telegram_lane.sql",
    "0057_connector_read_recovery.sql",
    "0058_connector_intelligence_turns.sql",
}
COLLISIONS = {46: 2, 47: 2, 48: 2, 50: 2, 51: 2, 52: 2}
STAMP = "2026-10-01T00:00:00Z"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout


def historical_migrations(ref):
    paths = git("ls-tree", "-r", "--name-only", ref, DIRECTORY).decode().splitlines()
    return {
        Path(path).name: git("show", f"{ref}:{path}")
        for path in paths if path.endswith(".sql")
    }


def migration_order(name):
    # Installed Wrangler 4.100.0 compareSegments(): numeric prefix, lexical tie.
    # This union is flat and all prefixes are zero-padded decimal integers.
    return int(name.split("_", 1)[0]), name


def verify_inventory(base, recovery, source, candidate):
    require(len(base) == 53, "Unexpected common ancestor inventory")
    require(len(recovery) == 54, "Unexpected recovery inventory")
    require(len(source) == 63, "Unexpected source inventory")
    require(set(recovery) - set(base) == {AMENDMENT}, "Recovery additions changed")
    require(set(source) - set(base) == SOURCE_ADDITIONS, "Source additions changed")
    require(set(base) <= set(recovery) & set(source), "Common migration removed")
    union = {**recovery, **source}
    require(len(union) == 64 and set(candidate) == set(union),
            "Candidate must contain exactly the 64 original full filenames")
    for name, original in base.items():
        for label, history in (("recovery", recovery), ("source", source)):
            require(sha256(history[name]).digest() == sha256(original).digest(),
                    f"Common migration changed in {label}: {name}")
    for name, original in union.items():
        require(sha256(candidate[name]).digest() == sha256(original).digest(),
                f"Candidate migration bytes changed: {name}")
    counts = Counter(migration_order(name)[0] for name in candidate)
    require({number: count for number, count in counts.items() if count > 1}
            == COLLISIONS, "Duplicate prefixes must retain distinct filenames")
    require(sorted(candidate) == sorted(candidate, key=migration_order),
            "Fixture order differs from installed Wrangler numeric/lexical order")


def connect():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("""CREATE TABLE d1_migrations(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)""")
    return db


def apply(db, migrations):
    applied = {row[0] for row in db.execute("SELECT name FROM d1_migrations")}
    pending = []
    for name in sorted(migrations, key=migration_order):
        if name in applied:
            continue
        # Match Wrangler's full-name tracking, not a numeric high-water mark.
        quoted_name = name.replace("'", "''")
        db.executescript(migrations[name].decode("utf-8-sig")
                         + f"\nINSERT INTO d1_migrations(name) VALUES('{quoted_name}');")
        pending.append(name)
    db.execute("PRAGMA foreign_keys=ON")
    require(db.execute("PRAGMA foreign_keys").fetchone() == (1,), "FKs disabled")
    return pending


def insert(db, table, values):
    columns = ",".join(values)
    slots = ",".join("?" for _ in values)
    db.execute(f"INSERT INTO {table}({columns}) VALUES({slots})", tuple(values.values()))


def json_text(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def seed(db):
    # Deliberately non-production identities and .invalid endpoints only.
    insert(db, "accounts", dict(
        id="fixture-owner", email="owner@example.invalid", normalized_email="owner@example.invalid",
        username="fixture-owner", role="user", password_hash="fixture-unused",
        created_at=STAMP, updated_at=STAMP))
    insert(db, "briefings", dict(
        id="fixture-feed", owner_account_id="fixture-owner", slug="fixture-feed",
        title="Preserved private fixture", interest_profile="migration evidence",
        public_feed_enabled=0, explore_featured=0, created_at=STAMP, updated_at=STAMP))
    insert(db, "sources", dict(
        id="fixture-source", briefing_id="fixture-feed", title="Fixture Telegram",
        type="channel", enabled=1, last_seen_at=STAMP, created_at=STAMP,
        updated_at=STAMP, provider="telegram", kind="telegram_channel",
        source_url="https://t.me/fixture", collection_owner="connector"))
    insert(db, "v1_intake_scopes", dict(
        id="fixture-source", feed_id="fixture-feed", source_id="fixture-canonical",
        json=json_text(dict(feedId="fixture-feed", sourceId="fixture-canonical",
                            feedRevision=1, enabled=True, restrictions={}))))
    insert(db, "v1_feeds", dict(id="fixture-feed", json=json_text(dict(
        id="fixture-feed", ownerId="fixture-owner", revision=1))))
    for table in ("v1_evidence", "v1_revisions", "v1_acquired", "v1_acquisition_results"):
        insert(db, table, dict(
            id=f"fixture-{table}", feed_source_id="fixture-source", item_key="item-1",
            json=json_text(dict(id=f"fixture-{table}", evidenceId="fixture-evidence",
                                revision=1, body="Retained fixture evidence", state="ACTIVE"))))
    insert(db, "v1_jobs", dict(
        id="fixture-job", feed_source_id="fixture-source", item_key="item-1",
        json=json_text(dict(kind="ACQUIRE", state="PENDING", nextAttemptAt=STAMP))))
    insert(db, "connector_item_fingerprints", dict(
        feed_id="fixture-feed", feed_source_id="fixture-source", source_id="fixture-canonical",
        source_item_key="item-1", configuration_revision=1, fingerprint="fixture-fingerprint",
        fetch_sequence=7))
    insert(db, "connector_provider_budgets", dict(
        provider_id="x_apify", limit_usd=17, reserved_usd=3.25))
    for operation, payload, status in (("unknown", None, -1),
                                       ("completed", "fixture-payload", 200)):
        insert(db, "connector_provider_operations", dict(
            provider_id="x_apify", operation_id=f"fixture-{operation}",
            request_hash=f"fixture-{operation}-hash", ceiling_usd=1.625,
            payload_ref=payload, status=status, headers='{"fixture":true}'))
    request = json_text(dict(scope=dict(feedId="fixture-feed", feedSourceId="fixture-source"),
                             source=dict(family="telegram")))
    insert(db, "connector_provider_poll_jobs", dict(
        job_id="fixture-provider-job", request=request, initial_hash="fixture-hash",
        provider_order='["telegram_telethon"]', due_at=STAMP,
        state="BLOCKED", last_error="UNCERTAIN_PAID_SUBMISSION", attempts=3))
    insert(db, "connector_rss_poll_jobs", dict(
        job_id="fixture-rss-job", request=request, request_hash="fixture-rss-hash",
        due_at=STAMP, state="PENDING", offset=4))
    grant = dict(id="fixture-existing-grant", accountId="fixture-provider-account",
                 modelIds=["fixture-model"], validFrom=STAMP,
                 validUntil="2026-11-01T00:00:00Z", maxExposureUsd=50,
                 maxConcurrentOperations=2)
    insert(db, "v1_model_spending_authorizations", dict(
        id=grant["id"], account_id=grant["accountId"], valid_from=grant["validFrom"],
        valid_until=grant["validUntil"], json=json_text(grant)))
    for outcome in ("unknown", "provisional", "reported"):
        reservation = dict(id=f"fixture-{outcome}", accountId=grant["accountId"],
                           model="fixture-model", feedId="fixture-feed", token=f"fixture-{outcome}-token",
                           reservedCostUsd=0.5, leaseUntil=0, createdAt=STAMP)
        insert(db, "v1_model_spending_reservations", dict(
            id=reservation["id"], account_id=grant["accountId"], authorization_id=grant["id"],
            token=reservation["token"], model=reservation["model"], feed_id="fixture-feed",
            reserved_cost_usd=0.5, lease_until=0, created_at=STAMP, json=json_text(reservation)))
        if outcome != "unknown":
            insert(db, "v1_model_spending_settlements", dict(
                id=reservation["id"], token=reservation["token"], cost_usd=0.25,
                reported=int(outcome == "reported")))
    insert(db, "v1_feed_documents", dict(
        kind="semantic_intents", id="fixture-unknown", feed_id="fixture-feed",
        json=json_text(dict(state="UNKNOWN", token="fixture-unknown-token", reservedCostUsd=0.5))))
    if table_exists(db, "v1_model_spending_concurrency_amendments"):
        amendment = dict(id="fixture-existing-amendment", authorizationId=grant["id"],
                         sequence=1, maxConcurrentOperations=3)
        insert(db, "v1_model_spending_concurrency_amendments", dict(
            id=amendment["id"], authorization_id=grant["id"], sequence=1,
            max_concurrent_operations=3, json=json_text(amendment)))
    insert(db, "mail_oauth_tokens", dict(
        provider="OUTLOOK_GRAPH", version=1, iv="fixture-iv", ciphertext="fixture-ciphertext",
        updated_at=STAMP))
    insert(db, "push_subscriptions", dict(
        endpoint="https://push.example.invalid/fixture", account_id="fixture-owner",
        subscription_json="{}", last_notified_at=STAMP, created_at=STAMP))
    db.commit()


def table_exists(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()


PRESERVE = (
    "accounts", "briefings", "sources", "v1_intake_scopes", "v1_feeds",
    "v1_evidence", "v1_revisions", "v1_acquired", "v1_acquisition_results", "v1_jobs",
    "v1_feed_documents", "connector_item_fingerprints", "connector_provider_budgets",
    "connector_provider_operations", "connector_provider_poll_jobs", "connector_rss_poll_jobs",
    "v1_model_spending_authorizations", "v1_model_spending_reservations",
    "v1_model_spending_settlements", "v1_model_spending_concurrency_amendments",
    "mail_oauth_tokens", "push_subscriptions",
)


def snapshot(db):
    result = {}
    for table in PRESERVE:
        if table_exists(db, table):
            columns = [row[1] for row in db.execute(f"PRAGMA table_info({table})")]
            result[table] = (columns, db.execute(f"SELECT {','.join(columns)} FROM {table} ORDER BY rowid").fetchall())
    return result


def verify_preserved(db, before):
    for table, (columns, rows) in before.items():
        current = db.execute(f"SELECT {','.join(columns)} FROM {table} ORDER BY rowid").fetchall()
        require(current == rows, f"Upgrade changed existing {table} data")
    expected_amendments = len(before.get("v1_model_spending_concurrency_amendments", ([], []))[1])
    require(db.execute("SELECT COUNT(*) FROM v1_model_spending_authorizations").fetchone() == (1,),
            "Migration created a grant")
    require(db.execute("SELECT COUNT(*) FROM v1_model_spending_concurrency_amendments").fetchone()
            == (expected_amendments,), "Migration created a concurrency amendment")
    require(db.execute("""SELECT COUNT(*) FROM v1_model_spending_reservations r
        LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
        WHERE COALESCE(s.reported,0)=0 AND r.lease_until<=0""").fetchone() == (2,),
            "Upgrade changed UNKNOWN model liabilities")
    require(db.execute("SELECT COUNT(*) FROM connector_provider_operations WHERE payload_ref IS NULL").fetchone()
            == (1,), "Upgrade changed uncertain source submission")
    require(db.execute("SELECT COUNT(*) FROM connector_provider_operations WHERE feed_id IS NOT NULL OR feed_source_id IS NOT NULL").fetchone()
            == (0,), "Upgrade invented financial scope for legacy operations")
    require(db.execute("SELECT COUNT(*) FROM connector_source_provider_budgets").fetchone()
            == (0,), "Migration allocated source/provider budget accounting")


def schema(db):
    return db.execute("""SELECT type,name,tbl_name,sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name""").fetchall()


def verify_health(db):
    require(db.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "Integrity failure")
    require(db.execute("PRAGMA foreign_key_check").fetchall() == [], "FK failure")


def scenario(label, initial, candidate):
    with closing(connect()) as db:
        apply(db, initial)
        if initial:
            seed(db)
        before = snapshot(db)
        history_before = db.execute("SELECT * FROM d1_migrations ORDER BY id").fetchall()
        pending = apply(db, candidate)
        require(pending == sorted(set(candidate) - set(initial), key=migration_order),
                f"{label}: pending filenames/order differ")
        require(db.execute("SELECT * FROM d1_migrations ORDER BY id LIMIT ?", (len(history_before),)).fetchall()
                == history_before, f"{label}: original migration history rewritten")
        tracked = db.execute("SELECT name FROM d1_migrations ORDER BY id").fetchall()
        require(len(tracked) == 64 and {row[0] for row in tracked} == set(candidate),
                f"{label}: full filenames not tracked exactly once")
        if initial:
            verify_preserved(db, before)
        else:
            for table in ("v1_model_spending_authorizations", "v1_model_spending_reservations",
                          "v1_model_spending_settlements", "v1_model_spending_concurrency_amendments",
                          "connector_provider_operations", "connector_provider_budgets"):
                require(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone() == (0,),
                        f"Fresh migration created financial authority/data: {table}")
        require(apply(db, candidate) == [], f"{label}: migration replay was not a no-op")
        require(db.execute("SELECT name FROM d1_migrations ORDER BY id").fetchall() == tracked,
                f"{label}: replay rewrote migration history")
        if initial:
            verify_preserved(db, before)
        verify_health(db)
        print(f"PASS {label}: {len(pending)} pending; 64 tracked full names; preservation/replay/integrity/FKs")
        return schema(db)


def main():
    base, recovery, source = (historical_migrations(ref) for ref in (BASE, RECOVERY, SOURCE))
    candidate = {path.name: path.read_bytes() for path in (ROOT / DIRECTORY).glob("*.sql")}
    verify_inventory(base, recovery, source, candidate)
    print("PASS exact union: 53 common hashes unchanged; 54 recovery + 63 source = 64 filenames")
    print("PASS ordering: Wrangler numeric/lexical ties retain all six duplicate prefixes")
    scenarios = [scenario(label, initial, candidate) for label, initial in (
        ("fresh", {}), ("full recovery 61c3548 upgrade", recovery),
        ("full source 9052b56 upgrade", source))]
    require(scenarios[0] == scenarios[1] == scenarios[2], "Final schemas do not converge")
    print("PASS all three final schemas match; no grant/UNKNOWN mutations outside in-memory fixtures")


if __name__ == "__main__":
    main()
