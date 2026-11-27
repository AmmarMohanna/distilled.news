"""Inventory a local SQLite snapshot or qualify retention on disposable data."""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from time import perf_counter


MIGRATIONS = Path(__file__).resolve().parents[1] / "apps/worker/migrations"
FIXTURE_NOW = datetime(2026, 11, 27, tzinfo=timezone.utc)
EVIDENCE_TABLES = ("v1_inputs", "v1_acquired", "v1_revisions", "v1_evidence", "v1_evidence_receipts")
DAY_SCHEDULES = (30, 60, 120, 360, 720, 1440)


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def timestamp(value):
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def page_usage(db):
    page_size = db.execute("PRAGMA page_size").fetchone()[0]
    return {
        "allocated_bytes": page_size * db.execute("PRAGMA page_count").fetchone()[0],
        "reusable_bytes": page_size * db.execute("PRAGMA freelist_count").fetchone()[0],
    }


def age_screen(db, as_of):
    rows = db.execute("""
        WITH current AS (
          SELECT unixepoch(json_extract(p.json,'$.publishedAt')) AS published,
            a.object_key IS NOT NULL AS attached,
            json_extract(j.json,'$.state') IS 'DONE' AS delivery_done
          FROM v1_feed_documents p
          JOIN v1_feed_documents e ON e.kind='editions' AND e.id=p.id AND e.feed_id=p.feed_id
          LEFT JOIN v1_feed_documents j ON j.kind='delivery_jobs' AND j.id=p.id AND j.feed_id=p.feed_id
          LEFT JOIN v1_visible_edition_delivery d ON d.edition_id=p.id AND d.feed_id=p.feed_id
          LEFT JOIN v1_verified_archives a ON a.object_key=d.object_key AND a.state='REFERENCED'
          WHERE p.kind='publication_status' AND json_extract(p.json,'$.status')='PUBLISHED'
        ), aged AS (
          SELECT CASE WHEN published IS NULL OR published>unixepoch(:at) THEN 'invalid_or_future'
            WHEN published<unixepoch(:at)-90*86400 THEN 'over_90_days'
            WHEN published<unixepoch(:at)-30*86400 THEN 'over_30_days'
            ELSE 'within_30_days' END AS cohort, attached, delivery_done FROM current
        )
        SELECT cohort, COUNT(*), SUM(attached), SUM(NOT delivery_done)
        FROM aged GROUP BY cohort ORDER BY cohort
    """, {"at": timestamp(as_of)}).fetchall()
    return {
        "as_of": timestamp(as_of),
        "deletion_eligibility": "not_evaluated",
        "published_cohorts": [{"cohort": cohort, "rows": count, "attached_manifest_rows": attached,
                               "delivery_incomplete_or_missing": incomplete}
                              for cohort, count, attached, incomplete in rows],
    }


