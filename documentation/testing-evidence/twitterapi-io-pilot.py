"""Two explicitly approved single-page requests; --replay makes no provider calls."""
import subprocess
import sys
from pathlib import Path

REMOTE = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/twitterapi.env"
set +a
.venv/bin/python - <<'PY'
import asyncio, hashlib, json, os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
from bench.extractors import isolated

os.umask(0o077)
replay = REPLAY_VALUE
folder = Path.home() / '.local/share/distilled-bench/twitterapi-io-pilot-001'
if not replay:
    folder.mkdir(parents=True, exist_ok=False)
cases = [
    ('profile', '/twitter/user/last_tweets', {'userName': 'NASA', 'includeReplies': 'false'}, 'x_profile'),
    ('search', '/twitter/tweet/advanced_search', {'query': '"James Webb telescope" -filter:retweets', 'queryType': 'Latest'}, 'x_search'),
]
def stamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return parsedate_to_datetime(value)

reports = []
for name, endpoint, params, kind in cases:
    raw_file = folder / (name + '.json')
    if not replay:
        requested_at = datetime.now(timezone.utc).isoformat()
        (folder / (name + '-request.json')).write_text(json.dumps({'endpoint': endpoint, 'params': params, 'requested_at': requested_at}, indent=2))
        request = Request('https://api.twitterapi.io' + endpoint + '?' + urlencode(params), headers={'X-API-Key': os.environ['TWITTERAPI_IO_KEY']})
        try:
            with urlopen(request, timeout=60) as response:
                raw_file.write_bytes(response.read())
        except HTTPError as error:
            (folder / (name + '-error.json')).write_bytes(error.read())
            print(json.dumps({'case': name, 'http_status': error.code, 'stopped': True}))
            raise SystemExit(1)
    captured = json.loads((folder / (name + '-request.json')).read_text())['requested_at']
    payload = raw_file.read_bytes()
    envelope = json.loads(payload)
    body = envelope.get('data', envelope)
    rows = body.get('tweets') if isinstance(body, dict) else None
    if envelope.get('status') == 'error' or not isinstance(rows, list):
        print(json.dumps({'case': name, 'stopped': True, 'response_keys': list(envelope), 'reason': 'Unexpected response or provider error; saved privately'}))
        raise SystemExit(1)
    # Reuse existing X record normalizer offline; this does not label the provider Apify.
    normalized = asyncio.run(isolated('apify', json.dumps(rows), {'id': 'twitterapi-io-' + name, 'kind': kind, 'input': params.get('query', 'NASA')}, captured))
    (folder / (name + '-normalized.json')).write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding='utf-8')
    items = normalized['baseline']
    mapped = {str(item['messageId']): item for item in items}
    checks = []
    for row in rows:
        item = mapped.get(str(row.get('id')), {})
        author = row.get('author') or {}
        missing = [key for key in ('id', 'text', 'createdAt', 'url') if not row.get(key)]
        expected_links = [e['expanded_url'] for e in (row.get('entities') or {}).get('urls', []) if isinstance(e.get('expanded_url'), str) and e['expanded_url'].startswith(('http://', 'https://'))]
        date_ok = False
        try:
            date_ok = stamp(item.get('postedAt', '')) == stamp(row.get('createdAt', ''))
        except (ValueError, TypeError):
            pass
        checks.append({'id': row.get('id'), 'required_fields': not missing, 'text': bool(row.get('text')) and item.get('text') == row['text'], 'author': bool(author.get('userName')) and item.get('source', {}).get('username') == author['userName'], 'date': date_ok, 'post_link': bool(row.get('url')) and item.get('sourceUrl') == row['url'], 'expanded_links': all(link in item.get('links', []) for link in expected_links)})
    reports.append({'case': name, 'returned': len(rows), 'normalized': len(items), 'count_preserved': len(rows) == len(items), 'duplicate_ids': len(rows) - len({r.get('id') for r in rows}), 'failed_checkpoints': [{'id': c['id'], 'check': k} for c in checks for k,v in c.items() if k != 'id' and not v], 'checks': checks, 'has_next_page': body.get('has_next_page', envelope.get('has_next_page')), 'sha256': hashlib.sha256(payload).hexdigest(), 'estimated_post_cost_usd': max(1, len(rows)) * 0.00015, 'nested_quote_posts': sum(bool(r.get('quoted_tweet')) for r in rows), 'nested_reposts': sum(bool(r.get('retweeted_tweet')) for r in rows), 'other_text_fields': sorted({k for r in rows for k in r if k in ('fullText', 'full_text', 'note_tweet', 'noteTweet')})})
summary = {'run': 'twitterapi-io-pilot-001', 'cases': reports, 'requests_in_this_execution': 0 if replay else 2, 'media': 'OUT_OF_SCOPE', 'actual_billing_verified': False, 'limitations': 'Single pages only; independent completeness, search relevance, nested quote/repost full text and production integration not established. Existing normalizer reused as a compatibility check; provider metadata still says apify and is not production-ready.'}
(folder / 'checks.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
PY
'''

if __name__ == '__main__':
    replay = '--replay' in sys.argv
    script = REMOTE.replace('REPLAY_VALUE', str(replay))
    result = subprocess.run([
        r'C:\Windows\System32\OpenSSH\ssh.exe', '-i', str(Path.home() / '.ssh/distilled_bench_codex'),
        '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
        'distilled-bench@148.230.109.96', 'bash -s',
    ], input=script.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    folder = Path(__file__).with_name('twitterapi-io-pilot-001')
    folder.mkdir(exist_ok=True)
    (folder / ('replay.txt' if replay else 'verification.txt')).write_bytes(result.stdout)
    print(result.stdout.decode('utf-8', errors='replace'))
    raise SystemExit(result.returncode)
