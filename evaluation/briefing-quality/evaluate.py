"""Second-generation offline evaluation. No network or provider credentials used.

Private artifacts are immutable per run directory. Mechanical labels are never human gold.
"""
import argparse
import csv
import itertools
import json
import math
import platform
import random
import secrets
import subprocess
import time
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from suite import ROOT, SHA, write, table, tokens, percentile, split_cases

REPO = ROOT.parent.parent
METRICS = {'accuracy': ('supportedClaims','claims'), 'relevance': ('relevantItems','items'),
           'importance': ('coveredWeight','expectedWeight'), 'allFactRecall': ('coveredFacts','expectedFacts'),
           'completeness': ('coveredCritical','expectedCritical'), 'duplicateRate': ('duplicateItems','items'),
           'novelty': ('novelItems','eligibleNovelItems')}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def instant(value):
    require(isinstance(value, str), 'Timestamp missing')
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(dt.tzinfo is not None and dt.utcoffset() is not None, 'Naive timestamp')
    return dt.astimezone(timezone.utc)


def canonical_url(value):
    if not value:
        return None
    u = urlsplit(value)
    return urlunsplit((u.scheme.lower(), u.netloc.lower(), u.path.rstrip('/'),
                      urlencode(sorted((k,v) for k,v in parse_qsl(u.query) if not k.lower().startswith(('utm_', 'fbclid', 'gclid')))), ''))


def number(value, name, integer=False):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0, 'Invalid '+name)
    require(not integer or value == int(value), 'Noninteger '+name)
    return value


def private_dir(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT / 'private'), 'Output must be under ignored private/')
    subprocess.run(['git','check-ignore','--quiet',str(path / 'sentinel.json')], cwd=REPO, check=True)
    path.mkdir(parents=True, exist_ok=False)
    return path


def read_archive(archive, destination):
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        require(all(chr(92) not in name for name in names), 'Unsafe ZIP path')
        require(len(names) == len(set(names)), 'Duplicate ZIP entry')
        require(all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and '\\' not in n and ':' not in n for n in names), 'Unsafe ZIP path')
        sums = [n for n in names if n.endswith('/SHA256SUMS.txt')]
        require(len(sums) == 1, 'One checksum manifest required')
        base = sums[0].removesuffix('SHA256SUMS.txt')
        covered = set()
        for line in z.read(sums[0]).decode().splitlines():
            digest, relative = line.split(maxsplit=1)
            relative = relative.strip().removeprefix('*')
            require(chr(92) not in relative and ':' not in relative and not PurePosixPath(relative).is_absolute() and '..' not in PurePosixPath(relative).parts, 'Unsafe checksum path')
            name = base + relative
            require(name in names, 'Checksum references missing member')
            require(name not in covered, 'Duplicate checksum')
            require(SHA(z.read(name)) == digest, 'Checksum mismatch: '+name)
            covered.add(name)
        require(covered == {n for n in names if not n.endswith('/') and n != sums[0]}, 'Unchecksummed archive member')
        for name in names:
            if not name.endswith('/'):
                target = destination / name.removeprefix(base)
                require(name.startswith(base) and target.resolve().is_relative_to(destination.resolve()), 'Outside archive root')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
        return len(covered)


