"""Run offline evaluation checks and emit an honest machine-readable health report."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def default_checks():
    vitest = ['node', 'node_modules/vitest/vitest.mjs', 'run']
    return [
        ('evaluation-python', [sys.executable, '-m', 'unittest', 'discover', '-s', 'evaluation/briefing-quality', '-p', 'test_*.py']),
        ('evaluation-replay', vitest + ['--config', 'evaluation/briefing-quality/vitest.config.ts']),
        ('briefing-engine', vitest + ['--root', 'packages/briefing', '--config', 'vitest.config.ts']),
        ('dataset-exporter', ['node', '--test', 'scripts/export-acquired-benchmark.test.mjs']),
        ('evaluation-types', ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--types', 'node',
                              'evaluation/briefing-quality/replay.ts', 'evaluation/briefing-quality/replay.test.ts', 'evaluation/briefing-quality/replay-boundaries.test.ts', 'evaluation/briefing-quality/diagnose.ts']),
        ('evaluator-worker-types', ['node', 'node_modules/typescript/bin/tsc', '-p', 'evaluation/briefing-quality/worker/tsconfig.json']),
    ]


def run_checks(output, checks=None, executor=None):
    output = Path(output)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    run_id = stamp + '-' + uuid4().hex[:12]
    directory = output / run_id
    directory.mkdir(parents=True, exist_ok=False)
    checks = default_checks() if checks is None else checks
    executor = subprocess.run if executor is None else executor
    environment = dict(os.environ, CI='true', WRANGLER_SEND_METRICS='false')
    for name in ('BRIEFING_EVAL_OPENROUTER_KEY', 'EVALUATION_OPENROUTER_KEY', 'DASHBOARD_TOKEN', 'METRICS_TOKEN', 'OPENROUTER_API_KEY', 'CLOUDFLARE_API_TOKEN'):
        environment.pop(name, None)
    results = []
    for name, command in checks:
        started = time.monotonic()
        log = directory / (name + '.log')
        with log.open('w', encoding='utf-8') as stream:
            try:
                process = executor(command, cwd=REPO, env=environment, stdout=stream, stderr=subprocess.STDOUT, timeout=300, check=False)
                code, reason = process.returncode, None
            except subprocess.TimeoutExpired:
                code, reason = None, 'timeout'
            except OSError as error:
                code, reason = None, type(error).__name__
        results.append(dict(name=name, status='passed' if code == 0 and reason is None else 'failed', exitCode=code,
                            reason=reason, durationSeconds=round(time.monotonic()-started, 3), log=log.relative_to(output).as_posix()))
    report = dict(schemaVersion=1, runId=run_id, checkedAt=stamp, status='passed' if results and all(r['status']=='passed' for r in results) else 'failed', checks=results,
                  scope='offline correctness and regression checks; synthetic/provider-double tests are not factual-quality measurements',
                  paidModelCalls=0, liveBriefingsInspected=0, humanQuality='not_measured', participantOutcomes='not_measured',
                  retainedPrivateDataset='not_inspected_by_this_runner')
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    (directory / 'report.json').write_text(encoded, encoding='utf-8')
    temporary = output / ('latest-' + run_id + '.tmp')
    temporary.write_text(encoded, encoding='utf-8')
    temporary.replace(output / 'latest.json')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'reports/continuous')
    args = parser.parse_args()
    report = run_checks(args.output)
    print(json.dumps(report, indent=2))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write('## Briefing evaluation: ' + report['status'] + '\n\n')
            for check in report['checks']: summary.write('- ' + check['name'] + ': **' + check['status'] + '**\n')
            summary.write('\nOffline regressions only. Live factual quality and participant outcomes were not measured. Paid model calls: 0.\n')
    return 0 if report['status']=='passed' else 1


if __name__ == '__main__': raise SystemExit(main())
