import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('timing', Path(__file__).with_name('compare-validation-timing.py'))
timing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timing)

class TimingOutcomeTest(unittest.TestCase):
    def test_pass_requires_process_report_and_assertion_success(self):
        self.assertEqual(timing.classify_result(0, {'success': True}, {'status': 'passed'}, ''), ('passed', None))
        self.assertEqual(timing.classify_result(1, {'success': True}, {'status': 'passed'}, ''), ('failed', 'RUNNER_OR_SUITE_FAILURE'))
        self.assertEqual(timing.classify_result(0, {'success': False}, {'status': 'passed'}, ''), ('failed', 'RUNNER_OR_SUITE_FAILURE'))
        self.assertEqual(timing.classify_result(0, {}, {'status': 'passed'}, ''), ('failed', 'RUNNER_OR_SUITE_FAILURE'))

    def test_timeout_is_a_failure_not_a_completed_latency_sample(self):
        self.assertEqual(timing.classify_result(1, {'success': False}, {'status': 'failed'}, 'Test timed out in 5000ms'), ('failed', 'TEST_TIMEOUT'))
        self.assertEqual(timing.classify_result(1, {'success': False}, {'status': 'failed'}, 'Hook timed out in 10000ms'), ('failed', 'HOOK_TIMEOUT'))

    def test_windows_path_boundary_is_rejected_before_subprocess(self):
        with patch.object(timing.sys, 'platform', 'win32'):
            timing.validate_report_path('x' * 259)
            with self.assertRaisesRegex(ValueError, 'short output directory'):
                timing.validate_report_path('x' * 260)

if __name__ == '__main__':
    unittest.main()