def inventory(db, as_of):
    tables = {name for (name,) in db.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
    required = {"v1_feed_documents", "briefing_editions", "v1_verified_archives"}
    if not required <= tables:
        raise ValueError("Snapshot is missing the current publication or archive schema")
    docs = db.execute("""
        SELECT kind, COUNT(*), SUM(length(CAST(json AS BLOB))) AS bytes
        FROM v1_feed_documents GROUP BY kind ORDER BY bytes DESC, kind
    """).fetchall()
    sources = {}
    for table in EVIDENCE_TABLES:
        if table in tables:
            count, size = db.execute(
                f'SELECT COUNT(*), COALESCE(SUM(length(CAST(json AS BLOB))),0) FROM "{table}"'
            ).fetchone()
            sources[table] = {"rows": count, "payload_bytes": size}
    legacy = db.execute("""
        SELECT status, COUNT(*), SUM(length(CAST(COALESCE(summary,'') AS BLOB))
          +length(CAST(COALESCE(sections_json,'') AS BLOB))) AS bytes
        FROM briefing_editions GROUP BY status ORDER BY bytes DESC
    """).fetchall()
    archived = db.execute("""
        SELECT kind, state, COUNT(*), SUM(byte_count)
        FROM v1_verified_archives GROUP BY kind,state ORDER BY kind,state
    """).fetchall()
    return {
        "sqlite": page_usage(db),
        "document_kinds": [{"kind": kind, "rows": count, "payload_bytes": size} for kind, count, size in docs],
        "source_tables": sources,
        "legacy_editions": [{"status": status, "rows": count, "payload_bytes": size} for status, count, size in legacy],
        "r2_manifest": [{"kind": kind, "state": state, "rows": count, "recorded_bytes": size}
                        for kind, state, count, size in archived],
        "age_screen": age_screen(db, as_of),
    }


def audit(path, as_of):
    # An existing SQLite file is required. The URI can never create a database.
    snapshot = Path(path).resolve(strict=True)
    db = sqlite3.connect(snapshot.as_uri() + "?mode=ro", uri=True)
    try:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        return inventory(db, as_of)
    finally:
        db.close()


def document(db, kind, identity, feed, value):
    db.execute("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)",
               (kind, identity, feed, json_text(value)))


def seed_fixture(db, root):
    db.execute("PRAGMA foreign_keys=ON")
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))
    feed, at = "lab-feed", timestamp(FIXTURE_NOW)
    db.execute("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at)"
               " VALUES('lab-owner','lab@example.invalid','lab@example.invalid','lab','user','fixture',?,?)", (at, at))
    db.execute("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at)"
               " VALUES(?,'lab-owner','lab','Fixture','News',?,?)", (feed, at, at))
    db.execute("INSERT INTO v1_feeds(id,json) VALUES(?,?)", (feed, json_text({"id": feed, "revision": 1})))
    db.execute("INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES('lab-scope',?,'lab-source','{}')", (feed,))
    records = []
    for age in range(1, 101):
        identity = f"edition-{age:03d}"
        published = timestamp(FIXTURE_NOW - timedelta(days=age))
        revision_ids, support, articles = [], [], []
        for source in range(3):
            item = f"item-{age}-{source}"
            revision = f"rev-{item}"
            body = f"Fixture source {age}/{source}. " + "An independent source reported a bounded development. " * 70
            for table, key, payload in (
                ("v1_inputs", item, {"id": item, "feedId": feed, "publisherId": f"publisher-{source}"}),
                ("v1_acquired", f"acquired-{item}", {"id": f"acquired-{item}", "body": body}),
                ("v1_revisions", revision, {"id": revision, "feedId": feed, "sourceObservationId": item, "body": body}),
                ("v1_evidence", item, {"id": item, "state": "ACTIVE", "currentRevisionId": revision}),
            ):
                db.execute(f"INSERT INTO {table}(id,feed_source_id,item_key,json) VALUES(?,'lab-scope',?,?)",
                           (key, item, json_text(payload)))
            revision_ids.append(revision)
            articles.append({"id": revision, "text": body})
            support.append({"evidenceRevisionId": revision, "quote": body})
        edition = {
            "id": identity, "feedId": feed, "engine": "v3", "createdAt": published,
            "windowStart": published, "windowEnd": published, "feedRevision": 1, "language": "en",
            "evidenceRevisionIds": revision_ids,
            "stories": [{"candidateId": identity, "claims": [{"id": identity + ":claim",
                         "text": f"Local fixture report for age {age}.", "support": support}]}],
        }
        document(db, "editions", identity, feed, edition)
        document(db, "publication_status", identity, feed, {
            "id": identity, "feedId": feed, "status": "PUBLISHED", "publishedAt": published})
        document(db, "delivery_jobs", identity, feed, {"id": identity, "feedId": feed, "state": "DONE"})
        document(db, "v3_window_inputs", identity, feed, {"id": identity, "feedId": feed, "input": {"articles": articles}})
        archive = json_text({
            "id": identity, "feedId": feed, "publishedAt": published, "stories": edition["stories"],
            "citations": [{"evidenceRevisionId": rev, "publisherName": "Lab publisher"} for rev in revision_ids],
        }).encode()
        digest = hashlib.sha256(archive).hexdigest()
        object_path = root / f"{identity}-{digest}.json"
        object_path.write_bytes(archive)
        reference = (object_path.name, digest, len(archive))
        verify_object(object_path, reference)
        db.execute("""
            INSERT INTO v1_verified_archives VALUES(?, 'EDITION', ?, ?, ?, ?, 1, 'VERIFIED',
              CAST(unixepoch('now','subsec')*1000 AS INTEGER)+86400000, 1)
        """, (object_path.name, feed, identity, digest, len(archive)))
        db.execute("INSERT INTO v1_edition_delivery VALUES(?,?,?,?,?)",
                   (identity, feed, object_path.name, published, published))
        records.append((age, identity, published, reference, len(json_text(edition).encode())))
    db.commit()
    return records


def verify_object(path, reference):
    name, digest, size = reference
    body = path.read_bytes()
    if path.name != name or len(body) != size or hashlib.sha256(body).hexdigest() != digest:
        raise ValueError("Archive failed local identity, size or digest verification")
    return json.loads(body)


