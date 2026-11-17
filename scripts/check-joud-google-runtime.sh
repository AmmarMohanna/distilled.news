#!/usr/bin/env bash
# Read-only diagnostics for the dedicated Joud runtime. Never prints credentials.
set -eu
python3 - <<'PY'
import json
from pathlib import Path
import urllib.request
import urllib.error

folder = Path('/home/distilled-bench/distilled-source-runtime-joud').resolve(strict=True)
env = dict(line.split('=', 1) for line in (folder / 'runtime.env').read_text().splitlines() if '=' in line)
source = (folder / 'source-execution.py').read_text()
print(json.dumps({'egressConfirmedInFile': env.get('SOURCE_BROWSER_EGRESS_CONFIRMED') == 'true', 'googleFeedSupported': "kind == 'google_feed'" in source}))
request = urllib.request.Request('http://127.0.0.1:8791/v1/source-execution', data=json.dumps({'kind': 'google_feed', 'input': {'url': 'https://news.google.com/rss/search?q=Lebanon+economy&hl=en-US&gl=US&ceid=US%3Aen'}}).encode(), headers={'Authorization': 'Bearer ' + env['SOURCE_EXECUTION_TOKEN'], 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(request, timeout=65) as response:
        result = json.load(response)
    xml = result.get('xml', '')
    print(json.dumps({'status': result.get('status'), 'runtimeError': result.get('error'), 'xmlBytes': len(xml.encode()), 'items': xml.count('<item>')}))
except urllib.error.HTTPError as error:
    print(json.dumps({'httpStatus': error.code}))
except Exception:
    print(json.dumps({'diagnostic': 'RUNTIME_CHECK_UNAVAILABLE'}))
PY
