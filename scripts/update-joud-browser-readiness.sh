#!/usr/bin/env bash
# Operator-run, narrowly scoped patch. No credential changes or service restart.
set -eu
python3 - <<'PY'
import ast
import datetime
import json
import os
from pathlib import Path
import shutil
import tempfile

folder = Path('/home/distilled-bench/distilled-source-runtime-joud').resolve(strict=True)
target = (folder / 'source-execution.py').resolve(strict=True)
if target.parent != folder:
    raise SystemExit('Unexpected source path; nothing changed')
before = target.read_text()
old = "            response = await page.goto(data['url'], wait_until='domcontentloaded', timeout=20000)\n            html = await page.content()"
new = """            response = await page.goto(data['url'], wait_until='domcontentloaded', timeout=20000)
            if data.get('waitForArticleText') is True:
                # Exact reviewed articles can hydrate after DOMContentLoaded.
                # This is a bounded readiness wait, not scrolling or navigation.
                try:
                    await page.wait_for_function(
                        "() => [...document.querySelectorAll('article,[itemprop=articleBody],main')].some(n => (n.innerText || '').trim().length >= 400)",
                        timeout=3500)
                except Exception as error:
                    if type(error).__name__ != 'TimeoutError':
                        raise
            html = await page.content()"""
if new in before:
    print(json.dumps({'alreadyInstalled': True}))
else:
    if before.count(old) != 1:
        raise SystemExit('Runtime differs from expected code; nothing changed')
    after = before.replace(old, new)
    ast.parse(after)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = folder / ('source-execution.py.before-browser-readiness-' + stamp)
    shutil.copy2(target, backup)
    metadata = target.stat()
    with tempfile.NamedTemporaryFile(mode='w', dir=folder, prefix='browser-readiness-', delete=False) as temporary:
        temporary.write(after)
        replacement = Path(temporary.name)
    os.chmod(replacement, metadata.st_mode)
    os.chown(replacement, metadata.st_uid, metadata.st_gid)
    os.replace(replacement, target)
    print(json.dumps({'updated': True, 'backup': str(backup)}))
# The service starts a fresh Python process per request.
PY