def audit_cases(cases, manifest, snapshot):
    require(len({r['acquired']['id'] for r in snapshot['records']}) == len(snapshot['records']), 'Duplicate snapshot ID')
    tracks = {t['id']:t for t in manifest['tracks']}
    require(len(tracks)==len(manifest['tracks']), 'Duplicate track')
    require(len({c['_file'] for c in cases})==len(cases), 'Duplicate case')
    records = snapshot['records']
    flags = Counter()
    for c in cases:
        start, end = instant(c['windowStart']), instant(c['windowEnd'])
        require(end > start and end <= instant(snapshot['frozenAt']), 'Invalid interval/freeze')
        require((end-start).total_seconds()/60 == c['intervalMinutes'], 'Incorrect duration')
        ids = [a['id'] for a in c['articles']]
        require(len(ids)==len(set(ids)), 'Duplicate article ID')
        expected = {r['acquired']['id'] for r in records if r['acquired']['feedId']==c['feedId']
                    and (r.get('receipt') or {}).get('decision') in ('PROMOTED_NEW_REVISION','REPLAY_CURRENT_CONTENT')
                    and (r.get('receipt') or {}).get('decidedAt') is not None
                    and start <= instant(r['receipt']['decidedAt']) < end}
        require(set(ids)==expected, 'Incomplete half-open interval')
        for a in c['articles']:
            require(start <= instant(a['availableAt']) < end, 'Article outside interval')
            for field in ('publishedAt','acquiredAt'):
                if a.get(field):
                    instant(a[field])
                else:
                    flags['missing_'+field] += 1
            if a.get('publishedAt') and instant(a['publishedAt']) > end:
                flags['future_publication_metadata'] += 1
            flags['completeness_'+str(a.get('contentCompleteness'))] += 1
            require(isinstance(a['text'],str), 'Missing full body')
    for tid, track in tracks.items():
        seq = sorted((c for c in cases if c['provenance']['trackId']==tid), key=lambda c:instant(c['windowStart']))
        require(bool(seq), 'Empty track')
        require([c['provenance']['sequenceIndex'] for c in seq]==list(range(len(seq))), 'Broken sequence indices')
        require(all(instant(a['windowEnd'])==instant(b['windowStart']) for a,b in zip(seq,seq[1:])), 'Chronology gap')
        require(all(c['feedId']==track['feedId'] for c in seq), 'Track mixes feeds')
        for p in track['initialHistory'] or []:
            require(instant(p['at']) < instant(seq[0]['windowStart']), 'Future history seed')
    require(set(tracks)=={c['provenance']['trackId'] for c in cases}, 'Unknown track')
    return dict(flags)


def leakage_candidates(cases, assignments):
    # All-split lexical screening is a steward artifact, never an optimization label.
    articles = {}
    for c in cases:
        for a in c['articles']:
            articles.setdefault(a['id'], {'article':a, 'cases':set(), 'splits':set()})
            articles[a['id']]['cases'].add(c['_file'])
            articles[a['id']]['splits'].add(assignments[c['_file']]['split'])
    found = []
    for (aid,a),(bid,b) in itertools.combinations(articles.items(),2):
        if a['splits']==b['splits'] and len(a['splits'])==1:
            continue
        aa, bb = a['article'], b['article']
        ta,tb = tokens(aa.get('title') or ''),tokens(bb.get('title') or '')
        overlap = len(ta & tb)/len(ta | tb) if ta | tb else 0
        same_url = canonical_url(aa.get('url')) is not None and canonical_url(aa.get('url'))==canonical_url(bb.get('url'))
        body_a,body_b = tokens(aa['text']),tokens(bb['text'])
        body_overlap = len(body_a & body_b)/len(body_a | body_b) if body_a | body_b else 0
        if same_url or (len(ta & tb)>=3 and overlap>=.35) or (len(body_a & body_b)>=20 and body_overlap>=.55):
            found.append({'articleA':aid,'articleB':bid,'casesA':sorted(a['cases']),'casesB':sorted(b['cases']),
                          'titleJaccard':overlap,'bodyJaccard':body_overlap,'normalizedUrlMatch':same_url,
                          'status':'pending independent semantic review; lexical overlap is not story identity'})
    return found


def baseline(c, system):
    articles = c['articles']
    if system=='keyword':
        profile = tokens(c['interestProfile'])
        ranked = sorted(articles, key=lambda a:(-len(profile & tokens((a.get('title') or '')+' '+a['text'])),a['id']))
        articles,seen = [],set()
        for a in ranked:
            key = a.get('url') or SHA(a['text'].encode())
            if profile & tokens((a.get('title') or '')+' '+a['text']) and key not in seen:
                articles.append(a)
                seen.add(key)
        articles=articles[:5]
    return [{'headline': a.get('title') or '', 'body': '' if a.get('title') else a['text'],
             'sourceIds':[a['id']]} for a in articles]


