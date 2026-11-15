"""Metadata-only chronological selection; never chooses windows using quality scores."""
import json,hashlib
from pathlib import Path
root=Path('evaluation/briefing-quality/private/reliability-v1');q=json.loads((root/'qualification.private.json').read_text(encoding='utf-8'));freeze=json.loads((root/'freeze.json').read_text(encoding='utf-8'))
def write(name,rows,scope):
 plan={'measurementClass':scope,'selectedAt':'2026-11-15','selection':'First three chronological windows in this metadata stratum; no output-score selection. Entire retained input is preserved.','independence':'No event-independence certification: partial/unknown source completeness and ongoing related news. This is a retained-input exploratory chronological comparison, not confirmatory held-out.','cases':[{'id':r['caseId'],'path':str(Path(r['path']).resolve()),'windowStart':r['windowStart'],'windowEnd':r['windowEnd'],'snapshotHash':r['snapshotHash']} for r in rows]}
 p=root/(name+'-plan.private.json')
 if p.exists():assert json.loads(p.read_text(encoding='utf-8'))==plan
 else:p.write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'plan':str(p),'windows':len(rows),'articles':sum(r['articles'] for r in rows),'scope':scope}))
eligible=[r for r in q if r.get('path') and not r.get('rejections')]
feed=next(r['feedId'] for r in eligible if r['postFreeze'])
old=sorted([r for r in eligible if r['feedId']==feed and not r['postFreeze']],key=lambda r:r['windowStart'])[:3]
new=sorted([r for r in eligible if r['feedId']==feed and r['windowStart']>=freeze['frozenAt']],key=lambda r:r['windowStart'])[:3]
write('recent-historical',old,'recent-pre-freeze-exploratory')
write('prospective',new,'post-freeze-chronological-exploratory-not-certified-independent')
