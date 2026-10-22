"""Serial baseline/current reproduction of four unchanged strict timing tests.

Use immutable snapshots with the same installed dependencies. Stop other local
Vitest/D1 workloads first. No test or hook timeout override is permitted here.
Raw private logs/reports belong in an ignored output directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
import uuid

CASES = [
    ('src/agent-runtime-store.test.ts', 'D1 agent runtime fencing and outbox relays an admission committed before publication from a fresh store instance'),
    ('src/v1-intelligence/publication.test.ts', 'restart after durable model draft and grounding resumes publication without a second paid call'),
    ('src/v1-intelligence/runtime.test.ts', 'cron dispatches only approved bounded feed windows; duplicate briefing delivery returns one persisted edition'),
    ('src/v1-intelligence/runtime.test.ts', 'recovers a committed edition whose request was not settled before a crash'),
]

def classify_result(exit_code, report, assertion, log_text):
    passed = exit_code == 0 and report.get('success') is True and assertion['status'] == 'passed'
    if passed:
        return 'passed', None
    if 'Test timed out in' in log_text:
        return 'failed', 'TEST_TIMEOUT'
    if 'Hook timed out in' in log_text:
        return 'failed', 'HOOK_TIMEOUT'
    return 'failed', 'RUNNER_OR_SUITE_FAILURE' if assertion['status'] == 'passed' else 'OTHER_FAILURE'

def validate_report_path(path):
    # Node can emit a long-path report that this Windows Python filesystem API
    # cannot reopen. Reject before running a test, preserving prior evidence.
    if sys.platform == 'win32' and len(str(path)) >= 260:
        raise ValueError('Windows report path is too long; choose a short output directory such as .local-reports/timing')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-root', required=True, type=Path)
    parser.add_argument('--current-root', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--rounds', type=int, default=3)
    args = parser.parse_args()
    assert 1 <= args.rounds <= 5
    roots = {'baseline': args.baseline_root.resolve(), 'current': args.current_root.resolve()}
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    corepack = shutil.which('corepack')
    assert corepack, 'corepack is required'
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    invariants = ['pnpm-lock.yaml', 'apps/worker/vitest.config.ts', 'apps/worker/package.json']
    invariants += ['apps/worker/' + p for p, _ in CASES]
    hashes = {p: {v: digest(root / p) for v, root in roots.items()} for p in set(invariants)}
    assert all(v['baseline'] == v['current'] for v in hashes.values()), 'Tests, limits or dependency declarations differ'
    source_hashes = {variant: {p.relative_to(root).as_posix(): digest(p) for p in sorted((root / 'apps/worker/src').rglob('*.ts'))} for variant, root in roots.items()}
    environment = {'runnerHash': digest(Path(__file__)), 'platform': platform.platform(), 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'comparisonHashes': hashes, 'workerSourceHashes': source_hashes, 'rounds': args.rounds, 'order': 'Alternate baseline/current by round and case', 'testTimeoutOverride': None, 'hookTimeoutOverride': None}
    environment_path = output / 'environment.json'
    if environment_path.exists():
        assert json.loads(environment_path.read_text(encoding='utf-8')) == environment, 'Cannot mix different revisions or environments when resuming'
    environment_path.write_text(json.dumps(environment, indent=2), encoding='utf-8')
    summary_path = output / 'results.json'
    summary = json.loads(summary_path.read_text(encoding='utf-8')) if summary_path.exists() else []
    for repeat in range(args.rounds):
        for index, (file, title) in enumerate(CASES):
            variants = ['baseline', 'current'] if (repeat + index) % 2 == 0 else ['current', 'baseline']
            for variant in variants:
                if any(r['round'] == repeat + 1 and r['case'] == index + 1 and r['variant'] == variant for r in summary):
                    continue
                root = roots[variant]
                name = f'timing-{repeat+1}-{index+1}-{variant}'
                # A fresh attempt cannot consume an interrupted predecessor's
                # report. Preserve old evidence rather than overwriting it.
                attempt = name + '-' + uuid.uuid4().hex
                report = output / (attempt + '.json')
                log_path = output / (attempt + '.log')
                validate_report_path(report)
                assert not report.exists() and not log_path.exists()
                pattern = '^' + ''.join('\\' + c if c in r'\^$.*+?()[]{}|' else c for c in title) + '$'
                command = [corepack, 'pnpm', '--filter', '@distilled/worker', 'exec', 'vitest', 'run', file, '--maxWorkers=1', '-t', pattern, '--reporter=default', '--reporter=json', '--outputFile=' + str(report)]
                print(json.dumps({'run': name, 'title': title}), flush=True)
                started = time.monotonic()
                with log_path.open('xb') as log:
                    result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, shell=False)
                assert report.exists(), f'Missing machine report: {name}'
                data = json.loads(report.read_text(encoding='utf-8-sig'))
                assertions = [(s, a) for s in data['testResults'] for a in s['assertionResults'] if a['status'] in ['passed', 'failed']]
                assert len(assertions) == 1, f'Wrong selection coverage: {name}'
                suite, assertion = assertions[0]
                assert Path(suite['name']).resolve() == (root / 'apps/worker' / file).resolve(), 'Wrong snapshot executed'
                assert assertion['fullName'] == title
                log_text = log_path.read_text(encoding='utf-8-sig', errors='replace')
                status, failure_kind = classify_result(result.returncode, data, assertion, log_text)
                row = {'round': repeat + 1, 'case': index + 1, 'variant': variant, 'attempt': attempt, 'file': file, 'fullName': title, 'exitCode': result.returncode, 'reportSuccess': data.get('success'), 'assertionStatus': assertion['status'], 'processWallMs': round((time.monotonic() - started) * 1000, 3), 'testDurationMs': assertion.get('duration'), 'status': status, 'failureKind': failure_kind, 'failureMessages': assertion.get('failureMessages', [])}
                summary.append(row)
                temporary = output / 'results.new.json'
                temporary.write_text(json.dumps(summary, indent=2), encoding='utf-8')
                temporary.replace(summary_path)
                print(json.dumps({k: v for k, v in row.items() if k != 'failureMessages'}), flush=True)

if __name__ == '__main__':
    main()
