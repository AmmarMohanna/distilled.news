"""Apply only the reviewed LinkedIn function on the benchmark VPS; offline replay."""
import base64
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / 'packages/connectors/src/apify.ts').read_text(encoding='utf-8')
start = source.index('export function normalizeLinkedInItems(')
end = source.index('function normalizeGenericApifyItems(', start)
new = source[start:end]
old = new.replace(' ?? httpUrl(record.linkedinUrl)', '')
old = old.replace('    const posted = asRecord(record.postedAt);\n    const postedAt = dateValue(record.postedAt) ?? dateValue(posted.date) ?? dateValue(posted.timestamp) ?? dateValue(record.date ?? record.createdAt);', '    const postedAt = dateValue(record.postedAt ?? record.date ?? record.createdAt);')
author_start = old.index('    const author = asRecord(record.author);')
author_end = old.index('    return [toMessage({', author_start)
old = old[:author_start] + old[author_end:]
old = old.replace(' ?? stringValue(author.name)', '').replace('      username: stringValue(author.publicIdentifier) ?? stringValue(author.universalName),\n', '').replace(', ...attributeLinks', '')
script = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import asyncio, base64, json, os
from pathlib import Path
from bench.extractors import isolated
os.umask(0o077)
path = Path('../../packages/connectors/src/apify.ts')
old = base64.b64decode('OLD_BLOCK').decode()
new = base64.b64decode('NEW_BLOCK').decode()
source = path.read_text()
folder = Path.home() / '.local/share/distilled-bench/linkedin-pilot-001'
if new in source:
    print('LinkedIn function already updated')
elif source.count(old) == 1:
    backup = folder / 'apify-before-linkedin-fix.ts'
    with backup.open('x') as handle:
        handle.write(source)
    path.write_text(source.replace(old, new, 1))
    print('Updated only LinkedIn function; original backed up privately')
else:
    raise SystemExit('VPS function differs from expected version; no edit made')
reports = []
for name in ('company', 'profile'):
    rows = json.loads((folder / (name + '-raw.json')).read_text())
    run = json.loads((folder / (name + '-run.json')).read_text())
    result = asyncio.run(isolated('apify', json.dumps(rows), {'id': 'linkedin-' + name, 'kind': 'linkedin_' + name, 'input': ''}, run['startedAt']))
    items = result['baseline']
    mapped = {item['sourceUrl']: item for item in items}
    checks = []
    for row in rows:
        item = mapped.get(row.get('linkedinUrl'), {})
        links = [a['hyperlink'] for a in row.get('contentAttributes', []) if isinstance(a.get('hyperlink'), str) and a['hyperlink'].startswith(('http://', 'https://'))]
        checks.append({'id': row['id'], 'retained': bool(item), 'text': bool(row.get('content')) and item.get('text') == row['content'].strip(), 'author': item.get('source', {}).get('title') == row.get('author', {}).get('name'), 'date': item.get('postedAt') == row.get('postedAt', {}).get('date'), 'url': item.get('sourceUrl') == row.get('linkedinUrl'), 'attribute_links': all(link in item.get('links', []) for link in links)})
    failed = [{'id': c['id'], 'check': k} for c in checks for k, v in c.items() if k != 'id' and not v]
    reports.append({'case': name, 'returned': len(rows), 'normalized': len(items), 'checkpoints': len(checks) * 6, 'failed_checkpoints': failed, 'checks': checks})
    (folder / (name + '-after-fixes.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in reports[-1].items() if k != 'checks'}))
(folder / 'vps-verification.json').write_text(json.dumps(reports, indent=2))
if any(r['failed_checkpoints'] or r['returned'] != r['normalized'] for r in reports):
    raise SystemExit(1)
PY
.venv/bin/python -m pytest -q
'''.replace('OLD_BLOCK', base64.b64encode(old.encode()).decode()).replace('NEW_BLOCK', base64.b64encode(new.encode()).decode())
result = subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe', '-i', str(Path.home() / '.ssh/distilled_bench_codex'), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', 'distilled-bench@148.230.109.96', 'bash -s'], input=script.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(root / 'documentation/testing-evidence/linkedin-pilot-001/vps-verification.txt').write_bytes(result.stdout)
print(result.stdout.decode(errors='replace'))
raise SystemExit(result.returncode)
