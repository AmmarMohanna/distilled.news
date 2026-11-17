"""Fail closed unless a human data steward certifies semantic separation.

Never moves exposed development/validation evidence into a new held-out group.
"""
import argparse
import json
from pathlib import Path
from evaluate import require
from suite import ROOT, SHA, write


def certify(provisional, candidates, certificate):
    require(certificate.get('origin')=='human' and bool(certificate.get('stewardId')) and bool(certificate.get('reviewedAt')),'Actual human steward certificate required')
    require(certificate.get('archiveSha256')==provisional['archiveSha256'],'Certificate for wrong dataset')
    require(certificate.get('crossLanguageAndRelatedDevelopmentsReviewed') is True,'Semantic review incomplete')
    decisions=certificate.get('candidateDecisions',[])
    expected={tuple(sorted((c['articleA'],c['articleB']))) for c in candidates}
    supplied={tuple(sorted((c['articleA'],c['articleB']))) for c in decisions}
    require(expected==supplied and len(supplied)==len(decisions),'Missing/duplicate semantic candidate decision')
    # A positive cross-split link prevents certification; redesign/merge affected components first.
    require(all(d.get('decision')=='independent' and bool(d.get('rationale')) for d in decisions),'Linked/uncertain developments require merged components and a newly reviewed split')
    require(certificate.get('additionalCrossSplitLinks',[])==[],'Additional leakage requires redesign')
    return {**provisional,'frozen':True,'certificateSha256':SHA(json.dumps(certificate,sort_keys=True,ensure_ascii=False).encode()),
            'frenchHeldOut':'unavailable; existing exposed French data not repurposed'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('prepared',type=Path);p.add_argument('certificate',type=Path);a=p.parse_args()
    require(a.prepared.resolve().is_relative_to((ROOT/'private').resolve()),'Private split artifacts required')
    require(a.certificate.resolve().is_relative_to((ROOT/'private').resolve()),'Reviewer identity must stay private')
    load=lambda p:json.loads(p.read_text(encoding='utf-8'))
    result=certify(load(a.prepared/'splits.provisional.json'),load(a.prepared/'semantic-leakage-candidates.json'),load(a.certificate))
    target=a.prepared/'splits.frozen.json';require(not target.exists(),'Frozen split already exists');write(target,result)
