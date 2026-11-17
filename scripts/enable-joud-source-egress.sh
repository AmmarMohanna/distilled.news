#!/usr/bin/env bash
# Enable only Joud's configured runtime after checking its existing egress rules.
# Does not change firewall rules or print runtime credentials.
set -eu
python3 - <<'PY'
import datetime
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

def verified_rules(rules, uid):
    lines = [line.strip() for line in rules.splitlines()]
    ipv4 = [line for line in lines if re.fullmatch(r'ip daddr \{ [0-9./, ]+\} (?:counter packets \d+ bytes \d+ )?reject with icmp port-unreachable', line)]
    ipv6 = [line for line in lines if re.fullmatch(r'ip6 daddr \{ [0-9a-fA-F:/., ]+\} (?:counter packets \d+ bytes \d+ )?reject with icmpv6 port-unreachable', line)]
    if not ipv4 or not ipv6:
        return False
    if not all(value in ' '.join(ipv4) for value in ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16']):
        return False
    if not all(value in ' '.join(ipv6) for value in ['::1', '::ffff:0.0.0.0/96', 'fc00::/7', 'fe80::/10', 'ff00::/8']):
        return False
    non_runtime = f'meta skuid != {uid} accept'
    if non_runtime not in lines or 'type filter hook output priority filter; policy accept;' not in lines:
        return False
    allowed = {
        non_runtime,
        f'meta skuid {uid} ip daddr 127.0.0.1 tcp dport {{ 8790, 8791 }} accept',
        f'meta skuid {uid} ip daddr 127.0.0.1 tcp sport {{ 8790, 8791 }} accept',
        'ip daddr 127.0.0.53 udp dport 53 accept',
        'ip daddr 127.0.0.53 tcp dport 53 accept',
    }
    structure = {'', 'table inet distilled_bench_egress {', 'chain output {', 'type filter hook output priority filter; policy accept;', '}'}
    return all(line in allowed or line in structure or line in ipv4 or line in ipv6 for line in lines)

folder = Path('/home/distilled-bench/distilled-source-runtime-joud').resolve(strict=True)
target = (folder / 'runtime.env').resolve(strict=True)
if target.parent != folder:
    raise SystemExit('Unexpected runtime environment path')
unit = 'distilled-source-joud.service'
user = subprocess.check_output(['systemctl', 'show', unit, '-p', 'User', '--value'], text=True).strip()
if user != 'distilled-bench':
    raise SystemExit('Unexpected dedicated service user')
uid = pwd.getpwnam(user).pw_uid
rules = subprocess.check_output(['nft', 'list', 'table', 'inet', 'distilled_bench_egress'], text=True)
if not verified_rules(rules, uid):
    raise SystemExit('Egress rules did not match the reviewed runtime rules; nothing changed')
environment_files = subprocess.check_output(['systemctl', 'show', unit, '-p', 'EnvironmentFiles', '--value'], text=True)
if str(target) not in environment_files:
    raise SystemExit('The dedicated service does not reference the expected environment file; nothing changed')
before = target.read_text()
line = 'SOURCE_BROWSER_EGRESS_CONFIRMED=true'
after = re.sub(r'^SOURCE_BROWSER_EGRESS_CONFIRMED=.*$', line, before, flags=re.M) if re.search(r'^SOURCE_BROWSER_EGRESS_CONFIRMED=', before, re.M) else before.rstrip() + '\n' + line + '\n'
backup = None
if after != before:
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = folder / ('runtime.env.before-egress-' + stamp)
    shutil.copy2(target, backup)
    metadata = target.stat()
    with tempfile.NamedTemporaryFile(mode='w', dir=folder, prefix='runtime-env-', delete=False) as temporary:
        temporary.write(after)
        replacement = Path(temporary.name)
    os.chmod(replacement, metadata.st_mode)
    os.chown(replacement, metadata.st_uid, metadata.st_gid)
    os.replace(replacement, target)
    try:
        subprocess.run(['systemctl', 'restart', unit], check=True, capture_output=True, timeout=30)
    except Exception:
        shutil.copy2(backup, target)
        subprocess.run(['systemctl', 'restart', unit], capture_output=True, timeout=30)
        raise SystemExit('Dedicated restart failed; original environment restored')
print(json.dumps({'egressRulesVerified': True, 'enabled': True, 'environmentUpdated': after != before, 'backup': str(backup) if backup else None}))
for attempt in range(10):
    try:
        with socket.create_connection(('127.0.0.1', 8791), timeout=1):
            break
    except OSError:
        time.sleep(0.5)
env = dict(value.split('=', 1) for value in after.splitlines() if '=' in value)
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
