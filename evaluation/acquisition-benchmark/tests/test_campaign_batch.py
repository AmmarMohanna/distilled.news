import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/campaign_batch.py"
spec = importlib.util.spec_from_file_location("campaign_batch", SCRIPT)
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class CampaignGuardTests(unittest.TestCase):
    def test_pending_family_cannot_execute(self):
        with self.assertRaisesRegex(ValueError, "not ready"):
            batch.executable_config(Path("manifest.json"), {"status": "pending", "config": None})

    def test_changed_config_cannot_execute(self):
        with tempfile.TemporaryDirectory(dir=SCRIPT.parent) as directory:
            path = Path(directory) / "config.json"
            path.write_text("{}")
            family = {"status": "ready", "blockers": [], "config": path.name,
                      "config_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            self.assertEqual(batch.executable_config(path.parent / "manifest.json", family), path)
            path.write_text('{"changed": true}')
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                batch.executable_config(path.parent / "manifest.json", family)

    def test_ready_label_does_not_override_blockers(self):
        with self.assertRaisesRegex(ValueError, "not ready"):
            batch.executable_config(Path("manifest.json"), {"status": "ready", "config": "config.json", "blockers": ["authorization pending"]})


if __name__ == "__main__":
    unittest.main()
