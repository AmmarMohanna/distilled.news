"""Run one approved text-only X functional check; retain raw content on VPS only."""
import subprocess
from pathlib import Path

remote = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
set -a
. "$HOME/.config/distilled-bench/x.env"
set +a
.venv/bin/python - <<'PY'
import asyncio, json, os
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
from bench.processing import normalize
os.umask(0o077)
folder = Path.home() / '.local/share/distilled-bench/x-search-functional-001'
folder.mkdir(parents=True, exist_ok=False)
params = {'query': '"James Webb telescope" -is:retweet', 'max_results': 10, 'sort_order': 'recency', 'tweet.fields': 'created_at,author_id,entities,note_tweet'}
(folder / 'request.json').write_text(json.dumps({'params': params, 'requested_at': datetime.now(timezone.utc).isoformat()}, indent=2))
request = Request('https://api.x.com/2/tweets/search/recent?' + urlencode(params), headers={'Authorization': 'Bearer ' + os.environ['X_BEARER_TOKEN']})
try:
    with urlopen(request, timeout=30) as response:
        payload = response.read()
except HTTPError as error:
    (folder / 'error.json').write_bytes(error.read())
    print(json.dumps({'http_status': error.code, 'stopped': True}))
    raise SystemExit(1)
(folder / 'posts.json').write_bytes(payload)
raw = json.loads(payload)
result = asyncio.run(normalize(payload, {'id': 'x-webb-search', 'kind': 'x_search', 'input': params['query']}, {'adapter': 'x_api', 'settings': {}}, None))
(folder / 'normalized.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
rows, items = raw.get('data', []), result['items']
by_id = {i['id']: i for i in items}
checks = []
for row in rows:
    item = by_id.get(row['id'], {})
    note = row.get('note_tweet') or {}
    text = note.get('text', row.get('text'))
    entities = note.get('entities', row.get('entities', {}))
    links = list(dict.fromkeys(e.get('unwound_url') or e.get('expanded_url') or e.get('url') for e in entities.get('urls', []) if e.get('unwound_url') or e.get('expanded_url') or e.get('url')))
    stamp, original = item.get('published_at'), row.get('created_at')
    checks.append({'id': row['id'], 'text': bool(text) and item.get('text') == text, 'author_id': bool(row.get('author_id')) and item.get('author') == row['author_id'], 'date': bool(stamp and original) and datetime.fromisoformat(stamp.replace('Z', '+00:00')) == datetime.fromisoformat(original.replace('Z', '+00:00')), 'post_link': item.get('url') == 'https://x.com/i/web/status/' + row['id'], 'expanded_links': item.get('links') == links})
summary = {'query': params['query'], 'posts_returned': len(rows), 'posts_normalized': len(items), 'count_preserved': len(items) == len(rows), 'unique_ids': len(by_id) == len(items), 'normalization_dropped': result.get('normalization_dropped'), 'partial_error_count': len(raw.get('errors', [])), 'failed_checkpoints': [{'id': c['id'], 'check': k} for c in checks for k,v in c.items() if k != 'id' and not v], 'long_form_posts': sum(bool(r.get('note_tweet', {}).get('text')) for r in rows), 'has_next_page': bool(raw.get('meta', {}).get('next_token')), 'checks': checks, 'paid_requests': 1, 'post_only_cost_estimate_usd': len(rows)*0.005, 'billing_verified': False, 'media': 'OUT_OF_SCOPE', 'limitations': 'One page only; no independent completeness, relevance, edits, production-ingestion or duplicate recovery verification.'}
(folder / 'normalization-checks.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
PY
'''

if __name__ == '__main__':
    proc = subprocess.run([
        r'C:\Windows\System32\OpenSSH\ssh.exe',
        '-i', str(Path.home() / '.ssh/distilled_bench_codex'),
        '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        'distilled-bench@148.230.109.96', 'bash -s',
    ], input=remote.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    evidence = Path(__file__).with_name('x-search-functional-001')
    evidence.mkdir(exist_ok=True)
    (evidence / 'verification.txt').write_bytes(proc.stdout)
    print(proc.stdout.decode('utf-8', errors='replace'))
    raise SystemExit(proc.returncode)
