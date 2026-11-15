"""Run the existing baselines without reimplementing tokenization or ranking."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from evaluate import baseline
sys.stdin.reconfigure(encoding='utf-8',errors='strict')
sys.stdout.reconfigure(encoding='utf-8',errors='strict')
payload=json.load(sys.stdin)
json.dump(baseline(payload['case'],payload['system']),sys.stdout,ensure_ascii=False)
