"""Offline briefing evaluation. Standard library only; never calls a provider."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import subprocess
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SHA = lambda b: hashlib.sha256(b).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def table(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def tokens(text):
    return set(re.findall(r'[^\W\d_]{3,}', text.casefold(), re.UNICODE))


def percentile(values, p):
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * p
    lo = int(position)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (position - lo)


def split_cases(cases):
    # Whole tracks and matching feed/ID/URL/body components stay together.
    parent = {c['provenance']['trackId']: c['provenance']['trackId'] for c in cases}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    seen = {}
    for c in cases:
        track = c['provenance']['trackId']
        keys = [('feed', c['feedId'])]
        for a in c['articles']:
            keys += [('id', a['id']), ('text', SHA(a['text'].encode()))]
            if a.get('url'):
                keys.append(('url', a['url']))
        for key in keys:
            if key in seen:
                parent[find(track)] = find(seen[key])
            seen[key] = track
    groups = defaultdict(list)
    for c in cases:
        groups[find(c['provenance']['trackId'])].append(c)
    ordered = sorted(groups.values(), key=lambda g: SHA('|'.join(sorted({c['provenance']['trackId'] for c in g})).encode()))
    counts = defaultdict(Counter)
    assignments = {}
    for group in ordered:
        langs = {c['language'] for c in group}
        # Deterministic rotation gives available languages representation before filling development.
        choice = min(('development', 'validation', 'held-out'), key=lambda s: (sum(counts[l][s] for l in langs), ('development', 'validation', 'held-out').index(s)))
        gid = SHA('|'.join(sorted({c['provenance']['trackId'] for c in group})).encode())[:12]
        for c in group:
            assignments[c['_file']] = {'split': choice, 'group': gid}
        for lang in langs:
            counts[lang][choice] += 1
    return assignments, dict(counts)


def audit(archive):
    out = ROOT / 'private'
    if (out / 'audit.json').exists():
        raise ValueError('Existing audit found. Preserve this run; move private/ to a separately ignored archive before rerunning.')
    raw = archive.read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        roots = [n for n in z.namelist() if n.endswith('/SHA256SUMS.txt')]
        if len(roots) != 1:
            raise ValueError('Expected one checksum manifest')
        base = roots[0].removesuffix('SHA256SUMS.txt')
        checked = 0
        for line in z.read(roots[0]).decode().splitlines():
            expected, name = line.split(maxsplit=1)
            if SHA(z.read(base + name.strip())) != expected:
                raise ValueError('Checksum mismatch: ' + name)
            checked += 1
        manifest = json.loads(z.read(base + 'dataset/manifest.json'))
        snapshot_bytes = z.read(base + 'snapshot.json')
        if SHA(snapshot_bytes) != manifest['snapshotSha256']:
            raise ValueError('Snapshot hash mismatch')
        snapshot = json.loads(snapshot_bytes)
        original = {r['acquired']['id']: r for r in snapshot['records']}
        cases = []
        for item in manifest['files']:
            data = z.read(base + 'dataset/' + item['file'])
            if SHA(data) != item['sha256']:
                raise ValueError('Case hash mismatch')
            c = json.loads(data)
            assert len(c['articles']) == item['articles']
            assert len({a['id'] for a in c['articles']}) == len(c['articles'])
            expected_ids = {r['acquired']['id'] for r in snapshot['records']
                            if r['acquired']['feedId'] == c['feedId']
                            and (r.get('receipt') or {}).get('decision') in ('PROMOTED_NEW_REVISION', 'REPLAY_CURRENT_CONTENT')
                            and c['windowStart'] <= r['receipt'].get('decidedAt', '') < c['windowEnd']}
            assert expected_ids == {a['id'] for a in c['articles']}, 'Incomplete interval membership'
            for a in c['articles']:
                r = original[a['id']]
                assert a['text'] == r['acquired']['body']
                assert a['provenance']['textSha256'] == SHA(a['text'].encode())
                assert a['availableAt'] == r['receipt']['decidedAt']
                assert a['publishedAt'] == r['acquired'].get('publishedAt')
                assert a['acquiredAt'] == r['acquired'].get('acquiredAt')
            c['_file'] = item['file']
            cases.append(c)
        for track in manifest['tracks']:
            sequence = sorted((c for c in cases if c['provenance']['trackId'] == track['id']), key=lambda c: c['windowStart'])
            assert all(a['windowEnd'] == b['windowStart'] for a, b in zip(sequence, sequence[1:]))
        assignments, groups = split_cases(cases)
        by_language = {}
        flags = []
        source_counts = Counter()
        for lang in ('en', 'fr', 'ar'):
            subset = [c for c in cases if c['language'] == lang]
            articles = [a for c in subset for a in c['articles']]
            by_language[lang] = {'cases': len(subset), 'uniqueAcquiredIds': len({a['id'] for a in articles}),
                                 'occurrences': len(articles), 'emptyCases': sum(not c['articles'] for c in subset),
                                 'splitCases': dict(Counter(assignments[c['_file']]['split'] for c in subset)),
                                 'independentGroups': dict(groups.get(lang, {})),
                                 'languageMeaning': 'Requested output language; article language is not independently certified'}
            if any(not groups.get(lang, {}).get(s) for s in ('development', 'validation', 'held-out')):
                flags.append(lang + ': insufficient independent groups for three-way coverage; collect additional independent data')
        for c in cases:
            source_counts.update(a['sourceType'] for a in c['articles'])
        review_rows, coverage_rows, blind_rows, metrics = [], [], [], []
        runmap = []
        # Run only development: validation/held-out are not generated or semantically reviewed.
        for c in cases:
            if assignments[c['_file']]['split'] != 'development':
                continue
            track = c['provenance']['trackId']
            case_id = c['_file'].removesuffix('.json')
            profile = tokens(c['interestProfile'])
            selected = sorted(c['articles'], key=lambda a: (-len(profile & tokens((a.get('title') or '') + ' ' + a['text'])), a['id']))
            selected = [a for a in selected if profile & tokens((a.get('title') or '') + ' ' + a['text'])]
            # Exact within-window dedup only. No claim of semantic or historical deduplication.
            unique, seen = [], set()
            for a in selected:
                key = a.get('url') or SHA(a['text'].encode())
                if key not in seen:
                    unique.append(a)
                    seen.add(key)
            for system in ('all-headlines', 'keyword'):
                chosen = c['articles'] if system == 'all-headlines' else unique[:5]
                output = {'caseId': case_id, 'system': system, 'language': c['language'],
                          'items': [{'articleId': a['id'], 'text': a.get('title') or a['text'][:280]} for a in chosen],
                          'measurement': 'offline replay; extractive baseline, no model calls', 'costUsd': 0,
                          'limitations': 'No translation, semantic judgment or published-history novelty filtering'}
                write(out / 'outputs' / system / (case_id + '.json'), output)
                blind_id = SHA((case_id + system).encode())[:16]
                runmap.append({'blindId': blind_id, 'caseId': case_id, 'system': system})
                write(out / 'blind' / (blind_id + '.json'), {k: v for k, v in output.items() if k not in ('system', 'costUsd', 'measurement', 'limitations')})
                blind_rows.append(dict(blind_id=blind_id, case_id=case_id, language=c['language'], reviewer='', accuracy='', relevance='', importance='', completeness='', deduplication='', novelty='', notes=''))
                metrics.append({'caseId': case_id, 'language': c['language'], 'system': system, 'inputArticles': len(c['articles']), 'selectedArticles': len(chosen), 'qualityScores': None})
            # One row per reviewer/article; raw evidence remains private.
            write(out / 'review-cases' / c['_file'], c)
            for a in c['articles']:
                for reviewer in ('R1', 'R2'):
                    review_rows.append(dict(case_id=case_id, language=c['language'], article_id=a['id'], reviewer=reviewer,
                                            relevant='', importance='', development_id='', novelty='', evidence_quote='', rationale='', status='pending'))
            coverage_rows.append(dict(case_id=case_id, language=c['language'], coverage_id='', expected_fact='', evidence_article_ids='', evidence_quote='', importance='', adjudicator='', status='pending'))
        report = {'archiveSha256': SHA(raw), 'snapshotSha256': manifest['snapshotSha256'], 'checksumsVerified': checked,
                  'cases': len(cases), 'uniqueAcquiredIds': len({a['id'] for c in cases for a in c['articles']}),
                  'occurrences': sum(len(c['articles']) for c in cases), 'feeds': len({c['feedId'] for c in cases}),
                  'emptyCases': sum(not c['articles'] for c in cases), 'byOutputLanguage': by_language,
                  'sourceOccurrences': dict(source_counts), 'flags': flags,
                  'splitStatus': 'provisional; exact identity leakage blocked; human semantic story review required before freeze',
                  'qualityStatus': 'NOT EVALUATED: no adjudicated human labels or current V3 outputs',
                  'humanStudyStatus': 'NOT CONDUCTED', 'paidModelCalls': 0,
                  'maxArticlesPerCase': max(len(c['articles']) for c in cases),
                  'gitRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()}
        write(out / 'audit.json', report)
        write(out / 'splits.provisional.json', {'archiveSha256': SHA(raw), 'assignments': assignments})
        write(out / 'baseline-metrics.json', metrics)
        write(out / 'reviewer-key.json', runmap)
        table(out / 'article-review.csv', review_rows, ['case_id','language','article_id','reviewer','relevant','importance','development_id','novelty','evidence_quote','rationale','status'])
        table(out / 'expected-coverage.csv', coverage_rows, ['case_id','language','coverage_id','expected_fact','evidence_article_ids','evidence_quote','importance','adjudicator','status'])
        table(out / 'output-review.csv', blind_rows, ['blind_id','case_id','language','reviewer','accuracy','relevance','importance','completeness','deduplication','novelty','notes'])
        write(ROOT / 'reports' / 'dataset-audit.json', report)
        print(json.dumps(report, indent=2))


def score(path):
    """Aggregate evidence-backed adjudicated counts; never infer labels from text overlap."""
    rows = json.loads(path.read_text(encoding='utf-8'))
    results = []
    fields = ('claims', 'supportedClaims', 'relevantItems', 'items', 'coveredWeight', 'expectedWeight', 'coveredFacts', 'expectedFacts',
              'coveredCritical', 'expectedCritical', 'duplicateItems', 'novelItems', 'eligibleNovelItems')
    identities = set()
    for r in rows:
        if r.get('split') not in ('development', 'validation', 'held-out'):
            raise ValueError('Missing split; never pool tuning and held-out results')
        identity = (r.get('caseId'), r.get('system'))
        if identity in identities:
            raise ValueError('Duplicate adjudicated case/system')
        identities.add(identity)
        if r.get('language') not in ('en', 'fr', 'ar'):
            raise ValueError('Invalid language')
        if r.get('status') != 'adjudicated' or not r.get('reviewers') or not r.get('evidenceFile'):
            raise ValueError('Only adjudicated records with reviewers and evidenceFile can be scored')
        if not (path.parent / r['evidenceFile']).is_file():
            raise ValueError('Missing review evidence file')
        for f in fields:
            if isinstance(r.get(f), bool) or not isinstance(r.get(f), (int,float)) or not math.isfinite(r[f]) or r[f] < 0:
                raise ValueError('Missing/invalid count: ' + f)
        for num, den in [('supportedClaims','claims'),('relevantItems','items'),('coveredWeight','expectedWeight'),('coveredFacts','expectedFacts'),('coveredCritical','expectedCritical'),('duplicateItems','items'),('novelItems','eligibleNovelItems')]:
            if r[num] > r[den]:
                raise ValueError('Numerator exceeds denominator')
    for split, lang, system in sorted({(r['split'], r['language'], r['system']) for r in rows}):
            subset = [r for r in rows if r['language'] == lang and r['system'] == system and r['split'] == split]
            def ratio(n,d):
                den = sum(r[d] for r in subset)
                return sum(r[n] for r in subset) / den if den else None
            results.append({'split':split, 'language':lang, 'system':system, 'cases':len(subset), 'denominators': {f:sum(r[f] for r in subset) for f in fields},
                            'accuracy':ratio('supportedClaims','claims'), 'relevance':ratio('relevantItems','items'),
                            'importanceWeightedCoverage':ratio('coveredWeight','expectedWeight'),
                            'completeness':ratio('coveredFacts','expectedFacts'),
                            'criticalRecall':ratio('coveredCritical','expectedCritical'),
                            'duplicateRate':ratio('duplicateItems','items'), 'noveltyPrecision':ratio('novelItems','eligibleNovelItems')})
    write(ROOT / 'private' / 'quality-results.json', results)
    print(json.dumps(results, indent=2))


def study(path):
    rows = list(csv.DictReader(path.open(encoding='utf-8-sig')))
    summaries = []
    for lang in ('en', 'fr', 'ar'):
        for condition in ('manual', 'distilled'):
            group = [r for r in rows if r['language'] == lang and r['condition'] == condition]
            times = [float(r['elapsed_seconds']) for r in group if r['elapsed_seconds']]
            summaries.append({'language': lang, 'condition': condition, 'records': len(group),
                              'timedRecords': len(times), 'p50Seconds': percentile(times, .5),
                              'p95Seconds': percentile(times, .95),
                              'successes': sum(r['success'].lower() == 'true' for r in group),
                              'successRate': sum(r['success'].lower() == 'true' for r in group) / len(group) if group else None})
    pairs = []
    for participant, lang in sorted({(r['participant_id'], r['language']) for r in rows}):
        group = [r for r in rows if (r['participant_id'], r['language']) == (participant, lang)]
        a = [r for r in group if r['condition'] == 'manual']
        b = [r for r in group if r['condition'] == 'distilled']
        if len(a) != 1 or len(b) != 1:
            continue
        a, b = a[0], b[0]
        pair = {'participant_id': participant, 'language': lang, 'differenceDirection': 'distilled minus manual'}
        for key in ('elapsed_seconds', 'usefulness', 'effort'):
            pair[key] = float(b[key]) - float(a[key]) if a[key] and b[key] else None
        for name, num, den in [('missedFactRate', 'missed_facts', 'expected_facts'), ('comprehension', 'correct_answers', 'total_answers')]:
            pair[name] = (float(b[num])/float(b[den]) - float(a[num])/float(a[den])) if all(r[num] and r[den] and float(r[den]) > 0 for r in (a,b)) else None
        pairs.append(pair)
    write(ROOT / 'private' / 'study-results.json', {'records':len(rows), 'summaries':summaries, 'pairedDifferences':pairs})
    print('Study records:', len(rows), '; paired comparisons:', len(pairs))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('audit').add_argument('archive', type=Path)
    sub.add_parser('score').add_argument('reviews', type=Path)
    sub.add_parser('study').add_argument('csv', type=Path)
    args = parser.parse_args()
    if args.command == 'audit':
        audit(args.archive)
    elif args.command == 'score':
        score(args.reviews)
    else:
        study(args.csv)
