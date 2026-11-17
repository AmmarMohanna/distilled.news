#!/usr/bin/env bash
# Apply only the tested Telegram lookup correction to the dedicated Joud runtime.
# Invoked by the operator over SSH; does not print or change runtime credentials.
set -eu
python3 - <<'PY'
import ast
import datetime
import json
import os
from pathlib import Path
import shutil
import tempfile
import urllib.request
import urllib.error

folder = Path('/home/distilled-bench/distilled-source-runtime-joud').resolve(strict=True)
target = (folder / 'source-execution.py').resolve(strict=True)
if target.parent != folder or target.name != 'source-execution.py':
    raise SystemExit('Unexpected runtime source path')
before = target.read_text()
old = '        entity = await client.get_entity(username)'
new = '        peer = await client.get_input_entity(username)\n        entity = await client.get_entity(peer)'
if new in before:
    print(json.dumps({'updated': False, 'alreadyInstalled': True}))
else:
    if before.count(old) != 1:
        raise SystemExit('Runtime differs from expected code; no files changed')
    after = before.replace(old, new)
    ast.parse(after)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = folder / ('source-execution.py.before-cache-' + stamp)
    shutil.copy2(target, backup)
    metadata = target.stat()
    with tempfile.NamedTemporaryFile(mode='w', dir=folder, prefix='source-execution-', suffix='.tmp', delete=False) as temporary:
        temporary.write(after)
        replacement = Path(temporary.name)
    os.chmod(replacement, metadata.st_mode)
    os.chown(replacement, metadata.st_uid, metadata.st_gid)
    os.replace(replacement, target)
    print(json.dumps({'updated': True, 'backup': str(backup)}))

# Each request spawns a fresh Python process; no service restart is necessary.
env = dict(line.split('=', 1) for line in (folder / 'runtime.env').read_text().splitlines() if '=' in line)
def call(kind, inputs):
    request = urllib.request.Request('http://127.0.0.1:8791/v1/source-execution', data=json.dumps({'kind': kind, 'input': inputs}).encode(), headers={'Authorization': 'Bearer ' + env['SOURCE_EXECUTION_TOKEN'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=65) as response:
        return json.load(response)
try:
    result = call('telegram_resolve', {'username': 'telegram'})
    print(json.dumps({'username': 'telegram', 'resolved': bool(result.get('channelId')), 'runtimeError': result.get('error'), 'retryNotBefore': result.get('retryNotBefore')}))
    if result.get('channelId'):
        page = call('telethon', {'channelId': result['channelId'], 'afterId': 0, 'limit': 5})
        print(json.dumps({'readablePosts': len([row for row in page.get('records', []) if row.get('text', '').strip()]), 'runtimeError': page.get('error')}))
except urllib.error.HTTPError as error:
    print(json.dumps({'httpStatus': error.code}))
except Exception:
    print(json.dumps({'diagnostic': 'RUNTIME_CHECK_UNAVAILABLE'}))
PY