def replay_baselines(cases, tracks, assignments, out):
    results=[]
    for system in ('all-headlines','keyword'):
        for track in tracks:
            history = list(track['initialHistory'] or [])
            seq = sorted((c for c in cases if c['provenance']['trackId']==track['id']),key=lambda c:instant(c['windowStart']))
            for c in seq:
                if assignments[c['_file']]['split']!='development':
                    continue
                started=time.perf_counter()
                before=list(history)
                items=baseline(c,system)
                status='published' if items else 'empty'
                if items:
                    history += [dict(id=f"{system}:{c['_file']}:{i}",at=c['windowEnd'],headline=a['headline'],body=a['body']) for i,a in enumerate(items)]
                row={'caseId':c['_file'],'trackId':track['id'],'cluster':assignments[c['_file']]['group'],
                     'split':'development','language':c['language'],'system':system,'status':status,'items':items,
                     'historyBefore':before,'historyAfter':history,'historyPolicy':'own actual local published prose only; baseline does not use memory for selection',
                     'deliberateColdStart':track['initialHistory'] is None,'latencyMs':(time.perf_counter()-started)*1000,
                     'calls':0,'retries':0,'inputTokens':0,'outputTokens':0,'costUsd':0,
                     'measurementClass':'offline_extractive_replay','inputSha256':SHA(json.dumps(c,sort_keys=True,ensure_ascii=False).encode())}
                write(out/'outputs'/system/c['_file'],row)
                results.append({k:v for k,v in row.items() if k not in ('historyBefore','historyAfter','items')})
    return results


def packets(cases, assignments, out):
    rows=[]
    coverage=[]
    for c in cases:
        if assignments[c['_file']]['split']!='development':
            continue
        drafts=[]
        prior={}
        for previous in sorted(cases,key=lambda x:instant(x['windowStart'])):
            if previous['provenance']['trackId']==c['provenance']['trackId'] and instant(previous['windowEnd'])<=instant(c['windowStart']):
                for a in previous['articles']:
                    prior[a.get('url') or a['id']]=a
        groups={}
        for a in c['articles']:
            key=canonical_url(a.get('url')) or SHA(a['text'].encode())
            groups.setdefault(key,[]).append(a['id'])
            old=prior.get(a.get('url') or a['id'])
            draft={'articleId':a['id'],'evidenceFile':'../archive/dataset/'+c['_file'],
                   'evidencePointer':'/articles/'+str(c['articles'].index(a)),
                   'expectedCoverageCandidate':a.get('title') or a['text'][:240],
                   'evidenceQuote':a['text'][:500], 'quoteLocation':'text[0:500]',
                   'relevanceHint':len(tokens(c['interestProfile']) & tokens((a.get('title') or '')+' '+a['text'])),
                   'importance':None,'importanceReason':'needs full-body human judgment',
                   'duplicateCandidateGroup':SHA(key.encode())[:12],
                   'noveltyCandidate':('same_url_changed_text' if old and old['text']!=a['text'] else 'exact_recurrence' if old else 'no_mechanical_prior_match'),
                   'uncertainty':['Not a certified atomic fact','Title may overstate body','Cross-language paraphrases and conflicts not resolved'],
                   'labelOrigin':'AI-generated mechanical draft; pending human review','status':'pending'}
            drafts.append(draft)
            for reviewer in ('R1','R2'):
                rows.append(dict(case_id=c['_file'],language=c['language'],article_id=a['id'],reviewer=reviewer,relevant='',importance='',development_id='',novelty='',evidence_quote='',rationale='',status='pending'))
        write(out/'packets'/c['_file'],{'caseId':c['_file'],'interestProfile':c['interestProfile'],'language':c['language'],
              'drafts':drafts,'duplicateCandidates':list(groups.values()),'expectedCoverageStatus':'No human reference yet',
              'instruction':'Read entire linked evidence; do not accept draft title as a fact. Independently annotate before adjudication.'})
        coverage.append(dict(case_id=c['_file'],language=c['language'],fact_id='',expected_fact='',evidence_article_ids='',evidence_quote='',importance='',uncertainty='',adjudicator='',status='pending'))
    table(out/'article-review.csv',rows,['case_id','language','article_id','reviewer','relevant','importance','development_id','novelty','evidence_quote','rationale','status'])
    table(out/'expected-coverage.csv',coverage,['case_id','language','fact_id','expected_fact','evidence_article_ids','evidence_quote','importance','uncertainty','adjudicator','status'])