def qualify_fixture(db, root, records):
    age, identity, published, reference, _ = records[45]
    query = """
        SELECT a.object_key,a.sha256,a.byte_count FROM v1_visible_edition_delivery d
        JOIN v1_verified_archives a ON a.object_key=d.object_key AND a.state='REFERENCED'
        WHERE d.feed_id=? AND d.edition_id=? AND d.published_at=?
    """
    start = perf_counter()
    for _ in range(100):
        actual = db.execute(query, ("lab-feed", identity, published)).fetchone()
        if actual != reference:
            raise RuntimeError("Verified reference is missing")
        payload = verify_object(root / actual[0], actual)
        if payload["id"] != identity or payload["feedId"] != "lab-feed" or payload["publishedAt"] != published:
            raise RuntimeError("Archive identity mismatch")
    lookup_ms = (perf_counter() - start) * 1000 / 100
    for citation in payload["citations"]:
        if not db.execute("SELECT 1 FROM v1_revisions WHERE id=?", (citation["evidenceRevisionId"],)).fetchone():
            raise RuntimeError("Fixture citation is missing")
    db.execute("SAVEPOINT interrupted_lab")
    db.execute("DELETE FROM v1_feed_documents WHERE kind='editions' AND id=?", (identity,))
    detached = db.execute(query, ("lab-feed", identity, published)).fetchone() is None
    db.execute("ROLLBACK TO interrupted_lab")
    db.execute("RELEASE interrupted_lab")
    restored = db.execute(query, ("lab-feed", identity, published)).fetchone() == reference
    if not detached or not restored:
        raise RuntimeError("Current delete/rollback contract changed; review the retention design")
    original = (root / reference[0]).read_bytes()
    (root / reference[0]).write_bytes(b"!" + original[1:])
    try:
        verify_object(root / reference[0], reference)
    except ValueError:
        (root / reference[0]).write_bytes(original)
    else:
        raise RuntimeError("Corruption was accepted")
    verify_object(root / reference[0], reference)
    return {"age_days": age, "mean_local_manifest_lookup_and_read_ms": round(lookup_ms, 4),
            "current_delete_detaches_verified_artifact": detached, "rollback_restores_reference": restored,
            "citation_revisions_present": len(payload["citations"]), "digest_failure_and_restore_verified": True}


def projected_bytes(records, support_bytes, yield_fraction):
    width = sum(record[4] for record in records) / len(records)
    archive_width = sum(record[3][2] for record in records) / len(records)
    retained_support = support_bytes / len(records)
    # The proposed compact searchable index does not exist. Use an explicit
    # 1 KiB logical metadata assumption and leave independent sources out.
    index_width = 1024
    for feeds in (100, 500, 1000):
        for minutes in DAY_SCHEDULES:
            editions_day = feeds * 1440 / minutes * yield_fraction
            yield {
                "feeds": feeds, "schedule_minutes": minutes, "publication_yield": yield_fraction,
                "editions_30d": round(editions_day * 30),
                "d1_90d_all_edition_payload_bytes": round(editions_day * 90 * width),
                "d1_30d_edition_payload_plus_90d_metadata_bytes": round(editions_day * (30 * width + 90 * index_width)),
                "d1_90d_sampled_support_payload_bytes": round(editions_day * 90 * retained_support),
                "private_r2_30_to_90d_bytes": round(editions_day * 60 * archive_width),
            }


def fixture():
    with TemporaryDirectory(prefix="distilled-retention-lab-") as directory:
        root = Path(directory)
        db = sqlite3.connect(":memory:")
        try:
            records = seed_fixture(db, root)
            check = qualify_fixture(db, root, records)
            before = inventory(db, FIXTURE_NOW)
            sources = sum(table["payload_bytes"] for table in before["source_tables"].values())
            windows = sum(row["payload_bytes"] for row in before["document_kinds"] if row["kind"] == "v3_window_inputs")
            # This simulation takes place exclusively in the new in-memory fixture.
            # In the current contract, deletion detaches the artifact. The result
            # illustrates page usage and cannot qualify production compaction.
            compacted = [record for record in records if 30 < record[0] <= 90]
            db.executemany("DELETE FROM v1_feed_documents WHERE kind='editions' AND id=?",
                           [(record[1],) for record in compacted])
            db.commit()
            after_delete = page_usage(db)
            db.execute("VACUUM")
            after_local_rebuild = page_usage(db)
            return {
                "fixture_inventory": before, "verification": check, "sample_editions": len(records),
                "simulated_payloads_removed": len(compacted), "sqlite_after_delete": after_delete,
                "sqlite_after_offline_vacuum": after_local_rebuild,
                "r2_simulated_objects": len(list(root.iterdir())),
                "r2_simulated_object_bytes": sum(path.stat().st_size for path in root.iterdir()),
                "projections": [row for fraction in (0.25, 1.0)
                                for row in projected_bytes(records, sources + windows, fraction)],
            }
        finally:
            db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--sqlite", help="Existing local SQLite snapshot. Opened read-only.")
    mode.add_argument("--fixture", action="store_true", help="Run the disposable qualification fixture.")
    args = parser.parse_args()
    report = fixture() if args.fixture else audit(args.sqlite, datetime.now(timezone.utc))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
