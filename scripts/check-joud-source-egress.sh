#!/usr/bin/env bash
# Read-only firewall inspection. Does not read environment or credential values.
set -eu
python3 - <<'PY'
import json
import subprocess

checks = [
    ['systemctl', 'show', 'distilled-source-joud.service', '-p', 'User', '-p', 'Group'],
    ['nft', 'list', 'ruleset'],
    ['iptables', '-S'],
    ['ip6tables', '-S'],
]
for command in checks:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=15)
        output = result.stdout
        print(json.dumps({'check': ' '.join(command), 'exitCode': result.returncode, 'output': output[:20000], 'truncated': len(output) > 20000}))
    except FileNotFoundError:
        print(json.dumps({'check': command[0], 'available': False}))
    except Exception:
        print(json.dumps({'check': command[0], 'diagnostic': 'CHECK_UNAVAILABLE'}))
PY
