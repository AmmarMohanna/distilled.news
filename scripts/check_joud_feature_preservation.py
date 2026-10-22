"""Check pinned protected implementation alongside feature-level shared merges.

This proves source preservation, not live behavior or visual correctness.
"""
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
JOUD='ebe6997e6ef3f604d9c9ab821295394bd91822aa'
PROTECTED=[
    'apps/worker/wrangler.joud.jsonc',
    'apps/worker/src/repository.ts',
    'apps/worker/src/sketches.ts','apps/worker/src/feed-sketch-jobs.ts',
    'apps/worker/src/sketch-route.test.ts','apps/worker/src/sketches.test.ts','apps/worker/src/feed-sketch-jobs.test.ts',
    'apps/worker/src/source-recommendations.ts','apps/worker/src/source-recommendations.test.ts',
    'apps/worker/src/source-assessment.ts','apps/worker/src/source-assessment.test.ts',
    'apps/worker/src/source-catalog.ts','apps/worker/src/source-recommendation-fetch.ts',
    'apps/worker/src/product-feed-discovery.ts','apps/worker/src/product-feed-discovery.test.ts',
    'apps/worker/src/source-recommendation-flow.test.ts','apps/worker/src/source-recommendation-recovery.test.ts',
    'apps/worker/src/source-verification-collector.ts','apps/worker/src/source-verification-collector.test.ts',
    'apps/worker/src/telegram-verification.ts','apps/worker/src/telegram-verification.test.ts',
    'apps/worker/src/native-source-execution.ts','apps/worker/src/native-source-execution.test.ts',
    'apps/worker/src/collector-budget.ts',
    'apps/worker/src/storage-maintenance.ts','apps/worker/src/storage-maintenance.test.ts','apps/worker/src/storage-routes.test.ts',
    'apps/worker/src/v1-intelligence/semantic-wait-record.ts',
    'packages/connectors/src/source-runtime/provider-http.ts',
    'packages/connectors/src/source-runtime/provider-normalize.ts',
    'packages/connectors/src/source-runtime/public-html.ts',
    'scripts/source-execution-server.mjs','scripts/source-execution-server.test.mjs',
]

def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT)

def run():
    frontend=git('ls-tree','-r','--name-only',JOUD,'--','apps/web').decode().splitlines()
    for name in frontend+PROTECTED:
        current=(ROOT/name).read_bytes().replace(b'\r\n',b'\n')
        assert current==git('show',f'{JOUD}:{name}').replace(b'\r\n',b'\n'),name
    print(f'PASS {len(frontend)} frontend files and {len(PROTECTED)} protected backend/configuration files match {JOUD}')
    for name in ['ARCHITECTURE_v1.md','PARALLEL_IMPLEMENTATION_AGREEMENT.md']:
        assert (ROOT/'documentation'/name).read_bytes().replace(b'\r\n',b'\n')==git('show',f'{JOUD}:documentation/{name}').replace(b'\r\n',b'\n')
    print('PASS frozen architecture/agreement and protected feature implementations preserved')

if __name__=='__main__':
    run()
