#!/usr/bin/env bash
# Read-only browser diagnostic under the existing service user. No file changes.
set -eu
python3 - <<'PY'
import ast
import json
import os
from pathlib import Path
import signal
import subprocess

folder = Path('/home/distilled-bench/distilled-source-runtime-joud').resolve(strict=True)
env = dict(line.split('=', 1) for line in (folder / 'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
python = env.get('SOURCE_EXECUTION_PYTHON', '').strip().strip('"')
if not python or not Path(python).is_file():
    raise SystemExit('Configured service Python path missing; no changes made')
code = r'''
import asyncio, importlib.util, json, re
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('runtime','/home/distilled-bench/distilled-source-runtime-joud/source-execution.py')
runtime=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
url='https://www.cbsnews.com/projects/2026/cornell-rape-allegations-documents/'
async def main():
    runtime.public_url(url)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(service_workers='block',accept_downloads=False)
        scripts,failures,errors=[],[],[]
        count=0
        async def route(r):
            nonlocal count
            q=r.request; u=urlsplit(q.url)
            if q.is_navigation_request() and q.frame==page.main_frame and q.url!=url:
                return await r.abort()
            if q.resource_type in ('image','media','font') or u.scheme!='https' or u.hostname!='www.cbsnews.com' or u.port not in (None,443) or u.username or u.password:
                return await r.abort()
            count+=1
            return await r.abort() if count>80 else await r.continue_()
        await context.route('**/*',route)
        try:
            page=await context.new_page()
            def response(r):
                if r.request.resource_type=='script' and len(scripts)<16:
                    scripts.append({'path':urlsplit(r.url).path,'status':r.status})
            def failed(q):
                if q.resource_type in ('script','document') and len(failures)<16:
                    reason=re.search(r'net::[A-Z0-9_]+',q.failure or '')
                    failures.append({'host':urlsplit(q.url).hostname,'path':urlsplit(q.url).path,'reason':reason.group(0) if reason else 'OTHER'})
            def page_error(e):
                if len(errors)<8:
                    s=str(e).lower()
                    errors.append('MODULE_FETCH_FAILED' if 'import' in s or 'module' in s else 'SYNTAX_ERROR' if 'syntax' in s or 'unexpected token' in s else 'SCRIPT_ERROR')
            page.on('response',response)
            page.on('requestfailed',failed)
            page.on('pageerror',page_error)
            result=await page.goto(url,wait_until='domcontentloaded',timeout=20000)
            try:
                await page.wait_for_function("() => [...document.querySelectorAll('main.story')].some(n => (n.innerText || '').length >= 200)",timeout=3500)
            except Exception:
                pass
            html=await page.content()
            print(json.dumps({'status':result.status if result else 0,'htmlBytes':len(html.encode()),'hasHeadline':bool(re.search(r'<h1\b',html)),'scripts':scripts,'failedResources':failures,'pageErrors':errors}))
        finally:
            await context.close()
            await browser.close()
try:
    asyncio.run(main())
except Exception as e:
    print(json.dumps({'diagnosticError':type(e).__name__}))
'''
ast.parse(code)
process = subprocess.Popen(['runuser', '-u', 'distilled-bench', '--', python, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
try:
    output, _ = process.communicate(timeout=50)
    print(output.strip() or json.dumps({'diagnosticExit': process.returncode}))
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGKILL)
    process.communicate()
    print(json.dumps({'diagnosticError': 'PROCESS_TIMEOUT'}))
PY