def prepare(archive, output):
    out=private_dir(output)
    checked=read_archive(archive,out/'archive')
    manifest=json.loads((out/'archive/dataset/manifest.json').read_text(encoding='utf-8'))
    snapshot_bytes=(out/'archive/snapshot.json').read_bytes()
    require(SHA(snapshot_bytes)==manifest['snapshotSha256'],'Snapshot hash mismatch')
    snapshot=json.loads(snapshot_bytes)
    cases=[]
    for f in manifest['files']:
        raw=(out/'archive/dataset'/f['file']).read_bytes()
        require(SHA(raw)==f['sha256'],'Case hash mismatch')
        c=json.loads(raw)
        require(len(c['articles'])==f['articles'],'Manifest count mismatch')
        for key in ('feedId','windowStart','windowEnd','intervalMinutes'):
            require(c[key]==f[key],'Manifest field mismatch '+key)
        require(c['provenance']['trackId']==f['trackId'] and c['provenance']['sequenceIndex']==f['sequenceIndex'],'Manifest track mismatch')
        c['_file']=f['file']
        cases.append(c)
    rebuilt=json.loads(subprocess.check_output(['node',str(ROOT/'rebuild.mjs'),str(out/'archive')],cwd=REPO,text=True))
    flags=audit_cases(cases,manifest,snapshot)
    assignments,counts=split_cases(cases)
    # Existing semantic exposure is retained; do not rebrand previously opened validation as held-out.
    write(out/'splits.provisional.json',{'archiveSha256':SHA(archive.read_bytes()),'frozen':False,'assignments':assignments,
          'policy':'retain original exposure; pending semantic steward review. No French held-out.'})
    candidates=leakage_candidates(cases,assignments)
    write(out/'semantic-leakage-candidates.json',candidates)
    results=replay_baselines(cases,manifest['tracks'],assignments,out)
    write(out/'replay-results.json',results)
    key=[]
    output_reviews=[]
    for row in results:
        blind_id=secrets.token_hex(12)
        output=json.loads((out/'outputs'/row['system']/row['caseId']).read_text(encoding='utf-8'))
        write(out/'blind'/f'{blind_id}.json',{'blindId':blind_id,'caseId':row['caseId'],'language':row['language'],
              'items':output['items'],'historyBefore':[{**p,'id':SHA((blind_id+p['id']).encode())[:16]} for p in output['historyBefore']],
              'evidenceFile':'../archive/dataset/'+row['caseId']})
        key.append({'blindId':blind_id,'caseId':row['caseId'],'system':row['system']})
        for reviewer in ('R1','R2'):
            output_reviews.append(dict(blind_id=blind_id,case_id=row['caseId'],language=row['language'],reviewer=reviewer,
                                       accuracy='',relevance='',importance='',completeness='',deduplication='',novelty='',notes='',status='pending'))
    write(out/'reviewer-key.json',key)
    table(out/'output-review.csv',output_reviews,['blind_id','case_id','language','reviewer','accuracy','relevance','importance','completeness','deduplication','novelty','notes','status'])
    write(out/'quality-expected.json',[{'caseId':c['_file'],'system':system,'judgmentOrigin':'human'} for c in cases if assignments[c['_file']]['split']=='development'
                                     for system in ('all-headlines','keyword','single-llm','v3')])
    write(out/'quality-observed.json',[])
    packets(cases,assignments,out)
    language={lang:{'cases':sum(c['language']==lang for c in cases),'splits':dict(Counter(assignments[c['_file']]['split'] for c in cases if c['language']==lang)),
                    'independentComponents':dict(counts.get(lang,{}))} for lang in ('en','fr','ar')}
    runtime=[]
    for lang,system in itertools.product(('en','fr','ar'),('all-headlines','keyword')):
        rows=[r for r in results if r['language']==lang and r['system']==system]
        runtime.append({'language':lang,'system':system,'cases':len(rows),'published':sum(r['status']=='published' for r in rows),
                        'empty':sum(r['status']=='empty' for r in rows),'failures':0,'calls':0,'retries':0,'tokens':0,'costUsd':0,
                        'p50Ms':percentile([r['latencyMs'] for r in rows],.5),'p95Ms':percentile([r['latencyMs'] for r in rows],.95),
                        'latencyPopulation':'all terminal windows; local selection only','qualityJudgments':0})
    pilot=[]
    for lang in ('en','fr','ar'):
        tids=sorted({c['provenance']['trackId'] for c in cases if c['language']==lang and assignments[c['_file']]['split']=='development'})
        tid=min(tids,key=lambda tid:(abs(sum(c['provenance']['trackId']==tid for c in cases)-3),tid))
        pilot += [f['file'] for f in manifest['files'] if f['trackId']==tid]
    run_manifest={'schemaVersion':2,'authorized':False,'measurementClass':'isolated_model_replay',
                  'archiveSha256':SHA(archive.read_bytes()),'snapshotSha256':manifest['snapshotSha256'],
                  'gitRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
                  'cases':pilot,'split':'development','systems':['single-llm','v3'],'models':{'editor':'openai/gpt-4.1','verifier':'openai/gpt-4.1-mini'},
                  'maxUsd':5,'maxCalls':60,'maxPerCallUsd':.5,'maxRequestUtf8Bytes':200000,'maxOutputTokens':4000,
                  'priceBasis':'OpenRouter model pages checked 2026-10-27: GPT-4.1 $2/$8 and mini $0.40/$1.60 per million input/output tokens; reconfirm before execution',
                  'priceSources':['https://openrouter.ai/openai/gpt-4.1','https://openrouter.ai/openai/gpt-4.1-mini'],
                  'estimatedNormalCalls':sum(bool(c['articles']) for c in cases if c['_file'] in pilot)*3,
                  'estimatedUsdRange':None,
                  'costMethod':'Normal path 1 single-LLM + 1 editor + 1 verifier per nonempty case; repairs, malformed replies and chunks consume global call/dollar caps; byte-count token upper bound for admission.',
                  'execution':'Local engine generateBriefing with evaluation-only provider port and append-only reservations; no Worker, D1, queues, feeds or notifications',
                  'history':'own actual published prose; null initialHistory means recorded deliberate cold start; replay clock = windowEnd',
                  'candidate':None,'candidateReason':'No adjudicated development findings justify a candidate yet',
                  'stopPolicy':'No automatic transport retry. Unknown outcome retains worst-case reservation, aborts run and fences restart. No held-out execution.'}
    hashes={str(p.relative_to(REPO)):SHA(p.read_bytes()) for p in sorted((REPO/'packages/briefing/src').glob('*.ts'))}
    hashes['scripts/export-acquired-benchmark.mjs']=SHA((REPO/'scripts/export-acquired-benchmark.mjs').read_bytes())
    hashes.update({str(p.relative_to(REPO)):SHA(p.read_bytes()) for pattern in ('*.py','*.ts','*.mjs') for p in sorted(ROOT.glob(pattern))})
    run_manifest['sourceHashes']=hashes
    write(out/'paid-run.proposed.json',run_manifest)
    report={'schemaVersion':2,'createdAt':datetime.now(timezone.utc).isoformat(),'archiveSha256':SHA(archive.read_bytes()),
            'checksumsVerified':checked,**rebuilt,'snapshotRecords':len(snapshot['records']),'cases':len(cases),
            'articleOccurrences':sum(len(c['articles']) for c in cases),'uniqueAcquiredIds':len({a['id'] for c in cases for a in c['articles']}),
            'flagsOccurrenceCounts':flags,'languages':language,'crossSplitLexicalCandidates':len(candidates),
            'semanticCertification':'pending; cross-language and related developments can evade lexical screening',
            'baselineRuntime':runtime,'paidCalls':0,'humanJudgments':0,'participants':0,
            'python':platform.python_version(),'node':subprocess.check_output(['node','--version'],text=True).strip(),
            'gitRevision':run_manifest['gitRevision'],'sourceHashes':hashes,
            'quality':'Unavailable pending independent human evidence and output review; baseline selections are not accuracy measurements'}
    write(out/'audit-v2.json',report)
    write(ROOT/'reports/offline-v2.json',report)
    print(json.dumps({'output':str(out),'cases':len(cases),'checksums':checked,'semanticCandidates':len(candidates),'baselineCases':len(results),'proposedCases':len(pilot)},indent=2))


