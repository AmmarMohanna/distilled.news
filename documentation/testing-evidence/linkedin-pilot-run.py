"""Approved two-run pilot. Existing submissions are resumed, never resubmitted."""
import subprocess
from pathlib import Path

REMOTE = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/apify.env"
set +a
.venv/bin/python - <<'PY'
import asyncio, hashlib, json, os, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from bench.extractors import isolated
os.umask(0o077)
folder = Path.home() / '.local/share/distilled-bench/linkedin-pilot-001'
folder.mkdir(parents=True, exist_ok=True)
def save(name, value):
    (folder / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
def api(path, payload=None):
    req = Request('https://api.apify.com/v2/' + path, data=None if payload is None else json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + os.environ['APIFY_TOKEN'], 'Content-Type': 'application/json'})
    try:
        with urlopen(req, timeout=45) as r:
            return json.load(r)
    except HTTPError as e:
        save('api-error.json', {'status': e.code, 'body': e.read().decode(errors='replace')})
        raise SystemExit('Provider HTTP error ' + str(e.code) + '; details saved privately')
reports = []
for name, target in [('company', 'https://www.linkedin.com/company/microsoft/'), ('profile', 'https://www.linkedin.com/in/satyanadella/')]:
    actor = 'harvestapi~linkedin-' + name + '-posts'
    state = folder / (name + '-run.json')
    if state.exists():
        info = json.loads(state.read_text())
    else:
        metadata = api('acts/' + actor)['data']
        save(name + '-actor.json', metadata)
        print(json.dumps({'case': name, 'pricing': metadata.get('pricingInfos')}), flush=True)
        marker = folder / (name + '-submission.json')
        if marker.exists():
            raise SystemExit('Uncertain prior submission; reconcile before continuing')
        payload = {'targetUrls': [target], 'maxPosts': 10, 'scrapeComments': False, 'scrapeReactions': False}
        save(marker.name, {'input': payload, 'maxTotalChargeUsd': 0.05})
        info = api('acts/' + actor + '/runs?timeout=180&maxItems=10&maxTotalChargeUsd=0.05', payload)['data']
        save(state.name, info)
    print(json.dumps({'case': name, 'run_id': info['id'], 'status': info['status']}), flush=True)
    while info['status'] in ('READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'):
        time.sleep(5)
        info = api('actor-runs/' + info['id'])['data']
        save(state.name, info)
    if info['status'] != 'SUCCEEDED':
        raise SystemExit('Run ended ' + info['status'] + '; no retry')
    rows = api('datasets/' + info['defaultDatasetId'] + '/items?format=json&clean=true&limit=10')
    save(name + '-raw.json', rows)
    normalized = asyncio.run(isolated('apify', json.dumps(rows), {'id': 'linkedin-' + name, 'kind': 'linkedin_' + name, 'input': target}, info['startedAt']))
    save(name + '-normalized.json', normalized)
    items = normalized['baseline']
    report = {'case': name, 'run_id': info['id'], 'returned': len(rows), 'normalized': len(items), 'cost_usd': info.get('usageTotalUsd'), 'keys': sorted({k for row in rows for k in row}), 'first_record': rows[:1], 'first_normalized': items[:1]}
    reports.append(report)
    print(json.dumps(report, ensure_ascii=True), flush=True)
save('inspection.json', reports)
PY
'''
if __name__ == '__main__':
    result = subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe', '-i', str(Path.home() / '.ssh/distilled_bench_codex'), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', 'distilled-bench@148.230.109.96', 'bash -s'], input=REMOTE.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    folder = Path(__file__).with_name('linkedin-pilot-001')
    folder.mkdir(exist_ok=True)
    (folder / 'inspection.txt').write_bytes(result.stdout)
    print(result.stdout.decode('utf-8', errors='replace'))
    raise SystemExit(result.returncode)
