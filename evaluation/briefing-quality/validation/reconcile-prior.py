"""Read-only financial inspection. Reconciliation evidence is appended outside old ledgers."""
import hashlib,json,sqlite3
from pathlib import Path
root=Path('evaluation/briefing-quality/private/reliability-v1');out=Path('evaluation/briefing-quality/private/funded-v3');out.mkdir(parents=True,exist_ok=True)
rows=[]
for p in root.rglob('eval.sqlite'):
 before=hashlib.sha256(p.read_bytes()).hexdigest()
 try:
  with sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True) as db:
   db.row_factory=sqlite3.Row
   if not db.execute("SELECT 1 FROM sqlite_master WHERE name='eval_calls'").fetchone():continue
   calls=[dict(r) for r in db.execute('SELECT * FROM eval_calls WHERE cost_micro IS NULL')]
   for c in calls:
    receipts=[dict(r) for r in db.execute('SELECT * FROM eval_provider_receipts WHERE call_id=?',[c['id']])]
    providers=[]
    for f in (p.parent/'provider').glob('*.json'):
     try:
      fp=Path('\\\\?\\'+str(f.resolve()));raw=json.loads(fp.read_text(encoding='utf-8'));body=json.loads(raw['body'])
      if raw.get('status')!=200:providers.append({'status':raw.get('status'),'reason':body.get('error',{}).get('metadata',{}).get('reason'),'generationId':body.get('id'),'artifactSha256':hashlib.sha256(fp.read_bytes()).hexdigest()})
     except (ValueError,OSError):pass
    rows.append({'ledger':str(p),'id':c['id'],'state':c['state'],'stage':c['stage'],'reservationUsd':c['reservation_micro']/1e6,'requestHash':c['request_hash'],'receipts':receipts,'providerRejectionsInCase':providers,'resolution':'unresolved_no_correlated_provider_charge_receipt','originalLedgerModified':False})
 except sqlite3.DatabaseError as e:rows.append({'ledger':str(p),'inspectionError':str(e)})
 assert hashlib.sha256(p.read_bytes()).hexdigest()==before,'READ_ONLY_LEDGER_CHANGED'
report={'unresolvedHoldsUsd':sum(r.get('reservationUsd',0) for r in rows),'operations':rows,'receiptCount':sum(len(r.get('receipts',[])) for r in rows),'resolvedUsd':0,'policy':'Old records unchanged. Provider admission-rejection evidence is preserved but is not invented as a charge receipt. No UNKNOWN operation is resent.'}
p=out/'prior-reconciliation.private.json'
if p.exists():assert json.loads(p.read_text(encoding='utf-8'))==report
else:p.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'operations':len(rows),'unresolvedHoldsUsd':report['unresolvedHoldsUsd'],'receiptCount':report['receiptCount'],'resolvedUsd':0}))
