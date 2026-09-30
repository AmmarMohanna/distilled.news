"""Read saved VPS responses and replay locally; never submits an actor run."""
import hashlib
import json
import subprocess
from pathlib import Path

REMOTE = r'''
set -e
set -a
. "$HOME/.config/distilled-bench/apify.env"
set +a
python3 - <<'PY'
import json, os
from pathlib import Path
from urllib.request import Request, urlopen
folder = Path.home() / '.local/share/distilled-bench/linkedin-pilot-001'
data = []
for name in ('company', 'profile'):
    run = json.loads((folder / (name + '-run.json')).read_text())
    req = Request('https://api.apify.com/v2/actor-runs/' + run['id'], headers={'Authorization': 'Bearer ' + os.environ['APIFY_TOKEN']})
    with urlopen(req, timeout=30) as r:
        billing = json.load(r)['data']
    (folder / (name + '-billing.json')).write_text(json.dumps(billing, indent=2))
    data.append({'case': name, 'run': billing, 'raw': json.loads((folder / (name + '-raw.json')).read_text())})
print(json.dumps(data))
PY
'''
root = Path(__file__).resolve().parents[2]
result = subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe', '-i', str(Path.home() / '.ssh/distilled_bench_codex'), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', 'distilled-bench@148.230.109.96', 'bash -s'], input=REMOTE.encode(), capture_output=True, check=True)
reports = []
for case in json.loads(result.stdout):
    rows = case['raw']
    request = {'operation': 'apify', 'payload': json.dumps(rows), 'target': {'id': 'linkedin-' + case['case'], 'kind': 'linkedin_' + case['case'], 'input': ''}, 'fetched_at': case['run']['startedAt']}
    transformed = subprocess.run(['node', str(root / 'evaluation/acquisition-benchmark/node/transform.mjs')], input=json.dumps(request).encode(), capture_output=True, check=True)
    items = json.loads(transformed.stdout)['baseline']
    mapped = {item['sourceUrl']: item for item in items}
    checks = []
    for row in rows:
        item = mapped.get(row.get('linkedinUrl'), {})
        links = [a['hyperlink'] for a in row.get('contentAttributes', []) if isinstance(a.get('hyperlink'), str) and a['hyperlink'].startswith(('http://', 'https://'))]
        checks.append({'id': row['id'], 'retained': bool(item), 'text': bool(row.get('content')) and item.get('text') == row['content'].strip(), 'author': item.get('source', {}).get('title') == row.get('author', {}).get('name'), 'date': item.get('postedAt') == row.get('postedAt', {}).get('date'), 'url': item.get('sourceUrl') == row.get('linkedinUrl'), 'attribute_links': all(link in item.get('links', []) for link in links)})
    reports.append({'case': case['case'], 'run_id': case['run']['id'], 'returned': len(rows), 'normalized': len(items), 'duplicate_urls': len(rows) - len({r.get('linkedinUrl') for r in rows}), 'reposted_by_count': sum(bool(r.get('repostedBy')) for r in rows), 'nested_repost_count': sum(bool(r.get('repost')) for r in rows), 'cost_usd': case['run'].get('usageTotalUsd'), 'charged_events': case['run'].get('chargedEventCounts'), 'failed_checkpoints': [{'id': c['id'], 'check': key} for c in checks for key, value in c.items() if key != 'id' and not value], 'checks': checks, 'raw_canonical_sha256': hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()})
output = root / 'documentation/testing-evidence/linkedin-pilot-001/after-fixes.json'
output.write_text(json.dumps(reports, indent=2), encoding='utf-8')
for report in reports:
    print(json.dumps({k: v for k, v in report.items() if k != 'checks'}))