def agreement(rows, field, labels, weighted=False):
    units=defaultdict(dict)
    for r in rows:
        key=(r['case_id'],r['article_id'],r['language'])
        require(r['reviewer'] not in units[key], 'Duplicate independent judgment')
        units[key][r['reviewer']]=r.get(field,'') if r.get('status')=='reviewed' else ''
    pairs=[]
    for values in units.values():
        # Explicit fixed R1/R2 slots; identities are kept in a separate private mapping.
        a,b=values.get('R1',''),values.get('R2','')
        if a and b:
            require(a in labels and b in labels,'Unknown '+field+' category')
            pairs.append((a,b))
    n=len(pairs)
    confusion=Counter(pairs)
    if not n:
        return {'paired':0,'missingPairs':len(units),'rawAgreement':None,'kappa':None,'confusion':{}}
    ca,cb=Counter(a for a,b in pairs),Counter(b for a,b in pairs)
    distance=lambda a,b: ((labels.index(a)-labels.index(b))/(len(labels)-1))**2 if weighted else float(a!=b)
    observed=sum(distance(a,b) for a,b in pairs)/n
    expected=sum(ca[a]*cb[b]*distance(a,b) for a in labels for b in labels)/(n*n)
    return {'paired':n,'missingPairs':len(units)-n,'rawAgreement':sum(a==b for a,b in pairs)/n,
            'kappa':1-observed/expected if expected else None,'weighted':weighted,
            'confusion':{a+' | '+b:v for (a,b),v in sorted(confusion.items())}}


