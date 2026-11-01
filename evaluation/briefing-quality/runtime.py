"""Summarize recorded replay artifacts, including failed-attempt and unknown costs."""
import argparse
import json
from collections import defaultdict
from pathlib import Path
from suite import ROOT, write, percentile
from evaluate import require, number


def summarize(rows, calls, expected):
    planned_ids = {(r['caseId'], r['language'], r['system']) for r in expected}
    require(len(planned_ids) == len(expected), 'Duplicate planned case/system')
    require(all(r['language'] in ('en','fr','ar') for r in expected), 'Invalid planned language')
    for row in rows:
        require((row['caseId'],row['language'],row['system']) in planned_ids, 'Unplanned terminal case/system')
        number(row.get('latencyMs'), 'latencyMs')
        require(row.get('status') == 'failed' or row.get('result',{}).get('status') in ('published','empty','rejected'), 'Unknown terminal status')
    journal = {}
    for call in calls:
        require(call.get('language') in ('en','fr','ar') and call.get('system') in {r['system'] for r in expected}, 'Unplanned call context')
        number(call.get('id'), 'call ID', integer=True)
        require(call['id'] > 0, 'Invalid call ID')
        key = (call['language'],call['system'],call['id'])
        state = call.get('state')
        require(state in ('RESERVED','SETTLED','UNKNOWN_OR_TERMINAL_FAILURE'), 'Unknown journal state')
        entry = journal.setdefault(key, set())
        require(state not in entry, 'Duplicate journal state')
        if state == 'RESERVED':
            require(not entry, 'Reservation must precede outcome')
            number(call.get('reservationUsd'), 'reservationUsd')
        else:
            require('RESERVED' in entry, 'Outcome without reservation')
        if state == 'SETTLED':
            number(call.get('costUsd'), 'costUsd')
            number(call.get('inputTokens'), 'inputTokens', integer=True)
            number(call.get('outputTokens'), 'outputTokens', integer=True)
        entry.add(state)
    groups=[]
    for lang in ('en','fr','ar'):
        for system in sorted({e['system'] for e in expected}):
            relevant=[r for r in rows if r['language']==lang and r['system']==system]
            planned=[e for e in expected if e['language']==lang and e['system']==system]
            ids={r['caseId'] for r in relevant}
            require(len(ids)==len(relevant),'Duplicate terminal case/system')
            ledger=[r for r in calls if r.get('language')==lang and r.get('system')==system]
            reservations={r['id']:r for r in ledger if r['state']=='RESERVED'}
            settlements={r['id']:r for r in ledger if r['state']=='SETTLED'}
            unresolved={i:r for i,r in reservations.items() if i not in settlements}
            cost=sum(r['costUsd'] for r in settlements.values())
            held=sum(r['reservationUsd'] for r in unresolved.values())
            published=[r for r in relevant if r.get('result',{}).get('status')=='published']
            empty=[r for r in relevant if r.get('result',{}).get('status')=='empty']
            rejected=[r for r in relevant if r.get('result',{}).get('status')=='rejected']
            failures=[r for r in relevant if r.get('status')=='failed']
            latency=lambda pop:{'n':len(pop),'p50Ms':percentile([r['latencyMs'] for r in pop],.5),'p95Ms':percentile([r['latencyMs'] for r in pop],.95)}
            groups.append({'language':lang,'system':system,'plannedWindows':len(planned),'terminalWindows':len(relevant),
                           'missingWindows':[e['caseId'] for e in planned if e['caseId'] not in ids],
                           'publishedBriefings':len(published),'emptyWindows':len(empty),'rejectedWindows':len(rejected),'failures':len(failures),
                           'latencyAllTerminal':latency(relevant),'latencyPublished':latency(published),
                           'attemptedCalls':len(reservations),'correctiveRetries':sum(r.get('correctiveRetry',False) for r in reservations.values()),
                           'transportRetries':0,'knownInputTokens':sum(r['inputTokens'] for r in settlements.values()),
                           'knownOutputTokens':sum(r['outputTokens'] for r in settlements.values()),'unknownUsageCalls':len(unresolved),
                           'knownCostUsdIncludingFailedBriefings':cost,'unresolvedReservationUsd':held,
                           'exactTotalCostUsd':cost if not unresolved else None,
                           'costPerPublishedBriefingUsd':cost/len(published) if published and not unresolved else None,
                           'costPerPublishedBriefingBoundsUsd':[cost/len(published),(cost+held)/len(published)] if published else None,
                           'measurementClass':'isolated_model_replay; excludes acquisition, persistence and notification'})
    return groups


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('prepared',type=Path);a=p.parse_args()
    require(a.run.resolve().is_relative_to((ROOT/'private').resolve()),'Run must remain private')
    manifest=json.loads((a.run/'manifest.json').read_text(encoding='utf-8'))
    dataset=json.loads((a.prepared/'archive/dataset/manifest.json').read_text(encoding='utf-8'))
    rows=[json.loads(p.read_text(encoding='utf-8')) for p in a.run.glob('*.json') if p.name.startswith(('v3-','single-llm-'))]
    ledger=a.run/'calls.jsonl'
    calls=[json.loads(s) for s in ledger.read_text(encoding='utf-8').splitlines()] if ledger.exists() else []
    expected=[{'caseId':name,'system':system,'language':json.loads((a.prepared/'archive/dataset'/name).read_text(encoding='utf-8'))['language']}
              for name in manifest['cases'] for system in manifest['systems']]
    write(a.run/'runtime-summary.json',summarize(rows,calls,expected))
    print('Recorded terminal model windows:',len(rows),'; reserved model attempts:',sum(r['state']=='RESERVED' for r in calls))
