"""One serial cron worker; fixed paid roster, durable submission markers, no paid retries."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from urllib.parse import urlencode


def save(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.flush(); os.fsync(f.fileno())
    tmp.replace(path)


def claim(path, value):
    try:
        with path.open('x', encoding='utf-8') as f:
            json.dump(value, f); f.flush(); os.fsync(f.fileno())
        return True
    except FileExistsError:
        return False


def get(url, token, twitter=False):
    headers = {'X-API-Key': token} if twitter else {'Authorization': 'Bearer ' + token}
    with urlopen(Request(url, headers=headers), timeout=45) as r:
        raw = r.read(10_000_001)
    if len(raw) > 10_000_000: raise ValueError('Response size limit')
    return json.loads(raw)


def twitter_round(root, folder, index, manifest):
    token = os.environ['TWITTERAPI_IO_KEY']
    out = folder / f'twitter-r{index:03}'; out.mkdir(exist_ok=True)
    halt = folder / 'twitter-HALTED.json'
    if halt.exists(): return
    for target in manifest['twitter_targets']:
        key = target['id']; marker = out / (key + '-submitted.json')
        if marker.exists(): continue  # Even an uncertain request is never submitted twice.
        previous = list(folder.glob('twitter-r*/*-submitted.json'))
        if len(previous) >= 210 or (len(previous) + 1) * 0.02 > 4.20000001:
            save(halt, {'reason': 'Reservation ceiling'}); return
        try:
            before = get('https://api.twitterapi.io/oapi/my/info', token, True)['recharge_credits']
            if not isinstance(before, (int, float)) or before < 2000: raise ValueError('Insufficient credits for reservation')
            profile = target['kind'] == 'x_profile'
            endpoint = '/twitter/user/last_tweets' if profile else '/twitter/tweet/advanced_search'
            params = {'userName': target['input'], 'includeReplies': 'false'} if profile else {'query': target['input'], 'queryType': 'Latest'}
            if not claim(marker, {'reserved_usd': 0.02, 'credit_before': before, 'started_at': time.time(), 'endpoint': endpoint, 'params': params}): continue
            started = time.monotonic()
            payload = get('https://api.twitterapi.io' + endpoint + '?' + urlencode(params), token, True)
            save(out / (key + '-raw.json'), payload)
            after = get('https://api.twitterapi.io/oapi/my/info', token, True)['recharge_credits']
            delta = before - after
            if not 0 <= delta <= 2000: raise ValueError('Unexpected credit delta; halt for billing review')
            obj = payload.get('data', payload); rows = obj.get('tweets')
            if not isinstance(rows, list) or len(rows) > 20: raise ValueError('Unexpected one-page response')
            from bench.extractors import isolated
            normalized = asyncio.run(isolated('apify', json.dumps(rows[:10]), target, __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()))
            save(out / (key + '-normalized.json'), normalized)
            save(out / (key + '-result.json'), {'provider': 'twitterapi_io', 'raw_count': len(rows), 'evaluated_count': min(10, len(rows)), 'normalization': 'Apify-compatible bridge; provider identity retained in this wrapper', 'credit_before': before, 'credit_after': after, 'observed_account_delta_usd': delta / 100000, 'estimate_usd': max(1, len(rows)) * 0.00015, 'elapsed_seconds': time.monotonic() - started, 'quality': 'SOURCE_UNVERIFIED'})
        except Exception as e:
            save(halt, {'target': key, 'round': index, 'reason': type(e).__name__, 'detail': str(e), 'note': 'No retry. Reservation retained; account delta can include other usage or billing delay.'})
            return


def family_round(root, folder, family, index):
    config_path = folder / (family + '.json'); config = json.loads(config_path.read_text())
    run = f'stage3-paid-20260927-{family}-r{index:03}'
    marker = folder / (run + '-submitted.json'); complete = folder / (run + '-processed.json')
    if complete.exists(): return
    with (folder / (run + '.log')).open('ab') as log:
        if claim(marker, {'run_id': run, 'submitted_at': time.time(), 'reservation_max_usd': sum(len(t['routes']) for t in config['targets']) * config['routes'][0]['cost_ceiling_usd']}):
            result = subprocess.run([sys.executable, '-m', 'bench', 'run', '--config', str(config_path), '--run-id', run], stdout=log, stderr=log, timeout=3600)
            acquisition_returncode = result.returncode
        else:
            acquisition_returncode = 'interrupted_or_previously_submitted_no_retry'
        # Processing reads saved captures only; never resume uncertain paid acquisition.
        result = subprocess.run([sys.executable, '-m', 'bench', 'process', '--data-dir', config['data_dir'], '--run-id', run], stdout=log, stderr=log, timeout=600)
    billing = []
    report = Path(config['data_dir']) / 'reports' / run / 'report.json'
    if report.exists():
        for job in json.loads(report.read_text()).get('jobs', []):
            for step in (job.get('result') or {}).get('steps', []):
                remote = (step.get('coverage') or {}).get('remote_id') or (job.get('remote') or {}).get('id')
                if not remote or step.get('adapter') != 'apify': continue
                try:
                    info = get('https://api.apify.com/v2/actor-runs/' + remote, os.environ['APIFY_TOKEN'])['data']
                    billing.append({k: info.get(k) for k in ('id', 'status', 'usageTotalUsd', 'chargedEventCounts', 'buildId', 'options')})
                    if isinstance(info.get('usageTotalUsd'), (int, float)) and info['usageTotalUsd'] > config['routes'][0]['cost_ceiling_usd'] + 1e-9:
                        save(folder / (family + '-HALTED.json'), {'reason': 'Provider charge exceeded per-run allowance', 'remote_id': remote})
                except Exception as e: billing.append({'id': remote, 'billing_error': type(e).__name__})
    save(complete, {'acquisition_returncode': acquisition_returncode, 'processing_returncode': result.returncode, 'billing': billing, 'note': 'Full reservations retained in ledger, even when reported usage is lower.'})


def main():
    os.umask(0o077)
    root = Path.cwd(); sys.path.insert(0, str(root))
    folder = root / 'data/campaigns/stage3-paid-20260927'
    manifest = json.loads((folder / 'manifest.json').read_text())
    now = time.time(); anchor = manifest['anchor_epoch']
    if (folder / 'STOP').exists() or (folder / 'COMPLETE').exists(): return
    for index in range(21):
        due = anchor + index * 21600
        if now < due: break
        done = folder / f'round-{index:03}.json'
        if done.exists(): continue
        if now - due > 21600:
            save(done, {'status': 'MISSED_WINDOW', 'due': due, 'observed_at': now}); continue
        started = time.time()
        for family in ('x', 'google', 'linkedin', 'web'):
            if (folder / 'STOP').exists(): return
            if (folder / (family + '-HALTED.json')).exists(): continue
            # Alternate source order without changing request counts or budgets.
            if family == 'x' and index % 2 == 1: twitter_round(root, folder, index, manifest)
            try: family_round(root, folder, family, index)
            except Exception as e: save(folder / (family + '-HALTED.json'), {'reason': type(e).__name__, 'detail': str(e), 'round': index})
            if family == 'x' and index % 2 == 0: twitter_round(root, folder, index, manifest)
        save(done, {'status': 'FINISHED_CHECK_LOGS', 'due': due, 'started_at': started, 'finished_at': time.time(), 'lateness_seconds': started - due})
    if all((folder / f'round-{i:03}.json').exists() for i in range(21)):
        save(folder / 'COMPLETE', {'finished_at': time.time()})


if __name__ == '__main__': main()