def agreement_file(path):
    require(path.resolve().is_relative_to((ROOT/'private').resolve()),'Reviews must remain private')
    rows=list(csv.DictReader(path.open(encoding='utf-8-sig')))
    output={lang:{f:agreement([r for r in rows if r['language']==lang],f,labels,weighted)
                  for f,labels,weighted in [('relevant',['yes','no','uncertain'],False),('importance',['0','1','2','3'],True),
                                           ('novelty',['new','update','correction','repeat','uncertain'],False)]} for lang in ('en','fr','ar')}
    write(path.parent/'agreement.json',output)
    return output


def paired_quality(rows, expected):
    """Adjudicated human/AI counts remain separate. Bootstrap independent leakage components."""
    identities=set()
    valid=[]
    missing=[]
    for r in rows:
        require(r.get('caseId') and r.get('system') and r.get('cluster'),'Missing case/system/independence cluster')
        require(r.get('language') in ('en','fr','ar') and r.get('split') in ('development','validation','held-out'),'Invalid language/split')
        require(r.get('judgmentOrigin') in ('human','ai'),'Judgment origin required')
        identity=(r['caseId'],r['system'],r['judgmentOrigin'])
        require(identity not in identities,'Duplicate case/system/origin')
        identities.add(identity)
        if r.get('status')!='adjudicated':
            missing.append(identity)
            continue
        require(len(set(r.get('reviewers',[])))>=2 and bool(r.get('evidenceFile')), 'Independent reviewers and evidence required')
        for n,d in METRICS.values():
            number(r.get(n),n,integer=n not in ('coveredWeight','expectedWeight'))
            number(r.get(d),d,integer=d not in ('coveredWeight','expectedWeight'))
            require(r[n]<=r[d],'Numerator exceeds denominator')
        require(r['expectedCritical']<=r['expectedFacts'] and r['coveredCritical']<=r['coveredFacts'],'Inconsistent coverage')
        require(r['eligibleNovelItems']<=r['items'],'Invalid novelty population')
        valid.append(r)
    def ratio(r,n,d): return r[n]/r[d] if r[d] else None
    aggregates=[]
    pairs=[]
    for split,lang,origin in sorted({(r['split'],r['language'],r['judgmentOrigin']) for r in valid}):
        subset=[r for r in valid if (r['split'],r['language'],r['judgmentOrigin'])==(split,lang,origin)]
        systems=sorted({r['system'] for r in subset})
        for system in systems:
            group=[r for r in subset if r['system']==system]
            result={'split':split,'language':lang,'origin':origin,'system':system,'cases':len(group),'clusters':len({r['cluster'] for r in group}),'metrics':{}}
            for metric,(n,d) in METRICS.items():
                values=[ratio(r,n,d) for r in group if r[d]]
                den=sum(r[d] for r in group)
                result['metrics'][metric]={'numerator':sum(r[n] for r in group),'denominator':den,'micro':sum(r[n] for r in group)/den if den else None,
                                          'macro':sum(values)/len(values) if values else None,'scoredCases':len(values),'undefinedCases':len(group)-len(values)}
            aggregates.append(result)
        for a,b in itertools.combinations(systems,2):
            aa={r['caseId']:r for r in subset if r['system']==a}
            bb={r['caseId']:r for r in subset if r['system']==b}
            for metric,(n,d) in METRICS.items():
                differences=[]
                clusters=defaultdict(list)
                for cid in sorted(aa.keys() & bb.keys()):
                    require(aa[cid]['cluster']==bb[cid]['cluster'],'Mismatched cluster')
                    require(aa[cid][d]==bb[cid][d] or d in ('claims','items','eligibleNovelItems'),'Reference denominator changed between systems')
                    if aa[cid][d] and bb[cid][d]:
                        delta=ratio(bb[cid],n,d)-ratio(aa[cid],n,d)
                        clusters[aa[cid]['cluster']].append(delta)
                        differences.append({'caseId':cid,'delta':delta})
                means=[sum(v)/len(v) for v in clusters.values()]
                interval=None
                if len(means)>=5:
                    rng=random.Random(20261027)
                    draws=[sum(rng.choices(means,k=len(means)))/len(means) for _ in range(2000)]
                    interval=[percentile(draws,.025),percentile(draws,.975)]
                pairs.append({'split':split,'language':lang,'origin':origin,'systemA':a,'systemB':b,'direction':'B minus A',
                              'metric':metric,'pairedCases':len(differences),'clusters':len(means),'perCase':differences,
                              'meanClusterDelta':sum(means)/len(means) if means else None,'clusterDeltaRange':[min(means),max(means)] if means else None,
                              'exploratory95ClusterBootstrap':interval,'uncertainty':'No interval below five independent components; bootstrap exploratory otherwise'})
    expected_ids={(r['caseId'],r['system'],r['judgmentOrigin']) for r in expected}
    return {'aggregates':aggregates,'pairs':pairs,'perCase':valid,'pending':missing,
            'missingExpected':sorted(expected_ids-{(r['caseId'],r['system'],r['judgmentOrigin']) for r in valid})}


def quality_file(path, expected):
    require(path.resolve().is_relative_to((ROOT/'private').resolve()),'Judgments must remain private')
    rows=json.loads(path.read_text(encoding='utf-8'))
    for row in rows:
        if row.get('status')=='adjudicated':
            evidence=(path.parent/row.get('evidenceFile','')).resolve()
            require(evidence.is_relative_to((ROOT/'private').resolve()) and evidence.is_file(),'Evidence must exist in private storage')
    output=paired_quality(rows,json.loads(expected.read_text(encoding='utf-8')))
    write(path.parent/'quality-v2.json',output)


def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('prepare'); a.add_argument('archive',type=Path); a.add_argument('--out',type=Path,required=True)
    a=sub.add_parser('agreement'); a.add_argument('reviews',type=Path)
    a=sub.add_parser('quality'); a.add_argument('reviews',type=Path); a.add_argument('expected',type=Path)
    args=p.parse_args()
    if args.command=='prepare': prepare(args.archive,args.out)
    elif args.command=='agreement': print(json.dumps(agreement_file(args.reviews),indent=2))
    else: quality_file(args.reviews,args.expected)


if __name__=='__main__': main()
