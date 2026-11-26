import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release

SHA = "a" * 40


def rows(*names):
    return [{"success": True, "results": [{"name": name} for name in names]}]


class ReleaseGateTests(unittest.TestCase):
    def test_repository_targets_are_valid_and_isolated(self):
        configs = release.load_configs()
        release.validate_configs(configs)
        configs["ci-staging"]["d1_databases"][0]["database_id"] = configs["production"]["d1_databases"][0]["database_id"]
        with self.assertRaisesRegex(release.ReleaseError, "shares a data resource"):
            release.validate_configs(configs)

    def test_ci_staging_refuses_integration_database_and_background_bindings(self):
        configs = release.load_configs()
        configs["ci-staging"]["d1_databases"][0]["database_id"] = "ab259bfe-6029-4e20-8cb6-eea6b7a67459"
        with self.assertRaisesRegex(release.ReleaseError, "integration staging"):
            release.validate_configs(configs)
        for binding in ("queues", "triggers", "vpc_services", "send_email", "r2_buckets"):
            configs = release.load_configs()
            configs["ci-staging"][binding] = {}
            with self.subTest(binding=binding), self.assertRaisesRegex(release.ReleaseError, "only the dedicated DB"):
                release.validate_configs(configs)

    def test_production_cannot_use_an_experimental_engine_or_container_rollout(self):
        for key, value in (("vars", {"BRIEFING_ENGINE": "v5"}), ("containers", [{}])):
            with self.subTest(key=key):
                configs = copy.deepcopy(release.load_configs())
                if key == "vars":
                    configs["production"][key].update(value)
                else:
                    configs["production"][key] = value
                with self.assertRaises(release.ReleaseError):
                    release.validate_configs(configs)

    def test_migration_ledger_blocks_pending_ahead_and_duplicate_rows(self):
        release.check_migration_ledger(["a.sql", "b.sql"], rows("b.sql", "a.sql"))
        for applied in (rows("a.sql"), rows("a.sql", "b.sql", "c.sql"), rows("a.sql", "b.sql", "a.sql"), []):
            with self.subTest(applied=applied), self.assertRaises(release.ReleaseError):
                release.check_migration_ledger(["a.sql", "b.sql"], applied)

    def test_migration_diff_requires_new_sequence_and_never_rewrites_history(self):
        old = "apps/worker/migrations/0100_old.sql"
        new = "apps/worker/migrations/0101_new.sql"
        with patch.object(release, "git", side_effect=[f"A\t{new}", old]):
            release.validate_migration_diff(SHA, ["0100_old.sql", "0101_new.sql"])
        for status, path in (("M", old), ("D", old), ("A", "apps/worker/migrations/0099_earlier.sql")):
            with patch.object(release, "git", side_effect=[f"{status}\t{path}", old]):
                with self.assertRaises(release.ReleaseError):
                    release.validate_migration_diff(SHA, ["0100_old.sql", Path(path).name])

    def test_preflight_checks_the_target_database_name_and_ledger(self):
        production = release.load_configs()["production"]
        db = production["d1_databases"][0]
        path = f"d1/database/{db['database_id']}"
        calls = []
        def cloudflare(endpoint, data=None):
            calls.append((endpoint, data))
            return {"name": db["database_name"]} if data is None else rows(*release.migration_names())

        release.preflight(production, cloudflare)
        self.assertEqual(calls, [(path, None), (f"{path}/query", {"sql": "SELECT name FROM d1_migrations"})])
        with self.assertRaisesRegex(release.ReleaseError, "Live D1 database name"):
            release.preflight(production, lambda _: {"name": "distilled-news-staging"})

    def test_old_runs_fail_even_if_their_security_checks_succeeded(self):
        with patch.object(release, "git", return_value=SHA):
            with self.assertRaisesRegex(release.ReleaseError, "stale"):
                release.assert_current(SHA, lambda _path: {"object": {"sha": "b" * 40}})

    def test_security_gate_needs_success_for_the_exact_push(self):
        for conclusion, head in (("success", SHA), ("failure", SHA), ("cancelled", SHA), ("success", "b" * 40)):
            def github(path):
                if path == "git/ref/heads/main":
                    return {"object": {"sha": SHA}}
                self.assertIn(f"head_sha={SHA}", path)
                self.assertIn("event=push", path)
                return {"workflow_runs": [{
                    "status": "completed", "head_sha": head, "head_branch": "main",
                    "event": "push", "conclusion": conclusion, "html_url": "https://github.com/example/run",
                }]}

            with self.subTest(conclusion=conclusion, head=head), patch.object(release, "git", return_value=SHA):
                if conclusion == "success" and head == SHA:
                    release.wait_for_security(SHA, github, attempts=1)
                else:
                    with self.assertRaises(release.ReleaseError):
                        release.wait_for_security(SHA, github, attempts=1)

    def test_missing_security_run_times_out(self):
        with patch.object(release, "git", return_value=SHA):
            def github(path):
                return {"object": {"sha": SHA}} if path == "git/ref/heads/main" else {"workflow_runs": []}

            with self.assertRaisesRegex(release.ReleaseError, "Timed out"):
                release.wait_for_security(SHA, github, attempts=1, sleep=lambda _seconds: None)


class SmokeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.dist = Path(directory.name)
        self.asset = "/assets/index-123.js"
        (self.dist / "assets").mkdir()
        (self.dist / self.asset[1:]).write_bytes(b"export {};")
        html = f'<script type="module" src="{self.asset}"></script>'
        (self.dist / "index.html").write_text(html, encoding="utf-8")
        self.responses = {
            "/": (200, {"Content-Type": "text/html"}, html.encode()),
            self.asset: (200, {"Content-Type": "text/javascript"}, b"export {};"),
            "/api/health/release": self.json_response(200, {"status": "ok", "sha": SHA, "readOnly": True}),
            "/api/auth/session": self.json_response(200, {"authenticated": False, "setupRequired": True}),
            "/api/explore/feeds": self.json_response(200, {"feeds": [], "revision": "r"}),
            "/api/me/health": self.json_response(401, {"error": "unauthorized"}),
            "/api/admin/accounts": self.json_response(401, {"error": "unauthorized"}),
        }

    @staticmethod
    def json_response(status, value):
        return status, {"Content-Type": "application/json"}, json.dumps(value).encode()

    def test_read_only_staging_smoke(self):
        release.smoke("ci-staging", SHA, self.responses.__getitem__, self.dist)

    def test_smoke_fails_on_redirect_auth_regression_other_release_or_wrong_asset(self):
        for path, response in (
            ("/", (302, {}, b"")),
            ("/api/admin/accounts", self.json_response(200, {"accounts": []})),
            ("/api/health/release", self.json_response(200, {"status": "ok", "sha": "b" * 40, "readOnly": True})),
            ("/api/health/release", self.json_response(200, {"status": "ok", "sha": SHA, "readOnly": False})),
            (self.asset, (200, {"Content-Type": "text/javascript"}, b"old build")),
        ):
            with self.subTest(path=path, response=response):
                overridden = self.responses | {path: response}
                with self.assertRaises(release.ReleaseError):
                    release.smoke("ci-staging", SHA, overridden.__getitem__, self.dist)
