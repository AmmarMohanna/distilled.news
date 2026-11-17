import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from continuous import run_checks


class ContinuousTests(unittest.TestCase):
    def test_success_report_does_not_invent_live_measurements(self):
        with tempfile.TemporaryDirectory() as directory:
            result = run_checks(directory, [('fixture', ['offline'])], executor=lambda *args, **kwargs: SimpleNamespace(returncode=0))
            self.assertEqual(result['status'], 'passed')
            self.assertEqual(result['paidModelCalls'], 0)
            self.assertEqual(result['liveBriefingsInspected'], 0)
            self.assertEqual(result['humanQuality'], 'not_measured')
            self.assertEqual(json.loads((Path(directory)/'latest.json').read_text()), result)

    def test_one_failure_keeps_other_checks_and_causes_red_status(self):
        with tempfile.TemporaryDirectory() as directory:
            result = run_checks(directory, [('bad', ['bad']), ('good', ['good'])], executor=lambda command, **kwargs: SimpleNamespace(returncode=1 if command==['bad'] else 0))
            self.assertEqual(result['status'], 'failed')
            self.assertEqual([r['status'] for r in result['checks']], ['failed','passed'])

    def test_timeout_and_missing_executable_fail_closed(self):
        for error in [subprocess.TimeoutExpired('fixture', 300), FileNotFoundError('fixture')]:
            with self.subTest(error=type(error).__name__), tempfile.TemporaryDirectory() as directory:
                def fail(*args, **kwargs): raise error
                result = run_checks(directory, [('fixture', ['offline'])], executor=fail)
                self.assertEqual(result['status'], 'failed')
                self.assertIsNotNone(result['checks'][0]['reason'])

    def test_credentials_are_not_forwarded_and_history_is_preserved(self):
        def inspect(*args, **kwargs):
            self.assertNotIn('BRIEFING_EVAL_OPENROUTER_KEY', kwargs['env'])
            return SimpleNamespace(returncode=0)
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {'BRIEFING_EVAL_OPENROUTER_KEY':'synthetic-test-value'}):
            first = run_checks(directory, [('fixture', ['offline'])], executor=inspect)
            second = run_checks(directory, [('fixture', ['offline'])], executor=inspect)
            self.assertNotEqual(first['runId'], second['runId'])
            self.assertEqual(len(list(Path(directory).glob('*/report.json'))), 2)

    def test_empty_run_is_not_green(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(run_checks(directory, [], executor=lambda *a, **k: None)['status'], 'failed')


if __name__ == '__main__': unittest.main()
