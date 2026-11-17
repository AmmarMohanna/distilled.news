"""Observed participant analysis only; no recruitment or simulated participants."""
import argparse
import csv
from collections import defaultdict, Counter
from pathlib import Path
from evaluate import require, number
from suite import ROOT, write, percentile

NUMERIC=('elapsed_seconds','missed_facts','expected_facts','correct_answers','total_answers','usefulness','effort','source_opens')


def analyze(rows):
    seen=set()
    for r in rows:
        require(r.get('participant_id') and r.get('task_pair') and r.get('pack'),'Participant/task_pair/pack required')
        require(r.get('language') in ('en','fr','ar') and r.get('condition') in ('manual','distilled'),'Invalid language/condition')
        require(r.get('status') in ('completed','timeout','withdrawn','technical_failure'),'Observation status required')
        require(r.get('order') in ('1','2'),'Order must be 1 or 2')
        key=(r['participant_id'],r['language'],r['task_pair'],r['condition'])
        require(key not in seen,'Duplicate participant/condition/task pair')
        seen.add(key)
        require(r.get('success','') in ('true','false',''),'Invalid success label')
        for k in NUMERIC:
            if r.get(k,'')!='':
                value=number(float(r[k]),k,integer=k in ('missed_facts','expected_facts','correct_answers','total_answers','source_opens'))
                if k in ('usefulness','effort'): require(1<=value<=5,'Rating outside 1..5')
        for n,d in [('missed_facts','expected_facts'),('correct_answers','total_answers')]:
            if r.get(n,'')!='' and r.get(d,'')!='':require(float(r[n])<=float(r[d]),'Count exceeds total')
        if r['status']=='timeout':require(r.get('success')=='false','Timeout must fail')
        if r['status']=='withdrawn':require(bool(r.get('missing_reason')),'Withdrawal needs reason')
    summaries=[]
    for lang in ('en','fr','ar'):
        for condition in ('manual','distilled'):
            group=[r for r in rows if r['language']==lang and r['condition']==condition]
            metrics={}
            for name,n,d in [('time','elapsed_seconds',None),('usefulness','usefulness',None),('effort','effort',None),
                              ('missedFactRate','missed_facts','expected_facts'),('comprehension','correct_answers','total_answers')]:
                values=[float(r[n])/(float(r[d]) if d else 1) for r in group if r.get(n,'')!='' and (not d or (r.get(d,'')!='' and float(r[d])>0))]
                metrics[name]={'observed':len(values),'missing':len(group)-len(values),'median':percentile(values,.5),
                               'range':[min(values),max(values)] if values else None}
            observed_success=[r for r in group if r.get('success','')!='']
            summaries.append({'language':lang,'condition':condition,'records':len(group),'participants':len({r['participant_id'] for r in group}),
                              'statuses':dict(Counter(r['status'] for r in group)),'metrics':metrics,
                              'successNumerator':sum(r['success']=='true' for r in observed_success),'successDenominator':len(observed_success),
                              'missingSuccess':len(group)-len(observed_success)})
    groups=defaultdict(dict)
    for r in rows:groups[(r['participant_id'],r['language'],r['task_pair'])][r['condition']]=r
    pairs=[]
    missing=[]
    for (pid,lang,pair),values in groups.items():
        if set(values)!= {'manual','distilled'}:
            missing.append({'participant_id':pid,'language':lang,'task_pair':pair,'reason':'missing condition'});continue
        a,b=values['manual'],values['distilled']
        require(a['pack']!=b['pack'],'Same evidence pack creates learning contamination')
        require(a['order']!=b['order'],'Conditions have same order')
        require(a.get('key_version') and a.get('key_version')==b.get('key_version'),'Unmatched answer key version')
        r={'participant_id':pid,'language':lang,'task_pair':pair,'manualPack':a['pack'],'distilledPack':b['pack'],
           'order':a['order']+'-manual','direction':'distilled minus manual','statuses':[a['status'],b['status']]}
        for name,n,d in [('time','elapsed_seconds',None),('usefulness','usefulness',None),('effort','effort',None),
                          ('missedFactRate','missed_facts','expected_facts'),('comprehension','correct_answers','total_answers')]:
            def value(row):
                return float(row[n])/(float(row[d]) if d else 1) if row.get(n,'')!='' and (not d or row.get(d,'')!='' and float(row[d])>0) else None
            va,vb=value(a),value(b)
            r[name]=vb-va if va is not None and vb is not None else None
        pairs.append(r)
    paired_summaries=[]
    for lang in ('en','fr','ar'):
        for metric in ('time','usefulness','effort','missedFactRate','comprehension'):
            # Collapse repeated observations within participant before descriptive summaries.
            by_person=defaultdict(list)
            for r in pairs:
                if r['language']==lang and r[metric] is not None:by_person[r['participant_id']].append(r[metric])
            values=[sum(v)/len(v) for v in by_person.values()]
            paired_summaries.append({'language':lang,'metric':metric,'participants':len(values),'medianDelta':percentile(values,.5),
                                     'range':[min(values),max(values)] if values else None,'uncertainty':'Descriptive convenience sample; no population inference'})
    return {'observations':len(rows),'uniqueParticipants':len({r['participant_id'] for r in rows}),'summaries':summaries,
            'pairs':pairs,'incompletePairs':missing,'pairedSummaries':paired_summaries,
            'multilingualParticipants':sum(len({r['language'] for r in rows if r['participant_id']==pid})>1 for pid in {r['participant_id'] for r in rows})}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('observations',type=Path);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
    require(args.out.resolve().is_relative_to((ROOT/'private').resolve()),'Participant results must remain private')
    require(args.observations.resolve().is_relative_to((ROOT/'private').resolve()) or args.observations.resolve()==ROOT/'templates/observations.csv','Observations must remain private')
    with args.observations.open(encoding='utf-8-sig',newline='') as f:result=analyze(list(csv.DictReader(f)))
    write(args.out,result)
    print('Observed records:',result['observations'],'; actual participants:',result['uniqueParticipants'])
