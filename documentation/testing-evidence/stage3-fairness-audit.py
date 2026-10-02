"""Read saved X paired cohorts without making provider requests."""
import json
from pathlib import Path
from datetime import datetime

def audit(root):
    folder=root/'data/campaigns/stage3-paid-20260927'
    output=[]
    for report in sorted((root/'data/stage3-paid-20260927-x/reports').glob('*/report.json')):
        index=int(report.parent.name.rsplit('r',1)[1])
        for job in json.loads(report.read_text()).get('jobs',[]):
            target=job['spec']['target']; key=target['id']
            step=((job.get('result') or {}).get('steps') or [{}])[0]
            private=folder/f'twitter-r{index:03}'
            rawfile=private/(key+'-raw.json'); marker=private/(key+'-submitted.json')
            row={'round':index,'target':key,'input':target['input'],'apify_status':step.get('status'),'twitter_available':rawfile.exists(),'evaluation_limit':10}
            if rawfile.exists() and step.get('normalized'):
                raw=json.loads(rawfile.read_text()); tw=raw.get('data',raw).get('tweets',[])[:10]
                ap=step['normalized']['items'][:10]
                a={str(x.get('id') or x.get('messageId')) for x in ap if x.get('id') or x.get('messageId')}
                b={str(x.get('id')) for x in tw if x.get('id')}
                row.update(apify_evaluated=len(ap),twitter_evaluated=len(tw),shared_ids=len(a&b),apify_only=len(a-b),twitter_only=len(b-a),empty_sample=not ap or not tw)
                if marker.exists() and step.get('started_at'):
                    row['collection_start_gap_seconds']=round(abs(json.loads(marker.read_text())['started_at']-datetime.fromisoformat(step['started_at']).timestamp()),2)
                row['interpretation']='Coverage observation only; sequential snapshots and reply/repost semantics can differ. Shared-ID field checks require review; no source-truth PASS.'
            output.append(row)
    result={'checked_at':datetime.now().astimezone().isoformat(),'pairs':output,'rules':{'paid_retries':False,'same_roster':True,'same_evaluated_limit':10,'rounds':21,'provider_order':'Apify first in even rounds; TwitterAPI.io first in odd rounds.','media_scored':False,'failures_and_empty_results':'Retain in denominators; do not discard failed targets.','unequal_returned_counts':'Report returned count and limit separately; do not pad samples or buy retries.','billing':'Use all charged raw results, not just evaluated ten, in costs.'}}
    path=folder/'fairness-review.json'; tmp=path.with_suffix('.tmp'); tmp.write_text(json.dumps(result,indent=2)); tmp.replace(path)
    return result

if __name__=='__main__': print(json.dumps(audit(Path.cwd()),indent=2))
