import json,subprocess,sys,unittest
from pathlib import Path
class BridgeTests(unittest.TestCase):
 def test_preserves_multilingual_utf8_in_both_directions(self):
  text='تنبيه: طريق مغلق — accès fermé à Beyrouth. ”'
  case={'interestProfile':'طريق مغلق accès Beyrouth','articles':[{'id':'a','title':text,'text':text,'url':None}]}
  for system in ['all-headlines','keyword']:
   run=subprocess.run([sys.executable,str(Path(__file__).with_name('baseline_bridge.py'))],input=json.dumps({'case':case,'system':system},ensure_ascii=False).encode('utf-8'),capture_output=True)
   self.assertEqual(run.returncode,0,run.stderr.decode('utf-8',errors='replace'))
   self.assertEqual(json.loads(run.stdout.decode('utf-8'))[0]['headline'],text)
if __name__=='__main__':unittest.main()
