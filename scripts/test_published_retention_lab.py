import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from published_retention_lab import FIXTURE_NOW, audit, fixture, seed_fixture


class RetentionLabTest(unittest.TestCase):
    def test_current_schema_fixture_keeps_eligibility_review_only(self):
        result = fixture()
        screen = result["fixture_inventory"]["age_screen"]
        cohorts = {row["cohort"]: row["rows"] for row in screen["published_cohorts"]}
        self.assertEqual(cohorts, {"within_30_days": 30, "over_30_days": 60, "over_90_days": 10})
        self.assertEqual(screen["deletion_eligibility"], "not_evaluated")
        self.assertTrue(result["verification"]["current_delete_detaches_verified_artifact"])
        self.assertTrue(result["verification"]["rollback_restores_reference"])
        self.assertTrue(result["verification"]["digest_failure_and_restore_verified"])
        self.assertEqual(result["verification"]["citation_revisions_present"], 3)
        before = result["fixture_inventory"]["sqlite"]
        after = result["sqlite_after_delete"]
        self.assertEqual(before["allocated_bytes"], after["allocated_bytes"])
        self.assertGreater(after["reusable_bytes"], before["reusable_bytes"])
        self.assertLess(result["sqlite_after_offline_vacuum"]["allocated_bytes"], after["allocated_bytes"])
        self.assertEqual(result["r2_simulated_object_bytes"],
                         result["fixture_inventory"]["r2_manifest"][0]["recorded_bytes"])
        self.assertEqual(len(result["projections"]), 36)
        half_hour = [row for row in result["projections"] if row["feeds"] == 1000 and row["schedule_minutes"] == 30]
        self.assertEqual({row["editions_30d"] for row in half_hour}, {360000, 1440000})

    def test_snapshot_audit_never_writes_and_distinguishes_pending_delivery_and_withdrawal(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "snapshot.sqlite"
            db = sqlite3.connect(path)
            try:
                seed_fixture(db, root)
                db.execute("UPDATE v1_feed_documents SET json=json_set(json,'$.state','PENDING')"
                           " WHERE kind='delivery_jobs' AND id='edition-093'")
                db.execute("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN')"
                           " WHERE kind='publication_status' AND id='edition-094'")
                db.commit()
            finally:
                db.close()
            before = path.read_bytes()
            result = audit(path, FIXTURE_NOW)
            older = next(row for row in result["age_screen"]["published_cohorts"] if row["cohort"] == "over_90_days")
            self.assertEqual(older["rows"], 9)
            self.assertEqual(older["delivery_incomplete_or_missing"], 1)
            self.assertEqual(path.read_bytes(), before)
            with self.assertRaises(FileNotFoundError):
                audit(root / "absent.sqlite", FIXTURE_NOW)
            self.assertFalse((root / "absent.sqlite").exists())


if __name__ == "__main__":
    unittest.main()
